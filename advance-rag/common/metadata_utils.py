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
Metadata filtering and schema utilities for RAG retrieval.

Supports three filtering modes used during document retrieval:

- **auto**: An LLM generates filter conditions from the user query and available metadata.
- **semi_auto**: The LLM generates conditions but is restricted to user-selected metadata keys.
- **manual**: Filter conditions are provided directly by the caller.

Also provides helpers to merge metadata dicts, deduplicate lists, convert
metadata definitions to JSON Schema, and normalise legacy formats.
"""
import ast
import logging
from typing import Any, Callable, Dict

import json_repair

def convert_conditions(metadata_condition):
    """Convert frontend filter conditions into the internal operator format.

    Maps human-readable operators (e.g. ``"is"``, ``"not is"``) to their
    symbolic equivalents (``"="``, ``"!="``) and restructures each condition
    into ``{"op", "key", "value"}`` dicts.

    Args:
        metadata_condition: Dict with a ``"conditions"`` list, or None.

    Returns:
        List of condition dicts with ``op``, ``key``, and ``value`` keys.
    """
    if metadata_condition is None:
        metadata_condition = {}
    op_mapping = {
        "is": "=",
        "not is": "≠",
        ">=": "≥",
        "<=": "≤",
        "!=": "≠"
    }
    return [
        {
            "op": op_mapping.get(cond["comparison_operator"], cond["comparison_operator"]),
            "key": cond["name"],
            "value": cond["value"]
        }
        for cond in metadata_condition.get("conditions", [])
    ]


def meta_filter(metas: dict, filters: list[dict], logic: str = "and"):
    """Apply metadata filters against an inverted index of metadata values.

    Each entry in *metas* maps a metadata key to a dict of
    ``{value: [doc_id, ...]}`` pairs.  Filters are applied sequentially using
    AND or OR logic as specified.

    Args:
        metas: Inverted metadata index ``{key: {value: [doc_ids]}}``.
        filters: List of filter dicts, each with ``op``, ``key``, and ``value``.
        logic: Combination logic -- ``"and"`` (intersection) or ``"or"`` (union).

    Returns:
        List of matching document IDs.
    """
    doc_ids = set([])

    def filter_out(v2docs, operator, value):
        """Evaluate a single filter operator against all values in v2docs.

        Args:
            v2docs: Mapping of metadata values to lists of document IDs.
            operator: Comparison operator string (e.g. "=", "contains", ">=").
            value: The target value to compare against.

        Returns:
            List of document IDs that match the filter.
        """
        ids = []
        for input, docids in v2docs.items():

            if operator in ["=", "≠", ">", "<", "≥", "≤"]:
                # Check if input is in YYYY-MM-DD date format
                input_str = str(input).strip()
                value_str = str(value).strip()

                # Strict date format detection: YYYY-MM-DD (must be 10 chars with correct format)
                is_input_date = (
                    len(input_str) == 10 and
                    input_str[4] == '-' and
                    input_str[7] == '-' and
                    input_str[:4].isdigit() and
                    input_str[5:7].isdigit() and
                    input_str[8:10].isdigit()
                )

                is_value_date = (
                    len(value_str) == 10 and
                    value_str[4] == '-' and
                    value_str[7] == '-' and
                    value_str[:4].isdigit() and
                    value_str[5:7].isdigit() and
                    value_str[8:10].isdigit()
                )

                if is_value_date:
                    # Query value is in date format
                    if is_input_date:
                        # Data is also in date format: perform date comparison
                        input = input_str
                        value = value_str
                    else:
                        # Data is not in date format: skip this record (no match)
                        continue
                else:
                    # Query value is not in date format: use original logic
                    try:
                        if isinstance(input, list):
                            input = input[0]
                        # Safely evaluate string literals to their Python types
                        input = ast.literal_eval(input)
                        value = ast.literal_eval(value)
                    except Exception:
                        pass

                    # Convert strings to lowercase for case-insensitive comparison
                    if isinstance(input, str):
                        input = input.lower()
                    if isinstance(value, str):
                        value = value.lower()
            else:
                # Non-comparison operators: maintain original logic
                if isinstance(input, str):
                    input = input.lower()
                if isinstance(value, str):
                    value = value.lower()

            matched = False
            try:
                if operator == "contains":
                    matched = str(input).find(value) >= 0 if not isinstance(input, list) else any(str(i).find(value) >= 0 for i in input)
                elif operator == "not contains":
                    matched = str(input).find(value) == -1 if not isinstance(input, list) else all(str(i).find(value) == -1 for i in input)
                elif operator == "in":
                    matched = input in value if not isinstance(input, list) else all(i in value for i in input)
                elif operator == "not in":
                    matched = input not in value if not isinstance(input, list) else all(i not in value for i in input)
                elif operator == "start with":
                    matched = str(input).lower().startswith(str(value).lower()) if not isinstance(input, list) else "".join([str(i).lower() for i in input]).startswith(str(value).lower())
                elif operator == "end with":
                    matched = str(input).lower().endswith(str(value).lower()) if not isinstance(input, list) else "".join([str(i).lower() for i in input]).endswith(str(value).lower())
                elif operator == "empty":
                    matched = not input
                elif operator == "not empty":
                    matched = bool(input)
                elif operator == "=":
                    matched = input == value
                elif operator == "≠":
                    matched = input != value
                elif operator == ">":
                    matched = input > value
                elif operator == "<":
                    matched = input < value
                elif operator == "≥":
                    matched = input >= value
                elif operator == "≤":
                    matched = input <= value
            except Exception:
                pass

            if matched:
                ids.extend(docids)
        return ids

    # Apply each filter sequentially, combining results with AND/OR logic
    for f in filters:
        k = f["key"]
        if k not in metas:
            # Key not found in metas: treat as no match
            ids = []
        else:
            v2docs = metas[k]
            ids = filter_out(v2docs, f["op"], f["value"])

        if not doc_ids:
            doc_ids = set(ids)
        else:
            if logic == "and":
                doc_ids = doc_ids & set(ids)
                if not doc_ids:
                    return []
            else:
                doc_ids = doc_ids | set(ids)
    return list(doc_ids)


async def apply_meta_data_filter(
    meta_data_filter: dict | None,
    metas: dict,
    question: str,
    chat_mdl: Any = None,
    base_doc_ids: list[str] | None = None,
    manual_value_resolver: Callable[[dict], dict] | None = None,
) -> list[str] | None:
    """
    Apply metadata filtering rules and return the filtered doc_ids.

    meta_data_filter supports three modes:
    - auto: generate filter conditions via LLM (gen_meta_filter)
    - semi_auto: generate conditions using selected metadata keys only
    - manual: directly filter based on provided conditions

    Args:
        meta_data_filter: Configuration dict with ``method`` and mode-specific params.
        metas: Inverted metadata index ``{key: {value: [doc_ids]}}``.
        question: The user's query text (used by auto/semi_auto modes).
        chat_mdl: Chat model instance for LLM-based filter generation.
        base_doc_ids: Pre-existing document ID list to extend.
        manual_value_resolver: Optional callback to transform manual filter values.

    Returns:
        list of doc_ids, ["-999"] when manual filters yield no result, or None
        when auto/semi_auto filters return empty.
    """
    from rag.prompts.generator import gen_meta_filter # move from the top of the file to avoid circular import

    doc_ids = list(base_doc_ids) if base_doc_ids else []

    if not meta_data_filter:
        return doc_ids

    method = meta_data_filter.get("method")

    if method == "auto":
        # Let the LLM generate filter conditions from all available metadata
        filters: dict = await gen_meta_filter(chat_mdl, metas, question)
        doc_ids.extend(meta_filter(metas, filters["conditions"], filters.get("logic", "and")))
        if not doc_ids:
            return None
    elif method == "semi_auto":
        # Restrict LLM-generated filters to user-selected metadata keys
        selected_keys = []
        constraints = {}
        for item in meta_data_filter.get("semi_auto", []):
            if isinstance(item, str):
                selected_keys.append(item)
            elif isinstance(item, dict):
                key = item.get("key")
                op = item.get("op")
                selected_keys.append(key)
                if op:
                    constraints[key] = op

        if selected_keys:
            filtered_metas = {key: metas[key] for key in selected_keys if key in metas}
            if filtered_metas:
                filters: dict = await gen_meta_filter(chat_mdl, filtered_metas, question, constraints=constraints)
                doc_ids.extend(meta_filter(metas, filters["conditions"], filters.get("logic", "and")))
                if not doc_ids:
                    return None
    elif method == "manual":
        # Apply caller-provided filter conditions directly
        filters = meta_data_filter.get("manual", [])
        if manual_value_resolver:
            filters = [manual_value_resolver(flt) for flt in filters]
        doc_ids.extend(meta_filter(metas, filters, meta_data_filter.get("logic", "and")))
        # Return sentinel ["-999"] when manual filters explicitly match nothing
        if filters and not doc_ids:
            doc_ids = ["-999"]

    return doc_ids


def dedupe_list(values: list) -> list:
    """Remove duplicate items from a list while preserving insertion order.

    Args:
        values: List of items (stringified for dedup comparison).

    Returns:
        De-duplicated list in original order.
    """
    seen = set()
    deduped = []
    for item in values:
        key = str(item)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def update_metadata_to(metadata, meta):
    """Merge *meta* values into *metadata*, deduplicating list entries.

    Handles *meta* as either a dict or a JSON string. Only string and list
    values are accepted; other types are silently skipped.

    Args:
        metadata: Target metadata dict to update in place.
        meta: Source metadata (dict or JSON string) to merge from.

    Returns:
        The updated *metadata* dict.
    """
    if not meta:
        return metadata
    if isinstance(meta, str):
        try:
            meta = json_repair.loads(meta)
        except Exception:
            logging.error("Meta data format error.")
            return metadata
    if not isinstance(meta, dict):
        return metadata

    for k, v in meta.items():
        # Filter list values to only include strings
        if isinstance(v, list):
            v = [vv for vv in v if isinstance(vv, str)]
            if not v:
                continue
            v = dedupe_list(v)
        if not isinstance(v, list) and not isinstance(v, str):
            continue
        # Insert new key or merge into existing
        if k not in metadata:
            metadata[k] = v
            continue
        if isinstance(metadata[k], list):
            if isinstance(v, list):
                metadata[k].extend(v)
            else:
                metadata[k].append(v)
            metadata[k] = dedupe_list(metadata[k])
        else:
            metadata[k] = v

    return metadata


def metadata_schema(metadata: dict|list|None) -> Dict[str, Any]:
    """Convert a list of metadata field definitions into a JSON Schema object.

    Args:
        metadata: List of dicts with ``key``, optional ``description``, and optional ``enum``.

    Returns:
        JSON Schema dict with ``type: "object"`` and ``additionalProperties: false``.
    """
    if not metadata:
        return {}
    properties = {}

    for item in metadata:
        key = item.get("key")
        if not key:
            continue

        prop_schema = {
            "description": item.get("description", "")
        }
        if "enum" in item and item["enum"]:
            prop_schema["enum"] = item["enum"]
            prop_schema["type"] = "string"

        properties[key] = prop_schema

    json_schema = {
        "type": "object",
        "properties": properties,
    }

    json_schema["additionalProperties"] = False
    return json_schema


def _is_json_schema(obj: dict) -> bool:
    """Check if *obj* looks like a JSON Schema definition.

    Args:
        obj: Dict to inspect.

    Returns:
        True if *obj* has a ``$schema`` key or ``type: "object"`` with ``properties``.
    """
    if not isinstance(obj, dict):
        return False
    if "$schema" in obj:
        return True
    return obj.get("type") == "object" and isinstance(obj.get("properties"), dict)


def _is_metadata_list(obj: list) -> bool:
    """Check if *obj* is a list of metadata field definitions.

    Each item must be a dict with a non-empty string ``key`` and optional
    ``enum`` (list), ``description`` (str), and ``descriptions`` (str) fields.

    Args:
        obj: List to inspect.

    Returns:
        True if *obj* matches the metadata-list shape.
    """
    if not isinstance(obj, list) or not obj:
        return False
    for item in obj:
        if not isinstance(item, dict):
            return False
        key = item.get("key")
        if not isinstance(key, str) or not key:
            return False
        if "enum" in item and not isinstance(item["enum"], list):
            return False
        if "description" in item and not isinstance(item["description"], str):
            return False
        if "descriptions" in item and not isinstance(item["descriptions"], str):
            return False
    return True


def turn2jsonschema(obj: dict | list) -> Dict[str, Any]:
    """Normalise *obj* into a JSON Schema, regardless of input format.

    Accepts either an already-valid JSON Schema dict or a legacy metadata list
    and returns a standardised JSON Schema object.

    Args:
        obj: JSON Schema dict or list of metadata field definitions.

    Returns:
        JSON Schema dict, or empty dict if the input is unrecognised.
    """
    if isinstance(obj, dict) and _is_json_schema(obj):
        return obj
    if isinstance(obj, list) and _is_metadata_list(obj):
        normalized = []
        for item in obj:
            description = item.get("description", item.get("descriptions", ""))
            normalized_item = {
                "key": item.get("key"),
                "description": description,
            }
            if "enum" in item:
                normalized_item["enum"] = item["enum"]
            normalized.append(normalized_item)
        return metadata_schema(normalized)
    return {}
