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
Unicode text normalisation utilities.

Provides functions to convert Arabic-Indic and Extended Arabic-Indic digit
codepoints to ASCII digits, and to normalise Arabic presentation forms
(ligatures in the FB50-FDFF and FE70-FEFF ranges) to their canonical
Unicode equivalents via NFKC normalisation.
"""

from __future__ import annotations

import re
import unicodedata


# Pre-compiled regex matching Arabic Presentation Forms A (FB50-FDFF) and B (FE70-FEFF)
ARABIC_PRESENTATION_FORMS_RE = re.compile(r"[\uFB50-\uFDFF\uFE70-\uFEFF]")


def normalize_arabic_digits(text: str | None) -> str | None:
    """Replace Arabic-Indic digits (U+0660..0669, U+06F0..06F9) with ASCII 0-9.

    Args:
        text: Input string, or None.

    Returns:
        String with Arabic-Indic digits replaced by ASCII equivalents,
        or None/non-string inputs passed through unchanged.
    """
    if text is None or not isinstance(text, str):
        return text

    out = []
    for ch in text:
        code = ord(ch)
        # Arabic-Indic digits (U+0660 to U+0669)
        if 0x0660 <= code <= 0x0669:
            out.append(chr(code - 0x0660 + 0x30))
        # Extended Arabic-Indic digits (U+06F0 to U+06F9)
        elif 0x06F0 <= code <= 0x06F9:
            out.append(chr(code - 0x06F0 + 0x30))
        else:
            out.append(ch)
    return "".join(out)


def normalize_arabic_presentation_forms(text: str | None) -> str | None:
    """Normalize Arabic presentation forms to canonical text when present.

    Only applies NFKC normalisation if presentation-form codepoints are
    detected, avoiding unnecessary processing on non-Arabic text.

    Args:
        text: Input string, or None.

    Returns:
        NFKC-normalised string if Arabic presentation forms were found,
        otherwise the original string. None/non-string inputs pass through.
    """
    if text is None or not isinstance(text, str):
        return text
    # Skip normalisation if no presentation forms are present
    if not ARABIC_PRESENTATION_FORMS_RE.search(text):
        return text
    return unicodedata.normalize("NFKC", text)
