# Copyright (c) 2024 Microsoft Corporation.
# Licensed under the MIT License

from common.misc_utils import thread_pool_exec

"""General-mode graph extractor for entity and relationship extraction.

This module implements the general (Microsoft GraphRAG-style) entity and
relationship extraction pipeline. It uses a multi-pass gleaning approach:
after the initial extraction, it repeatedly prompts the LLM to find missed
entities, until the LLM indicates no more remain or the max gleaning count
is reached.

Reference:
 - [graphrag](https://github.com/microsoft/graphrag)
"""

import re
from typing import Any
from dataclasses import dataclass
import tiktoken

from rag.graphrag.general.extractor import Extractor, ENTITY_EXTRACTION_MAX_GLEANINGS
from rag.graphrag.general.graph_prompt import GRAPH_EXTRACTION_PROMPT, CONTINUE_PROMPT, LOOP_PROMPT
from rag.graphrag.utils import ErrorHandlerFn, perform_variable_replacements, chat_limiter, split_string_by_multi_markers
from rag.llm.chat_model import Base as CompletionLLM
import networkx as nx
from common.token_utils import num_tokens_from_string

# Default delimiters for parsing LLM extraction output
DEFAULT_TUPLE_DELIMITER = "<|>"
DEFAULT_RECORD_DELIMITER = "##"
DEFAULT_COMPLETION_DELIMITER = "<|COMPLETE|>"


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
    """General-mode entity and relationship extractor using Microsoft GraphRAG prompts.

    Uses the GRAPH_EXTRACTION_PROMPT with tuple/record/completion delimiters
    to extract entities and relationships from text. Supports iterative
    gleaning to maximize entity recall.
    """

    _join_descriptions: bool
    _tuple_delimiter_key: str
    _record_delimiter_key: str
    _entity_types_key: str
    _input_text_key: str
    _completion_delimiter_key: str
    _entity_name_key: str
    _input_descriptions_key: str
    _extraction_prompt: str
    _summarization_prompt: str
    _loop_args: dict[str, Any]
    _max_gleanings: int
    _on_error: ErrorHandlerFn

    def __init__(
        self,
        llm_invoker: CompletionLLM,
        language: str | None = "English",
        entity_types: list[str] | None = None,
        tuple_delimiter_key: str | None = None,
        record_delimiter_key: str | None = None,
        input_text_key: str | None = None,
        entity_types_key: str | None = None,
        completion_delimiter_key: str | None = None,
        join_descriptions=True,
        max_gleanings: int | None = None,
        on_error: ErrorHandlerFn | None = None,
    ):
        """Initialize the general-mode graph extractor.

        Args:
            llm_invoker: LLM client for chat completions.
            language: Output language for extractions.
            entity_types: List of entity type labels to extract.
            tuple_delimiter_key: Override key for tuple delimiter variable.
            record_delimiter_key: Override key for record delimiter variable.
            input_text_key: Override key for input text variable.
            entity_types_key: Override key for entity types variable.
            completion_delimiter_key: Override key for completion delimiter variable.
            join_descriptions: Whether to join duplicate descriptions.
            max_gleanings: Maximum gleaning iterations (default 2).
            on_error: Custom error handler callback.
        """
        super().__init__(llm_invoker, language, entity_types)
        # TODO: streamline construction
        self._llm = llm_invoker
        self._join_descriptions = join_descriptions
        self._input_text_key = input_text_key or "input_text"
        self._tuple_delimiter_key = tuple_delimiter_key or "tuple_delimiter"
        self._record_delimiter_key = record_delimiter_key or "record_delimiter"
        self._completion_delimiter_key = (
            completion_delimiter_key or "completion_delimiter"
        )
        self._entity_types_key = entity_types_key or "entity_types"
        self._extraction_prompt = GRAPH_EXTRACTION_PROMPT
        self._max_gleanings = (
            max_gleanings
            if max_gleanings is not None
            else ENTITY_EXTRACTION_MAX_GLEANINGS
        )
        self._on_error = on_error or (lambda _e, _s, _d: None)
        self.prompt_token_count = num_tokens_from_string(self._extraction_prompt)

        # Construct logit bias args for yes/no continuation decision
        encoding = tiktoken.get_encoding("cl100k_base")
        yes = encoding.encode("YES")
        no = encoding.encode("NO")
        self._loop_args = {"logit_bias": {yes[0]: 100, no[0]: 100}, "max_tokens": 1}

        # Wire defaults into the prompt variables
        self._prompt_variables = {
            self._tuple_delimiter_key: DEFAULT_TUPLE_DELIMITER,
            self._record_delimiter_key: DEFAULT_RECORD_DELIMITER,
            self._completion_delimiter_key: DEFAULT_COMPLETION_DELIMITER,
            self._entity_types_key: ",".join(entity_types),
        }

    async def _process_single_content(self, chunk_key_dp: tuple[str, str], chunk_seq: int, num_chunks: int, out_results, task_id=""):
        """Extract entities and relationships from a single text chunk.

        Sends the chunk through the extraction prompt, then iteratively
        applies gleaning passes to find missed entities.

        Args:
            chunk_key_dp: Tuple of (chunk_key, chunk_content).
            chunk_seq: Sequence number of this chunk (for progress reporting).
            num_chunks: Total number of chunks being processed.
            out_results: Shared list to append extraction results to.
            task_id: Task identifier for cancellation checking.
        """
        token_count = 0
        chunk_key = chunk_key_dp[0]
        content = chunk_key_dp[1]
        variables = {
            **self._prompt_variables,
            self._input_text_key: content,
        }
        hint_prompt = perform_variable_replacements(self._extraction_prompt, variables=variables)
        # Initial extraction pass
        async with chat_limiter:
            response = await thread_pool_exec(self._chat,hint_prompt,[{"role": "user", "content": "Output:"}],{},task_id)
        token_count += num_tokens_from_string(hint_prompt + response)

        results = response or ""
        history = [{"role": "system", "content": hint_prompt}, {"role": "user", "content": response}]

        # Repeat extraction (gleaning) to maximize entity count
        for i in range(self._max_gleanings):
            history.append({"role": "user", "content": CONTINUE_PROMPT})
            async with chat_limiter:
                response = await thread_pool_exec(self._chat, "", history, {})
            token_count += num_tokens_from_string("\n".join([m["content"] for m in history]) + response)
            results += response or ""

            # if this is the final glean, don't bother updating the continuation flag
            if i >= self._max_gleanings - 1:
                break
            # Ask LLM if more entities remain
            history.append({"role": "assistant", "content": response})
            history.append({"role": "user", "content": LOOP_PROMPT})
            async with chat_limiter:
                continuation = await thread_pool_exec(self._chat, "", history)
            token_count += num_tokens_from_string("\n".join([m["content"] for m in history]) + response)
            if continuation != "Y":
                break
            history.append({"role": "assistant", "content": "Y"})

        # Parse the accumulated results into entity/relationship records
        records = split_string_by_multi_markers(
            results,
            [self._prompt_variables[self._record_delimiter_key], self._prompt_variables[self._completion_delimiter_key]],
        )
        # Extract the parenthesized content from each record
        rcds = []
        for record in records:
            record = re.search(r"\((.*)\)", record)
            if record is None:
                continue
            rcds.append(record.group(1))
        records = rcds
        maybe_nodes, maybe_edges = self._entities_and_relations(chunk_key, records, self._prompt_variables[self._tuple_delimiter_key])
        out_results.append((maybe_nodes, maybe_edges, token_count))
        if self.callback:
            self.callback(0.5+0.1*len(out_results)/num_chunks, msg = f"Entities extraction of chunk {chunk_seq} {len(out_results)}/{num_chunks} done, {len(maybe_nodes)} nodes, {len(maybe_edges)} edges, {token_count} tokens.")
