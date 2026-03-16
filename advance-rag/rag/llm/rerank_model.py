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
"""Reranking model integrations for RAG retrieval refinement.

Provides reranking capabilities that score the relevance of candidate text
passages against a query. Used as a second-stage retrieval step after initial
vector/keyword search to improve result quality.

Supported providers:
    - OpenAI-API-Compatible: Generic rerank endpoint via HTTP POST
    - Cohere: Native Cohere rerank SDK
    - RAGcon: LiteLLM proxy-based reranking

Typical usage:
    reranker = CoHereRerank(key="co-...", model_name="rerank-v3.5")
    scores, token_count = reranker.similarity("user query", ["doc1", "doc2"])
"""

from abc import ABC
from urllib.parse import urljoin

import numpy as np
import requests

from common.log_utils import log_exception
from common.token_utils import num_tokens_from_string, truncate, total_token_count_from_response


class Base(ABC):
    """Abstract base class for all reranking provider implementations.

    Defines the ``similarity`` interface that scores query-document relevance,
    plus a shared ``_normalize_rank`` utility for min-max normalization of
    relevance scores to the [0, 1] range.
    """

    def __init__(self, key, model_name, **kwargs):
        """Initialize the reranking base class.

        Args:
            key: API key or authentication token for the provider.
            model_name: Identifier of the reranking model.
            **kwargs: Additional provider-specific configuration.
        """
        pass

    def similarity(self, query: str, texts: list):
        """Compute relevance scores for texts against a query.

        Args:
            query: The search query string.
            texts: List of candidate text passages to score.

        Returns:
            A tuple of (rank_array, token_count) where rank_array is a
            numpy array of relevance scores and token_count tracks usage.

        Raises:
            NotImplementedError: If not overridden by a subclass.
        """
        raise NotImplementedError("Please implement encode method!")

    @staticmethod
    def _normalize_rank(rank: np.ndarray) -> np.ndarray:
        """Normalize relevance scores to the [0, 1] range using min-max scaling.

        Handles the edge case where all scores are identical (or nearly so)
        by returning a zero vector to avoid division-by-zero errors.

        Args:
            rank: Raw relevance scores as a numpy array.

        Returns:
            Normalized scores in [0, 1], or zeros if all values are equal.
        """
        min_rank = np.min(rank)
        max_rank = np.max(rank)

        # Avoid division by zero when all scores are effectively equal
        if not np.isclose(min_rank, max_rank, atol=1e-3):
            rank = (rank - min_rank) / (max_rank - min_rank)
        else:
            rank = np.zeros_like(rank)

        return rank


class OpenAI_APIRerank(Base):
    """OpenAI-API-Compatible reranking provider.

    Sends rerank requests via HTTP POST to a generic /rerank endpoint.
    Compatible with any service that implements the standard rerank API
    format (e.g. Jina, custom deployments).
    """

    _FACTORY_NAME = "OpenAI-API-Compatible"

    def __init__(self, key, model_name, base_url):
        """Initialize the OpenAI-API-compatible reranker.

        Args:
            key: API key for Bearer token authentication.
            model_name: Model identifier. Triple-underscore suffixes
                (e.g. "model___variant") are stripped to extract the
                base model name.
            base_url: Base URL of the rerank API. If the URL does not
                already contain "/rerank", it is appended automatically.
        """
        # Normalize the base URL to point to the /rerank endpoint
        normalized_base_url = (base_url or "").strip()
        if "/rerank" in normalized_base_url:
            self.base_url = normalized_base_url.rstrip("/")
        else:
            self.base_url = urljoin(f"{normalized_base_url.rstrip('/')}/", "rerank").rstrip("/")
        self.headers = {"Content-Type": "application/json", "Authorization": f"Bearer {key}"}
        # Strip triple-underscore suffixes used for variant identification
        self.model_name = model_name.split("___")[0]

    def similarity(self, query: str, texts: list):
        """Score document relevance against a query via the rerank API.

        Args:
            query: The search query string.
            texts: List of candidate documents to rerank. Each is
                truncated to 500 tokens before sending.

        Returns:
            A tuple of (normalized_ranks, token_count) where
            normalized_ranks is a numpy array of scores in [0, 1].
        """
        # Truncate documents to prevent exceeding API token limits
        texts = [truncate(t, 500) for t in texts]
        data = {
            "model": self.model_name,
            "query": query,
            "documents": texts,
            "top_n": len(texts),
        }
        token_count = 0
        for t in texts:
            token_count += num_tokens_from_string(t)
        res = requests.post(self.base_url, headers=self.headers, json=data).json()
        rank = np.zeros(len(texts), dtype=float)
        try:
            # Map each result's relevance score back to its original index
            for d in res["results"]:
                rank[d["index"]] = d["relevance_score"]
        except Exception as _e:
            log_exception(_e, res)

        # Normalize scores to [0, 1] for consistent downstream usage
        rank = Base._normalize_rank(rank)

        return rank, token_count


class CoHereRerank(Base):
    """Cohere reranking provider using the native Cohere SDK.

    Also used as the reranker for VLLM deployments that expose
    a Cohere-compatible rerank interface.
    """

    _FACTORY_NAME = ["Cohere", "VLLM"]

    def __init__(self, key, model_name, base_url=None):
        """Initialize the Cohere reranker.

        Args:
            key: Cohere API key.
            model_name: Cohere model name (e.g. "rerank-v3.5").
                Triple-underscore suffixes are stripped.
            base_url: Optional custom base URL for self-hosted
                Cohere-compatible endpoints. If empty, uses the
                default Cohere API endpoint.
        """
        from cohere import Client

        # Only pass base_url if it's a non-empty string, otherwise use default Cohere API endpoint
        client_kwargs = {"api_key": key}
        if base_url and base_url.strip():
            client_kwargs["base_url"] = base_url
        self.client = Client(**client_kwargs)
        self.model_name = model_name.split("___")[0]

    def similarity(self, query: str, texts: list):
        """Score document relevance using Cohere's rerank API.

        Args:
            query: The search query string.
            texts: List of candidate documents to rerank.

        Returns:
            A tuple of (rank_array, token_count) where rank_array
            contains the raw relevance scores from Cohere.
        """
        token_count = num_tokens_from_string(query) + sum([num_tokens_from_string(t) for t in texts])
        res = self.client.rerank(
            model=self.model_name,
            query=query,
            documents=texts,
            top_n=len(texts),
            return_documents=False,
        )
        rank = np.zeros(len(texts), dtype=float)
        try:
            # Map each result's relevance score back to its original index
            for d in res.results:
                rank[d.index] = d.relevance_score
        except Exception as _e:
            log_exception(_e, res)
        return rank, token_count


class RAGconRerank(Base):
    """RAGcon reranking provider - routes through LiteLLM proxy.

    Sends rerank requests to the RAGcon gateway which proxies them to
    the appropriate upstream reranking model provider.

    Default Base URL: https://connect.ragcon.ai/v1
    """

    _FACTORY_NAME = "RAGcon"

    def __init__(self, key, model_name, base_url=None, **kwargs):
        """Initialize the RAGcon reranker.

        Args:
            key: RAGcon API key for authentication.
            model_name: Model identifier routed through LiteLLM.
            base_url: RAGcon proxy URL. Falls back to default if not provided.
            **kwargs: Additional configuration (unused).
        """
        if not base_url:
            base_url = "https://connect.ragcon.com/v1"

        self._api_key = key
        self._base_url = base_url

        self.headers = {"Content-Type": "application/json", "Authorization": f"Bearer {key}"}
        self.model_name = model_name


    def similarity(self, query: str, texts: list):
        """Score document relevance through the RAGcon rerank proxy.

        Args:
            query: The search query string.
            texts: List of candidate documents to rerank. Each is
                truncated to 500 tokens before sending.

        Returns:
            A tuple of (normalized_ranks, token_count) where
            normalized_ranks is a numpy array of scores in [0, 1].
        """
        # Truncate documents to prevent exceeding API token limits
        texts = [truncate(t, 500) for t in texts]
        data = {
            "model": self.model_name,
            "query": query,
            "documents": texts,
            "top_n": len(texts),
        }
        token_count = 0
        for t in texts:
            token_count += num_tokens_from_string(t)
        res = requests.post(self._base_url + "/rerank", headers=self.headers, json=data).json()
        rank = np.zeros(len(texts), dtype=float)
        try:
            # Map each result's relevance score back to its original index
            for d in res["results"]:
                rank[d["index"]] = d["relevance_score"]
        except Exception as _e:
            log_exception(_e, res)

        # Normalize scores to [0, 1] for consistent downstream usage
        rank = Base._normalize_rank(rank)

        return rank, token_count
