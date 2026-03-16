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
"""Fulltext query construction for RAG search.

Builds boosted, weighted fulltext queries from user questions by tokenizing,
computing term weights (TF-IDF), expanding with synonyms, and assembling
structured query expressions that the document store can execute.
"""

import logging
import json
import re
from collections import defaultdict

from common.query_base import QueryBase
from common.doc_store.doc_store_base import MatchTextExpr
from rag.nlp import rag_tokenizer, term_weight, synonym


class FulltextQueryer(QueryBase):
    """Constructs weighted fulltext search queries from natural-language questions.

    Combines term-weight scoring, synonym expansion, and fine-grained
    tokenization to produce MatchTextExpr objects suitable for document
    store search. Supports both Chinese and non-Chinese text with
    language-specific processing paths.
    """

    def __init__(self):
        """Initialize the queryer with term-weight dealer, synonym dealer, and boosted query fields."""
        self.tw = term_weight.Dealer()
        self.syn = synonym.Dealer()
        # Field boost values control relevance ranking:
        # higher boost = more weight in scoring
        self.query_fields = [
            "title_tks^10",
            "title_sm_tks^5",
            "important_kwd^30",
            "important_tks^20",
            "question_tks^20",
            "content_ltks^2",
            "content_sm_ltks",
        ]

    def question(self, txt, tbl="qa", min_match: float = 0.6):
        """Build a fulltext query expression from a user question.

        Normalizes the input, tokenizes, computes term weights, expands
        synonyms, and constructs a boosted query string. Uses separate
        processing paths for Chinese vs non-Chinese text.

        Args:
            txt: Raw user question text.
            tbl: Table type hint (default "qa"), unused in current logic.
            min_match: Minimum fraction of terms that must match (0.0-1.0).

        Returns:
            A tuple of (MatchTextExpr, keywords) where MatchTextExpr is the
            constructed query expression and keywords is a list of extracted
            search terms. Returns (None, keywords) if no query could be built.
        """
        original_query = txt
        # Normalize: add spaces between English/Chinese, convert full-width
        # to half-width, traditional to simplified, lowercase
        txt = self.add_space_between_eng_zh(txt)
        txt = re.sub(
            r"[ :|\r\n\t,，。？?/`!！&^%%()\[\]{}<>]+",
            " ",
            rag_tokenizer.tradi2simp(rag_tokenizer.strQ2B(txt.lower())),
        ).strip()
        otxt = txt
        txt = self.rmWWW(txt)

        # Non-Chinese text processing path
        if not self.is_chinese(txt):
            txt = self.rmWWW(txt)
            tks = rag_tokenizer.tokenize(txt).split()
            keywords = [t for t in tks if t]
            tks_w = self.tw.weights(tks, preprocess=False)
            # Strip special characters that interfere with query syntax
            tks_w = [(re.sub(r"[ \\\"'^]", "", tk), w) for tk, w in tks_w]
            tks_w = [(re.sub(r"^[\+-]", "", tk), w) for tk, w in tks_w if tk]
            tks_w = [(tk.strip(), w) for tk, w in tks_w if tk.strip()]
            # Expand each token with synonyms, capped at 256 tokens
            syns = []
            for tk, w in tks_w[:256]:
                syn = [rag_tokenizer.tokenize(s) for s in self.syn.lookup(tk)]
                keywords.extend(syn)
                # Synonyms get 1/4 the weight of the original token
                syn = ["\"{}\"^{:.4f}".format(s, w / 4.) for s in syn if s.strip()]
                syns.append(" ".join(syn))

            # Build query clauses: each token boosted by its weight, with synonyms
            q = ["({}^{:.4f}".format(tk, w) + " {})".format(syn) for (tk, w), syn in zip(tks_w, syns) if
                 tk and not re.match(r"[.^+\(\)-]", tk)]
            # Add bigram phrase queries for adjacent token pairs with double boost
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

        def need_fine_grained_tokenize(tk):
            """Determine if a token needs sub-word tokenization.

            Short tokens (<3 chars) and purely alphanumeric/symbol tokens
            are already atomic and do not benefit from further splitting.
            """
            if len(tk) < 3:
                return False
            if re.match(r"[0-9a-z\.\+#_\*-]+$", tk):
                return False
            return True

        # Chinese text processing path
        txt = self.rmWWW(txt)
        qs, keywords = [], []
        # Process up to 256 split segments from the term-weight dealer
        for tt in self.tw.split(txt)[:256]:  # .split():
            if not tt:
                continue
            keywords.append(tt)
            twts = self.tw.weights([tt])
            syns = self.syn.lookup(tt)
            # Collect synonym keywords up to a cap of 32
            if syns and len(keywords) < 32:
                keywords.extend(syns)
            logging.debug(json.dumps(twts, ensure_ascii=False))
            tms = []
            # Sort tokens by weight descending for priority processing
            for tk, w in sorted(twts, key=lambda x: x[1] * -1):
                # Apply fine-grained sub-word tokenization for complex tokens
                sm = (
                    rag_tokenizer.fine_grained_tokenize(tk).split()
                    if need_fine_grained_tokenize(tk)
                    else []
                )
                # Strip punctuation from sub-word tokens
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

                # Accumulate keywords from tokens and sub-words (cap at 32)
                if len(keywords) < 32:
                    keywords.append(re.sub(r"[ \\\"']+", "", tk))
                    keywords.extend(sm)

                # Expand token-level synonyms
                tk_syns = self.syn.lookup(tk)
                tk_syns = [self.sub_special_char(s) for s in tk_syns]
                if len(keywords) < 32:
                    keywords.extend([s for s in tk_syns if s])
                tk_syns = [rag_tokenizer.fine_grained_tokenize(s) for s in tk_syns if s]
                # Quote multi-word synonym expressions
                tk_syns = [f"\"{s}\"" if s.find(" ") > 0 else s for s in tk_syns]

                if len(keywords) >= 32:
                    break

                # Build the query clause for this token with synonym OR branches
                tk = self.sub_special_char(tk)
                if tk.find(" ") > 0:
                    tk = '"%s"' % tk
                if tk_syns:
                    tk = f"({tk} OR (%s)^0.2)" % " ".join(tk_syns)
                # Add sub-word phrase match with proximity boost
                if sm:
                    tk = f'{tk} OR "%s" OR ("%s"~2)^0.5' % (" ".join(sm), " ".join(sm))
                if tk.strip():
                    tms.append((tk, w))

            tms = " ".join([f"({t})^{w}" for t, w in tms])

            # Add proximity phrase query for multi-token segments (boost 1.5)
            if len(twts) > 1:
                tms += ' ("%s"~2)^1.5' % rag_tokenizer.tokenize(tt)

            # Combine segment-level synonym alternatives with OR
            syns = " OR ".join(
                [
                    '"%s"'
                    % rag_tokenizer.tokenize(self.sub_special_char(s))
                    for s in syns
                ]
            )
            # Original terms get 5x boost vs synonyms at 0.7x
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

    def hybrid_similarity(self, avec, bvecs, atks, btkss, tkweight=0.3, vtweight=0.7):
        """Compute hybrid similarity combining vector cosine and token-based scores.

        Args:
            avec: Query embedding vector.
            bvecs: List of candidate embedding vectors.
            atks: Query tokens (string or list).
            btkss: List of candidate token lists.
            tkweight: Weight for token-based similarity (default 0.3).
            vtweight: Weight for vector cosine similarity (default 0.7).

        Returns:
            A tuple of (combined_scores, token_scores, vector_scores) as numpy arrays.
            Falls back to token-only scores when all vector similarities are zero.
        """
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np

        sims = cosine_similarity([avec], bvecs)
        tksim = self.token_similarity(atks, btkss)
        # If vector similarities are all zero, rely solely on token similarity
        if np.sum(sims[0]) == 0:
            return np.array(tksim), tksim, sims[0]
        return np.array(sims[0]) * vtweight + np.array(tksim) * tkweight, tksim, sims[0]

    def token_similarity(self, atks, btkss):
        """Compute token-based similarity between a query and multiple candidates.

        Builds weighted unigram+bigram dictionaries from tokens, then
        computes overlap-based similarity for each candidate.

        Args:
            atks: Query tokens (string or list).
            btkss: List of candidate token lists.

        Returns:
            List of similarity scores, one per candidate.
        """
        def to_dict(tks):
            """Convert token list to a weighted unigram+bigram dictionary.

            Unigrams get 40% of their weight; bigrams (adjacent pairs)
            get 60% of the max weight of the two constituent tokens.
            """
            if isinstance(tks, str):
                tks = tks.split()
            d = defaultdict(int)
            wts = self.tw.weights(tks, preprocess=False)
            for i, (t, c) in enumerate(wts):
                d[t] += c * 0.4
                if i+1 < len(wts):
                    _t, _c = wts[i+1]
                    d[t+_t] += max(c, _c) * 0.6
            return d

        atks = to_dict(atks)
        btkss = [to_dict(tks) for tks in btkss]
        return [self.similarity(atks, btks) for btks in btkss]

    def similarity(self, qtwt, dtwt):
        """Compute weighted token overlap similarity between query and document.

        Calculates the ratio of matching query-term weights present in the
        document to total query-term weights. Accepts either pre-built
        weight dictionaries or raw text strings.

        Args:
            qtwt: Query term weights as dict {token: weight} or raw text string.
            dtwt: Document term weights as dict {token: weight} or raw text string.

        Returns:
            Similarity score in [0, 1], representing fraction of query weight
            covered by matching document terms.
        """
        if isinstance(dtwt, type("")):
            dtwt = {t: w for t, w in self.tw.weights(self.tw.split(dtwt), preprocess=False)}
        if isinstance(qtwt, type("")):
            qtwt = {t: w for t, w in self.tw.weights(self.tw.split(qtwt), preprocess=False)}
        # Accumulate weight of query terms found in the document
        s = 1e-9
        for k, v in qtwt.items():
            if k in dtwt:
                s += v  # * dtwt[k]
        # Total query weight as denominator
        q = 1e-9
        for k, v in qtwt.items():
            q += v  # * v
        return s / q  # math.sqrt(3. * (s / q / math.log10( len(dtwt.keys()) + 512 )))

    def paragraph(self, content_tks: str, keywords: list = [], keywords_topn=30):
        """Build a paragraph-level fulltext query from content tokens and keywords.

        Extracts the top-N weighted terms from content, expands them with
        synonyms, and combines with provided keywords into a match expression.

        Args:
            content_tks: Tokenized content string or list of token characters.
            keywords: Pre-existing keywords to include in the query.
            keywords_topn: Number of top-weighted terms to extract from content.

        Returns:
            A MatchTextExpr for searching against the configured query fields,
            with minimum_should_match set proportionally to keyword count.
        """
        if isinstance(content_tks, str):
            content_tks = [c.strip() for c in content_tks.strip() if c.strip()]
        tks_w = self.tw.weights(content_tks, preprocess=False)

        origin_keywords = keywords.copy()
        # Quote existing keywords for exact phrase matching
        keywords = [f'"{k.strip()}"' for k in keywords]
        # Add top-weighted content terms with synonym expansion
        for tk, w in sorted(tks_w, key=lambda x: x[1] * -1)[:keywords_topn]:
            tk_syns = self.syn.lookup(tk)
            tk_syns = [self.sub_special_char(s) for s in tk_syns]
            tk_syns = [rag_tokenizer.fine_grained_tokenize(s) for s in tk_syns if s]
            tk_syns = [f"\"{s}\"" if s.find(" ") > 0 else s for s in tk_syns]
            tk = self.sub_special_char(tk)
            if tk.find(" ") > 0:
                tk = '"%s"' % tk
            # Synonyms get reduced boost (0.2x) compared to the original term
            if tk_syns:
                tk = f"({tk} OR (%s)^0.2)" % " ".join(tk_syns)
            if tk:
                keywords.append(f"{tk}^{w}")

        return MatchTextExpr(self.query_fields, " ".join(keywords), 100,
                             {"minimum_should_match": min(3, round(len(keywords) / 10)),
                              "original_query": " ".join(origin_keywords)})
