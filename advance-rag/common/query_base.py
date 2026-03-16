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
Abstract base class for query builders.

Provides common text-processing helpers (language detection, special-character
escaping, stopword removal, CJK/English spacing) used by concrete query
implementations for different doc-store backends (Elasticsearch, Infinity, etc.).
"""
import re
from abc import ABC, abstractmethod


class QueryBase(ABC):
    """Base class that concrete query builders must extend.

    Static helper methods handle language detection and text normalisation
    that is shared across all backends.  Subclasses implement ``question``
    to build backend-specific query objects.
    """

    @staticmethod
    def is_chinese(line):
        """Heuristically determine whether *line* is predominantly Chinese.

        Splits the line on whitespace; if there are three or fewer tokens the
        text is assumed to be Chinese.  Otherwise, counts non-ASCII-alpha tokens
        and returns True when they represent 70 %+ of the total.

        Args:
            line: Input text string.

        Returns:
            True if the text appears to be Chinese.
        """
        arr = re.split(r"[ \t]+", line)
        if len(arr) <= 3:
            return True
        e = 0
        for t in arr:
            if not re.match(r"[a-zA-Z]+$", t):
                e += 1
        return e * 1.0 / len(arr) >= 0.7

    @staticmethod
    def sub_special_char(line):
        """Escape special characters that have meaning in query DSLs.

        Backslash-escapes characters like ``:``, ``{``, ``}``, ``/``, ``[``,
        ``]``, ``-``, ``*``, ``"``, ``(``, ``)``, ``|``, ``+``, ``~``, ``^``.

        Args:
            line: Input string.

        Returns:
            Escaped and stripped string.
        """
        return re.sub(r"([:\{\}/\[\]\-\*\"\(\)\|\+~\^])", r"\\\1", line).strip()

    @staticmethod
    def rmWWW(txt):
        """Remove common question words and stopwords from *txt*.

        Handles both Chinese question particles (e.g. "什么", "怎么", "哪里")
        and English stopwords / question words (what, who, how, is, are, ...).

        Args:
            txt: Input query text.

        Returns:
            Cleaned text with stopwords removed.  If removal would produce
            an empty string, the original text is returned instead.
        """
        patts = [
            (
                r"是*(怎么办|什么样的|哪家|一下|那家|请问|啥样|咋样了|什么时候|何时|何地|何人|是否|是不是|多少|哪里|怎么|哪儿|怎么样|如何|哪些|是啥|啥是|啊|吗|呢|吧|咋|什么|有没有|呀|谁|哪位|哪个)是*",
                "",
            ),
            (r"(^| )(what|who|how|which|where|why)('re|'s)? ", " "),
            (
                r"(^| )('s|'re|is|are|were|was|do|does|did|don't|doesn't|didn't|has|have|be|there|you|me|your|my|mine|just|please|may|i|should|would|wouldn't|will|won't|done|go|for|with|so|the|a|an|by|i'm|it's|he's|she's|they|they're|you're|as|by|on|in|at|up|out|down|of|to|or|and|if) ",
                " ")
        ]
        otxt = txt
        for r, p in patts:
            txt = re.sub(r, p, txt, flags=re.IGNORECASE)
        if not txt:
            txt = otxt
        return txt

    @staticmethod
    def add_space_between_eng_zh(txt):
        """Insert spaces between adjacent English and Chinese characters.

        Improves tokenisation quality for mixed-language text by ensuring
        word boundaries exist between scripts.

        Args:
            txt: Input text with potentially adjacent English/Chinese chars.

        Returns:
            Text with spaces inserted at script boundaries.
        """
        # (ENG/ENG+NUM) + ZH
        txt = re.sub(r'([A-Za-z]+[0-9]+)([\u4e00-\u9fa5]+)', r'\1 \2', txt)
        # ENG + ZH
        txt = re.sub(r'([A-Za-z])([\u4e00-\u9fa5]+)', r'\1 \2', txt)
        # ZH + (ENG/ENG+NUM)
        txt = re.sub(r'([\u4e00-\u9fa5]+)([A-Za-z]+[0-9]+)', r'\1 \2', txt)
        txt = re.sub(r'([\u4e00-\u9fa5]+)([A-Za-z])', r'\1 \2', txt)
        return txt

    @abstractmethod
    def question(self, text, tbl, min_match):
        """
        Returns a query object based on the input text, table, and minimum match criteria.
        """
        raise NotImplementedError("Not implemented")
