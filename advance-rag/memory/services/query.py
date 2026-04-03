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

"""Query construction utilities for memory message search.

This module provides functions and classes for building search queries against
the memory message store. It includes:

- get_vector(): Encodes text into an embedding vector and wraps it as a
  MatchDenseExpr for vector similarity search.
- MsgTextQuery: Constructs full-text search queries with tokenization,
  term weighting, synonym expansion, and language-specific processing
  for both English and Chinese text.

These query builders produce MatchDenseExpr and MatchTextExpr objects that
are consumed by the various document store connectors (OpenSearch, Infinity,
OceanBase) for hybrid retrieval.
"""

import re
import logging
import json
import numpy as np
from common.query_base import QueryBase
from common.doc_store.doc_store_base import MatchDenseExpr, MatchTextExpr
from common.float_utils import get_float
from rag.nlp import rag_tokenizer, term_weight, synonym


def get_vector(txt, emb_mdl, topk=10, similarity=0.1):
    """Encode text into an embedding vector and create a dense match expression.

    Uses the provided embedding model to encode the query text, then wraps
    the resulting vector in a MatchDenseExpr for cosine similarity search.

    Args:
        txt: The text string to encode into an embedding vector.
        emb_mdl: The embedding model instance with an encode_queries() method.
        topk: Maximum number of nearest neighbors to retrieve.
        similarity: Minimum cosine similarity threshold for results.

    Returns:
        A MatchDenseExpr configured for cosine similarity search with the
        encoded vector.

    Raises:
        Exception: If the embedding model returns a multi-dimensional array
            (expected exactly one dimension).
    """
    # Handle similarity parameter provided as string
    if isinstance(similarity, str) and len(similarity) > 0:
        try:
            similarity = float(similarity)
        except Exception as e:
            logging.warning(f"Convert similarity '{similarity}' to float failed: {e}. Using default 0.1")
            similarity = 0.1
    qv, _ = emb_mdl.encode_queries(txt)
    # Validate that the embedding is a 1-D vector
    shape = np.array(qv).shape
    if len(shape) > 1:
        raise Exception(
            f"Dealer.get_vector returned array's shape {shape} doesn't match expectation(exact one dimension).")
    embedding_data = [get_float(v) for v in qv]
    # Name the vector column by its dimension (e.g. q_768_vec)
    vector_column_name = f"q_{len(embedding_data)}_vec"
    return MatchDenseExpr(vector_column_name, embedding_data, 'float', 'cosine', topk, {"similarity": similarity})


class MsgTextQuery(QueryBase):
    """Builds full-text search queries for memory messages.

    Handles both English and Chinese text with language-specific processing:
    - English: tokenization, term weighting, synonym expansion, bigram phrases.
    - Chinese: fine-grained tokenization, term splitting, synonym lookup,
      proximity matching, and phrase boosting.

    Attributes:
        tw: Term weight dealer for computing token importance weights.
        syn: Synonym dealer for expanding query terms.
        query_fields: List of content fields to search against.
    """

    def __init__(self):
        """Initialize the text query builder with term weight and synonym dealers."""
        self.tw = term_weight.Dealer()
        self.syn = synonym.Dealer()
        self.query_fields = [
            "content"
        ]

    def question(self, txt, tbl="messages", min_match: float=0.6):
        """Build a full-text search expression from a natural language query.

        Processes the input text through normalization, tokenization, term weighting,
        and synonym expansion. Produces a MatchTextExpr with a structured query string
        and a list of keywords for highlighting.

        Args:
            txt: The raw query text from the user.
            tbl: The target table name (unused, kept for API compatibility).
            min_match: Minimum percentage of query terms that must match (0.0-1.0).

        Returns:
            A tuple of (MatchTextExpr, keywords_list). The MatchTextExpr may be None
            if no valid query terms could be extracted. Keywords are used for
            result highlighting.
        """
        original_query = txt
        # Normalize whitespace between English and Chinese characters
        txt = MsgTextQuery.add_space_between_eng_zh(txt)
        # Normalize punctuation, convert to simplified Chinese, lowercase
        txt = re.sub(
            r"[ :|\r\n\t,，。？?/`!！&^%%()\[\]{}<>]+",
            " ",
            rag_tokenizer.tradi2simp(rag_tokenizer.strQ2B(txt.lower())),
        ).strip()
        otxt = txt
        txt = MsgTextQuery.rmWWW(txt)

        if not self.is_chinese(txt):
            # English text processing pipeline
            txt = self.rmWWW(txt)
            tks = rag_tokenizer.tokenize(txt).split()
            keywords = [t for t in tks if t]
            # Compute term importance weights
            tks_w = self.tw.weights(tks, preprocess=False)
            # Clean up tokens: remove quotes, single chars, and leading +/- signs
            tks_w = [(re.sub(r"[ \\\"'^]", "", tk), w) for tk, w in tks_w]
            tks_w = [(re.sub(r"^[a-z0-9]$", "", tk), w) for tk, w in tks_w if tk]
            tks_w = [(re.sub(r"^[\+-]", "", tk), w) for tk, w in tks_w if tk]
            tks_w = [(tk.strip(), w) for tk, w in tks_w if tk.strip()]
            # Expand each token with synonyms
            syns = []
            for tk, w in tks_w[:256]:
                syn = self.syn.lookup(tk)
                syn = rag_tokenizer.tokenize(" ".join(syn)).split()
                keywords.extend(syn)
                syn = ["\"{}\"^{:.4f}".format(s, w / 4.) for s in syn if s.strip()]
                syns.append(" ".join(syn))

            # Build weighted query terms with synonym alternatives
            q = ["({}^{:.4f}".format(tk, w) + " {})".format(syn) for (tk, w), syn in zip(tks_w, syns) if
                 tk and not re.match(r"[.^+\(\)-]", tk)]
            # Add bigram phrases for adjacent terms with boosted weight
            for i in range(1, len(tks_w)):
                left, right = tks_w[i - 1][0].strip(), tks_w[i][0].strip()
                if not left or not right:
                    continue
                q.append(
                    '"%s %s"^%.4f'
                    % (
                        tks_w[i - 1][0],
                        tks_w[i][0],
                        max(tks_w[i - 1][1], tks_w[i][1]) * 2,
                    )
                )
            if not q:
                q.append(txt)
            query = " ".join(q)
            return MatchTextExpr(
                self.query_fields, query, 100, {"original_query": original_query}
            ), keywords

        # Chinese text processing pipeline
        def need_fine_grained_tokenize(tk):
            """Determine if a token needs fine-grained sub-tokenization.

            Short tokens (< 3 chars) and pure alphanumeric tokens don't benefit
            from further splitting.

            Args:
                tk: The token string to evaluate.

            Returns:
                True if the token should be further tokenized.
            """
            if len(tk) < 3:
                return False
            if re.match(r"[0-9a-z\.\+#_\*-]+$", tk):
                return False
            return True

        txt = self.rmWWW(txt)
        qs, keywords = [], []
        # Split into term groups and process each group
        for tt in self.tw.split(txt)[:256]:  # .split():
            if not tt:
                continue
            keywords.append(tt)
            twts = self.tw.weights([tt])
            syns = self.syn.lookup(tt)
            if syns and len(keywords) < 32:
                keywords.extend(syns)
            logging.debug(json.dumps(twts, ensure_ascii=False))
            tms = []
            # Process each weighted token within the term group
            for tk, w in sorted(twts, key=lambda x: x[1] * -1):
                # Apply fine-grained tokenization for complex tokens
                sm = (
                    rag_tokenizer.fine_grained_tokenize(tk).split()
                    if need_fine_grained_tokenize(tk)
                    else []
                )
                # Clean sub-tokens of punctuation
                sm = [
                    re.sub(
                        r"[ ,\./;'\[\]\\`~!@#$%\^&\*\(\)=\+_<>\?:\"\{\}\|，。；''【】、！￥……（）——《》？：""-]+",
                        "",
                        m,
                    )
                    for m in sm
                ]
                sm = [self.sub_special_char(m) for m in sm if len(m) > 1]
                sm = [m for m in sm if len(m) > 1]

                # Collect keywords for highlighting (cap at 32)
                if len(keywords) < 32:
                    keywords.append(re.sub(r"[ \\\"']+", "", tk))
                    keywords.extend(sm)

                # Look up synonyms for each token
                tk_syns = self.syn.lookup(tk)
                tk_syns = [self.sub_special_char(s) for s in tk_syns]
                if len(keywords) < 32:
                    keywords.extend([s for s in tk_syns if s])
                # Tokenize synonyms for matching
                tk_syns = [rag_tokenizer.fine_grained_tokenize(s) for s in tk_syns if s]
                tk_syns = [f"\"{s}\"" if s.find(" ") > 0 else s for s in tk_syns]

                if len(keywords) >= 32:
                    break

                # Build query term with synonym alternatives and proximity matches
                tk = self.sub_special_char(tk)
                if tk.find(" ") > 0:
                    tk = '"%s"' % tk
                if tk_syns:
                    tk = f"({tk} OR (%s)^0.2)" % " ".join(tk_syns)
                if sm:
                    tk = f'{tk} OR "%s" OR ("%s"~2)^0.5' % (" ".join(sm), " ".join(sm))
                if tk.strip():
                    tms.append((tk, w))

            tms = " ".join([f"({t})^{w}" for t, w in tms])

            # Add proximity phrase boost for multi-token term groups
            if len(twts) > 1:
                tms += ' ("%s"~2)^1.5' % rag_tokenizer.tokenize(tt)

            # Combine with synonym alternatives at reduced weight
            syns = " OR ".join(
                [
                    '"%s"'
                    % rag_tokenizer.tokenize(self.sub_special_char(s))
                    for s in syns
                ]
            )
            if syns and tms:
                tms = f"({tms})^5 OR ({syns})^0.7"

            qs.append(tms)

        if qs:
            query = " OR ".join([f"({t})" for t in qs if t])
            if not query:
                query = otxt
            return MatchTextExpr(
                self.query_fields, query, 100, {"minimum_should_match": min_match, "original_query": original_query}
            ), keywords
        return None, keywords
