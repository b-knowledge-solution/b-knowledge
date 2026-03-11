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
Pickle/base64 serialization utilities extracted from the deleted api/ layer.
"""

import io
import base64
import pickle

from common.encoding_utils import bytes_to_string, string_to_bytes
from common.config_utils import get_base_config

safe_module = {
    'numpy',
    'rag_flow'
}


class RestrictedUnpickler(pickle.Unpickler):
    """Unpickler that only allows modules in the safe_module set."""

    def find_class(self, module, name):
        import importlib
        if module.split('.')[0] in safe_module:
            _module = importlib.import_module(module)
            return getattr(_module, name)
        raise pickle.UnpicklingError("global '%s.%s' is forbidden" %
                                     (module, name))


def restricted_loads(src):
    """Helper function analogous to pickle.loads() with module restrictions."""
    return RestrictedUnpickler(io.BytesIO(src)).load()


def serialize_b64(src, to_str=False):
    """Pickle and base64-encode *src*."""
    dest = base64.b64encode(pickle.dumps(src))
    if not to_str:
        return dest
    else:
        return bytes_to_string(dest)


def deserialize_b64(src):
    """Base64-decode and unpickle *src*."""
    src = base64.b64decode(
        string_to_bytes(src) if isinstance(
            src, str) else src)
    use_deserialize_safe_module = get_base_config(
        'use_deserialize_safe_module', False)
    if use_deserialize_safe_module:
        return restricted_loads(src)
    return pickle.loads(src)
