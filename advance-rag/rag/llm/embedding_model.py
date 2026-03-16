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
"""Embedding model integrations for text vectorization.

Provides a unified abstraction for generating dense vector embeddings from
text, used for semantic search and retrieval in the RAG pipeline. Supports
batch encoding of document chunks and single-query encoding with automatic
text truncation and token counting.

Supported providers:
    - OpenAI: text-embedding-ada-002 and newer models
    - Azure OpenAI: Azure-hosted embedding models
    - Ollama: Local/self-hosted embedding via Ollama server
    - Gemini: Google's gemini-embedding-001 and variants
    - OpenAI-API-Compatible / VLLM: Generic OpenAI-compatible endpoints
    - RAGcon: LiteLLM proxy-based embedding

Typical usage:
    embedder = OpenAIEmbed(key="sk-...", model_name="text-embedding-ada-002")
    vectors, tokens = embedder.encode(["chunk 1", "chunk 2", "chunk 3"])
    query_vec, tokens = embedder.encode_queries("search query")
"""

import json
import os
from abc import ABC
from urllib.parse import urljoin

import numpy as np
from ollama import Client
from openai import OpenAI

from common.log_utils import log_exception
from common.token_utils import num_tokens_from_string, truncate, total_token_count_from_response
import logging


class Base(ABC):
    """Abstract base class for all embedding provider implementations.

    Defines the two core methods every embedding backend must implement:
    ``encode`` for batch document embedding and ``encode_queries`` for
    single query embedding (which may use different model configurations
    for asymmetric retrieval).
    """

    def __init__(self, key, model_name, **kwargs):
        """Initialize the embedding base class.

        Args:
            key: API key or authentication token for the provider.
            model_name: Identifier of the embedding model.
            **kwargs: Additional provider-specific configuration.
        """
        pass

    def encode(self, texts: list):
        """Encode a batch of texts into dense vector embeddings.

        Args:
            texts: List of text strings to embed.

        Returns:
            A tuple of (embeddings_array, token_count) where
            embeddings_array is a numpy array of shape (n, dim).

        Raises:
            NotImplementedError: If not overridden by a subclass.
        """
        raise NotImplementedError("Please implement encode method!")

    def encode_queries(self, text: str):
        """Encode a single query text into a dense vector embedding.

        Args:
            text: The query string to embed.

        Returns:
            A tuple of (embedding_vector, token_count) where
            embedding_vector is a 1D numpy array.

        Raises:
            NotImplementedError: If not overridden by a subclass.
        """
        raise NotImplementedError("Please implement encode method!")


class OpenAIEmbed(Base):
    """OpenAI embedding provider using the /v1/embeddings endpoint.

    Handles automatic batching (max 16 texts per request) and text
    truncation to stay within the 8191 token limit per input.
    """

    _FACTORY_NAME = "OpenAI"

    def __init__(self, key, model_name="text-embedding-ada-002", base_url="https://api.openai.com/v1"):
        """Initialize the OpenAI embedding client.

        Args:
            key: OpenAI API key.
            model_name: Embedding model name (default "text-embedding-ada-002").
            base_url: OpenAI API base URL. Falls back to default if empty.
        """
        if not base_url:
            base_url = "https://api.openai.com/v1"
        self.client = OpenAI(api_key=key, base_url=base_url)
        self.model_name = model_name

    def encode(self, texts: list):
        """Encode texts in batches of 16, truncating each to 8191 tokens.

        Args:
            texts: List of text strings to embed.

        Returns:
            A tuple of (embeddings_array, total_tokens) as numpy array
            and cumulative token usage.

        Raises:
            Exception: If the API returns an error response.
        """
        # OpenAI requires batch size <= 16
        batch_size = 16
        texts = [truncate(t, 8191) for t in texts]
        ress = []
        total_tokens = 0
        for i in range(0, len(texts), batch_size):
            res = self.client.embeddings.create(input=texts[i : i + batch_size], model=self.model_name, encoding_format="float", extra_body={"drop_params": True})
            try:
                ress.extend([d.embedding for d in res.data])
                total_tokens += total_token_count_from_response(res)
            except Exception as _e:
                log_exception(_e, res)
                raise Exception(f"Error: {res}")
        return np.array(ress), total_tokens

    def encode_queries(self, text):
        """Encode a single query text into an embedding vector.

        Args:
            text: Query string, truncated to 8191 tokens before encoding.

        Returns:
            A tuple of (embedding_vector, token_count) as numpy array
            and token usage.

        Raises:
            Exception: If the API returns an error response.
        """
        res = self.client.embeddings.create(input=[truncate(text, 8191)], model=self.model_name, encoding_format="float",extra_body={"drop_params": True})
        try:
            return np.array(res.data[0].embedding), total_token_count_from_response(res)
        except Exception as _e:
            log_exception(_e, res)
            raise Exception(f"Error: {res}")


class AzureEmbed(OpenAIEmbed):
    """Azure OpenAI embedding provider.

    Uses the Azure-hosted OpenAI service with Azure-specific authentication
    (endpoint URL + API version). Inherits encoding logic from OpenAIEmbed.
    """

    _FACTORY_NAME = "Azure-OpenAI"

    def __init__(self, key, model_name, **kwargs):
        """Initialize the Azure OpenAI embedding client.

        Args:
            key: JSON string containing ``api_key`` and optionally
                ``api_version`` fields.
            model_name: Deployed embedding model name in Azure.
            **kwargs: Must include ``base_url`` pointing to the Azure endpoint.
        """
        from openai.lib.azure import AzureOpenAI

        # Parse the JSON key to extract Azure-specific credentials
        api_key = json.loads(key).get("api_key", "")
        api_version = json.loads(key).get("api_version", "2024-02-01")
        self.client = AzureOpenAI(api_key=api_key, azure_endpoint=kwargs["base_url"], api_version=api_version)
        self.model_name = model_name


class OllamaEmbed(Base):
    """Ollama embedding provider using a local or remote Ollama server.

    Processes texts one at a time (no batch API) and strips known special
    tokens that can cause encoding failures in some Ollama models.
    """

    _FACTORY_NAME = "Ollama"

    # Tokens that cause issues in some Ollama embedding models
    _special_tokens = ["<|endoftext|>"]

    def __init__(self, key, model_name, **kwargs):
        """Initialize the Ollama embedding client.

        Args:
            key: API key for authenticated Ollama servers. Use "x" or
                empty string for unauthenticated local servers.
            model_name: Ollama model name for embeddings.
            **kwargs: Must include ``base_url`` for the Ollama server host.
                Optional ``ollama_keep_alive`` controls model persistence
                (defaults to OLLAMA_KEEP_ALIVE env var or -1 for indefinite).
        """
        # Use Bearer auth header only when a real API key is provided
        self.client = Client(host=kwargs["base_url"]) if not key or key == "x" else Client(host=kwargs["base_url"], headers={"Authorization": f"Bearer {key}"})
        self.model_name = model_name
        self.keep_alive = kwargs.get("ollama_keep_alive", int(os.environ.get("OLLAMA_KEEP_ALIVE", -1)))

    def encode(self, texts: list):
        """Encode texts one at a time through the Ollama embeddings API.

        Args:
            texts: List of text strings to embed. Special tokens are
                stripped from each text before encoding.

        Returns:
            A tuple of (embeddings_array, estimated_tokens). Token count
            is estimated at 128 per text since Ollama does not report
            actual usage.

        Raises:
            Exception: If the Ollama API returns an error response.
        """
        arr = []
        tks_num = 0
        for txt in texts:
            # Remove special tokens that can cause encoding failures
            for token in OllamaEmbed._special_tokens:
                txt = txt.replace(token, "")
            res = self.client.embeddings(prompt=txt, model=self.model_name, options={"use_mmap": True}, keep_alive=self.keep_alive)
            try:
                arr.append(res["embedding"])
            except Exception as _e:
                log_exception(_e, res)
                raise Exception(f"Error: {res}")
            # Ollama doesn't report token counts; use fixed estimate
            tks_num += 128
        return np.array(arr), tks_num

    def encode_queries(self, text):
        """Encode a single query text through Ollama.

        Args:
            text: Query string. Special tokens are stripped before encoding.

        Returns:
            A tuple of (embedding_vector, estimated_tokens) with a fixed
            128-token estimate.

        Raises:
            Exception: If the Ollama API returns an error response.
        """
        # Remove special tokens if they exist
        for token in OllamaEmbed._special_tokens:
            text = text.replace(token, "")
        res = self.client.embeddings(prompt=text, model=self.model_name, options={"use_mmap": True}, keep_alive=self.keep_alive)
        try:
            return np.array(res["embedding"]), 128
        except Exception as _e:
            log_exception(_e, res)
            raise Exception(f"Error: {res}")


class GeminiEmbed(Base):
    """Google Gemini embedding provider using the google-genai SDK.

    Supports batch embedding with automatic batching (max 16 texts per
    request) and handles multiple response payload formats across
    different SDK versions.
    """

    _FACTORY_NAME = "Gemini"

    def __init__(self, key, model_name="gemini-embedding-001", **kwargs):
        """Initialize the Gemini embedding client.

        Args:
            key: Google API key.
            model_name: Gemini embedding model name. The "models/" prefix
                is automatically stripped if present.
            **kwargs: Additional configuration (unused).
        """
        from google import genai
        from google.genai import types

        self.key = key
        # Strip the "models/" prefix since the SDK adds it internally
        self.model_name = model_name[7:] if model_name.startswith("models/") else model_name
        self.client = genai.Client(api_key=self.key)
        self.types = types

    @staticmethod
    def _parse_embedding_vector(embedding):
        """Extract the raw vector values from a single embedding result.

        Handles both dict-based and object-based response formats, checking
        for ``values`` and ``embedding`` keys/attributes.

        Args:
            embedding: A single embedding result (dict or SDK object).

        Returns:
            List of float values representing the embedding vector.

        Raises:
            TypeError: If the embedding format is not recognized.
        """
        # Handle dictionary-based response format
        if isinstance(embedding, dict):
            values = embedding.get("values")
            if values is None:
                values = embedding.get("embedding")
            if values is not None:
                return values

        # Handle object-based response format
        values = getattr(embedding, "values", None)
        if values is None:
            values = getattr(embedding, "embedding", None)
        if values is not None:
            return values

        raise TypeError(f"Unsupported embedding payload: {type(embedding)}")

    @classmethod
    def _parse_embedding_response(cls, response):
        """Parse a complete embedding API response into a list of vectors.

        Handles responses that contain either a top-level ``embeddings``
        list or a single embedding result.

        Args:
            response: The full API response object or dictionary.

        Returns:
            List of embedding vectors (each a list of floats).

        Raises:
            ValueError: If the response is None/empty.
        """
        if response is None:
            raise ValueError("Embedding response is empty")

        # Try to extract the embeddings list from the response
        embeddings = getattr(response, "embeddings", None)
        if embeddings is None and isinstance(response, dict):
            embeddings = response.get("embeddings")

        # If no embeddings list found, treat the response as a single embedding
        if embeddings is None:
            return [cls._parse_embedding_vector(response)]

        return [cls._parse_embedding_vector(item) for item in embeddings]

    def _build_embedding_config(self):
        """Build the Gemini embedding configuration object.

        Creates an EmbedContentConfig with RETRIEVAL_DOCUMENT task type,
        handling SDK version differences in the TaskType enum and
        config constructor signatures.

        Returns:
            An EmbedContentConfig instance for the embed_content API call.
        """
        task_type = "RETRIEVAL_DOCUMENT"
        # Resolve the task type enum if available in the SDK
        if hasattr(self.types, "TaskType"):
            task_type = getattr(self.types.TaskType, "RETRIEVAL_DOCUMENT", task_type)
        try:
            return self.types.EmbedContentConfig(task_type=task_type, title="Embedding of single string")
        except TypeError:
            # Compatible with SDK versions that do not accept title in embed config.
            return self.types.EmbedContentConfig(task_type=task_type)

    def encode(self, texts: list):
        """Encode texts in batches of 16, truncating each to 2048 tokens.

        Args:
            texts: List of text strings to embed.

        Returns:
            A tuple of (embeddings_array, token_count) as numpy array
            and locally-computed token count.

        Raises:
            Exception: If the Gemini API returns an error response.
        """
        texts = [truncate(t, 2048) for t in texts]
        # Compute token count locally since Gemini doesn't always report it
        token_count = sum(num_tokens_from_string(text) for text in texts)
        config = self._build_embedding_config()
        batch_size = 16
        ress = []
        for i in range(0, len(texts), batch_size):
            result = None
            try:
                result = self.client.models.embed_content(
                    model=self.model_name,
                    contents=texts[i : i + batch_size],
                    config=config,
                )
                ress.extend(self._parse_embedding_response(result))
            except Exception as _e:
                log_exception(_e, result)
                raise Exception(f"Error: {result}")
        return np.array(ress), token_count

    def encode_queries(self, text):
        """Encode a single query text into a Gemini embedding vector.

        Args:
            text: Query string, truncated to 2048 tokens before encoding.

        Returns:
            A tuple of (embedding_vector, token_count) as numpy array
            and locally-computed token count.

        Raises:
            Exception: If the Gemini API returns an error response.
        """
        config = self._build_embedding_config()
        result = None
        token_count = num_tokens_from_string(text)
        try:
            result = self.client.models.embed_content(
                model=self.model_name,
                contents=[truncate(text, 2048)],
                config=config,
            )
            return np.array(self._parse_embedding_response(result)[0]), token_count
        except Exception as _e:
            log_exception(_e, result)
            raise Exception(f"Error: {result}")


class OpenAI_APIEmbed(OpenAIEmbed):
    """OpenAI-API-Compatible / VLLM embedding provider.

    For use with self-hosted or third-party services that expose an
    OpenAI-compatible /v1/embeddings endpoint. Automatically appends
    "/v1" to the provided base URL.
    """

    _FACTORY_NAME = ["VLLM", "OpenAI-API-Compatible"]

    def __init__(self, key, model_name, base_url):
        """Initialize the OpenAI-API-compatible embedding client.

        Args:
            key: API key for the compatible endpoint.
            model_name: Model identifier. Triple-underscore suffixes
                are stripped to extract the base model name.
            base_url: Root URL of the API (without /v1 suffix).

        Raises:
            ValueError: If base_url is empty or None.
        """
        if not base_url:
            raise ValueError("url cannot be None")
        # Append the /v1 path expected by OpenAI-compatible endpoints
        base_url = urljoin(base_url, "v1")
        self.client = OpenAI(api_key=key, base_url=base_url)
        # Strip triple-underscore suffixes used for variant identification
        self.model_name = model_name.split("___")[0]


class RAGconEmbed(OpenAIEmbed):
    """RAGcon embedding provider - routes through LiteLLM proxy.

    Proxies embedding requests through the RAGcon gateway which forwards
    them to the appropriate upstream embedding model provider.

    Default Base URL: https://connect.ragcon.ai/v1
    """

    _FACTORY_NAME = "RAGcon"

    def __init__(self, key, model_name="text-embedding-3-small", base_url=None):
        """Initialize the RAGcon embedding client.

        Args:
            key: RAGcon API key for authentication.
            model_name: Model identifier routed through LiteLLM
                (default "text-embedding-3-small").
            base_url: RAGcon proxy URL. Falls back to default if not provided.
        """
        if not base_url:
            base_url = "https://connect.ragcon.com/v1"

        super().__init__(key, model_name, base_url)
