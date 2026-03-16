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
"""Computer Vision (CV) model integrations for image and video understanding.

Provides multimodal LLM capabilities for describing images and processing
video content. Used in the RAG pipeline for extracting textual descriptions
from visual content embedded in documents (charts, diagrams, photos).

Supported providers:
    - OpenAI (GptV4): GPT-4 Vision and compatible models
    - Azure OpenAI (AzureGptV4): Azure-hosted vision models
    - OpenAI-API-Compatible (OpenAI_APICV): VLLM and other compatible endpoints
    - Ollama (OllamaCV): Local vision models via Ollama server
    - Gemini (GeminiCV): Google's multimodal Gemini models
    - Anthropic (AnthropicCV): Claude vision models
    - Google Cloud (GoogleCV): Vertex AI (supports both Gemini and Claude)
    - RAGcon (RAGconCV): LiteLLM proxy-based vision models

Typical usage:
    cv = GptV4(key="sk-...", model_name="gpt-4-vision-preview")
    description, tokens = cv.describe(image_bytes)
"""

import base64
import json
import logging
import os
import tempfile
from abc import ABC
from copy import deepcopy
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin

from openai import OpenAI, AsyncOpenAI
from openai.lib.azure import AzureOpenAI, AsyncAzureOpenAI

from common.token_utils import num_tokens_from_string, total_token_count_from_response
from rag.nlp import is_english
from rag.prompts.generator import vision_llm_describe_prompt


from common.misc_utils import thread_pool_exec

class Base(ABC):
    """Abstract base class for all computer vision model implementations.

    Provides shared utilities for image encoding, prompt construction,
    and async chat interfaces. Handles conversion of various image formats
    (bytes, BytesIO, PIL Image, base64 strings, URLs) into a unified
    data URL format suitable for multimodal LLM APIs.
    """

    def __init__(self, **kwargs):
        """Initialize the CV model base class.

        Configures retry parameters, tool calling state, and optional
        extra body for API requests.

        Args:
            **kwargs: Configuration options including:
                - max_retries: Maximum retry attempts (default from env LLM_MAX_RETRIES or 5).
                - retry_interval: Base delay between retries in seconds.
                - max_rounds: Maximum tool calling rounds (default 5).
        """
        # Configure retry parameters
        self.max_retries = kwargs.get("max_retries", int(os.environ.get("LLM_MAX_RETRIES", 5)))
        self.base_delay = kwargs.get("retry_interval", float(os.environ.get("LLM_BASE_DELAY", 2.0)))
        self.max_rounds = kwargs.get("max_rounds", 5)
        self.is_tools = False
        self.tools = []
        self.toolcall_sessions = {}
        self.extra_body = None

    def describe(self, image):
        """Generate a natural language description of an image.

        Args:
            image: Image data in any supported format (bytes, BytesIO,
                PIL Image, base64 string, or URL).

        Returns:
            A tuple of (description_text, token_count).

        Raises:
            NotImplementedError: If not overridden by a subclass.
        """
        raise NotImplementedError("Please implement encode method!")

    def describe_with_prompt(self, image, prompt=None):
        """Generate a description of an image using a custom prompt.

        Args:
            image: Image data in any supported format.
            prompt: Custom instruction prompt. If None, uses the default
                vision LLM describe prompt.

        Returns:
            A tuple of (description_text, token_count).

        Raises:
            NotImplementedError: If not overridden by a subclass.
        """
        raise NotImplementedError("Please implement encode method!")

    def _form_history(self, system, history, images=None):
        """Build a message history list with optional image attachments.

        Prepends a system message (if provided) and attaches images to
        the first user message in the history.

        Args:
            system: System prompt text, or None/empty to skip.
            history: List of message dicts with "role" and "content" keys.
            images: Optional list of image data to attach to the first
                user message.

        Returns:
            A new list of message dicts with images embedded in content.
        """
        hist = []
        if system:
            hist.append({"role": "system", "content": system})
        for h in history:
            # Attach images to the first user message encountered
            if images and h["role"] == "user":
                h["content"] = self._image_prompt(h["content"], images)
                images = []
            hist.append(h)
        return hist

    @staticmethod
    def _blob_to_data_url(blob, mime_type="image/png"):
        """Convert various image data types to a data URL string.

        Handles strings (URLs, data URLs, raw base64), BytesIO, memoryview,
        bytearray, and raw bytes. Returns existing data URLs and HTTP URLs
        unchanged.

        Args:
            blob: Image data in any of the supported formats.
            mime_type: MIME type for the data URL (default "image/png").

        Returns:
            A data URL string, the original URL if already valid, or None
            if the input type is not recognized.
        """
        if isinstance(blob, str):
            blob = blob.strip()
            # Already a valid URL or data URL; return as-is
            if blob.startswith("data:") or blob.startswith("http://") or blob.startswith("https://") or blob.startswith("file://"):
                return blob
            return f"data:{mime_type};base64,{blob}"
        if isinstance(blob, BytesIO):
            blob = blob.getvalue()
        if isinstance(blob, memoryview):
            blob = blob.tobytes()
        if isinstance(blob, bytearray):
            blob = bytes(blob)
        if isinstance(blob, bytes):
            b64 = base64.b64encode(blob).decode("utf-8")
            return f"data:{mime_type};base64,{b64}"
        return None

    def _normalize_image(self, image):
        """Normalize diverse image input formats into a single data URL.

        Handles multiple nested formats from different API clients:
        - Gemini inline_data format
        - OpenAI image_url format
        - Simplified URL format
        - Raw data formats (blob, data keys)
        - Raw bytes, BytesIO, PIL Image objects
        - Base64 strings

        Args:
            image: Image data in any supported format.

        Returns:
            A data URL string suitable for multimodal API requests.
        """
        if isinstance(image, dict):
            # Try Gemini-style inline_data format
            inline_data = image.get("inline_data")
            if isinstance(inline_data, dict):
                mime = inline_data.get("mime_type") or "image/png"
                data_url = self._blob_to_data_url(inline_data.get("data"), mime)
                if data_url:
                    return data_url

            # Try OpenAI-style image_url format
            image_url = image.get("image_url")
            if isinstance(image_url, dict):
                data_url = self._blob_to_data_url(image_url.get("url"), image.get("mime_type") or "image/png")
                if data_url:
                    return data_url
            if isinstance(image_url, str):
                data_url = self._blob_to_data_url(image_url, image.get("mime_type") or "image/png")
                if data_url:
                    return data_url

            # Try simple URL key
            if "url" in image:
                data_url = self._blob_to_data_url(image.get("url"), image.get("mime_type") or "image/png")
                if data_url:
                    return data_url

            # Try raw data keys (blob, data)
            mime = image.get("mime_type") or image.get("media_type") or "image/png"
            for key in ("blob", "data"):
                if key in image:
                    data_url = self._blob_to_data_url(image.get(key), mime)
                    if data_url:
                        return data_url

        # Handle raw binary types
        if isinstance(image, (bytes, bytearray, memoryview, BytesIO)):
            return self.image2base64(image)
        # Handle string (base64 or URL)
        if isinstance(image, str):
            return self._blob_to_data_url(image, "image/png")
        # Fallback: assume PIL Image or similar
        return self.image2base64(image)

    def _image_prompt(self, text, images):
        """Build a multimodal content array combining text and images.

        Converts a text-only prompt into the OpenAI multimodal content
        format with interleaved text and image_url entries.

        Args:
            text: The text portion of the prompt.
            images: Image data or list of image data. Single images are
                wrapped in a list automatically.

        Returns:
            The original text if no images, otherwise a list of content
            parts (text + image_url entries).
        """
        if not images:
            return text

        # Normalize single image to a list
        if isinstance(images, str) or "bytes" in type(images).__name__:
            images = [images]

        pmpt = [{"type": "text", "text": text}]
        for img in images:
            try:
                pmpt.append({"type": "image_url", "image_url": {"url": self._normalize_image(img)}})
            except Exception:
                logging.warning("[%s] Skip invalid image input in request payload.", self.__class__.__name__)
                continue
        return pmpt

    async def async_chat(self, system, history, gen_conf, images=None, **kwargs):
        """Send an asynchronous chat completion request with optional images.

        Args:
            system: System prompt text.
            history: Conversation history as a list of message dicts.
            gen_conf: Generation configuration (unused in base, kept for interface).
            images: Optional images to include in the conversation.
            **kwargs: Additional parameters.

        Returns:
            A tuple of (response_text, total_tokens) or an error message
            with 0 tokens on failure.
        """
        try:
            response = await self.async_client.chat.completions.create(
                model=self.model_name,
                messages=self._form_history(system, history, images),
                extra_body=self.extra_body,
            )
            return response.choices[0].message.content.strip(), response.usage.total_tokens
        except Exception as e:
            return "**ERROR**: " + str(e), 0

    async def async_chat_streamly(self, system, history, gen_conf, images=None, **kwargs):
        """Send a streaming asynchronous chat completion with optional images.

        Yields text deltas as they arrive from the model, with a length
        notification appended if the response is truncated.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation configuration.
            images: Optional images to include.
            **kwargs: Additional parameters.

        Yields:
            String deltas of the response, followed by the total token
            count as the final yielded value.
        """
        ans = ""
        tk_count = 0
        try:
            response = await self.async_client.chat.completions.create(
                model=self.model_name,
                messages=self._form_history(system, history, images),
                stream=True,
                extra_body=self.extra_body,
            )
            async for resp in response:
                if not resp.choices[0].delta.content:
                    continue
                delta = resp.choices[0].delta.content
                ans = delta
                # Append truncation notice if the model hit its length limit
                if resp.choices[0].finish_reason == "length":
                    ans += "...\nFor the content length reason, it stopped, continue?" if is_english([ans]) else "......\n由于长度的原因，回答被截断了，要继续吗？"
                if resp.choices[0].finish_reason == "stop":
                    tk_count += resp.usage.total_tokens
                yield ans
        except Exception as e:
            yield ans + "\n**ERROR**: " + str(e)

        yield tk_count

    @staticmethod
    def image2base64_rawvalue(self, image):
        """Encode an image to a raw base64 string without data URL header.

        Args:
            image: Image as bytes, BytesIO, or PIL Image object.

        Returns:
            Raw base64-encoded string (no "data:..." prefix).
        """
        # Return a base64 string without data URL header
        if isinstance(image, bytes):
            b64 = base64.b64encode(image).decode("utf-8")
            return b64
        if isinstance(image, BytesIO):
            data = image.getvalue()
            b64 = base64.b64encode(data).decode("utf-8")
            return b64
        # Assume PIL Image: try JPEG first, fall back to PNG
        with BytesIO() as buffered:
            try:
                image.save(buffered, format="JPEG")
            except Exception:
                # reset buffer before saving PNG
                buffered.seek(0)
                buffered.truncate()
                image.save(buffered, format="PNG")
            data = buffered.getvalue()
            b64 = base64.b64encode(data).decode("utf-8")
        return b64

    @staticmethod
    def image2base64(image):
        """Encode an image to a data URL with correct MIME type detection.

        Uses magic number sniffing (JPEG: FF D8) to determine the
        correct MIME type, avoiding mismatches with provider expectations.

        Args:
            image: Image as bytes, BytesIO, or PIL Image object.

        Returns:
            A complete data URL string (e.g. "data:image/jpeg;base64,...").
        """
        # Return a data URL with the correct MIME to avoid provider mismatches
        if isinstance(image, bytes):
            # Best-effort magic number sniffing for JPEG
            mime = "image/png"
            if len(image) >= 2 and image[0] == 0xFF and image[1] == 0xD8:
                mime = "image/jpeg"
            b64 = base64.b64encode(image).decode("utf-8")
            return f"data:{mime};base64,{b64}"
        if isinstance(image, BytesIO):
            data = image.getvalue()
            mime = "image/png"
            if len(data) >= 2 and data[0] == 0xFF and data[1] == 0xD8:
                mime = "image/jpeg"
            b64 = base64.b64encode(data).decode("utf-8")
            return f"data:{mime};base64,{b64}"
        # Assume PIL Image: try JPEG first, fall back to PNG
        with BytesIO() as buffered:
            fmt = "jpeg"
            try:
                image.save(buffered, format="JPEG")
            except Exception:
                # reset buffer before saving PNG
                buffered.seek(0)
                buffered.truncate()
                image.save(buffered, format="PNG")
                fmt = "png"
            data = buffered.getvalue()
            b64 = base64.b64encode(data).decode("utf-8")
            mime = f"image/{fmt}"
        return f"data:{mime};base64,{b64}"

    def prompt(self, b64):
        """Build a default image description prompt with language detection.

        Creates a user message containing the image and a description
        request in either Chinese or English based on the model's
        configured language.

        Args:
            b64: Base64-encoded image data or data URL.

        Returns:
            A list containing a single user message dict with
            multimodal content.
        """
        return [
            {
                "role": "user",
                "content": self._image_prompt(
                    "请用中文详细描述一下图中的内容，比如时间，地点，人物，事情，人物心情等，如果有数据请提取出数据。"
                    if self.lang.lower() == "chinese"
                    else "Please describe the content of this picture, like where, when, who, what happen. If it has number data, please extract them out.",
                    b64,
                ),
            }
        ]

    def vision_llm_prompt(self, b64, prompt=None):
        """Build a vision LLM prompt with a custom or default instruction.

        Args:
            b64: Base64-encoded image data or data URL.
            prompt: Custom prompt text. If None, uses the default
                vision_llm_describe_prompt template.

        Returns:
            A list containing a single user message dict with
            multimodal content.
        """
        return [{"role": "user", "content": self._image_prompt(prompt if prompt else vision_llm_describe_prompt(), b64)}]


class GptV4(Base):
    """OpenAI GPT-4 Vision provider.

    Uses the standard OpenAI chat completions API with vision-capable
    models (e.g. gpt-4-vision-preview, gpt-4o) for image understanding.
    """

    _FACTORY_NAME = "OpenAI"

    def __init__(self, key, model_name="gpt-4-vision-preview", lang="Chinese", base_url="https://api.openai.com/v1", **kwargs):
        """Initialize the GPT-4 Vision client.

        Args:
            key: OpenAI API key.
            model_name: Vision model name (default "gpt-4-vision-preview").
            lang: Language for description prompts ("Chinese" or "English").
            base_url: OpenAI API base URL. Falls back to default if empty.
            **kwargs: Additional configuration passed to Base.
        """
        if not base_url:
            base_url = "https://api.openai.com/v1"
        self.api_key = key
        self.client = OpenAI(api_key=key, base_url=base_url)
        self.async_client = AsyncOpenAI(api_key=key, base_url=base_url)
        self.model_name = model_name
        self.lang = lang
        super().__init__(**kwargs)

    def describe(self, image):
        """Generate a description of an image using GPT-4 Vision.

        Args:
            image: Image data in any supported format.

        Returns:
            A tuple of (description_text, total_tokens).
        """
        b64 = self.image2base64(image)
        res = self.client.chat.completions.create(
            model=self.model_name,
            messages=self.prompt(b64),
            extra_body=self.extra_body
        )
        return res.choices[0].message.content.strip(), total_token_count_from_response(res)

    def describe_with_prompt(self, image, prompt=None):
        """Generate a description of an image using a custom prompt.

        Args:
            image: Image data in any supported format.
            prompt: Custom instruction prompt. Uses default if None.

        Returns:
            A tuple of (description_text, total_tokens).
        """
        b64 = self.image2base64(image)
        res = self.client.chat.completions.create(
            model=self.model_name,
            messages=self.vision_llm_prompt(b64, prompt),
            extra_body=self.extra_body,
        )
        return res.choices[0].message.content.strip(), total_token_count_from_response(res)


class AzureGptV4(GptV4):
    """Azure OpenAI GPT-4 Vision provider.

    Uses Azure-hosted OpenAI services with Azure-specific authentication
    (endpoint URL, API version). Inherits vision logic from GptV4.
    """

    _FACTORY_NAME = "Azure-OpenAI"

    def __init__(self, key, model_name, lang="Chinese", **kwargs):
        """Initialize the Azure GPT-4 Vision client.

        Args:
            key: JSON string containing ``api_key`` and optionally
                ``api_version`` fields.
            model_name: Deployed vision model name in Azure.
            lang: Language for description prompts.
            **kwargs: Must include ``base_url`` pointing to the Azure endpoint.
        """
        # Parse Azure credentials from the JSON key
        api_key = json.loads(key).get("api_key", "")
        api_version = json.loads(key).get("api_version", "2024-02-01")
        self.client = AzureOpenAI(api_key=api_key, azure_endpoint=kwargs["base_url"], api_version=api_version)
        self.async_client = AsyncAzureOpenAI(api_key=api_key, azure_endpoint=kwargs["base_url"], api_version=api_version)
        self.model_name = model_name
        self.lang = lang
        Base.__init__(self, **kwargs)


class OpenAI_APICV(GptV4):
    """OpenAI-API-Compatible vision provider for VLLM and similar services.

    Connects to self-hosted or third-party services that expose an
    OpenAI-compatible chat completions endpoint with vision support.
    """

    _FACTORY_NAME = ["VLLM", "OpenAI-API-Compatible"]

    def __init__(self, key, model_name, lang="Chinese", base_url="", **kwargs):
        """Initialize the API-compatible vision client.

        Args:
            key: API key for the compatible endpoint.
            model_name: Model identifier. Triple-underscore suffixes
                are stripped to extract the base model name.
            lang: Language for description prompts.
            base_url: Root URL of the API (without /v1 suffix).
            **kwargs: Additional configuration passed to Base.

        Raises:
            ValueError: If base_url is empty or None.
        """
        if not base_url:
            raise ValueError("url cannot be None")
        # Append /v1 path expected by OpenAI-compatible endpoints
        base_url = urljoin(base_url, "v1")
        self.client = OpenAI(api_key=key, base_url=base_url)
        self.async_client = AsyncOpenAI(api_key=key, base_url=base_url)
        # Strip triple-underscore suffixes used for variant identification
        self.model_name = model_name.split("___")[0]
        self.lang = lang
        Base.__init__(self, **kwargs)


class OllamaCV(Base):
    """Ollama vision provider for local multimodal models.

    Uses the Ollama Python client to interact with locally-hosted
    vision models. Requires different message format and image handling
    compared to OpenAI-compatible providers.
    """

    _FACTORY_NAME = "Ollama"

    def __init__(self, key, model_name, lang="Chinese", **kwargs):
        """Initialize the Ollama vision client.

        Args:
            key: API key (often unused for local servers).
            model_name: Ollama model name with vision capabilities.
            lang: Language for description prompts.
            **kwargs: Must include ``base_url`` for the Ollama server.
                Optional ``ollama_keep_alive`` controls model persistence.
        """
        from ollama import Client

        self.client = Client(host=kwargs["base_url"])
        self.model_name = model_name
        self.lang = lang
        self.keep_alive = kwargs.get("ollama_keep_alive", int(os.environ.get("OLLAMA_KEEP_ALIVE", -1)))
        Base.__init__(self, **kwargs)

    def _clean_img(self, img):
        """Strip data URL headers from base64-encoded image strings.

        Ollama expects raw base64 without the "data:*;base64," prefix.

        Args:
            img: Image data (string or bytes).

        Returns:
            Cleaned image data suitable for the Ollama API.
        """
        if not isinstance(img, str):
            return img

        # remove the header like "data/*;base64,"
        if img.startswith("data:") and ";base64," in img:
            img = img.split(";base64,")[1]
        return img

    def _clean_conf(self, gen_conf):
        """Convert standard generation config to Ollama options format.

        Maps OpenAI-style parameter names to their Ollama equivalents.

        Args:
            gen_conf: Generation configuration dictionary.

        Returns:
            Ollama-compatible options dictionary.
        """
        options = {}
        if "temperature" in gen_conf:
            options["temperature"] = gen_conf["temperature"]
        if "top_p" in gen_conf:
            options["top_k"] = gen_conf["top_p"]
        if "presence_penalty" in gen_conf:
            options["presence_penalty"] = gen_conf["presence_penalty"]
        if "frequency_penalty" in gen_conf:
            options["frequency_penalty"] = gen_conf["frequency_penalty"]
        return options

    def _form_history(self, system, history, images=None):
        """Build Ollama-format message history with image attachments.

        Ollama uses an "images" key on message dicts rather than
        multimodal content arrays. System messages are only inserted
        if the first history message is from the user.

        Args:
            system: System prompt text.
            history: Conversation history.
            images: Optional images to attach to the first user message.

        Returns:
            Deep-copied history list with images attached in Ollama format.
        """
        hist = deepcopy(history)
        # Only prepend system message if the first message is from user
        if system and hist[0]["role"] == "user":
            hist.insert(0, {"role": "system", "content": system})
        if not images:
            return hist
        # Strip data URL headers from all images for Ollama compatibility
        temp_images = []
        for img in images:
            temp_images.append(self._clean_img(img))
        # Attach images to the first user message
        for his in hist:
            if his["role"] == "user":
                his["images"] = temp_images
                break
        return hist

    def describe(self, image):
        """Generate an image description using Ollama's generate API.

        Args:
            image: Raw image data (bytes) for the Ollama model.

        Returns:
            A tuple of (description_text, estimated_tokens). Token count
            is estimated at 128 since Ollama doesn't report usage.
        """
        prompt = self.prompt("")
        try:
            response = self.client.generate(
                model=self.model_name,
                prompt=prompt[0]["content"],
                images=[image],
            )
            ans = response["response"].strip()
            return ans, 128
        except Exception as e:
            return "**ERROR**: " + str(e), 0

    def describe_with_prompt(self, image, prompt=None):
        """Generate an image description with a custom prompt via Ollama.

        Args:
            image: Raw image data (bytes).
            prompt: Custom instruction prompt. Uses default if None.

        Returns:
            A tuple of (description_text, estimated_tokens).
        """
        vision_prompt = self.vision_llm_prompt("", prompt) if prompt else self.vision_llm_prompt("")
        try:
            response = self.client.generate(
                model=self.model_name,
                prompt=vision_prompt[0]["content"],
                images=[image],
            )
            ans = response["response"].strip()
            return ans, 128
        except Exception as e:
            return "**ERROR**: " + str(e), 0

    async def async_chat(self, system, history, gen_conf, images=None, **kwargs):
        """Async chat with Ollama vision model.

        Delegates to the synchronous Ollama client via thread pool
        to avoid blocking the async event loop.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation configuration (converted to Ollama options).
            images: Optional images to include.
            **kwargs: Additional parameters.

        Returns:
            A tuple of (response_text, total_tokens).
        """
        try:
            response = await thread_pool_exec(self.client.chat, model=self.model_name, messages=self._form_history(system, history, images), options=self._clean_conf(gen_conf), keep_alive=self.keep_alive)

            ans = response["message"]["content"].strip()
            return ans, response["eval_count"] + response.get("prompt_eval_count", 0)
        except Exception as e:
            return "**ERROR**: " + str(e), 0

    async def async_chat_streamly(self, system, history, gen_conf, images=None, **kwargs):
        """Streaming async chat with Ollama vision model.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation configuration.
            images: Optional images to include.
            **kwargs: Additional parameters.

        Yields:
            Text deltas followed by the total token count.
        """
        ans = ""
        try:
            response = await thread_pool_exec(self.client.chat, model=self.model_name, messages=self._form_history(system, history, images), stream=True, options=self._clean_conf(gen_conf), keep_alive=self.keep_alive)
            for resp in response:
                # Yield final token count when generation is complete
                if resp["done"]:
                    yield resp.get("prompt_eval_count", 0) + resp.get("eval_count", 0)
                ans = resp["message"]["content"]
                yield ans
        except Exception as e:
            yield ans + "\n**ERROR**: " + str(e)
        yield 0


class GeminiCV(Base):
    """Google Gemini vision provider using the google-genai SDK.

    Supports multimodal chat with images and video processing through
    Google's Gemini models. Handles both inline data (for small files)
    and the Files API (for videos over 20MB).
    """

    _FACTORY_NAME = "Gemini"

    def __init__(self, key, model_name="gemini-1.0-pro-vision-latest", lang="Chinese", **kwargs):
        """Initialize the Gemini vision client.

        Args:
            key: Google API key.
            model_name: Gemini vision model name.
            lang: Language for description prompts.
            **kwargs: Additional configuration passed to Base.
        """
        from google import genai

        self.api_key = key
        self.model_name = model_name
        self.client = genai.Client(api_key=key)
        self.lang = lang
        Base.__init__(self, **kwargs)
        logging.info(f"[GeminiCV] Initialized with model={self.model_name} lang={self.lang}")

    def _image_to_part(self, image):
        """Convert an image to a Gemini-compatible Part object.

        Extracts base64 data and MIME type from data URLs or converts
        raw image data, then wraps it in a google.genai Part with
        inline Blob data.

        Args:
            image: Image as a data URL string or raw image data.

        Returns:
            A google.genai types.Part containing the image as inline data.
        """
        from google.genai import types

        # Parse data URL if present, otherwise encode the image
        if isinstance(image, str) and image.startswith("data:") and ";base64," in image:
            header, b64data = image.split(",", 1)
            mime = header.split(":", 1)[1].split(";", 1)[0]
            data = base64.b64decode(b64data)
        else:
            data_url = self.image2base64(image)
            header, b64data = data_url.split(",", 1)
            mime = header.split(":", 1)[1].split(";", 1)[0]
            data = base64.b64decode(b64data)

        return types.Part(
            inline_data=types.Blob(
                mime_type=mime,
                data=data,
            )
        )

    def _form_history(self, system, history, images=None):
        """Build Gemini-format content history with image parts.

        Converts standard chat history into google-genai Content objects,
        mapping OpenAI roles to Gemini roles ("assistant" -> "model").
        System prompts and images are merged into the first content block.

        Args:
            system: System prompt text.
            history: Conversation history as message dicts.
            images: Optional images to include as inline data parts.

        Returns:
            List of google.genai types.Content objects.
        """
        from google.genai import types

        contents = []
        images = images or []
        system_len = len(system) if isinstance(system, str) else 0
        history_len = len(history) if history else 0
        images_len = len(images)
        logging.info(f"[GeminiCV] _form_history called: system_len={system_len} history_len={history_len} images_len={images_len}")

        # Convert all images to Gemini Part objects, skipping invalid ones
        image_parts = []
        for img in images:
            try:
                image_parts.append(self._image_to_part(img))
            except Exception:
                continue

        # Merge system prompt, first history message, and images into the first content block
        remaining_history = history or []
        if system or remaining_history:
            parts = []
            if system:
                parts.append(types.Part(text=system))
            if remaining_history:
                first = remaining_history[0]
                parts.append(types.Part(text=first.get("content", "")))
                remaining_history = remaining_history[1:]
            parts.extend(image_parts)
            contents.append(types.Content(role="user", parts=parts))
        elif image_parts:
            contents.append(types.Content(role="user", parts=image_parts))

        # Map remaining history with role conversion
        role_map = {"user": "user", "assistant": "model", "system": "user"}
        for h in remaining_history:
            role = role_map.get(h.get("role"), "user")
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part(text=h.get("content", ""))],
                )
            )

        return contents

    def describe(self, image):
        """Generate an image description using Gemini's multimodal API.

        Args:
            image: Image data in any supported format.

        Returns:
            A tuple of (description_text, total_tokens).
        """
        from google.genai import types

        # Select language-appropriate description prompt
        prompt = (
            "请用中文详细描述一下图中的内容，比如时间，地点，人物，事情，人物心情等，如果有数据请提取出数据。"
            if self.lang.lower() == "chinese"
            else "Please describe the content of this picture, like where, when, who, what happen. If it has number data, please extract them out."
        )

        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part(text=prompt),
                    self._image_to_part(image),
                ],
            )
        ]

        res = self.client.models.generate_content(
            model=self.model_name,
            contents=contents,
        )
        return res.text, total_token_count_from_response(res)

    def describe_with_prompt(self, image, prompt=None):
        """Generate an image description with a custom prompt via Gemini.

        Args:
            image: Image data in any supported format.
            prompt: Custom instruction prompt. Uses default if None.

        Returns:
            A tuple of (description_text, total_tokens).
        """
        from google.genai import types

        vision_prompt = prompt if prompt else vision_llm_describe_prompt()

        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part(text=vision_prompt),
                    self._image_to_part(image),
                ],
            )
        ]

        res = self.client.models.generate_content(
            model=self.model_name,
            contents=contents,
        )
        return res.text, total_token_count_from_response(res)

    async def async_chat(self, system, history, gen_conf, images=None, video_bytes=None, filename="", **kwargs):
        """Async chat with Gemini, supporting both image and video inputs.

        When video_bytes is provided, the video is processed separately
        via the Files API (for large videos) or inline data. Otherwise,
        performs standard multimodal chat with images.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation config with temperature and top_p.
            images: Optional images to include.
            video_bytes: Optional raw video bytes for video summarization.
            filename: Original filename of the video (for MIME detection).
            **kwargs: Additional parameters.

        Returns:
            A tuple of (response_text, total_tokens).
        """
        # Handle video processing as a separate path
        if video_bytes:
            try:
                size = len(video_bytes) if video_bytes else 0
                logging.info(f"[GeminiCV] async_chat called with video: filename={filename} size={size}")
                summary, summary_num_tokens = await thread_pool_exec(self._process_video, video_bytes, filename)
                return summary, summary_num_tokens
            except Exception as e:
                logging.info(f"[GeminiCV] async_chat video error: {e}")
                return "**ERROR**: " + str(e), 0

        from google.genai import types

        history_len = len(history) if history else 0
        images_len = len(images) if images else 0
        logging.info(f"[GeminiCV] async_chat called: history_len={history_len} images_len={images_len} gen_conf={gen_conf}")

        generation_config = types.GenerateContentConfig(
            temperature=gen_conf.get("temperature", 0.3),
            top_p=gen_conf.get("top_p", 0.7),
        )
        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=self._form_history(system, history, images),
                config=generation_config,
            )
            ans = response.text
            logging.info("[GeminiCV] async_chat completed")
            return ans, total_token_count_from_response(response)
        except Exception as e:
            logging.warning(f"[GeminiCV] async_chat error: {e}")
            return "**ERROR**: " + str(e), 0

    async def async_chat_streamly(self, system, history, gen_conf, images=None, **kwargs):
        """Streaming async chat with Gemini multimodal models.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation config with temperature and top_p.
            images: Optional images to include.
            **kwargs: Additional parameters.

        Yields:
            Text deltas followed by the total token count.
        """
        ans = ""
        response = None
        try:
            from google.genai import types

            generation_config = types.GenerateContentConfig(
                temperature=gen_conf.get("temperature", 0.3),
                top_p=gen_conf.get("top_p", 0.7),
            )
            history_len = len(history) if history else 0
            images_len = len(images) if images else 0
            logging.info(f"[GeminiCV] async_chat_streamly called: history_len={history_len} images_len={images_len} gen_conf={gen_conf}")

            response_stream = await self.client.aio.models.generate_content_stream(
                model=self.model_name,
                contents=self._form_history(system, history, images),
                config=generation_config,
            )

            async for chunk in response_stream:
                if chunk.text:
                    ans += chunk.text
                    yield chunk.text
            logging.info("[GeminiCV] chat_streamly completed")
        except Exception as e:
            logging.warning(f"[GeminiCV] chat_streamly error: {e}")
            yield ans + "\n**ERROR**: " + str(e)

        yield total_token_count_from_response(response)

    def _process_video(self, video_bytes, filename):
        """Process a video file and generate a text summary.

        Uses inline data for videos up to 20MB and the Gemini Files API
        for larger videos. Temporary files are cleaned up after upload.

        Args:
            video_bytes: Raw video content as bytes.
            filename: Original filename (used to determine file extension).

        Returns:
            A tuple of (summary_text, token_count).

        Raises:
            Exception: Propagated from the Gemini API on failure.
        """
        from google import genai
        from google.genai import types

        video_size_mb = len(video_bytes) / (1024 * 1024)
        client = self.client if hasattr(self, "client") else genai.Client(api_key=self.api_key)
        logging.info(f"[GeminiCV] _process_video called: filename={filename} size_mb={video_size_mb:.2f}")

        tmp_path = None
        try:
            # Use inline data for small videos, Files API for large ones
            if video_size_mb <= 20:
                response = client.models.generate_content(
                    model="models/gemini-2.5-flash",
                    contents=types.Content(parts=[types.Part(inline_data=types.Blob(data=video_bytes, mime_type="video/mp4")), types.Part(text="Please summarize the video in proper sentences.")]),
                )
            else:
                logging.info(f"Video size {video_size_mb:.2f}MB exceeds 20MB. Using Files API...")
                # Write video to temporary file for upload
                video_suffix = Path(filename).suffix or ".mp4"
                with tempfile.NamedTemporaryFile(delete=False, suffix=video_suffix) as tmp:
                    tmp.write(video_bytes)
                    tmp_path = Path(tmp.name)
                uploaded_file = client.files.upload(file=tmp_path)

                response = client.models.generate_content(model="gemini-2.5-flash", contents=[uploaded_file, "Please summarize this video in proper sentences."])

            summary = response.text or ""
            logging.info(f"[GeminiCV] Video summarized: {summary[:32]}...")
            return summary, num_tokens_from_string(summary)
        except Exception as e:
            logging.warning(f"[GeminiCV] Video processing failed: {e}")
            raise
        finally:
            # Clean up temporary file if it was created
            if tmp_path and tmp_path.exists():
                tmp_path.unlink()


class AnthropicCV(Base):
    """Anthropic Claude vision provider.

    Uses the Anthropic Messages API for multimodal image understanding.
    Supports both sync and streaming responses, with special handling
    for Claude's thinking/reasoning output blocks.
    """

    _FACTORY_NAME = "Anthropic"

    def __init__(self, key, model_name, base_url=None, **kwargs):
        """Initialize the Anthropic Claude vision client.

        Args:
            key: Anthropic API key.
            model_name: Claude model name (e.g. "claude-3-opus-20240229").
            base_url: Optional custom base URL (unused, kept for interface).
            **kwargs: Additional configuration passed to Base.
        """
        import anthropic

        self.client = anthropic.Anthropic(api_key=key)
        self.async_client = anthropic.AsyncAnthropic(api_key=key)
        self.model_name = model_name
        self.system = ""
        # Set max tokens based on model tier
        self.max_tokens = 8192
        if "haiku" in self.model_name or "opus" in self.model_name:
            self.max_tokens = 4096
        Base.__init__(self, **kwargs)

    def _image_prompt(self, text, images):
        """Build an Anthropic-format multimodal content array.

        Anthropic uses a different image format than OpenAI, with
        "type": "image" and a "source" block containing base64 data.

        Args:
            text: The text portion of the prompt.
            images: List of image data URLs or base64 strings.

        Returns:
            The original text if no images, otherwise a list of content
            parts in Anthropic's format.
        """
        if not images:
            return text
        pmpt = [{"type": "text", "text": text}]
        for img in images:
            pmpt.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        # Extract MIME type from data URL header if present
                        "media_type": (img.split(":")[1].split(";")[0] if isinstance(img, str) and img[:4] == "data" else "image/png"),
                        # Extract raw base64 data after the header
                        "data": (img.split(",")[1] if isinstance(img, str) and img[:4] == "data" else img),
                    },
                }
            )
        return pmpt

    def describe(self, image):
        """Generate an image description using Claude's Messages API.

        Args:
            image: Image data in any supported format.

        Returns:
            A tuple of (description_text, total_tokens).
        """
        b64 = self.image2base64(image)
        response = self.client.messages.create(model=self.model_name, max_tokens=self.max_tokens, messages=self.prompt(b64))
        return response["content"][0]["text"].strip(), response["usage"]["input_tokens"] + response["usage"]["output_tokens"]

    def describe_with_prompt(self, image, prompt=None):
        """Generate an image description with a custom prompt via Claude.

        Args:
            image: Image data in any supported format.
            prompt: Custom instruction prompt. Uses default if None.

        Returns:
            A tuple of (description_text, total_tokens).
        """
        b64 = self.image2base64(image)
        prompt = self.prompt(b64, prompt if prompt else vision_llm_describe_prompt())

        response = self.client.messages.create(model=self.model_name, max_tokens=self.max_tokens, messages=prompt)
        return response["content"][0]["text"].strip(), total_token_count_from_response(response)

    def _clean_conf(self, gen_conf):
        """Remove unsupported parameters from generation config for Anthropic.

        Anthropic does not support presence_penalty, frequency_penalty,
        and uses max_tokens differently.

        Args:
            gen_conf: Generation configuration dictionary.

        Returns:
            Cleaned configuration dictionary.
        """
        if "presence_penalty" in gen_conf:
            del gen_conf["presence_penalty"]
        if "frequency_penalty" in gen_conf:
            del gen_conf["frequency_penalty"]
        if "max_token" in gen_conf:
            gen_conf["max_tokens"] = self.max_tokens
        return gen_conf

    async def async_chat(self, system, history, gen_conf, images=None, **kwargs):
        """Async chat with Claude vision model.

        Args:
            system: System prompt text (passed separately in Anthropic API).
            history: Conversation history.
            gen_conf: Generation config (cleaned of unsupported params).
            images: Optional images to include.
            **kwargs: Additional parameters.

        Returns:
            A tuple of (response_text, total_tokens).
        """
        gen_conf = self._clean_conf(gen_conf)
        ans = ""
        try:
            response = await self.async_client.messages.create(
                model=self.model_name,
                messages=self._form_history(system, history, images),
                system=system,
                stream=False,
                **gen_conf,
            )
            response = response.to_dict()
            ans = response["content"][0]["text"]
            # Append truncation notice if the model hit its max_tokens limit
            if response["stop_reason"] == "max_tokens":
                ans += "...\nFor the content length reason, it stopped, continue?" if is_english([ans]) else "......\n由于长度的原因，回答被截断了，要继续吗？"
            return (
                ans,
                total_token_count_from_response(response),
            )
        except Exception as e:
            return ans + "\n**ERROR**: " + str(e), 0

    async def async_chat_streamly(self, system, history, gen_conf, images=None, **kwargs):
        """Streaming async chat with Claude, handling thinking blocks.

        Processes Anthropic's streaming events, wrapping thinking_delta
        content in think tags for downstream rendering.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation config.
            images: Optional images to include.
            **kwargs: Additional parameters.

        Yields:
            Text deltas (with thinking tags) followed by total token count.
        """
        gen_conf = self._clean_conf(gen_conf)
        total_tokens = 0
        try:
            response = self.async_client.messages.create(
                model=self.model_name,
                messages=self._form_history(system, history, images),
                system=system,
                stream=True,
                **gen_conf,
            )
            think = False
            async for res in response:
                if res.type == "content_block_delta":
                    # Handle thinking/reasoning output blocks
                    if res.delta.type == "thinking_delta" and res.delta.thinking:
                        if not think:
                            yield "<think>"
                            think = True
                        yield res.delta.thinking
                        total_tokens += num_tokens_from_string(res.delta.thinking)
                    elif think:
                        # Close thinking block when switching to regular output
                        yield "</think>"
                    else:
                        yield res.delta.text
                        total_tokens += num_tokens_from_string(res.delta.text)
        except Exception as e:
            yield "\n**ERROR**: " + str(e)

        yield total_tokens


class GoogleCV(AnthropicCV, GeminiCV):
    """Google Cloud Vertex AI vision provider (multi-inheritance).

    Routes requests to either Anthropic Claude or Gemini models based
    on the model name. Uses Vertex AI authentication with service
    account credentials for both providers.
    """

    _FACTORY_NAME = "Google Cloud"

    def __init__(self, key, model_name, lang="Chinese", base_url=None, **kwargs):
        """Initialize the Google Cloud Vertex AI vision client.

        Parses service account credentials from the JSON key and creates
        either an AnthropicVertex or google-genai Client based on whether
        the model name contains "claude".

        Args:
            key: JSON string containing google_service_account_key
                (base64-encoded), google_project_id, and google_region.
            model_name: Model name (e.g. "claude-3-opus" or "gemini-1.5-pro").
            lang: Language for description prompts.
            base_url: Unused (Vertex AI endpoints are derived from region).
            **kwargs: Additional configuration passed to Base.
        """
        import base64

        from google.oauth2 import service_account

        key = json.loads(key)
        access_token = json.loads(base64.b64decode(key.get("google_service_account_key", "")))
        project_id = key.get("google_project_id", "")
        region = key.get("google_region", "")

        scopes = ["https://www.googleapis.com/auth/cloud-platform"]
        self.model_name = model_name
        self.lang = lang

        # Route to Anthropic Vertex or Gemini based on model name
        if "claude" in self.model_name:
            from anthropic import AnthropicVertex
            from google.auth.transport.requests import Request

            if access_token:
                credits = service_account.Credentials.from_service_account_info(access_token, scopes=scopes)
                request = Request()
                credits.refresh(request)
                token = credits.token
                self.client = AnthropicVertex(region=region, project_id=project_id, access_token=token)
            else:
                self.client = AnthropicVertex(region=region, project_id=project_id)
        else:
            from google import genai
            if access_token:
                credits = service_account.Credentials.from_service_account_info(access_token, scopes=scopes)
                self.client = genai.Client(vertexai=True, project=project_id, location=region, credentials=credits)
            else:
                self.client = genai.Client(vertexai=True, project=project_id, location=region)
        Base.__init__(self, **kwargs)

    def describe(self, image):
        """Generate image description, routing to Claude or Gemini.

        Args:
            image: Image data in any supported format.

        Returns:
            A tuple of (description_text, total_tokens).
        """
        if "claude" in self.model_name:
            return AnthropicCV.describe(self, image)
        else:
            return GeminiCV.describe(self, image)

    def describe_with_prompt(self, image, prompt=None):
        """Generate image description with custom prompt, routing by model.

        Args:
            image: Image data in any supported format.
            prompt: Custom instruction prompt.

        Returns:
            A tuple of (description_text, total_tokens).
        """
        if "claude" in self.model_name:
            return AnthropicCV.describe_with_prompt(self, image, prompt)
        else:
            return GeminiCV.describe_with_prompt(self, image, prompt)

    async def async_chat(self, system, history, gen_conf, images=None, **kwargs):
        """Async chat routing to Claude or Gemini based on model name.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation configuration.
            images: Optional images to include.
            **kwargs: Additional parameters.

        Returns:
            A tuple of (response_text, total_tokens).
        """
        if "claude" in self.model_name:
            return await AnthropicCV.async_chat(self, system, history, gen_conf, images)
        else:
            return await GeminiCV.async_chat(self, system, history, gen_conf, images)

    async def async_chat_streamly(self, system, history, gen_conf, images=None, **kwargs):
        """Streaming async chat routing to Claude or Gemini.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation configuration.
            images: Optional images to include.
            **kwargs: Additional parameters.

        Yields:
            Text deltas followed by total token count.
        """
        if "claude" in self.model_name:
            async for ans in AnthropicCV.async_chat_streamly(self, system, history, gen_conf, images):
                yield ans
        else:
            async for ans in GeminiCV.async_chat_streamly(self, system, history, gen_conf, images):
                yield ans


class RAGconCV(GptV4):
    """RAGcon vision provider - routes through LiteLLM proxy.

    Supports vision models through the RAGcon LiteLLM gateway.
    Inherits all vision capabilities from GptV4.

    Default Base URL: https://connect.ragcon.ai/v1
    """

    _FACTORY_NAME = "RAGcon"

    def __init__(self, key, model_name, lang="Chinese", base_url="", **kwargs):
        """Initialize the RAGcon vision client.

        Args:
            key: RAGcon API key for authentication.
            model_name: Model identifier routed through LiteLLM.
            lang: Language for description prompts.
            base_url: RAGcon proxy URL. Falls back to default if empty.
            **kwargs: Additional configuration passed to Base.
        """

        if not base_url:
            base_url = "https://connect.ragcon.com/v1"

        # Initialize client
        self.client = OpenAI(api_key=key, base_url=base_url)
        self.async_client = AsyncOpenAI(api_key=key, base_url=base_url)
        self.model_name = model_name
        self.lang = lang

        Base.__init__(self, **kwargs)
