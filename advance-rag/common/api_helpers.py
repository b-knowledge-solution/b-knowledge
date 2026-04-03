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
"""Lightweight API helper functions for the worker context.

These are inlined copies of functions from api.utils.api_utils to avoid
dragging in the quart web framework (which the task executor doesn't need).
"""
import logging
import sys
from copy import deepcopy

from common.constants import RetCode


def deep_merge(default: dict, custom: dict) -> dict:
    """Recursively merge two dicts, custom values take priority."""
    merged = deepcopy(default)
    stack = [(merged, custom)]
    while stack:
        base_dict, override_dict = stack.pop()
        for key, val in override_dict.items():
            if key in base_dict and isinstance(val, dict) and isinstance(base_dict[key], dict):
                stack.append((base_dict[key], val))
            else:
                base_dict[key] = val
    return merged


def get_data_error_result(code=RetCode.DATA_ERROR, message="Sorry! Data missing!"):
    """Return a simple error dict (no quart jsonify needed in worker context)."""
    if sys.exc_info()[0] is not None:
        logging.exception(message)
    else:
        logging.error(message)
    return {"code": code, "message": message}


def get_parser_config(chunk_method, parser_config):
    """Build parser config with defaults for the given chunk method."""
    if not chunk_method:
        chunk_method = "naive"

    base_defaults = {
        "table_context_size": 0,
        "image_context_size": 0,
    }
    key_mapping = {
        "naive": {
            "layout_recognize": "DeepDOC",
            "chunk_token_num": 512,
            "delimiter": "\n",
            "auto_keywords": 0,
            "auto_questions": 0,
            "html4excel": False,
            "topn_tags": 3,
            "raptor": {
                "use_raptor": True,
                "prompt": "Please summarize the following paragraphs. Be careful with the numbers, do not make things up. Paragraphs as following:\n      {cluster_content}\nThe above is the content you need to summarize.",
                "max_token": 256,
                "threshold": 0.1,
                "max_cluster": 64,
                "random_seed": 0,
            },
            "graphrag": {
                "use_graphrag": True,
                "entity_types": ["organization", "person", "geo", "event", "category"],
                "method": "light",
            },
        },
        "qa": {"raptor": {"use_raptor": False}, "graphrag": {"use_graphrag": False}},
        "tag": None,
        "resume": None,
        "manual": {"raptor": {"use_raptor": False}, "graphrag": {"use_graphrag": False}},
        "table": None,
        "paper": {"raptor": {"use_raptor": False}, "graphrag": {"use_graphrag": False}},
        "book": {"raptor": {"use_raptor": False}, "graphrag": {"use_graphrag": False}},
        "laws": {"raptor": {"use_raptor": False}, "graphrag": {"use_graphrag": False}},
        "presentation": {"raptor": {"use_raptor": False}, "graphrag": {"use_graphrag": False}},
        "one": None,
        "knowledge_graph": {
            "chunk_token_num": 8192,
            "delimiter": r"\n",
            "entity_types": ["organization", "person", "location", "event", "time"],
            "raptor": {"use_raptor": False},
            "graphrag": {"use_graphrag": False},
        },
        "email": None,
        "picture": None,
    }

    default_config = key_mapping.get(chunk_method)

    if not parser_config:
        if default_config is None:
            return deep_merge(base_defaults, {})
        return deep_merge(base_defaults, default_config)

    if default_config is None:
        return deep_merge(base_defaults, parser_config)

    merged_config = deep_merge(base_defaults, default_config)
    merged_config = deep_merge(merged_config, parser_config)
    return merged_config
