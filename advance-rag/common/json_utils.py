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
"""JSON serialization utilities with custom type support.

Provides JSON encoding/decoding with support for datetime, Enum, set,
and custom BaseType objects. Used by Peewee JSONField and SerializedField.
"""
import datetime
import importlib
import json
from enum import Enum


class BaseType:
    """Base class for custom serializable types.

    Subclasses automatically get to_dict() and to_dict_with_type()
    methods for JSON serialization.
    """

    def to_dict(self):
        """Convert to dict, stripping leading underscores from attribute names."""
        d = {}
        for k, v in self.__dict__.items():
            # Strip leading underscores from attribute names
            key = k.lstrip("_") if k.startswith("_") else k
            d[key] = v
        return d

    def to_dict_with_type(self):
        """Serialize with type metadata for deserialization."""
        data = {}
        for k, v in self.__dict__.items():
            key = k.lstrip("_") if k.startswith("_") else k
            if isinstance(v, BaseType):
                data[key] = v.to_dict_with_type()
            else:
                data[key] = {"type": type(v).__name__, "data": v, "module": None}
        return {
            "type": type(self).__name__,
            "module": type(self).__module__,
            "data": data,
        }


class CustomJSONEncoder(json.JSONEncoder):
    """JSON encoder with support for datetime, Enum, set, and BaseType."""

    def default(self, o):
        if isinstance(o, datetime.datetime):
            return o.strftime("%Y-%m-%d %H:%M:%S")
        if isinstance(o, datetime.date):
            return o.strftime("%Y-%m-%d")
        if isinstance(o, datetime.timedelta):
            return str(o)
        if isinstance(o, Enum):
            return o.value
        if isinstance(o, set):
            return list(o)
        if isinstance(o, BaseType):
            return o.to_dict()
        if isinstance(o, type):
            return o.__name__
        return super().default(o)


def json_dumps(obj, byte=False, indent=None, with_type=False):
    """Serialize obj to JSON string (or bytes).

    @param obj: Object to serialize.
    @param byte: If True, return bytes instead of str.
    @param indent: Indentation level for pretty-printing.
    @param with_type: If True and obj is a BaseType, include type metadata.
    @returns: JSON string or bytes.
    """
    if with_type and isinstance(obj, BaseType):
        obj = obj.to_dict_with_type()
    result = json.dumps(obj, cls=CustomJSONEncoder, indent=indent, ensure_ascii=False)
    if byte:
        return result.encode("utf-8")
    return result


def json_loads(s, object_hook=None, object_pairs_hook=None):
    """Deserialize JSON string/bytes to Python object.

    @param s: JSON string or bytes.
    @param object_hook: Optional function applied to decoded dicts.
    @param object_pairs_hook: Optional function for ordered pairs.
    @returns: Deserialized Python object.
    """
    if isinstance(s, bytes):
        s = s.decode("utf-8")
    kwargs = {}
    if object_hook is not None:
        kwargs["object_hook"] = object_hook
    if object_pairs_hook is not None:
        kwargs["object_pairs_hook"] = object_pairs_hook
    return json.loads(s, **kwargs)


def from_dict_hook(d):
    """Object hook to reconstruct BaseType instances from typed dicts.

    Dicts with 'type', 'data', and 'module' keys are treated as serialized
    custom types. If module is None, returns raw data. Otherwise attempts
    to reconstruct the original class instance.

    @param d: Dict to potentially reconstruct.
    @returns: Reconstructed object or original dict.
    """
    if not isinstance(d, dict):
        return d
    if "type" not in d or "data" not in d:
        return d
    module_name = d.get("module")
    if module_name is None:
        return d["data"]
    try:
        mod = importlib.import_module(module_name)
        cls = getattr(mod, d["type"])
        obj = cls.__new__(cls)
        data = d["data"]
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, dict) and "data" in v:
                    setattr(obj, k, v["data"])
                else:
                    setattr(obj, k, v)
        return obj
    except (ImportError, AttributeError):
        return d
