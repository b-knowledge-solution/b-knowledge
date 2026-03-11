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
from abc import ABC
from urllib.parse import urljoin

import numpy as np
import requests

from common.log_utils import log_exception
from common.token_utils import num_tokens_from_string, truncate, total_token_count_from_response

class Base(ABC):
    def __init__(self, key, model_name, **kwargs):
        """
        Abstract base class constructor.
        Parameters are not stored; initialization is left to subclasses.
        """
        pass

    def similarity(self, query: str, texts: list):
        raise NotImplementedError("Please implement encode method!")

    @staticmethod
    def _normalize_rank(rank: np.ndarray) -> np.ndarray:
        """
        Normalize rank values to the range 0 to 1.
        Avoids division by zero if all ranks are identical.
        """
        min_rank = np.min(rank)
        max_rank = np.max(rank)

        if not np.isclose(min_rank, max_rank, atol=1e-3):
            rank = (rank - min_rank) / (max_rank - min_rank)
        else:
            rank = np.zeros_like(rank)

        return rank


class OpenAI_APIRerank(Base):
    _FACTORY_NAME = "OpenAI-API-Compatible"

    def __init__(self, key, model_name, base_url):
        normalized_base_url = (base_url or "").strip()
        if "/rerank" in normalized_base_url:
            self.base_url = normalized_base_url.rstrip("/")
        else:
            self.base_url = urljoin(f"{normalized_base_url.rstrip('/')}/", "rerank").rstrip("/")
        self.headers = {"Content-Type": "application/json", "Authorization": f"Bearer {key}"}
        self.model_name = model_name.split("___")[0]

    def similarity(self, query: str, texts: list):
        # noway to config Ragflow , use fix setting
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
            for d in res["results"]:
                rank[d["index"]] = d["relevance_score"]
        except Exception as _e:
            log_exception(_e, res)

        rank = Base._normalize_rank(rank)

        return rank, token_count


class CoHereRerank(Base):
    _FACTORY_NAME = ["Cohere", "VLLM"]

    def __init__(self, key, model_name, base_url=None):
        from cohere import Client

        # Only pass base_url if it's a non-empty string, otherwise use default Cohere API endpoint
        client_kwargs = {"api_key": key}
        if base_url and base_url.strip():
            client_kwargs["base_url"] = base_url
        self.client = Client(**client_kwargs)
        self.model_name = model_name.split("___")[0]

    def similarity(self, query: str, texts: list):
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
            for d in res.results:
                rank[d.index] = d.relevance_score
        except Exception as _e:
            log_exception(_e, res)
        return rank, token_count


class RAGconRerank(Base):
    """
    RAGcon Rerank Provider - routes through LiteLLM proxy

    Assumes LiteLLM proxy supports /rerank endpoint.
    Default Base URL: https://connect.ragcon.ai/v1
    """
    _FACTORY_NAME = "RAGcon"

    def __init__(self, key, model_name, base_url=None, **kwargs):
        if not base_url:
            base_url = "https://connect.ragcon.com/v1"

        self._api_key = key
        self._base_url = base_url

        self.headers = {"Content-Type": "application/json", "Authorization": f"Bearer {key}"}
        self.model_name = model_name


    def similarity(self, query: str, texts: list):
        # noway to config Ragflow , use fix setting
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
            for d in res["results"]:
                rank[d["index"]] = d["relevance_score"]
        except Exception as _e:
            log_exception(_e, res)

        rank = Base._normalize_rank(rank)

        return rank, token_count
