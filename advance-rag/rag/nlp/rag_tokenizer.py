#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
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
"""RAG tokenizer adapter with Infinity engine bypass support.

Wraps the base Infinity RagTokenizer to conditionally bypass tokenization
when the Infinity document engine is active (since Infinity handles
tokenization internally). Also re-exports convenience functions for
character classification and naive segmentation.
"""

import infinity.rag_tokenizer


class RagTokenizer(infinity.rag_tokenizer.RagTokenizer):
    """Extended RAG tokenizer that bypasses processing when Infinity engine is enabled.

    When ``settings.DOC_ENGINE_INFINITY`` is True, tokenize and
    fine_grained_tokenize return the input unchanged, deferring all
    tokenization to the Infinity engine. Otherwise, delegates to the
    parent class implementation.
    """

    def tokenize(self, line: str) -> str:
        """Tokenize a text line into space-separated tokens.

        Args:
            line: Raw text string to tokenize.

        Returns:
            Space-separated token string. Returns the input unchanged
            when the Infinity document engine is active.
        """
        from common import settings # moved from the top of the file to avoid circular import
        if settings.DOC_ENGINE_INFINITY:
            return line
        else:
            return super().tokenize(line)

    def fine_grained_tokenize(self, tks: str) -> str:
        """Apply fine-grained sub-word tokenization to an already-tokenized string.

        Splits compound tokens into smaller meaningful units (e.g.,
        splitting a Chinese compound word into its constituent characters
        or morphemes).

        Args:
            tks: Space-separated token string to further split.

        Returns:
            Space-separated token string with finer granularity. Returns
            the input unchanged when the Infinity document engine is active.
        """
        from common import settings # moved from the top of the file to avoid circular import
        if settings.DOC_ENGINE_INFINITY:
            return tks
        else:
            return super().fine_grained_tokenize(tks)


def is_chinese(s):
    """Check whether a string contains Chinese characters.

    Args:
        s: String to check.

    Returns:
        True if the string contains Chinese characters.
    """
    return infinity.rag_tokenizer.is_chinese(s)


def is_number(s):
    """Check whether a string represents a number.

    Args:
        s: String to check.

    Returns:
        True if the string is numeric.
    """
    return infinity.rag_tokenizer.is_number(s)


def is_alphabet(s):
    """Check whether a string consists entirely of alphabetic characters.

    Args:
        s: String to check.

    Returns:
        True if the string is purely alphabetic.
    """
    return infinity.rag_tokenizer.is_alphabet(s)


def naive_qie(txt):
    """Perform naive character-level segmentation of text.

    Args:
        txt: Input text to segment.

    Returns:
        Segmented text string.
    """
    return infinity.rag_tokenizer.naive_qie(txt)


# Module-level singleton tokenizer instance and convenience function aliases
tokenizer = RagTokenizer()
tokenize = tokenizer.tokenize
fine_grained_tokenize = tokenizer.fine_grained_tokenize
tag = tokenizer.tag
freq = tokenizer.freq
# Traditional-to-simplified Chinese character conversion
tradi2simp = tokenizer._tradi2simp
# Full-width to half-width character conversion
strQ2B = tokenizer._strQ2B
