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
"""OCR (Optical Character Recognition) model integrations for PDF parsing.

Provides OCR-based document parsing through external services like MinerU
and PaddleOCR. These models extract structured text sections and tables
from PDF documents, handling layout analysis, text recognition, and
content structuring.

Supported providers:
    - MinerU: Advanced PDF parser with pipeline/server backends
    - PaddleOCR: PaddlePaddle-based OCR with visual language models

Typical usage:
    ocr = MinerUOcrModel(key='{"mineru_apiserver": "http://..."}', model_name="mineru")
    sections, tables = ocr.parse_pdf("/path/to/document.pdf")
"""

import json
import logging
import os
from typing import Any, Optional

from deepdoc.parser.mineru_parser import MinerUParser
from deepdoc.parser.paddleocr_parser import PaddleOCRParser


class Base:
    """Abstract base class for all OCR provider implementations.

    Defines the ``parse_pdf`` interface that every OCR backend must implement
    to extract structured content (text sections and tables) from PDF files.
    """

    def __init__(self, key: str | dict, model_name: str, **kwargs):
        """Initialize the OCR base class.

        Args:
            key: API key or JSON configuration string for the provider.
            model_name: Identifier of the OCR model to use.
            **kwargs: Additional provider-specific configuration.
        """
        self.model_name = model_name

    def parse_pdf(self, filepath: str, binary=None, **kwargs) -> tuple[Any, Any]:
        """Parse a PDF file and extract structured content.

        Args:
            filepath: Filesystem path to the PDF file.
            binary: Optional raw PDF bytes (alternative to filepath).
            **kwargs: Additional parsing parameters.

        Returns:
            A tuple of (sections, tables) where sections is a list of
            extracted text blocks and tables is a list of table structures.

        Raises:
            NotImplementedError: If not overridden by a subclass.
        """
        raise NotImplementedError("Please implement parse_pdf!")


class MinerUOcrModel(Base, MinerUParser):
    """MinerU-based OCR provider for advanced PDF parsing.

    Supports two backends:
        - ``pipeline``: Local processing pipeline
        - ``server``: Remote MinerU API server

    Configuration is resolved from a priority chain: constructor kwargs,
    JSON key payload (from UI or auto-provisioning), then environment
    variables (MINERU_* prefixed).
    """

    _FACTORY_NAME = "MinerU"

    def __init__(self, key: str | dict, model_name: str, **kwargs):
        """Initialize the MinerU OCR model.

        Parses configuration from the ``key`` parameter which may contain
        either a nested JSON object (from UI) or flat MINERU_* keys
        (from environment auto-provisioning).

        Args:
            key: JSON string containing MinerU configuration. Supports
                both ``{"api_key": {"mineru_apiserver": "..."}}`` (UI format)
                and flat ``{"MINERU_APISERVER": "..."}`` (env format).
            model_name: Model identifier (stored by Base).
            **kwargs: Additional configuration passed to Base and MinerUParser.
        """
        Base.__init__(self, key, model_name, **kwargs)
        raw_config = {}
        if key:
            try:
                raw_config = json.loads(key)
            except Exception:
                raw_config = {}

        # Handle nested {"api_key": {...}} from UI vs flat payload from env vars
        config = raw_config.get("api_key", raw_config)
        if not isinstance(config, dict):
            config = {}

        def _resolve_config(key: str, env_key: str, default=""):
            """Resolve a config value from the JSON payload or environment.

            Priority: lowercase key (UI) > uppercase MINERU_* key (env provision) > env var.

            Args:
                key: Lowercase config key name.
                env_key: Uppercase environment variable name.
                default: Fallback value if not found anywhere.

            Returns:
                The resolved configuration value.
            """
            # lower-case keys (UI), upper-case MINERU_* (env auto-provision), env vars
            return config.get(key, config.get(env_key, os.environ.get(env_key, default)))

        self.mineru_api = _resolve_config("mineru_apiserver", "MINERU_APISERVER", "")
        self.mineru_output_dir = _resolve_config("mineru_output_dir", "MINERU_OUTPUT_DIR", "")
        self.mineru_backend = _resolve_config("mineru_backend", "MINERU_BACKEND", "pipeline")
        self.mineru_server_url = _resolve_config("mineru_server_url", "MINERU_SERVER_URL", "")
        self.mineru_delete_output = bool(int(_resolve_config("mineru_delete_output", "MINERU_DELETE_OUTPUT", 1)))

        # Redact sensitive config keys before logging
        redacted_config = {}
        for k, v in config.items():
            if any(sensitive_word in k.lower() for sensitive_word in ("key", "password", "token", "secret")):
                redacted_config[k] = "[REDACTED]"
            else:
                redacted_config[k] = v
        logging.info(f"Parsed MinerU config (sensitive fields redacted): {redacted_config}")

        MinerUParser.__init__(self, mineru_api=self.mineru_api, mineru_server_url=self.mineru_server_url)

    def check_available(self, backend: Optional[str] = None, server_url: Optional[str] = None) -> tuple[bool, str]:
        """Check whether the MinerU backend is accessible and ready.

        Args:
            backend: Backend type to check ("pipeline" or "server").
                Uses instance default if not specified.
            server_url: Server URL to check connectivity against.
                Uses instance default if not specified.

        Returns:
            A tuple of (is_available, reason) where reason explains
            any failure condition.
        """
        backend = backend or self.mineru_backend
        server_url = server_url or self.mineru_server_url
        return self.check_installation(backend=backend, server_url=server_url)

    def parse_pdf(self, filepath: str, binary=None, callback=None, parse_method: str = "raw", **kwargs):
        """Parse a PDF file using MinerU's extraction pipeline.

        Validates server availability before parsing, then delegates
        to MinerUParser with the configured backend and output settings.

        Args:
            filepath: Path to the PDF file on disk.
            binary: Optional raw PDF bytes as an alternative input.
            callback: Optional progress callback function.
            parse_method: Parsing strategy (default "raw").
            **kwargs: Additional parameters forwarded to MinerUParser.

        Returns:
            A tuple of (sections, tables) extracted from the PDF.

        Raises:
            RuntimeError: If the MinerU server is not accessible.
        """
        # Verify backend availability before attempting to parse
        ok, reason = self.check_available()
        if not ok:
            raise RuntimeError(f"MinerU server not accessible: {reason}")

        sections, tables = MinerUParser.parse_pdf(
            self,
            filepath=filepath,
            binary=binary,
            callback=callback,
            output_dir=self.mineru_output_dir,
            backend=self.mineru_backend,
            server_url=self.mineru_server_url,
            delete_output=self.mineru_delete_output,
            parse_method=parse_method,
            **kwargs,
        )
        return sections, tables


class PaddleOCROcrModel(Base, PaddleOCRParser):
    """PaddleOCR-based OCR provider for PDF parsing.

    Uses PaddlePaddle's OCR engine (including PaddleOCR-VL visual
    language models) via a remote API server for text and table
    extraction from PDF documents.

    Configuration follows the same resolution chain as MinerUOcrModel:
    JSON key payload then environment variables.
    """

    _FACTORY_NAME = "PaddleOCR"

    def __init__(self, key: str | dict, model_name: str, **kwargs):
        """Initialize the PaddleOCR model.

        Args:
            key: JSON string containing PaddleOCR configuration. Supports
                both nested ``{"api_key": {...}}`` and flat formats.
            model_name: Model identifier (stored by Base).
            **kwargs: Additional configuration passed to Base and PaddleOCRParser.
        """
        Base.__init__(self, key, model_name, **kwargs)
        raw_config = {}
        if key:
            try:
                raw_config = json.loads(key)
            except Exception:
                raw_config = {}

        # Handle nested {"api_key": {...}} from UI vs flat payload from env vars
        config = raw_config.get("api_key", raw_config)
        if not isinstance(config, dict):
            config = {}

        def _resolve_config(key: str, env_key: str, default=""):
            """Resolve a config value from the JSON payload or environment.

            Args:
                key: Lowercase config key name.
                env_key: Uppercase environment variable name.
                default: Fallback value if not found anywhere.

            Returns:
                The resolved configuration value.
            """
            # lower-case keys (UI), upper-case PADDLEOCR_* (env auto-provision), env vars
            return config.get(key, config.get(env_key, os.environ.get(env_key, default)))

        self.paddleocr_api_url = _resolve_config("paddleocr_api_url", "PADDLEOCR_API_URL", "")
        self.paddleocr_algorithm = _resolve_config("paddleocr_algorithm", "PADDLEOCR_ALGORITHM", "PaddleOCR-VL")
        self.paddleocr_access_token = _resolve_config("paddleocr_access_token", "PADDLEOCR_ACCESS_TOKEN", None)

        # Redact sensitive config keys before logging
        redacted_config = {}
        for k, v in config.items():
            if any(sensitive_word in k.lower() for sensitive_word in ("key", "password", "token", "secret")):
                redacted_config[k] = "[REDACTED]"
            else:
                redacted_config[k] = v
        logging.info(f"Parsed PaddleOCR config (sensitive fields redacted): {redacted_config}")

        PaddleOCRParser.__init__(
            self,
            api_url=self.paddleocr_api_url,
            access_token=self.paddleocr_access_token,
            algorithm=self.paddleocr_algorithm,
        )

    def check_available(self) -> tuple[bool, str]:
        """Check whether the PaddleOCR server is accessible.

        Returns:
            A tuple of (is_available, reason) where reason explains
            any failure condition.
        """
        return self.check_installation()

    def parse_pdf(self, filepath: str, binary=None, callback=None, parse_method: str = "raw", **kwargs):
        """Parse a PDF file using PaddleOCR's extraction engine.

        Validates server availability before parsing, then delegates
        to PaddleOCRParser for text and table extraction.

        Args:
            filepath: Path to the PDF file on disk.
            binary: Optional raw PDF bytes as an alternative input.
            callback: Optional progress callback function.
            parse_method: Parsing strategy (default "raw").
            **kwargs: Additional parameters forwarded to PaddleOCRParser.

        Returns:
            A tuple of (sections, tables) extracted from the PDF.

        Raises:
            RuntimeError: If the PaddleOCR server is not accessible.
        """
        # Verify server availability before attempting to parse
        ok, reason = self.check_available()
        if not ok:
            raise RuntimeError(f"PaddleOCR server not accessible: {reason}")

        sections, tables = PaddleOCRParser.parse_pdf(self, filepath=filepath, binary=binary, callback=callback, parse_method=parse_method, **kwargs)
        return sections, tables
