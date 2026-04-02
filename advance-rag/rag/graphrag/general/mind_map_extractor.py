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
"""Mind map extractor for GraphRAG.

This module converts document text into a hierarchical mind map structure.
It splits text into token-limited batches, sends each batch to an LLM to
produce a markdown outline, parses the markdown into a nested dictionary,
and merges all partial results into a single tree structure.
"""

import asyncio
import logging
import collections
import re
from typing import Any
from dataclasses import dataclass

from rag.graphrag.general.extractor import Extractor
from rag.graphrag.general.mind_map_prompt import MIND_MAP_EXTRACTION_PROMPT
from rag.graphrag.utils import ErrorHandlerFn, perform_variable_replacements, chat_limiter
from rag.llm.chat_model import Base as CompletionLLM
import markdown_to_json
from functools import reduce
from common.token_utils import num_tokens_from_string

from common.misc_utils import thread_pool_exec

@dataclass
class MindMapResult:
    """Container for mind map extraction results.

    Attributes:
        output: Nested dictionary representing the mind map tree,
            with "id" and "children" keys at each level.
    """
    output: dict


class MindMapExtractor(Extractor):
    """Extracts a hierarchical mind map from document text using LLM.

    Splits input sections into token-limited batches, generates markdown-formatted
    mind maps via LLM, parses them into dictionaries, and deep-merges the results
    into a single tree.

    Attributes:
        _input_text_key: Prompt variable key for the input text.
        _mind_map_prompt: The prompt template for mind map generation.
        _on_error: Error handler callback.
    """
    _input_text_key: str
    _mind_map_prompt: str
    _on_error: ErrorHandlerFn

    def __init__(
            self,
            llm_invoker: CompletionLLM,
            prompt: str | None = None,
            input_text_key: str | None = None,
            on_error: ErrorHandlerFn | None = None,
    ):
        """Initialize the mind map extractor.

        Args:
            llm_invoker: LLM client for chat completions.
            prompt: Custom prompt template (defaults to MIND_MAP_EXTRACTION_PROMPT).
            input_text_key: Override key for input text variable.
            on_error: Custom error handler callback.
        """
        # TODO: streamline construction
        self._llm = llm_invoker
        self._input_text_key = input_text_key or "input_text"
        self._mind_map_prompt = prompt or MIND_MAP_EXTRACTION_PROMPT
        self._on_error = on_error or (lambda _e, _s, _d: None)

    def _key(self, k):
        """Remove markdown bold markers (asterisks) from a key string.

        Args:
            k: The key string potentially containing asterisk markers.

        Returns:
            The cleaned key string.
        """
        return re.sub(r"\*+", "", k)

    def _be_children(self, obj: dict, keyset: set):
        """Recursively convert a nested dict/list into the mind map children format.

        Args:
            obj: The nested dict, list, or string to convert.
            keyset: Set of already-used keys for deduplication (modified in place).

        Returns:
            List of child node dictionaries with "id" and "children" keys.
        """
        if isinstance(obj, str):
            obj = [obj]
        if isinstance(obj, list):
            keyset.update(obj)
            obj = [re.sub(r"\*+", "", i) for i in obj]
            return [{"id": i, "children": []} for i in obj if i]
        arr = []
        for k, v in obj.items():
            k = self._key(k)
            if k and k not in keyset:
                keyset.add(k)
                arr.append(
                    {
                        "id": k,
                        "children": self._be_children(v, keyset)
                    }
                )
        return arr

    async def __call__(
            self, sections: list[str], prompt_variables: dict[str, Any] | None = None
    ) -> MindMapResult:
        """Generate a mind map from a list of text sections.

        Splits sections into token-limited batches, processes each batch
        concurrently through the LLM, and merges results into a single tree.

        Args:
            sections: List of text sections to process.
            prompt_variables: Optional overrides for prompt template variables.

        Returns:
            MindMapResult containing the hierarchical mind map tree.
        """
        if prompt_variables is None:
            prompt_variables = {}

        res = []
        # Calculate max tokens to leave room for LLM response
        token_count = max(self._llm.max_length * 0.8, self._llm.max_length - 512)
        texts = []
        cnt = 0
        tasks = []
        # Batch sections together up to the token limit
        for i in range(len(sections)):
            section_cnt = num_tokens_from_string(sections[i])
            if cnt + section_cnt >= token_count and texts:
                tasks.append(asyncio.create_task(
                    self._process_document("".join(texts), prompt_variables, res)
                ))
                texts = []
                cnt = 0

            texts.append(sections[i])
            cnt += section_cnt
        # Process any remaining text
        if texts:
            tasks.append(asyncio.create_task(
                self._process_document("".join(texts), prompt_variables, res)
            ))
        try:
            await asyncio.gather(*tasks, return_exceptions=False)
        except Exception as e:
            logging.error(f"Error processing document: {e}")
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
        if not res:
            return MindMapResult(output={"id": "root", "children": []})
        # Deep-merge all partial mind maps into one
        merge_json = reduce(self._merge, res)
        # Convert merged dict into the tree format with "id" and "children"
        if len(merge_json) > 1:
            keys = [re.sub(r"\*+", "", k) for k, v in merge_json.items() if isinstance(v, dict)]
            keyset = set(i for i in keys if i)
            merge_json = {
                "id": "root",
                "children": [
                    {
                        "id": self._key(k),
                        "children": self._be_children(v, keyset)
                    }
                    for k, v in merge_json.items() if isinstance(v, dict) and self._key(k)
                ]
            }
        else:
            k = self._key(list(merge_json.keys())[0])
            merge_json = {"id": k, "children": self._be_children(list(merge_json.items())[0][1], {k})}

        return MindMapResult(output=merge_json)

    def _merge(self, d1, d2):
        """Deep-merge two dictionaries, combining lists and nested dicts.

        Args:
            d1: First dictionary.
            d2: Second dictionary (receives merged values).

        Returns:
            The merged dictionary d2.
        """
        for k in d1:
            if k in d2:
                if isinstance(d1[k], dict) and isinstance(d2[k], dict):
                    self._merge(d1[k], d2[k])
                elif isinstance(d1[k], list) and isinstance(d2[k], list):
                    d2[k].extend(d1[k])
                else:
                    d2[k] = d1[k]
            else:
                d2[k] = d1[k]

        return d2

    def _list_to_kv(self, data):
        """Convert lists within a nested dict into key-value pairs.

        When a list element is itself a list and follows a string element,
        uses the preceding string as the key.

        Args:
            data: Nested dictionary to transform (modified in place).

        Returns:
            The transformed dictionary.
        """
        for key, value in data.items():
            if isinstance(value, dict):
                self._list_to_kv(value)
            elif isinstance(value, list):
                new_value = {}
                for i in range(len(value)):
                    if isinstance(value[i], list) and i > 0:
                        new_value[value[i - 1]] = value[i][0]
                data[key] = new_value
            else:
                continue
        return data

    def _todict(self, layer: collections.OrderedDict):
        """Recursively convert an OrderedDict (from markdown_to_json) to a regular dict.

        Args:
            layer: The OrderedDict to convert.

        Returns:
            A regular dictionary with list-to-kv transformations applied.
        """
        to_ret = layer
        if isinstance(layer, collections.OrderedDict):
            to_ret = dict(layer)

        try:
            for key, value in to_ret.items():
                to_ret[key] = self._todict(value)
        except AttributeError:
            pass

        return self._list_to_kv(to_ret)

    async def _process_document(
            self, text: str, prompt_variables: dict[str, str], out_res
    ) -> str:
        """Process a single text batch through the LLM to generate a mind map section.

        Args:
            text: The text content to convert into a mind map.
            prompt_variables: Variables for prompt template substitution.
            out_res: Shared list to append the parsed mind map dict to.

        Returns:
            The raw LLM response string.
        """
        variables = {
            **prompt_variables,
            self._input_text_key: text,
        }
        text = perform_variable_replacements(self._mind_map_prompt, variables=variables)
        async with chat_limiter:
            response = await thread_pool_exec(self._chat,text,[{"role": "user", "content": "Output:"}],{})
        # Strip markdown code fence markers from the response
        response = re.sub(r"```[^\n]*", "", response)
        logging.debug(response)
        logging.debug(self._todict(markdown_to_json.dictify(response)))
        out_res.append(self._todict(markdown_to_json.dictify(response)))
