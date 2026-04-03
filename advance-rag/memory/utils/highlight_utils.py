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

"""Highlight helpers for search results (wraps keywords in <em>).

This module provides functions to wrap matched keywords in HTML ``<em>`` tags
for displaying highlighted search results. It splits text into sentences and
only includes sentences that contain at least one keyword match, joining them
with ellipsis separators.
"""

import re
from collections.abc import Callable


def highlight_text(
    txt: str,
    keywords: list[str],
    is_english_fn: Callable[[str], bool] | None = None,
) -> str:
    """Wrap keyword matches in text with <em> tags, processing sentence by sentence.

    For English sentences (determined by is_english_fn), word-boundary-aware regex
    is used. For non-English sentences, a literal longest-first replacement strategy
    is applied. Only sentences containing at least one match are kept.

    Args:
        txt: The source text to highlight keywords in.
        keywords: List of keyword strings to search for and wrap.
        is_english_fn: Optional callable that returns True if a given sentence
            is English. When None, all sentences are treated as English.

    Returns:
        A string of highlighted sentences joined by "...", or the original
        text if no matches are found.
    """
    if not txt or not keywords:
        return ""

    # Normalize newlines to spaces for consistent sentence splitting
    txt = re.sub(r"[\r\n]", " ", txt, flags=re.IGNORECASE | re.MULTILINE)
    txt_list = []

    for t in re.split(r"[.?!;\n]", txt):
        t = t.strip()
        if not t:
            continue

        if is_english_fn is None or is_english_fn(t):
            # English: use word-boundary-aware regex for accurate matching
            for w in keywords:
                t = re.sub(
                    r"(^|[ .?/'\"\(\)!,:;-])(%s)([ .?/'\"\(\)!,:;-]|$)" % re.escape(w),
                    r"\1<em>\2</em>\3",
                    t,
                    flags=re.IGNORECASE | re.MULTILINE,
                )
        else:
            # Non-English: literal replace, longest keywords first to avoid partial overlaps
            for w in sorted(keywords, key=len, reverse=True):
                t = re.sub(
                    re.escape(w),
                    f"<em>{w}</em>",
                    t,
                    flags=re.IGNORECASE | re.MULTILINE,
                )

        # Only include sentences that actually contain a highlighted keyword
        if re.search(r"<em>[^<>]+</em>", t, flags=re.IGNORECASE | re.MULTILINE):
            txt_list.append(t)

    return "...".join(txt_list) if txt_list else txt


def get_highlight_from_messages(
    messages: list[dict] | None,
    keywords: list[str],
    field_name: str,
    is_english_fn: Callable[[str], bool] | None = None,
) -> dict[str, str]:
    """Build a mapping of document ID to highlighted text from a list of message dicts.

    Iterates over messages, extracts the specified field, and applies keyword
    highlighting. Only messages with successful highlights are included.

    Args:
        messages: List of message dictionaries, each expected to have "id" and
            the field specified by field_name.
        keywords: List of keyword strings to highlight.
        field_name: The key within each message dict containing the text to highlight.
        is_english_fn: Optional callable passed to highlight_text to determine
            language-specific highlighting behavior.

    Returns:
        A dict mapping document IDs to their highlighted text strings.
    """
    if not messages or not keywords:
        return {}

    ans = {}
    for doc in messages:
        doc_id = doc.get("id")
        if not doc_id:
            continue
        txt = doc.get(field_name)
        if not txt or not isinstance(txt, str):
            continue
        highlighted = highlight_text(txt, keywords, is_english_fn)
        # Only include entries where highlighting actually produced <em> tags
        if highlighted and re.search(r"<em>[^<>]+</em>", highlighted, flags=re.IGNORECASE | re.MULTILINE):
            ans[doc_id] = highlighted
    return ans
