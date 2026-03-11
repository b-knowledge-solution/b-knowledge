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
    def __init__(self, key, model_name, **kwargs):
        """
        Constructor for abstract base class.
        Parameters are accepted for interface consistency but are not stored.
        Subclasses should implement their own initialization as needed.
        """
        pass

    def encode(self, texts: list):
        raise NotImplementedError("Please implement encode method!")

    def encode_queries(self, text: str):
        raise NotImplementedError("Please implement encode method!")


class OpenAIEmbed(Base):
    _FACTORY_NAME = "OpenAI"

    def __init__(self, key, model_name="text-embedding-ada-002", base_url="https://api.openai.com/v1"):
        if not base_url:
            base_url = "https://api.openai.com/v1"
        self.client = OpenAI(api_key=key, base_url=base_url)
        self.model_name = model_name

    def encode(self, texts: list):
        # OpenAI requires batch size <=16
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
        res = self.client.embeddings.create(input=[truncate(text, 8191)], model=self.model_name, encoding_format="float",extra_body={"drop_params": True})
        try:
            return np.array(res.data[0].embedding), total_token_count_from_response(res)
        except Exception as _e:
            log_exception(_e, res)
            raise Exception(f"Error: {res}")


class AzureEmbed(OpenAIEmbed):
    _FACTORY_NAME = "Azure-OpenAI"

    def __init__(self, key, model_name, **kwargs):
        from openai.lib.azure import AzureOpenAI

        api_key = json.loads(key).get("api_key", "")
        api_version = json.loads(key).get("api_version", "2024-02-01")
        self.client = AzureOpenAI(api_key=api_key, azure_endpoint=kwargs["base_url"], api_version=api_version)
        self.model_name = model_name


class OllamaEmbed(Base):
    _FACTORY_NAME = "Ollama"

    _special_tokens = ["<|endoftext|>"]

    def __init__(self, key, model_name, **kwargs):
        self.client = Client(host=kwargs["base_url"]) if not key or key == "x" else Client(host=kwargs["base_url"], headers={"Authorization": f"Bearer {key}"})
        self.model_name = model_name
        self.keep_alive = kwargs.get("ollama_keep_alive", int(os.environ.get("OLLAMA_KEEP_ALIVE", -1)))

    def encode(self, texts: list):
        arr = []
        tks_num = 0
        for txt in texts:
            # remove special tokens if they exist base on regex in one request
            for token in OllamaEmbed._special_tokens:
                txt = txt.replace(token, "")
            res = self.client.embeddings(prompt=txt, model=self.model_name, options={"use_mmap": True}, keep_alive=self.keep_alive)
            try:
                arr.append(res["embedding"])
            except Exception as _e:
                log_exception(_e, res)
                raise Exception(f"Error: {res}")
            tks_num += 128
        return np.array(arr), tks_num

    def encode_queries(self, text):
        # remove special tokens if they exist
        for token in OllamaEmbed._special_tokens:
            text = text.replace(token, "")
        res = self.client.embeddings(prompt=text, model=self.model_name, options={"use_mmap": True}, keep_alive=self.keep_alive)
        try:
            return np.array(res["embedding"]), 128
        except Exception as _e:
            log_exception(_e, res)
            raise Exception(f"Error: {res}")


class GeminiEmbed(Base):
    _FACTORY_NAME = "Gemini"

    def __init__(self, key, model_name="gemini-embedding-001", **kwargs):
        from google import genai
        from google.genai import types

        self.key = key
        self.model_name = model_name[7:] if model_name.startswith("models/") else model_name
        self.client = genai.Client(api_key=self.key)
        self.types = types

    @staticmethod
    def _parse_embedding_vector(embedding):
        if isinstance(embedding, dict):
            values = embedding.get("values")
            if values is None:
                values = embedding.get("embedding")
            if values is not None:
                return values

        values = getattr(embedding, "values", None)
        if values is None:
            values = getattr(embedding, "embedding", None)
        if values is not None:
            return values

        raise TypeError(f"Unsupported embedding payload: {type(embedding)}")

    @classmethod
    def _parse_embedding_response(cls, response):
        if response is None:
            raise ValueError("Embedding response is empty")

        embeddings = getattr(response, "embeddings", None)
        if embeddings is None and isinstance(response, dict):
            embeddings = response.get("embeddings")

        if embeddings is None:
            return [cls._parse_embedding_vector(response)]

        return [cls._parse_embedding_vector(item) for item in embeddings]

    def _build_embedding_config(self):
        task_type = "RETRIEVAL_DOCUMENT"
        if hasattr(self.types, "TaskType"):
            task_type = getattr(self.types.TaskType, "RETRIEVAL_DOCUMENT", task_type)
        try:
            return self.types.EmbedContentConfig(task_type=task_type, title="Embedding of single string")
        except TypeError:
            # Compatible with SDK versions that do not accept title in embed config.
            return self.types.EmbedContentConfig(task_type=task_type)

    def encode(self, texts: list):
        texts = [truncate(t, 2048) for t in texts]
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
    _FACTORY_NAME = ["VLLM", "OpenAI-API-Compatible"]

    def __init__(self, key, model_name, base_url):
        if not base_url:
            raise ValueError("url cannot be None")
        base_url = urljoin(base_url, "v1")
        self.client = OpenAI(api_key=key, base_url=base_url)
        self.model_name = model_name.split("___")[0]


class RAGconEmbed(OpenAIEmbed):
    """
    RAGcon Embedding Provider - routes through LiteLLM proxy

    Default Base URL: https://connect.ragcon.ai/v1
    """
    _FACTORY_NAME = "RAGcon"

    def __init__(self, key, model_name="text-embedding-3-small", base_url=None):
        if not base_url:
            base_url = "https://connect.ragcon.com/v1"

        super().__init__(key, model_name, base_url)
