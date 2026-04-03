#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
"""Entity resolution for GraphRAG knowledge graphs.

This module resolves duplicate entities in a knowledge graph by identifying
entity pairs that likely refer to the same real-world concept and merging them.
The resolution process uses LLM-based comparison with edit-distance pre-filtering
to efficiently handle large graphs. Candidate pairs are batched and sent to an
LLM for yes/no similarity decisions, then equivalent entities are merged using
connected-component analysis.
"""
import asyncio
import logging
import itertools
import os
import re
from dataclasses import dataclass
from typing import Any, Callable

import networkx as nx

from rag.graphrag.general.extractor import Extractor
from rag.nlp import is_english
import editdistance
from rag.graphrag.entity_resolution_prompt import ENTITY_RESOLUTION_PROMPT
from rag.llm.chat_model import Base as CompletionLLM
from rag.graphrag.utils import perform_variable_replacements, chat_limiter, GraphChange
from db.services.task_service import has_canceled
from common.exceptions import TaskCanceledException

from common.misc_utils import thread_pool_exec

# Default delimiters used in the resolution prompt template
DEFAULT_RECORD_DELIMITER = "##"
DEFAULT_ENTITY_INDEX_DELIMITER = "<|>"
DEFAULT_RESOLUTION_RESULT_DELIMITER = "&&"


@dataclass
class EntityResolutionResult:
    """Container for the result of entity resolution.

    Attributes:
        graph: The updated graph with merged entities.
        change: Tracks which nodes/edges were added, updated, or removed.
    """
    graph: nx.Graph
    change: GraphChange


class EntityResolution(Extractor):
    """Resolves duplicate entities in a knowledge graph using LLM-based comparison.

    This class identifies candidate entity pairs that may refer to the same concept
    (pre-filtered by string similarity), sends them to an LLM in batches for
    confirmation, and merges confirmed duplicates in the graph. After merging,
    PageRank is recomputed for the updated graph.

    Attributes:
        _resolution_prompt: The LLM prompt template for entity comparison.
        _record_delimiter_key: Key name for the record separator in prompt variables.
        _entity_index_delimiter_key: Key name for the entity index wrapper.
        _resolution_result_delimiter_key: Key name for the yes/no result wrapper.
    """

    _resolution_prompt: str
    _output_formatter_prompt: str
    _record_delimiter_key: str
    _entity_index_delimiter_key: str
    _resolution_result_delimiter_key: str

    def __init__(
            self,
            llm_invoker: CompletionLLM,
    ):
        """Initialize the entity resolution extractor.

        Args:
            llm_invoker: The LLM client used for entity comparison chat calls.
        """
        super().__init__(llm_invoker)
        self._llm = llm_invoker
        self._resolution_prompt = ENTITY_RESOLUTION_PROMPT
        self._record_delimiter_key = "record_delimiter"
        self._entity_index_delimiter_key = "entity_index_delimiter"
        self._resolution_result_delimiter_key = "resolution_result_delimiter"
        self._input_text_key = "input_text"

    async def __call__(self, graph: nx.Graph,
                       subgraph_nodes: set[str],
                       prompt_variables: dict[str, Any] | None = None,
                       callback: Callable | None = None,
                       task_id: str = "") -> EntityResolutionResult:
        """Run entity resolution on the given graph.

        Identifies candidate pairs of potentially duplicate entities grouped by
        entity type, resolves them via LLM, merges confirmed duplicates, and
        recomputes PageRank.

        Args:
            graph: The knowledge graph to resolve entities in.
            subgraph_nodes: Set of node names from the newly added subgraph;
                only pairs involving at least one of these nodes are considered.
            prompt_variables: Optional overrides for prompt template variables.
            callback: Progress callback function accepting keyword arg ``msg``.
            task_id: Task identifier for cancellation checking.

        Returns:
            EntityResolutionResult with the updated graph and change tracking.
        """
        if prompt_variables is None:
            prompt_variables = {}

        # Wire defaults into the prompt variables
        self.prompt_variables = {
            **prompt_variables,
            self._record_delimiter_key: prompt_variables.get(self._record_delimiter_key)
                                        or DEFAULT_RECORD_DELIMITER,
            self._entity_index_delimiter_key: prompt_variables.get(self._entity_index_delimiter_key)
                                              or DEFAULT_ENTITY_INDEX_DELIMITER,
            self._resolution_result_delimiter_key: prompt_variables.get(self._resolution_result_delimiter_key)
                                                   or DEFAULT_RESOLUTION_RESULT_DELIMITER,
        }

        # Group nodes by entity type for pairwise comparison
        nodes = sorted(graph.nodes())
        entity_types = sorted(set(graph.nodes[node].get('entity_type', '-') for node in nodes))
        node_clusters = {entity_type: [] for entity_type in entity_types}

        for node in nodes:
            node_clusters[graph.nodes[node].get('entity_type', '-')].append(node)

        # Build candidate pairs: only pairs involving at least one subgraph node
        # and passing the string similarity pre-filter
        candidate_resolution = {entity_type: [] for entity_type in entity_types}
        for k, v in node_clusters.items():
            candidate_resolution[k] = [(a, b) for a, b in itertools.combinations(v, 2) if (a in subgraph_nodes or b in subgraph_nodes) and self.is_similarity(a, b)]
        num_candidates = sum([len(candidates) for _, candidates in candidate_resolution.items()])
        callback(msg=f"Identified {num_candidates} candidate pairs")
        remain_candidates_to_resolve = num_candidates

        resolution_result = set()
        resolution_result_lock = asyncio.Lock()
        resolution_batch_size = 100
        max_concurrent_tasks = 5
        semaphore = asyncio.Semaphore(max_concurrent_tasks)

        async def limited_resolve_candidate(candidate_batch, result_set, result_lock):
            """Resolve a batch of candidate pairs with concurrency limiting."""
            nonlocal remain_candidates_to_resolve, callback
            async with semaphore:
                try:
                    enable_timeout_assertion = os.environ.get("ENABLE_TIMEOUT_ASSERTION")
                    timeout_sec = 280 if enable_timeout_assertion else 1_000_000_000

                    try:
                        await asyncio.wait_for(
                            self._resolve_candidate(candidate_batch, result_set, result_lock, task_id),
                            timeout=timeout_sec
                        )
                        remain_candidates_to_resolve -= len(candidate_batch[1])
                        callback(
                            msg=f"Resolved {len(candidate_batch[1])} pairs, "
                                f"{remain_candidates_to_resolve} remain."
                        )

                    except asyncio.TimeoutError:
                        logging.warning(f"Timeout resolving {candidate_batch}, skipping...")
                        remain_candidates_to_resolve -= len(candidate_batch[1])
                        callback(
                            msg=f"Failed to resolve {len(candidate_batch[1])} pairs due to timeout, skipped. "
                                f"{remain_candidates_to_resolve} remain."
                        )

                except Exception as exception:
                    logging.error(f"Error resolving candidate batch: {exception}")


        # Create async tasks for each batch of candidate pairs
        tasks = []
        for key, lst in candidate_resolution.items():
            if not lst:
                continue
            for i in range(0, len(lst), resolution_batch_size):
                batch = (key, lst[i:i + resolution_batch_size])
                tasks.append(limited_resolve_candidate(batch, resolution_result, resolution_result_lock))
        try:
            await asyncio.gather(*tasks, return_exceptions=False)
        except Exception as e:
            logging.error(f"Error resolving candidate pairs: {e}")
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise

        callback(msg=f"Resolved {num_candidates} candidate pairs, {len(resolution_result)} of them are selected to merge.")

        # Build a connectivity graph from confirmed duplicate pairs and merge
        # each connected component into a single node
        change = GraphChange()
        connect_graph = nx.Graph()
        connect_graph.add_edges_from(resolution_result)

        async def limited_merge_nodes(graph, nodes, change):
            """Merge a connected component of duplicate nodes with concurrency limiting."""
            async with semaphore:
                await self._merge_graph_nodes(graph, nodes, change, task_id)

        tasks = []
        for sub_connect_graph in nx.connected_components(connect_graph):
            merging_nodes = list(sub_connect_graph)
            tasks.append(asyncio.create_task(limited_merge_nodes(graph, merging_nodes, change))
            )
        try:
            await asyncio.gather(*tasks, return_exceptions=False)
        except Exception as e:
            logging.error(f"Error merging nodes: {e}")
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise

        # Update pagerank after merging
        pr = nx.pagerank(graph)
        for node_name, pagerank in pr.items():
            graph.nodes[node_name]["pagerank"] = pagerank

        return EntityResolutionResult(
            graph=graph,
            change=change,
        )

    async def _resolve_candidate(self, candidate_resolution_i: tuple[str, list[tuple[str, str]]], resolution_result: set[str], resolution_result_lock: asyncio.Lock, task_id: str = ""):
        """Send a batch of entity pairs to the LLM for same/different classification.

        Constructs a prompt listing all pairs in the batch, sends it to the LLM,
        and parses the structured response to determine which pairs are duplicates.

        Args:
            candidate_resolution_i: Tuple of (entity_type, list of (name_a, name_b) pairs).
            resolution_result: Shared set to collect confirmed duplicate pairs.
            resolution_result_lock: Async lock protecting the shared result set.
            task_id: Task identifier for cancellation checking.
        """
        # Check for task cancellation before processing
        if task_id:
            if has_canceled(task_id):
                logging.info(f"Task {task_id} cancelled during entity resolution candidate processing.")
                raise TaskCanceledException(f"Task {task_id} was cancelled")

        # Build the comparison prompt text with all pairs in this batch
        pair_txt = [
            f'When determining whether two {candidate_resolution_i[0]}s are the same, you should only focus on critical properties and overlook noisy factors.\n']
        for index, candidate in enumerate(candidate_resolution_i[1]):
            pair_txt.append(
                f'Question {index + 1}: name of{candidate_resolution_i[0]} A is {candidate[0]} ,name of{candidate_resolution_i[0]} B is {candidate[1]}')
        sent = 'question above' if len(pair_txt) == 1 else f'above {len(pair_txt)} questions'
        pair_txt.append(
            f'\nUse domain knowledge of {candidate_resolution_i[0]}s to help understand the text and answer the {sent} in the format: For Question i, Yes, {candidate_resolution_i[0]} A and {candidate_resolution_i[0]} B are the same {candidate_resolution_i[0]}./No, {candidate_resolution_i[0]} A and {candidate_resolution_i[0]} B are different {candidate_resolution_i[0]}s. For Question i+1, (repeat the above procedures)')
        pair_prompt = '\n'.join(pair_txt)
        variables = {
            **self.prompt_variables,
            self._input_text_key: pair_prompt
        }
        text = perform_variable_replacements(self._resolution_prompt, variables=variables)
        logging.info(f"Created resolution prompt {len(text)} bytes for {len(candidate_resolution_i[1])} entity pairs of type {candidate_resolution_i[0]}")

        # Send the prompt to the LLM with rate limiting
        async with chat_limiter:
            timeout_seconds = 280 if os.environ.get("ENABLE_TIMEOUT_ASSERTION") else 1000000000
            try:
                response = await asyncio.wait_for(
                    thread_pool_exec(
                        self._chat,
                        text,
                        [{"role": "user", "content": "Output:"}],
                        {},
                        task_id
                    ),
                    timeout=timeout_seconds,
                )

            except asyncio.TimeoutError:
                logging.warning("_resolve_candidate._chat timeout, skipping...")
                return
            except Exception as e:
                logging.error(f"_resolve_candidate._chat failed: {e}")
                return

        logging.debug(f"_resolve_candidate chat prompt: {text}\nchat response: {response}")
        # Parse the structured LLM response to extract yes/no decisions
        result = self._process_results(len(candidate_resolution_i[1]), response,
                                       self.prompt_variables.get(self._record_delimiter_key,
                                                            DEFAULT_RECORD_DELIMITER),
                                       self.prompt_variables.get(self._entity_index_delimiter_key,
                                                            DEFAULT_ENTITY_INDEX_DELIMITER),
                                       self.prompt_variables.get(self._resolution_result_delimiter_key,
                                                            DEFAULT_RESOLUTION_RESULT_DELIMITER))
        # Thread-safely add confirmed duplicate pairs to the shared result set
        async with resolution_result_lock:
            for result_i in result:
                resolution_result.add(candidate_resolution_i[1][result_i[0] - 1])

    def _process_results(
            self,
            records_length: int,
            results: str,
            record_delimiter: str,
            entity_index_delimiter: str,
            resolution_result_delimiter: str
    ) -> list:
        """Parse the LLM response to extract entity resolution decisions.

        Splits the response by record delimiter and uses regex to extract the
        question index and yes/no answer from each record.

        Args:
            records_length: Total number of entity pairs in the batch.
            results: Raw LLM response string.
            record_delimiter: Delimiter separating individual answer records.
            entity_index_delimiter: Delimiter wrapping the question index number.
            resolution_result_delimiter: Delimiter wrapping the yes/no answer.

        Returns:
            List of (question_index, "yes") tuples for pairs deemed identical.
        """
        ans_list = []
        records = [r.strip() for r in results.split(record_delimiter)]
        for record in records:
            # Extract the question index number
            pattern_int = fr"{re.escape(entity_index_delimiter)}(\d+){re.escape(entity_index_delimiter)}"
            match_int = re.search(pattern_int, record)
            res_int = int(str(match_int.group(1) if match_int else '0'))
            if res_int > records_length:
                continue

            # Extract the yes/no decision
            pattern_bool = f"{re.escape(resolution_result_delimiter)}([a-zA-Z]+){re.escape(resolution_result_delimiter)}"
            match_bool = re.search(pattern_bool, record)
            res_bool = str(match_bool.group(1) if match_bool else '')

            if res_int and res_bool:
                if res_bool.lower() == 'yes':
                    ans_list.append((res_int, "yes"))

        return ans_list

    def _has_digit_in_2gram_diff(self, a, b):
        """Check whether the symmetric 2-gram difference contains any digit.

        This is used as a quick filter: if two entity names differ only in
        numeric portions (e.g., "Model 3" vs "Model 5"), they likely refer
        to different entities and should not be candidates for resolution.

        Args:
            a: First entity name.
            b: Second entity name.

        Returns:
            True if any character bigram in the symmetric difference contains a digit.
        """
        def to_2gram_set(s):
            return {s[i:i+2] for i in range(len(s) - 1)}

        set_a = to_2gram_set(a)
        set_b = to_2gram_set(b)
        diff = set_a ^ set_b

        return any(any(c.isdigit() for c in pair) for pair in diff)

    def is_similarity(self, a, b):
        """Pre-filter to determine if two entity names are similar enough to warrant LLM comparison.

        Uses different strategies for English vs non-English text:
        - English: edit distance must be at most half the shorter name length.
        - Non-English: character-level Jaccard overlap must be >= 0.8 (or > 1 shared
          character for very short names).

        Also rejects pairs whose differences involve digits (likely distinct entities).

        Args:
            a: First entity name.
            b: Second entity name.

        Returns:
            True if the names are similar enough to be candidate duplicates.
        """
        # Reject if numeric differences exist (e.g., "V1" vs "V2")
        if self._has_digit_in_2gram_diff(a, b):
            return False

        # English names: use edit distance
        if is_english(a) and is_english(b):
            if editdistance.eval(a, b) <= min(len(a), len(b)) // 2:
                return True
            return False

        # Non-English names: use character-level Jaccard overlap
        a, b = set(a), set(b)
        max_l = max(len(a), len(b))
        if max_l < 4:
            return len(a & b) > 1

        return len(a & b)*1./max_l >= 0.8
