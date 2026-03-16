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
"""Tavily web search integration for RAG retrieval augmentation.

Provides a client wrapper around the Tavily search API, used to
supplement knowledge base retrieval with real-time web search results.
Search results are converted into the standard chunk format expected
by the RAG pipeline.
"""

import logging
from tavily import TavilyClient
from common.misc_utils import get_uuid
from rag.nlp import rag_tokenizer


class Tavily:
    """Client wrapper for the Tavily web search API.

    Converts Tavily search results into the chunk format used by the
    RAG pipeline, enabling hybrid retrieval from both knowledge bases
    and web search.

    Attributes:
        tavily_client: Underlying TavilyClient instance.
    """

    def __init__(self, api_key: str):
        """Initialize the Tavily client.

        Args:
            api_key: Tavily API key for authentication.
        """
        self.tavily_client = TavilyClient(api_key=api_key)

    def search(self, query):
        """Execute an advanced web search via Tavily.

        Args:
            query: Search query string.

        Returns:
            List of result dicts with 'url', 'title', 'content', and 'score' keys.
            Returns empty list on error.
        """
        try:
            response = self.tavily_client.search(
                query=query,
                search_depth="advanced",
                max_results=6
            )
            return [{"url": res["url"], "title": res["title"], "content": res["content"], "score": res["score"]} for res
                    in response["results"]]
        except Exception as e:
            logging.exception(e)

        return []

    def retrieve_chunks(self, question):
        """Search the web and convert results to RAG chunk format.

        Performs a Tavily search, then transforms each result into the
        standard chunk dictionary format with tokenized content, document
        metadata, and aggregation info.

        Args:
            question: Natural language question to search for.

        Returns:
            Dict with 'chunks' (list of chunk dicts) and 'doc_aggs'
            (list of document aggregation dicts).
        """
        chunks = []
        aggs = []
        logging.info("[Tavily]Q: " + question)
        for r in self.search(question):
            id = get_uuid()
            # Build a chunk dict matching the RAG pipeline's expected schema
            chunks.append({
                "chunk_id": id,
                "content_ltks": rag_tokenizer.tokenize(r["content"]),
                "content_with_weight": r["content"],
                "doc_id": id,
                "docnm_kwd": r["title"],
                "kb_id": [],
                "important_kwd": [],
                "image_id": "",
                "similarity": r["score"],
                "vector_similarity": 1.,
                "term_similarity": 0,
                "vector": [],
                "positions": [],
                "url": r["url"]
            })
            # Build aggregation metadata for grouping results by document
            aggs.append({
                "doc_name": r["title"],
                "doc_id": id,
                "count": 1,
                "url": r["url"]
            })
            logging.info("[Tavily]R: " + r["content"][:128] + "...")
        return {"chunks": chunks, "doc_aggs": aggs}
