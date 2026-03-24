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
"""Base64 serialization utilities for Peewee model fields.

Provides pickle-based serialization with base64 encoding for storing
complex Python objects in database text columns.
"""
import base64
import logging
import pickle


def serialize_b64(obj, to_str=False):
    """Serialize a Python object to base64-encoded pickle.

    @param obj: Object to serialize.
    @param to_str: If True, return as UTF-8 string instead of bytes.
    @returns: Base64-encoded representation.
    """
    if obj is None:
        return None
    try:
        data = base64.b64encode(pickle.dumps(obj))
        if to_str:
            return data.decode("utf-8")
        return data
    except Exception as e:
        logging.warning(f"serialize_b64 failed: {e}")
        return None


def deserialize_b64(data):
    """Deserialize a base64-encoded pickle string/bytes back to a Python object.

    @param data: Base64-encoded string or bytes.
    @returns: Deserialized Python object, or empty dict on failure.
    """
    if data is None:
        return {}
    try:
        if isinstance(data, str):
            data = data.encode("utf-8")
        return pickle.loads(base64.b64decode(data))
    except Exception as e:
        logging.warning(f"deserialize_b64 failed: {e}")
        return {}
