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
Decorator utilities for the RAG worker.

Provides the ``singleton`` class decorator which ensures that only one
instance of the decorated class exists per OS process. This is used
throughout the codebase for connection pools and shared services.
"""
import os

def singleton(cls, *args, **kw):
    """Class decorator that turns *cls* into a per-process singleton.

    Each process (identified by PID) gets its own instance. Subsequent
    calls return the cached instance instead of creating a new one.

    Args:
        cls: The class to be decorated.
        *args: Positional arguments forwarded to the class constructor on first call.
        **kw: Keyword arguments forwarded to the class constructor on first call.

    Returns:
        A wrapper callable that always returns the same instance for a given process.
    """
    instances = {}

    def _singleton():
        # Key by class + PID so forked workers each get their own instance
        key = str(cls) + str(os.getpid())
        if key not in instances:
            instances[key] = cls(*args, **kw)
        return instances[key]

    return _singleton
