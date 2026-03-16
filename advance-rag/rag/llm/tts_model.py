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
"""Text-to-Speech (TTS) model integrations.

Provides a unified abstraction layer for multiple TTS providers including
OpenAI, Ollama, and RAGcon. Each provider converts text input into streaming
audio output via HTTP-based APIs.

Typical usage:
    tts = OpenAITTS(key="sk-...", model_name="tts-1")
    for audio_chunk in tts.tts("Hello world"):
        stream.write(audio_chunk)
"""

import re
from abc import ABC
from typing import Annotated, Literal

import requests
from pydantic import BaseModel, conint

from common.token_utils import num_tokens_from_string


class ServeReferenceAudio(BaseModel):
    """Reference audio sample used for in-context learning in TTS generation.

    Pairs a raw audio byte sequence with its corresponding transcript so the
    TTS engine can mimic the speaker's voice characteristics.
    """

    audio: bytes
    text: str


class ServeTTSRequest(BaseModel):
    """Pydantic schema for a TTS API request payload.

    Encapsulates all configurable parameters for text-to-speech generation
    including audio format, quality settings, reference audio for voice
    cloning, and latency preferences.
    """

    text: str
    chunk_length: Annotated[int, conint(ge=100, le=300, strict=True)] = 200
    # Audio format
    format: Literal["wav", "pcm", "mp3"] = "mp3"
    mp3_bitrate: Literal[64, 128, 192] = 128
    # References audios for in-context learning
    references: list[ServeReferenceAudio] = []
    # Reference id
    # For example, if you want use https://fish.audio/m/7f92f8afb8ec43bf81429cc1c9199cb1/
    # Just pass 7f92f8afb8ec43bf81429cc1c9199cb1
    reference_id: str | None = None
    # Normalize text for en & zh, this increase stability for numbers
    normalize: bool = True
    # Balance mode will reduce latency to 300ms, but may decrease stability
    latency: Literal["normal", "balanced"] = "normal"


class Base(ABC):
    """Abstract base class for all TTS provider implementations.

    Defines the minimal interface that every TTS backend must support:
    a ``tts`` method for audio generation and a ``normalize_text`` helper
    for stripping markdown/formatting artifacts before synthesis.
    """

    def __init__(self, key, model_name, base_url, **kwargs):
        """Initialize the TTS base class.

        Args:
            key: API key or authentication token for the provider.
            model_name: Identifier of the TTS model to use.
            base_url: Root URL of the provider's API endpoint.
            **kwargs: Additional provider-specific configuration.
        """
        pass

    def tts(self, audio):
        """Generate speech audio from input. Subclasses must override."""
        pass

    def normalize_text(self, text):
        """Strip markdown-style formatting tokens before TTS synthesis.

        Args:
            text: Raw text potentially containing bold markers, heading
                markers, or other formatting artifacts.

        Returns:
            Cleaned text string suitable for speech synthesis.
        """
        return re.sub(r"(\*\*|##\d+\$\$|#)", "", text)


class HTTPBasedTTS(Base):
    """Base class for HTTP-based TTS services.

    Provides common HTTP request handling, payload construction, and
    streaming response processing. Subclasses only need to customize
    endpoint paths or payload formats for their specific provider.
    """

    def __init__(self, key, model_name, base_url, **kwargs):
        """Initialize HTTP-based TTS client.

        Args:
            key: API key for authentication. Keys equal to "x" or empty
                are treated as unauthenticated requests.
            model_name: Provider-specific model identifier (e.g. "tts-1").
            base_url: Root URL of the TTS API (without trailing endpoint path).
            **kwargs: Additional configuration passed to Base.
        """
        self.model_name = model_name
        self.base_url = base_url
        self.api_key = key
        self.headers = {
            "Content-Type": "application/json"
        }
        # Only add auth header if a real API key is provided
        if key and key != "x":
            self.headers["Authorization"] = f"Bearer {self.api_key}"

    def _build_payload(self, text, voice, **kwargs):
        """Build the JSON payload for a TTS request.

        Args:
            text: The text content to synthesize into speech.
            voice: Voice identifier (e.g. "alloy", "echo", "fable").
            **kwargs: Additional payload fields for provider-specific options.

        Returns:
            Dictionary payload ready to be JSON-serialized and sent.
        """
        return {
            "model": self.model_name,
            "voice": voice,
            "input": text
        }

    def _send_request(self, endpoint, payload, stream=True):
        """Send an HTTP POST request to the TTS API endpoint.

        Args:
            endpoint: API endpoint path (e.g. "/audio/speech").
            payload: JSON-serializable dictionary with request parameters.
            stream: Whether to stream the response (default True for audio).

        Returns:
            The HTTP response object for streaming iteration.

        Raises:
            Exception: If the server returns a non-200 status code.
        """
        url = f"{self.base_url}{endpoint}"
        response = requests.post(
            url,
            headers=self.headers,
            json=payload,
            stream=stream
        )

        if response.status_code != 200:
            raise Exception(f"**Error**: {response.status_code}, {response.text}")

        return response

    def _process_response(self, response):
        """Iterate over streaming response chunks and yield audio bytes.

        Args:
            response: An HTTP response object with streaming enabled.

        Yields:
            Non-empty byte chunks of audio data.
        """
        for chunk in response.iter_content():
            if chunk:
                yield chunk

    def tts(self, text, voice="alloy"):
        """Generate speech from text using the OpenAI-compatible speech endpoint.

        Args:
            text: The text to convert to speech.
            voice: Voice identifier to use (default "alloy").

        Yields:
            Byte chunks of the generated audio stream.
        """
        # Strip markdown formatting before synthesis
        text = self.normalize_text(text)
        payload = self._build_payload(text, voice)
        response = self._send_request("/audio/speech", payload)
        return self._process_response(response)


class OpenAITTS(HTTPBasedTTS):
    """OpenAI TTS provider using the /v1/audio/speech endpoint.

    Wraps the standard OpenAI text-to-speech API with default configuration
    for the tts-1 model and https://api.openai.com/v1 base URL.
    """

    _FACTORY_NAME = "OpenAI"

    def __init__(self, key, model_name="tts-1", base_url="https://api.openai.com/v1"):
        """Initialize OpenAI TTS client.

        Args:
            key: OpenAI API key.
            model_name: TTS model identifier (default "tts-1").
            base_url: OpenAI API base URL. Falls back to default if empty.
        """
        if not base_url:
            base_url = "https://api.openai.com/v1"
        super().__init__(key, model_name, base_url)


class OllamaTTS(HTTPBasedTTS):
    """Ollama TTS provider using a local or remote Ollama server.

    Uses the /audio/tts endpoint instead of the OpenAI-compatible
    /audio/speech path used by other providers.
    """

    def __init__(self, key, model_name="ollama-tts", base_url="https://api.ollama.ai/v1"):
        """Initialize Ollama TTS client.

        Args:
            key: API key (may be "x" for unauthenticated local servers).
            model_name: Ollama model name (default "ollama-tts").
            base_url: Ollama server URL. Falls back to default if empty.
        """
        if not base_url:
            base_url = "https://api.ollama.ai/v1"
        super().__init__(key, model_name, base_url)

    def tts(self, text, voice="standard-voice"):
        """Generate speech using Ollama's TTS endpoint.

        Overrides the base class to use /audio/tts instead of /audio/speech.

        Args:
            text: The text to convert to speech.
            voice: Voice identifier (default "standard-voice").

        Yields:
            Byte chunks of the generated audio stream.
        """
        text = self.normalize_text(text)
        payload = self._build_payload(text, voice)
        # Ollama uses a different endpoint path than OpenAI
        response = self._send_request("/audio/tts", payload)
        return self._process_response(response)


class RAGconTTS(Base):
    """RAGcon TTS provider - routes through LiteLLM proxy.

    Text-to-speech models routed through LiteLLM. Uses the standard
    /v1/audio/speech endpoint on the RAGcon proxy server.

    Default Base URL: https://connect.ragcon.ai/v1
    """

    _FACTORY_NAME = "RAGcon"

    def __init__(self, key, model_name, base_url=None, **kwargs):
        """Initialize RAGcon TTS client.

        Args:
            key: RAGcon API key for authentication.
            model_name: Model identifier routed through LiteLLM.
            base_url: RAGcon proxy URL. Falls back to default if not provided.
            **kwargs: Additional configuration (unused, kept for interface consistency).
        """
        if not base_url:
            base_url = "https://connect.ragcon.com/v1"

        self.base_url = base_url
        self.api_key = key
        self.model_name = model_name
        self.headers = {
            "accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

    def tts(self, text, voice="English Female", stream=True):
        """Generate speech from text using RAGcon's LiteLLM proxy.

        Args:
            text: The text to convert to speech.
            voice: Voice identifier (default "English Female").
            stream: Whether to stream the response (default True).

        Yields:
            Byte chunks (1024 bytes each) of the generated audio stream.

        Raises:
            Exception: If the server returns a non-200 status code.
        """

        payload = {
            "model": self.model_name,
            "input": text,
            "voice": voice
        }

        response = requests.post(
            f"{self.base_url}/audio/speech",
            headers=self.headers,
            json=payload,
            stream=stream
        )

        if response.status_code != 200:
            raise Exception(f"**Error**: {response.status_code}, {response.text}")

        for chunk in response.iter_content(chunk_size=1024):
            if chunk:
                yield chunk
