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

"""Utility for parsing JSON from LLM response strings.

This module provides a helper to safely extract JSON objects from LLM outputs,
which may be wrapped in markdown code fences (e.g. ```json ... ```). It is
used during memory extraction to parse structured data returned by language models.
"""

import json


def get_json_result_from_llm_response(response_str: str) -> dict:
    """Parse an LLM response string to extract a JSON object.

    Strips optional markdown code fence delimiters (```json / ```) and
    attempts to parse the remaining content as JSON. Returns an empty
    dictionary on parse failure rather than raising.

    Args:
        response_str: The raw response string from an LLM, potentially
            wrapped in markdown code fences.

    Returns:
        A dictionary parsed from the JSON content, or an empty dict
        if parsing fails.
    """
    try:
        # Strip markdown code fence wrappers if present
        clean_str = response_str.strip()
        if clean_str.startswith('```json'):
            clean_str = clean_str[7:]  # Remove the starting ```json
        if clean_str.endswith('```'):
            clean_str = clean_str[:-3]  # Remove the ending ```

        return json.loads(clean_str.strip())
    except (ValueError, json.JSONDecodeError):
        return {}
