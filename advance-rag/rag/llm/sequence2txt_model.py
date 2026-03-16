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
"""Sequence-to-Text (Speech-to-Text) model integrations.

Provides audio transcription capabilities through multiple providers including
OpenAI Whisper, Azure OpenAI, and RAGcon. Each provider converts audio files
into text transcriptions with token usage tracking.

Typical usage:
    stt = GPTSeq2txt(key="sk-...", model_name="whisper-1")
    text, token_count = stt.transcription("/path/to/audio.mp3")
"""

import base64
import io
from abc import ABC

from openai import OpenAI
from openai.lib.azure import AzureOpenAI

from common.token_utils import num_tokens_from_string


class Base(ABC):
    """Abstract base class for all speech-to-text provider implementations.

    Provides a shared ``transcription`` method that reads an audio file and
    sends it to the provider's transcription API, plus an ``audio2base64``
    utility for encoding audio bytes.
    """

    def __init__(self, key, model_name, **kwargs):
        """Initialize the speech-to-text base class.

        Args:
            key: API key or authentication token for the provider.
            model_name: Identifier of the STT model (e.g. "whisper-1").
            **kwargs: Additional provider-specific configuration.
        """
        pass

    def transcription(self, audio_path, **kwargs):
        """Transcribe an audio file to text.

        Args:
            audio_path: Filesystem path to the audio file to transcribe.
            **kwargs: Additional parameters passed to the provider API.

        Returns:
            A tuple of (transcribed_text, token_count) where token_count
            is an approximate count of tokens in the transcription.
        """
        audio_file = open(audio_path, "rb")
        transcription = self.client.audio.transcriptions.create(model=self.model_name, file=audio_file)
        return transcription.text.strip(), num_tokens_from_string(transcription.text.strip())

    def audio2base64(self, audio):
        """Encode raw audio data to a base64 string.

        Args:
            audio: Audio data as raw bytes or a BytesIO buffer.

        Returns:
            Base64-encoded string representation of the audio.

        Raises:
            TypeError: If audio is not bytes or BytesIO.
        """
        if isinstance(audio, bytes):
            return base64.b64encode(audio).decode("utf-8")
        if isinstance(audio, io.BytesIO):
            return base64.b64encode(audio.getvalue()).decode("utf-8")
        raise TypeError("The input audio file should be in binary format.")


class GPTSeq2txt(Base):
    """OpenAI Whisper speech-to-text provider.

    Uses the OpenAI /v1/audio/transcriptions endpoint with
    the Whisper model for automatic speech recognition.
    """

    _FACTORY_NAME = "OpenAI"

    def __init__(self, key, model_name="whisper-1", base_url="https://api.openai.com/v1", **kwargs):
        """Initialize the OpenAI Whisper STT client.

        Args:
            key: OpenAI API key.
            model_name: Whisper model variant (default "whisper-1").
            base_url: OpenAI API base URL. Falls back to default if empty.
            **kwargs: Additional configuration passed to Base.
        """
        if not base_url:
            base_url = "https://api.openai.com/v1"
        self.client = OpenAI(api_key=key, base_url=base_url)
        self.model_name = model_name


class AzureSeq2txt(Base):
    """Azure OpenAI speech-to-text provider.

    Uses the Azure-hosted OpenAI service for audio transcription,
    requiring an Azure endpoint URL and API version.
    """

    _FACTORY_NAME = "Azure-OpenAI"

    def __init__(self, key, model_name, lang="Chinese", **kwargs):
        """Initialize the Azure OpenAI STT client.

        Args:
            key: Azure OpenAI API key.
            model_name: Deployed model name in Azure.
            lang: Target language for transcription (default "Chinese").
            **kwargs: Must include ``base_url`` pointing to the Azure endpoint.
        """
        self.client = AzureOpenAI(api_key=key, azure_endpoint=kwargs["base_url"], api_version="2024-02-01")
        self.model_name = model_name
        self.lang = lang


class RAGconSeq2txt(Base):
    """RAGcon speech-to-text provider - routes through LiteLLM proxy.

    Proxies transcription requests through the RAGcon LiteLLM gateway,
    which forwards them to the appropriate upstream Whisper-compatible
    model provider.

    Default Base URL: https://connect.ragcon.com/v1
    """

    _FACTORY_NAME = "RAGcon"

    def __init__(self, key, model_name, base_url=None, lang="English", **kwargs):
        """Initialize the RAGcon STT client.

        Args:
            key: RAGcon API key for authentication.
            model_name: Model identifier routed through LiteLLM.
            base_url: RAGcon proxy URL. Falls back to default if not provided.
            lang: Target language hint (default "English"). Whisper
                auto-detects language regardless of this setting.
            **kwargs: Additional configuration (unused).
        """
        # Use provided base_url or fallback to default
        if not base_url:
            base_url = "https://connect.ragcon.com/v1"

        self.base_url = base_url
        self.model_name = model_name
        self.key = key
        self.lang = lang

        self.client = OpenAI(api_key=key, base_url=self.base_url)

    def transcription(self, audio_path, **kwargs):
        """Transcribe audio file using RAGcon's OpenAI-compatible API.

        Uses Whisper's automatic language detection for multilingual audio.

        Args:
            audio_path: Filesystem path to the audio file.
            **kwargs: Additional parameters (maintained for interface consistency).

        Returns:
            A tuple of (transcribed_text, token_count).
        """
        with open(audio_path, "rb") as audio_file:
            # Call RAGcon API - Whisper will auto-detect language
            transcription = self.client.audio.transcriptions.create(
                model=self.model_name,
                file=audio_file
            )

        # Return text and token count
        text = transcription.text.strip()
        return text, num_tokens_from_string(text)
