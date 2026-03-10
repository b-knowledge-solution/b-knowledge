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
import base64
import io
from abc import ABC

from openai import OpenAI
from openai.lib.azure import AzureOpenAI

from common.token_utils import num_tokens_from_string


class Base(ABC):
    def __init__(self, key, model_name, **kwargs):
        """
        Abstract base class constructor.
        Parameters are not stored; initialization is left to subclasses.
        """
        pass

    def transcription(self, audio_path, **kwargs):
        audio_file = open(audio_path, "rb")
        transcription = self.client.audio.transcriptions.create(model=self.model_name, file=audio_file)
        return transcription.text.strip(), num_tokens_from_string(transcription.text.strip())

    def audio2base64(self, audio):
        if isinstance(audio, bytes):
            return base64.b64encode(audio).decode("utf-8")
        if isinstance(audio, io.BytesIO):
            return base64.b64encode(audio.getvalue()).decode("utf-8")
        raise TypeError("The input audio file should be in binary format.")


class GPTSeq2txt(Base):
    _FACTORY_NAME = "OpenAI"

    def __init__(self, key, model_name="whisper-1", base_url="https://api.openai.com/v1", **kwargs):
        if not base_url:
            base_url = "https://api.openai.com/v1"
        self.client = OpenAI(api_key=key, base_url=base_url)
        self.model_name = model_name


class AzureSeq2txt(Base):
    _FACTORY_NAME = "Azure-OpenAI"

    def __init__(self, key, model_name, lang="Chinese", **kwargs):
        self.client = AzureOpenAI(api_key=key, azure_endpoint=kwargs["base_url"], api_version="2024-02-01")
        self.model_name = model_name
        self.lang = lang


class RAGconSeq2txt(Base):
    """
    RAGcon Sequence2Text Provider - routes through LiteLLM proxy
    
    Speech-to-text models routed through LiteLLM.
    Default Base URL: https://connect.ragcon.com/v1
    """
    _FACTORY_NAME = "RAGcon"
    
    def __init__(self, key, model_name, base_url=None, lang="English", **kwargs):
        # Use provided base_url or fallback to default
        if not base_url:
            base_url = "https://connect.ragcon.com/v1"
        
        self.base_url = base_url
        self.model_name = model_name
        self.key = key
        self.lang = lang
        
        self.client = OpenAI(api_key=key, base_url=self.base_url)
    
    def transcription(self, audio_path, **kwargs):
        """
        Transcribe audio file using RAGcon's OpenAI-compatible API.
        Uses Whisper's automatic language detection for German and English audio.
        
        Args:
            audio_path: Path to the audio file
            **kwargs: Additional parameters (currently unused but maintained for compatibility)
        
        Returns:
            tuple: (transcribed_text, token_count)
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
