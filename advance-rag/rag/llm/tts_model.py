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

import re
from abc import ABC
from typing import Annotated, Literal

import requests
from pydantic import BaseModel, conint

from common.token_utils import num_tokens_from_string


class ServeReferenceAudio(BaseModel):
    audio: bytes
    text: str


class ServeTTSRequest(BaseModel):
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
    def __init__(self, key, model_name, base_url, **kwargs):
        """
        Abstract base class constructor.
        Parameters are not stored; subclasses should handle their own initialization.
        """
        pass

    def tts(self, audio):
        pass

    def normalize_text(self, text):
        return re.sub(r"(\*\*|##\d+\$\$|#)", "", text)


class HTTPBasedTTS(Base):
    """
    Base class for HTTP-based TTS services.
    Provides common HTTP request handling and response processing.
    """
    
    def __init__(self, key, model_name, base_url, **kwargs):
        self.model_name = model_name
        self.base_url = base_url
        self.api_key = key
        self.headers = {
            "Content-Type": "application/json"
        }
        if key and key != "x":
            self.headers["Authorization"] = f"Bearer {self.api_key}"
    
    def _build_payload(self, text, voice, **kwargs):
        """
        Build payload for TTS request.
        Subclasses should override this method if they need custom payload structure.
        """
        return {
            "model": self.model_name,
            "voice": voice,
            "input": text
        }
    
    def _send_request(self, endpoint, payload, stream=True):
        """
        Send HTTP request to TTS service.
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
        """
        Process streaming response from TTS service.
        """
        for chunk in response.iter_content():
            if chunk:
                yield chunk
    
    def tts(self, text, voice="alloy"):
        """
        Generate speech from text.
        """
        text = self.normalize_text(text)
        payload = self._build_payload(text, voice)
        response = self._send_request("/audio/speech", payload)
        return self._process_response(response)


class OpenAITTS(HTTPBasedTTS):
    _FACTORY_NAME = "OpenAI"

    def __init__(self, key, model_name="tts-1", base_url="https://api.openai.com/v1"):
        if not base_url:
            base_url = "https://api.openai.com/v1"
        super().__init__(key, model_name, base_url)


class OllamaTTS(HTTPBasedTTS):
    def __init__(self, key, model_name="ollama-tts", base_url="https://api.ollama.ai/v1"):
        if not base_url:
            base_url = "https://api.ollama.ai/v1"
        super().__init__(key, model_name, base_url)

    def tts(self, text, voice="standard-voice"):
        text = self.normalize_text(text)
        payload = self._build_payload(text, voice)
        response = self._send_request("/audio/tts", payload)
        return self._process_response(response)


class RAGconTTS(Base):
    """
    RAGcon TTS Provider - routes through LiteLLM proxy
    
    Text-to-speech models routed through LiteLLM.
    Default Base URL: https://connect.ragcon.ai/v1
    """
    _FACTORY_NAME = "RAGcon"
    
    def __init__(self, key, model_name, base_url=None, **kwargs):
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
        """
        Uses LiteLLM's /v1/audio/speech endpoint
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
