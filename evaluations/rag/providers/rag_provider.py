"""
RAG Provider for B-Knowledge Evaluation

Implements the promptfoo provider interface to query the B-Knowledge chat API.
Supports two modes selected automatically at runtime:

  MockRagProvider  — No live API needed. Returns deterministic fake responses
                     based on question keywords. Safe for dev, CI, and Phase 3
                     development while Phase 2 (real dataset) is still in progress.

  RagProvider      — Calls the real B-Knowledge chat endpoint with SSE streaming.
                     Activated when BKNOWLEDGE_API_URL and BKNOWLEDGE_CHAT_TOKEN
                     are set in the environment (or passed via promptfoo config).

Selection is handled by RagProviderFactory which is the entry point used in
promptfooconfig.yaml.

@description B-Knowledge RAG provider for promptfoo evaluation framework
"""

import os
import json
import asyncio
import hashlib
import logging
import httpx
from typing import AsyncIterator, Dict, Any, Optional

from providers.base import BaseProvider, ProviderResponse

# ---------------------------------------------------------------------------
# Module-level logger
# ---------------------------------------------------------------------------
logger = logging.getLogger(__name__)


# ===========================================================================
# MockRagProvider
# ===========================================================================

class MockRagProvider(BaseProvider):
    """
    Mock provider that returns deterministic fake responses.

    Designed so:
      - All metrics code can be written and tested without a live API.
      - Each question deterministically maps to a plausible answer so
        metric scores are stable across runs.
      - The mock is transparent: every response includes a flag so results
        can be filtered out of real evaluation reports.

    @description Mock implementation — swappable with RagProvider when API is ready
    """

    def __init__(self, **kwargs):
        """
        Initialize mock provider.

        @param kwargs: Accepts same args as RagProvider (ignored) for API parity
        """
        # Use placeholder URL — not actually called
        super().__init__(api_url="mock://localhost", timeout=0)
        logger.info("[MockRagProvider] Initialized — no real API will be called")

    async def query(self, prompt: str, **kwargs) -> ProviderResponse:
        """
        Return a deterministic mock response based on the question.

        The response is generated from a hash of the prompt so it is always
        the same for the same input, making metric scores reproducible.

        @param prompt: The question string
        @param kwargs: Unused additional arguments
        @returns: ProviderResponse with mock text and metadata flag
        """
        # Build a short, plausible-sounding response seeded by the question hash
        seed = int(hashlib.md5(prompt.encode()).hexdigest()[:8], 16)
        mock_sentences = [
            "To accomplish this, navigate to the Settings panel and apply the required configuration.",
            "The system handles this automatically when the correct environment variables are set.",
            "This feature is documented in the API reference under the Authentication section.",
            "You can configure this by editing the .env file and restarting the service.",
            "The recommended approach is to use the built-in workflow as described in the user guide.",
            "This process requires administrator access. Contact your team lead to enable it.",
            "Use the CLI command `npm run setup` followed by the configuration wizard.",
            "The default value is enabled. Override it by setting the relevant flag in config.",
        ]
        # Pick sentence deterministically from seed
        response_text = mock_sentences[seed % len(mock_sentences)]

        logger.debug(f"[MockRagProvider] query='{prompt[:60]}...' → mock response #{seed % len(mock_sentences)}")

        return ProviderResponse(
            text=response_text,
            metadata={
                "mock": True,
                "prompt_hash": seed,
                "provider": "MockRagProvider",
            },
            raw={"mock_response": response_text},
        )

    async def health_check(self) -> bool:
        """
        Always healthy — no external dependency.

        @returns: True always
        """
        return True


# ===========================================================================
# RagProvider
# ===========================================================================

class RagProvider(BaseProvider):
    """
    Real provider that calls the B-Knowledge chat API with SSE streaming.

    Protocol:
      POST {api_url}/api/chat/stream
      Headers:
        Authorization: Bearer {chat_token}
        Content-Type: application/json
        Accept: text/event-stream
      Body:
        { "question": "<prompt>", "stream": true }

    SSE event format expected from server:
        data: {"type": "text", "content": "partial answer chunk"}
        data: {"type": "done", "citations": [...]}
        data: [DONE]

    NOTE: If the B-Knowledge endpoint URL/format changes, update
    _build_request_body() and _parse_sse_chunk() only — all other logic
    stays the same.

    @description Real SSE-based implementation for B-Knowledge chat API
    """

    # SSE event types
    _EVENT_TEXT = "text"
    _EVENT_DONE = "done"
    _EVENT_ERROR = "error"

    def __init__(self, api_url: str, chat_token: str, timeout: int = 30, **kwargs):
        """
        Initialize the real provider.

        @param api_url: Base URL of the B-Knowledge API (e.g. http://localhost:3001)
        @param chat_token: Bearer token for authentication
        @param timeout: HTTP request timeout in seconds
        """
        super().__init__(api_url=api_url, timeout=timeout)
        self._chat_token = chat_token
        # Derive the streaming endpoint from the base URL
        self._stream_endpoint = f"{api_url.rstrip('/')}/api/chat/stream"
        logger.info(f"[RagProvider] Initialized → endpoint: {self._stream_endpoint}")

    def _build_headers(self) -> Dict[str, str]:
        """
        Build HTTP headers for the chat request.

        @returns: Dict of header name → value
        """
        return {
            "Authorization": f"Bearer {self._chat_token}",
            "Content-Type": "application/json",
            # Tell the server we accept an SSE stream
            "Accept": "text/event-stream",
            "Cache-Control": "no-cache",
        }

    def _build_request_body(self, prompt: str) -> Dict[str, Any]:
        """
        Build the JSON request body.

        @param prompt: The question to send
        @returns: Dict representing the JSON body
        """
        return {
            "question": prompt,
            "stream": True,
        }

    def _parse_sse_chunk(self, raw_line: str) -> Optional[Dict[str, Any]]:
        """
        Parse a single SSE data line into a structured dict.

        Expected formats:
          data: {"type":"text","content":"..."}
          data: {"type":"done","citations":[...]}
          data: [DONE]

        @param raw_line: Raw string line from the SSE stream
        @returns: Parsed dict, or None if line should be skipped
        """
        # Strip the "data: " prefix
        line = raw_line.strip()
        if not line.startswith("data:"):
            return None

        payload = line[len("data:"):].strip()

        # Terminal signal
        if payload == "[DONE]":
            return {"type": self._EVENT_DONE}

        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            logger.warning(f"[RagProvider] Could not parse SSE payload: {payload!r}")
            return None

    async def _stream_response(self, prompt: str) -> AsyncIterator[Dict[str, Any]]:
        """
        Open the SSE connection and yield parsed event dicts until done.

        @param prompt: The question to send
        @yields: Parsed SSE event dicts
        """
        headers = self._build_headers()
        body = self._build_request_body(prompt)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream("POST", self._stream_endpoint, headers=headers, json=body) as response:
                # Raise on HTTP error status before consuming the stream
                response.raise_for_status()

                async for line in response.aiter_lines():
                    parsed = self._parse_sse_chunk(line)
                    if parsed is not None:
                        yield parsed

    async def query(self, prompt: str, **kwargs) -> ProviderResponse:
        """
        Send the prompt to the B-Knowledge chat API and collect the full response.

        Accumulates all "text" chunks, then returns the joined result.

        @param prompt: The question string
        @param kwargs: Unused additional arguments
        @returns: ProviderResponse with complete answer text and metadata
        """
        text_chunks: list[str] = []
        citations: list[Any] = []

        try:
            async for event in self._stream_response(prompt):
                event_type = event.get("type")

                if event_type == self._EVENT_TEXT:
                    # Accumulate streamed content chunks
                    chunk = event.get("content", "")
                    text_chunks.append(chunk)

                elif event_type == self._EVENT_DONE:
                    # Capture citations from the final done event
                    citations = event.get("citations", [])
                    break

                elif event_type == self._EVENT_ERROR:
                    error_msg = event.get("message", "Unknown error from provider")
                    logger.error(f"[RagProvider] Server returned error event: {error_msg}")
                    raise RuntimeError(f"Provider error: {error_msg}")

        except httpx.HTTPStatusError as exc:
            logger.error(f"[RagProvider] HTTP {exc.response.status_code} from {self._stream_endpoint}")
            raise
        except httpx.RequestError as exc:
            logger.error(f"[RagProvider] Request failed: {exc}")
            raise

        full_text = "".join(text_chunks)

        return ProviderResponse(
            text=full_text,
            metadata={
                "mock": False,
                "provider": "RagProvider",
                "citation_count": len(citations),
            },
            raw={
                "chunks": text_chunks,
                "citations": citations,
            },
        )

    async def health_check(self) -> bool:
        """
        Ping the API base URL to confirm it is reachable.

        @returns: True if HTTP 2xx, False otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(self.api_url)
                return resp.status_code < 400
        except Exception:
            return False


# ===========================================================================
# RagProviderFactory — entry point for promptfoo
# ===========================================================================

def RagProviderFactory(config: Dict[str, Any]) -> BaseProvider:
    """
    Factory function called by promptfoo to instantiate the correct provider.

    Selection logic:
      1. If mock_mode is "true" → always use MockRagProvider
      2. If api_url is empty/unset → use MockRagProvider (dev fallback)
      3. Otherwise → use RagProvider with real API

    This keeps the evaluation pipeline working at all times regardless of
    whether the live B-Knowledge API is available.

    @param config: Dict from promptfooconfig.yaml providers[].config block
    @returns: Instantiated provider (MockRagProvider or RagProvider)
    """
    mock_mode = str(config.get("mock_mode", "false")).lower() == "true"
    api_url = config.get("api_url") or os.environ.get("BKNOWLEDGE_API_URL", "")
    chat_token = config.get("chat_token") or os.environ.get("BKNOWLEDGE_CHAT_TOKEN", "")

    # Use mock if explicitly requested OR if no API URL is configured
    if mock_mode or not api_url:
        logger.info("[RagProviderFactory] → MockRagProvider (mock_mode=%s, api_url='%s')", mock_mode, api_url)
        return MockRagProvider()

    if not chat_token:
        logger.warning(
            "[RagProviderFactory] BKNOWLEDGE_CHAT_TOKEN is not set — "
            "real API calls will likely receive 401. Using MockRagProvider as fallback."
        )
        return MockRagProvider()

    logger.info("[RagProviderFactory] → RagProvider (url=%s)", api_url)
    return RagProvider(
        api_url=api_url,
        chat_token=chat_token,
        timeout=int(config.get("timeout", 30)),
    )


# ===========================================================================
# Promptfoo callable interface
# ===========================================================================

def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Synchronous wrapper called by promptfoo for each test case.

    Promptfoo invokes this function with:
      - prompt:  The rendered question string
      - options: Provider config from promptfooconfig.yaml
      - context: Test case vars (question, expected_answer, source_doc, etc.)

    @param prompt: The question string rendered by promptfoo
    @param options: Provider config dict
    @param context: Test-case level variables
    @returns: Dict with "output" key (required by promptfoo)
    """
    config = options.get("config", {})
    provider = RagProviderFactory(config)

    # Run the async query in a new event loop (promptfoo calls this synchronously)
    loop = asyncio.new_event_loop()
    try:
        response: ProviderResponse = loop.run_until_complete(provider.query(prompt))
    finally:
        loop.close()

    return {
        "output": response.text,
        "metadata": response.metadata or {},
    }
