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
"""Plain text file parser for the RAG pipeline.

Parses plain text files (.txt) into chunks suitable for embedding and retrieval.
Splits text on configurable delimiters while respecting token count limits.
"""

import re

from deepdoc.parser.utils import get_text
from common.token_utils import num_tokens_from_string


class RAGFlowTxtParser:
    """Parser for plain text files that splits content into token-limited chunks.

    Splits text on user-specified delimiters (e.g., newline, punctuation) and
    groups the resulting segments into chunks that stay within a given token limit.
    """

    def __call__(self, fnm, binary=None, chunk_token_num=128, delimiter="\n!?;。；！？"):
        """Parse a text file or binary data into chunks.

        Args:
            fnm: File path to the text file.
            binary: Raw bytes of the file content. Overrides fnm if provided.
            chunk_token_num: Maximum number of tokens per chunk.
            delimiter: String of delimiter characters (or backtick-quoted multi-char
                delimiters) used to split the text.

        Returns:
            A list of [chunk_text, ""] pairs, where the second element is a
            placeholder for position tags.
        """
        txt = get_text(fnm, binary)
        return self.parser_txt(txt, chunk_token_num, delimiter)

    @classmethod
    def parser_txt(cls, txt, chunk_token_num=128, delimiter="\n!?;。；！？"):
        """Split raw text into token-limited chunks using delimiters.

        Args:
            txt: The raw text string to parse.
            chunk_token_num: Maximum number of tokens per chunk.
            delimiter: Delimiter specification string. Multi-character delimiters
                can be enclosed in backticks.

        Returns:
            A list of [chunk_text, ""] pairs.

        Raises:
            TypeError: If txt is not a string.
        """
        if not isinstance(txt, str):
            raise TypeError("txt type should be str!")
        cks = [""]
        tk_nums = [0]
        # Decode escaped unicode sequences in the delimiter string
        delimiter = delimiter.encode('utf-8').decode('unicode_escape').encode('latin1').decode('utf-8')

        def add_chunk(t):
            """Append text segment to the current chunk or start a new one if over limit."""
            nonlocal cks, tk_nums, delimiter
            tnum = num_tokens_from_string(t)
            if tk_nums[-1] > chunk_token_num:
                # Current chunk is full, start a new one
                cks.append(t)
                tk_nums.append(tnum)
            else:
                if cks[-1]:
                    cks[-1] += "\n" + t
                else:
                    cks[-1] += t
                tk_nums[-1] += tnum

        # Parse delimiter string: extract backtick-quoted multi-char delimiters
        # and individual characters as separate delimiters
        dels = []
        s = 0
        for m in re.finditer(r"`([^`]+)`", delimiter, re.I):
            f, t = m.span()
            dels.append(m.group(1))
            dels.extend(list(delimiter[s: f]))
            s = t
        if s < len(delimiter):
            dels.extend(list(delimiter[s:]))
        dels = [re.escape(d) for d in dels if d]
        dels = [d for d in dels if d]
        dels = "|".join(dels)

        # Split text on delimiters, then accumulate into chunks
        secs = re.split(r"(%s)" % dels, txt)
        for sec in secs:
            # Skip sections that are just delimiters themselves
            if re.match(f"^{dels}$", sec):
                continue
            add_chunk(sec)

        return [[c, ""] for c in cks]
