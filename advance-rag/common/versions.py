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
Version detection utilities for the RAG worker.

Resolves the application version from a ``VERSION`` file at the project root
(written at Docker build time) or, failing that, from the nearest git tag.
The result is cached globally after the first call.
"""

import os
import subprocess

# Cached version string; starts as "unknown" and is resolved on first call
RAGFLOW_VERSION_INFO = "unknown"


def get_ragflow_version() -> str:
    """Return the application version string, resolving it on first call.

    Resolution order:
    1. Return cached value if already resolved.
    2. Read from ``<project_root>/VERSION`` file.
    3. Fall back to ``git describe --tags``.

    Returns:
        Version string (e.g. ``"v0.18.0"`` or ``"v0.18.0-3-gabcdef"``),
        or ``"unknown"`` if neither source is available.
    """
    global RAGFLOW_VERSION_INFO
    if RAGFLOW_VERSION_INFO != "unknown":
        return RAGFLOW_VERSION_INFO
    # Look for a VERSION file in the parent directory of common/
    version_path = os.path.abspath(
        os.path.join(
            os.path.dirname(os.path.realpath(__file__)), os.pardir, "VERSION"
        )
    )
    if os.path.exists(version_path):
        with open(version_path, "r") as f:
            RAGFLOW_VERSION_INFO = f.read().strip()
    else:
        RAGFLOW_VERSION_INFO = get_closest_tag_and_count()
    return RAGFLOW_VERSION_INFO


def get_closest_tag_and_count():
    """Retrieve version info from git using ``git describe --tags``.

    Returns:
        A string like ``"v0.18.0"`` (exact tag) or ``"v0.18.0-3-gabcdef"``
        (commits since tag), or ``"unknown"`` if git is unavailable.
    """
    try:
        # Get the current commit hash
        version_info = (
            subprocess.check_output(["git", "describe", "--tags", "--match=v*", "--first-parent", "--always"])
            .strip()
            .decode("utf-8")
        )
        return version_info
    except Exception:
        return "unknown"
