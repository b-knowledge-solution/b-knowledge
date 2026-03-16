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
File-system path helpers for the RAG worker.

Provides utilities to resolve the project base directory and to recursively
walk directory trees. The base directory is determined from the environment
variables ``RAG_PROJECT_BASE`` or ``RAG_DEPLOY_BASE``, falling back to the
parent of this file's directory.
"""

import os

# Resolved once and cached; can be set via RAG_PROJECT_BASE or RAG_DEPLOY_BASE env vars
PROJECT_BASE = os.getenv("RAG_PROJECT_BASE") or os.getenv("RAG_DEPLOY_BASE")

def get_project_base_directory(*args):
    """Return the absolute path to the project root, optionally joining sub-paths.

    On first call the base directory is resolved from environment variables or
    by navigating up from this module's location. The result is cached globally.

    Args:
        *args: Optional path segments to join onto the base directory.

    Returns:
        The absolute project base path, with *args* appended if provided.
    """
    global PROJECT_BASE
    if PROJECT_BASE is None:
        # Fall back to the parent directory of common/
        PROJECT_BASE = os.path.abspath(
            os.path.join(
                os.path.dirname(os.path.realpath(__file__)),
                os.pardir,
            )
        )

    if args:
        return os.path.join(PROJECT_BASE, *args)
    return PROJECT_BASE

def traversal_files(base):
    """Recursively yield every file path under *base*.

    Args:
        base: Root directory to walk.

    Yields:
        Absolute path strings for each file found under *base*.
    """
    for root, ds, fs in os.walk(base):
        for f in fs:
            fullname = os.path.join(root, f)
            yield fullname
