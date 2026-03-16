#
#  Copyright 2025 The InfiniFlow Authors. All Rights Reserved.
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
"""
Token counting and truncation utilities using the tiktoken library.

Uses the ``cl100k_base`` encoding (the same tokenizer used by GPT-3.5/4)
to count tokens, extract total-token usage from various LLM provider
response formats, and truncate text to a maximum token length.

The tiktoken cache directory is set to the project base so that the
pre-cached BPE data files shipped with the Docker image are found
without network access.
"""

import os
import tiktoken

from common.file_utils import get_project_base_directory

# Point tiktoken at the project root so it finds pre-cached encoding files
tiktoken_cache_dir = get_project_base_directory()
os.environ["TIKTOKEN_CACHE_DIR"] = tiktoken_cache_dir
# Use cl100k_base encoding (shared by GPT-3.5-turbo and GPT-4)
encoder = tiktoken.get_encoding("cl100k_base")


def num_tokens_from_string(string: str) -> int:
    """Returns the number of tokens in a text string.

    Args:
        string: The text to tokenize.

    Returns:
        Token count, or 0 if encoding fails.
    """
    try:
        code_list = encoder.encode(string)
        return len(code_list)
    except Exception:
        return 0

def total_token_count_from_response(resp):
    """
    Extract token count from LLM response in various formats.

    Handles None responses and different response structures from various LLM
    providers (OpenAI, Google, Cohere, dict-based responses, etc.).

    Args:
        resp: LLM response object or dict. May be None.

    Returns:
        Total token count as int, or 0 if count cannot be determined.
    """
    if resp is None:
        return 0

    # OpenAI-style: resp.usage.total_tokens
    try:
        if hasattr(resp, "usage") and hasattr(resp.usage, "total_tokens"):
            return resp.usage.total_tokens
    except Exception:
        pass

    # Google-style: resp.usage_metadata.total_tokens
    try:
        if hasattr(resp, "usage_metadata") and hasattr(resp.usage_metadata, "total_tokens"):
            return resp.usage_metadata.total_tokens
    except Exception:
        pass

    # Cohere-style: resp.meta.billed_units.input_tokens
    try:
        if hasattr(resp, "meta") and hasattr(resp.meta, "billed_units") and hasattr(resp.meta.billed_units, "input_tokens"):
            return resp.meta.billed_units.input_tokens
    except Exception:
        pass

    # Dict-based: resp["usage"]["total_tokens"]
    if isinstance(resp, dict) and 'usage' in resp and 'total_tokens' in resp['usage']:
        try:
            return resp["usage"]["total_tokens"]
        except Exception:
            pass

    # Dict-based: resp["usage"]["input_tokens"] + resp["usage"]["output_tokens"]
    if isinstance(resp, dict) and 'usage' in resp and 'input_tokens' in resp['usage'] and 'output_tokens' in resp['usage']:
        try:
            return resp["usage"]["input_tokens"] + resp["usage"]["output_tokens"]
        except Exception:
            pass

    # Dict-based Cohere: resp["meta"]["tokens"]["input_tokens"] + ["output_tokens"]
    if isinstance(resp, dict) and 'meta' in resp and 'tokens' in resp['meta'] and 'input_tokens' in resp['meta']['tokens'] and 'output_tokens' in resp['meta']['tokens']:
        try:
            return resp["meta"]["tokens"]["input_tokens"] + resp["meta"]["tokens"]["output_tokens"]
        except Exception:
            pass
    return 0


def truncate(string: str, max_len: int) -> str:
    """Truncate text to at most *max_len* tokens and decode back to a string.

    Args:
        string: Input text.
        max_len: Maximum number of tokens to keep.

    Returns:
        The truncated text string.
    """
    return encoder.decode(encoder.encode(string)[:max_len])
