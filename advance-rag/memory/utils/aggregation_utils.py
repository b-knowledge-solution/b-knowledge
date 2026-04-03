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

"""Pure aggregation helpers for search results (no heavy dependencies).

This module provides lightweight utility functions for aggregating search result
documents by field values. It is intentionally free of heavy dependencies so it
can be imported from any doc-store backend (OpenSearch, Infinity, OceanBase)
without pulling in unnecessary libraries.
"""


def aggregate_by_field(messages: list | None, field_name: str) -> list[tuple[str, int]]:
    """Aggregate message documents by a specified field, returning value-count pairs.

    Handles two input formats:
    - Pre-aggregated rows: dicts containing "value" and "count" keys (passed through directly).
    - Per-document field values: strings or lists of strings whose occurrences are counted.

    Args:
        messages: List of message dictionaries to aggregate. May be None or empty.
        field_name: The field key to aggregate on within each message dict.

    Returns:
        A list of (value, count) tuples. Pre-aggregated rows appear first,
        followed by counted per-document values.
    """
    if not messages:
        return []

    counts: dict[str, int] = {}
    result: list[tuple[str, int]] = []

    for doc in messages:
        # Pass through pre-aggregated rows from the search engine
        if "value" in doc and "count" in doc:
            result.append((doc["value"], doc["count"]))
            continue

        # Skip documents that don't contain the target field
        if field_name not in doc:
            continue

        # Count occurrences of each distinct value (supports both str and list[str])
        v = doc[field_name]
        if isinstance(v, list):
            for vv in v:
                if isinstance(vv, str):
                    key = vv.strip()
                    if key:
                        counts[key] = counts.get(key, 0) + 1
        elif isinstance(v, str):
            key = v.strip()
            if key:
                counts[key] = counts.get(key, 0) + 1

    # Append the manually counted values to the result list
    if counts:
        for k, v in counts.items():
            result.append((k, v))

    return result
