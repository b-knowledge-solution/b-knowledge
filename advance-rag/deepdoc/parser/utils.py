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
"""Utility functions for the deepdoc parser module.

Provides helper functions used across multiple document parsers, such as
text extraction from files with automatic encoding detection.
"""

from rag.nlp import find_codec


def get_text(fnm: str, binary=None) -> str:
    """Extract text content from a file or binary data.

    Reads text either from raw binary data (with automatic codec detection)
    or from a file path. This is used by parsers like TxtParser to obtain
    the raw text content before chunking.

    Args:
        fnm: File path to read from when binary is not provided.
        binary: Raw bytes of the file content. When provided, fnm is ignored.

    Returns:
        The decoded text content as a string.
    """
    txt = ""
    if binary is not None:
        # Detect the encoding of the binary data automatically
        encoding = find_codec(binary)
        txt = binary.decode(encoding, errors="ignore")
    else:
        # Read from file path line by line
        with open(fnm, "r") as f:
            while True:
                line = f.readline()
                if not line:
                    break
                txt += line
    return txt
