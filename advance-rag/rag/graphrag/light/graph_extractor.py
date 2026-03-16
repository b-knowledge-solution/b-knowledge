# Copyright (c) 2024 Microsoft Corporation.
# Licensed under the MIT License

from common.misc_utils import thread_pool_exec

"""Light-mode graph extractor for entity and relationship extraction.

This module implements the light-mode (LightRAG-style) entity and relationship
extraction pipeline. Like the general-mode extractor, it uses iterative gleaning
to maximize entity recall, but with a different prompt format that also extracts
content-level keywords and relationship keywords.

Reference:
 - [graphrag](https://github.com/microsoft/graphrag)
 - [LightRAG](https://github.com/HKUDS/LightRAG)
"""

import logging
import re
from dataclasses import dataclass
from typing import Any

import networkx as nx

from rag.graphrag.general.extractor import ENTITY_EXTRACTION_MAX_GLEANINGS, Extractor
from rag.graphrag.light.graph_prompt import PROMPTS
from rag.graphrag.utils import chat_limiter, pack_user_ass_to_openai_messages, split_string_by_multi_markers
from rag.llm.chat_model import Base as CompletionLLM
from common.token_utils import num_tokens_from_string

@dataclass
class GraphExtractionResult:
    """Container for graph extraction results.

    Attributes:
        output: The extracted knowledge graph.
        source_docs: Mapping of document keys to their source content.
    """

    output: nx.Graph
    source_docs: dict[Any, Any]


class GraphExtractor(Extractor):
    """Light-mode entity and relationship extractor using LightRAG prompts.

    Uses LightRAG-style prompts with content keywords and relationship keywords.
    Supports iterative gleaning to find missed entities.

    Attributes:
        _max_gleanings: Maximum number of gleaning iterations.
        _example_number: Number of few-shot examples to include.
        _entity_extract_prompt: The main extraction prompt template.
        _context_base: Base context variables for prompt formatting.
        _continue_prompt: Follow-up prompt for additional extraction.
        _if_loop_prompt: Prompt asking if more entities remain.
        _left_token_count: Available token budget for input text.
    """
    _max_gleanings: int

    def __init__(
        self,
        llm_invoker: CompletionLLM,
        language: str | None = "English",
        entity_types: list[str] | None = None,
        example_number: int = 2,
        max_gleanings: int | None = None,
    ):
        """Initialize the light-mode graph extractor.

        Args:
            llm_invoker: LLM client for chat completions.
            language: Output language for extractions.
            entity_types: List of entity type labels to extract.
            example_number: Number of few-shot examples (default 2).
            max_gleanings: Maximum gleaning iterations.
        """
        super().__init__(llm_invoker, language, entity_types)
        self._max_gleanings = max_gleanings if max_gleanings is not None else ENTITY_EXTRACTION_MAX_GLEANINGS
        self._example_number = example_number
        examples = "\n".join(PROMPTS["entity_extraction_examples"][: int(self._example_number)])

        # Build context variables for prompt formatting
        example_context_base = dict(
            tuple_delimiter=PROMPTS["DEFAULT_TUPLE_DELIMITER"],
            record_delimiter=PROMPTS["DEFAULT_RECORD_DELIMITER"],
            completion_delimiter=PROMPTS["DEFAULT_COMPLETION_DELIMITER"],
            entity_types=",".join(self._entity_types),
            language=self._language,
        )
        # add example's format
        examples = examples.format(**example_context_base)

        self._entity_extract_prompt = PROMPTS["entity_extraction"]
        self._context_base = dict(
            tuple_delimiter=PROMPTS["DEFAULT_TUPLE_DELIMITER"],
            record_delimiter=PROMPTS["DEFAULT_RECORD_DELIMITER"],
            completion_delimiter=PROMPTS["DEFAULT_COMPLETION_DELIMITER"],
            entity_types=",".join(self._entity_types),
            examples=examples,
            language=self._language,
        )

        self._continue_prompt = PROMPTS["entity_continue_extraction"].format(**self._context_base)
        self._if_loop_prompt = PROMPTS["entity_if_loop_extraction"]

        # Calculate available token budget for input text
        self._left_token_count = llm_invoker.max_length - num_tokens_from_string(self._entity_extract_prompt.format(**self._context_base, input_text=""))
        self._left_token_count = max(llm_invoker.max_length * 0.6, self._left_token_count)

    async def _process_single_content(self, chunk_key_dp: tuple[str, str], chunk_seq: int, num_chunks: int, out_results, task_id=""):
        """Extract entities and relationships from a single text chunk.

        Uses the LightRAG prompt format with iterative gleaning.

        Args:
            chunk_key_dp: Tuple of (chunk_key, chunk_content).
            chunk_seq: Sequence number of this chunk.
            num_chunks: Total number of chunks being processed.
            out_results: Shared list to append extraction results to.
            task_id: Task identifier for cancellation checking.
        """
        token_count = 0
        chunk_key = chunk_key_dp[0]
        content = chunk_key_dp[1]
        hint_prompt = self._entity_extract_prompt.format(**self._context_base, input_text=content)

        gen_conf = {}
        logging.info(f"Start processing for {chunk_key}: {content[:25]}...")
        if self.callback:
            self.callback(msg=f"Start processing for {chunk_key}: {content[:25]}...")
        # Initial extraction pass
        async with chat_limiter:
            final_result = await thread_pool_exec(self._chat,"",[{"role": "user", "content": hint_prompt}],gen_conf,task_id)
        token_count += num_tokens_from_string(hint_prompt + final_result)
        # Build conversation history for gleaning
        history = pack_user_ass_to_openai_messages(hint_prompt, final_result, self._continue_prompt)
        # Iterative gleaning to find missed entities
        for now_glean_index in range(self._max_gleanings):
            async with chat_limiter:
                glean_result = await thread_pool_exec(self._chat,"",history,gen_conf,task_id)
            history.extend([{"role": "assistant", "content": glean_result}])
            token_count += num_tokens_from_string("\n".join([m["content"] for m in history]) + hint_prompt + self._continue_prompt)
            final_result += glean_result
            if now_glean_index == self._max_gleanings - 1:
                break

            # Ask LLM if more entities remain
            history.extend([{"role": "user", "content": self._if_loop_prompt}])
            async with chat_limiter:
                if_loop_result = await thread_pool_exec(self._chat,"",history,gen_conf,task_id)
            token_count += num_tokens_from_string("\n".join([m["content"] for m in history]) + if_loop_result + self._if_loop_prompt)
            if_loop_result = if_loop_result.strip().strip('"').strip("'").lower()
            if if_loop_result != "yes":
                break
            history.extend([{"role": "assistant", "content": if_loop_result}, {"role": "user", "content": self._continue_prompt}])

        logging.info(f"Completed processing for {chunk_key}: {content[:25]}... after {now_glean_index} gleanings, {token_count} tokens.")
        if self.callback:
            self.callback(msg=f"Completed processing for {chunk_key}: {content[:25]}... after {now_glean_index} gleanings, {token_count} tokens.")
        # Parse the accumulated results into entity/relationship records
        records = split_string_by_multi_markers(
            final_result,
            [self._context_base["record_delimiter"], self._context_base["completion_delimiter"]],
        )
        # Extract the parenthesized content from each record
        rcds = []
        for record in records:
            record = re.search(r"\((.*)\)", record)
            if record is None:
                continue
            rcds.append(record.group(1))
        records = rcds
        maybe_nodes, maybe_edges = self._entities_and_relations(chunk_key, records, self._context_base["tuple_delimiter"])
        out_results.append((maybe_nodes, maybe_edges, token_count))
        if self.callback:
            self.callback(
                0.5 + 0.1 * len(out_results) / num_chunks,
                msg=f"Entities extraction of chunk {chunk_seq} {len(out_results)}/{num_chunks} done, {len(maybe_nodes)} nodes, {len(maybe_edges)} edges, {token_count} tokens.",
            )
