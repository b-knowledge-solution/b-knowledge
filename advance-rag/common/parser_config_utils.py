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
Parser configuration utilities.

Normalises the ``layout_recognizer`` setting from the parser config, detecting
whether a third-party parser backend (MinerU, PaddleOCR) is indicated by a
``@suffix`` convention (e.g. ``"ModelName@mineru"``).
"""

from typing import Any


def normalize_layout_recognizer(layout_recognizer_raw: Any) -> tuple[Any, str | None]:
    """Parse the layout recognizer string and extract any parser model override.

    The convention is ``"ModelName@Backend"`` where Backend is ``mineru`` or
    ``paddleocr``.  If a backend suffix is detected the model name is extracted
    and the recognizer value is replaced with the canonical backend name.

    Args:
        layout_recognizer_raw: Raw layout recognizer value from parser config.
            May be a string like ``"MyModel@mineru"`` or a non-string value
            that is returned as-is.

    Returns:
        A tuple of ``(layout_recognizer, parser_model_name)`` where
        *parser_model_name* is the extracted model name (or None if no
        backend suffix was found).
    """
    parser_model_name: str | None = None
    layout_recognizer = layout_recognizer_raw

    if isinstance(layout_recognizer_raw, str):
        lowered = layout_recognizer_raw.lower()
        # Check for "@mineru" suffix indicating MinerU backend
        if lowered.endswith("@mineru"):
            parser_model_name = layout_recognizer_raw.rsplit("@", 1)[0]
            layout_recognizer = "MinerU"
        # Check for "@paddleocr" suffix indicating PaddleOCR backend
        elif lowered.endswith("@paddleocr"):
            parser_model_name = layout_recognizer_raw.rsplit("@", 1)[0]
            layout_recognizer = "PaddleOCR"

    return layout_recognizer, parser_model_name
