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
"""Chat model integrations for LLM-powered conversational AI.

Provides the core chat completion infrastructure for the RAG pipeline,
supporting both simple question-answering and multi-turn tool-calling
conversations. Includes two main base classes:

    - ``Base``: Direct OpenAI SDK integration for providers with native
      OpenAI-compatible endpoints (OpenAI, Google Cloud).
    - ``LiteLLMBase``: LiteLLM-based integration that supports Ollama,
      OpenAI, Azure-OpenAI, and Gemini through a unified proxy layer.

Both bases provide:
    - Async chat (single response and streaming)
    - Tool calling with multi-round conversation support
    - Automatic retry with exponential backoff for transient errors
    - Error classification and user-friendly error messages
    - Reasoning/thinking content extraction (for models like QwQ, Qwen3)

Supported providers:
    - OpenAI (via Base): Direct OpenAI SDK
    - Google Cloud (GoogleChat): Vertex AI with Claude and Gemini
    - Ollama (via LiteLLMBase): Local models through LiteLLM
    - Azure-OpenAI (via LiteLLMBase): Azure-hosted models through LiteLLM
    - Gemini (via LiteLLMBase): Google Gemini through LiteLLM
    - RAGcon (RAGconChat): LiteLLM proxy gateway

Typical usage:
    chat = RAGconChat(key="rk-...", model_name="gpt-4o")
    answer, tokens = await chat.async_chat(
        "You are helpful.",
        [{"role": "user", "content": "Hello"}],
    )
"""

import asyncio
import json
import logging
import os
import random
import re
import time
from abc import ABC
from copy import deepcopy
from urllib.parse import urljoin

import json_repair
import litellm
from openai import AsyncOpenAI, OpenAI
from strenum import StrEnum

from common.token_utils import num_tokens_from_string, total_token_count_from_response
from rag.llm import FACTORY_DEFAULT_BASE_URL, LITELLM_PROVIDER_PREFIX, SupportedLiteLLMProvider
from rag.nlp import is_chinese, is_english

from common.misc_utils import thread_pool_exec


class LLMErrorCode(StrEnum):
    """Enumeration of categorized LLM error codes.

    Used by the error classification system to map raw API errors into
    actionable categories that determine retry behavior and user-facing
    error messages.
    """

    ERROR_RATE_LIMIT = "RATE_LIMIT_EXCEEDED"
    ERROR_AUTHENTICATION = "AUTH_ERROR"
    ERROR_INVALID_REQUEST = "INVALID_REQUEST"
    ERROR_SERVER = "SERVER_ERROR"
    ERROR_TIMEOUT = "TIMEOUT"
    ERROR_CONNECTION = "CONNECTION_ERROR"
    ERROR_MODEL = "MODEL_ERROR"
    ERROR_MAX_ROUNDS = "ERROR_MAX_ROUNDS"
    ERROR_CONTENT_FILTER = "CONTENT_FILTERED"
    ERROR_QUOTA = "QUOTA_EXCEEDED"
    ERROR_MAX_RETRIES = "MAX_RETRIES_EXCEEDED"
    ERROR_GENERIC = "GENERIC_ERROR"


class ReActMode(StrEnum):
    """Supported agent reasoning modes for tool calling.

    - FUNCTION_CALL: Native function calling (OpenAI tool_calls format)
    - REACT: ReAct-style reasoning with thought/action/observation loops
    """

    FUNCTION_CALL = "function_call"
    REACT = "react"


# Prefix used to identify error responses in streamed output
ERROR_PREFIX = "**ERROR**"
# Truncation notices in Chinese and English for length-limited responses
LENGTH_NOTIFICATION_CN = "......\n由于大模型的上下文窗口大小限制，回答已经被大模型截断。"
LENGTH_NOTIFICATION_EN = "...\nThe answer is truncated by your chosen LLM due to its limitation on context length."


class Base(ABC):
    """Abstract base class for OpenAI SDK-based chat model implementations.

    Provides the core chat infrastructure using the OpenAI Python SDK
    directly. Handles retry logic, error classification, streaming,
    tool calling, and reasoning content extraction.

    Subclasses (e.g. GoogleChat, RAGconChat) override __init__ to configure
    provider-specific clients while inheriting all chat behavior.
    """

    def __init__(self, key, model_name, base_url, **kwargs):
        """Initialize the chat model with OpenAI SDK clients.

        Args:
            key: API key for the provider.
            model_name: Model identifier (e.g. "gpt-4o", "claude-3-opus").
            base_url: API base URL for the provider.
            **kwargs: Additional configuration including:
                - max_retries: Maximum retry attempts (default from LLM_MAX_RETRIES env or 5).
                - retry_interval: Base delay for exponential backoff.
                - max_rounds: Maximum tool calling rounds per conversation (default 5).
        """
        timeout = int(os.environ.get("LLM_TIMEOUT_SECONDS", 600))
        self.client = OpenAI(api_key=key, base_url=base_url, timeout=timeout)
        self.async_client = AsyncOpenAI(api_key=key, base_url=base_url, timeout=timeout)
        self.model_name = model_name
        # Configure retry parameters from kwargs or environment
        self.max_retries = kwargs.get("max_retries", int(os.environ.get("LLM_MAX_RETRIES", 5)))
        self.base_delay = kwargs.get("retry_interval", float(os.environ.get("LLM_BASE_DELAY", 2.0)))
        self.max_rounds = kwargs.get("max_rounds", 5)
        self.is_tools = False
        self.tools = []
        self.toolcall_sessions = {}

    def _get_delay(self):
        """Calculate a randomized retry delay using jittered exponential backoff.

        Returns:
            Delay in seconds, randomized between 10x and 150x the base delay.
        """
        return self.base_delay * random.uniform(10, 150)

    def _classify_error(self, error):
        """Classify an exception into a standardized LLMErrorCode.

        Performs keyword-based matching against the error message string
        to categorize the error for retry decisions and user reporting.

        Args:
            error: The exception to classify.

        Returns:
            An LLMErrorCode enum value representing the error category.
        """
        error_str = str(error).lower()

        # Ordered keyword-to-error-code mapping (first match wins)
        keywords_mapping = [
            (["quota", "capacity", "credit", "billing", "balance", "\u6b20\u8d39"], LLMErrorCode.ERROR_QUOTA),
            (["rate limit", "429", "tpm limit", "too many requests", "requests per minute"], LLMErrorCode.ERROR_RATE_LIMIT),
            (["auth", "key", "apikey", "401", "forbidden", "permission"], LLMErrorCode.ERROR_AUTHENTICATION),
            (["invalid", "bad request", "400", "format", "malformed", "parameter"], LLMErrorCode.ERROR_INVALID_REQUEST),
            (["server", "503", "502", "504", "500", "unavailable"], LLMErrorCode.ERROR_SERVER),
            (["timeout", "timed out"], LLMErrorCode.ERROR_TIMEOUT),
            (["connect", "network", "unreachable", "dns"], LLMErrorCode.ERROR_CONNECTION),
            (["filter", "content", "policy", "blocked", "safety", "inappropriate"], LLMErrorCode.ERROR_CONTENT_FILTER),
            (["model", "not found", "does not exist", "not available"], LLMErrorCode.ERROR_MODEL),
            (["max rounds"], LLMErrorCode.ERROR_MODEL),
        ]
        for words, code in keywords_mapping:
            if re.search("({})".format("|".join(words)), error_str):
                return code

        return LLMErrorCode.ERROR_GENERIC

    def _clean_conf(self, gen_conf):
        """Sanitize generation configuration to only include allowed parameters.

        Removes unsupported parameters, handles model-specific quirks
        (e.g. GPT-5 endpoints), and converts max_tokens to
        max_completion_tokens for newer API versions.

        Args:
            gen_conf: Raw generation configuration dictionary.

        Returns:
            Sanitized configuration with only allowed parameters.
        """
        model_name_lower = (self.model_name or "").lower()
        # gpt-5 and gpt-5.1 endpoints have inconsistent parameter support, clear custom generation params to prevent unexpected issues
        if "gpt-5" in model_name_lower:
            gen_conf = {}
            return gen_conf

        if "max_tokens" in gen_conf:
            del gen_conf["max_tokens"]

        # Whitelist of parameters accepted by the OpenAI chat completions API
        allowed_conf = {
            "temperature",
            "max_completion_tokens",
            "top_p",
            "stream",
            "stream_options",
            "stop",
            "n",
            "presence_penalty",
            "frequency_penalty",
            "functions",
            "function_call",
            "logit_bias",
            "user",
            "response_format",
            "seed",
            "tools",
            "tool_choice",
            "logprobs",
            "top_logprobs",
            "extra_headers",
        }

        gen_conf = {k: v for k, v in gen_conf.items() if k in allowed_conf}
        return gen_conf

    async def _async_chat_streamly(self, history, gen_conf, **kwargs):
        """Internal streaming chat implementation.

        Handles the raw streaming response from the OpenAI API, extracting
        reasoning content (wrapped in think tags) and regular text deltas.

        Args:
            history: Complete message history including system prompt.
            gen_conf: Cleaned generation configuration.
            **kwargs: Additional parameters including:
                - with_reasoning: Whether to include reasoning content (default True).
                - stop: Optional stop sequences.

        Yields:
            Tuples of (text_delta, token_count) for each stream chunk.
        """
        logging.info("[HISTORY STREAMLY]" + json.dumps(history, ensure_ascii=False, indent=4))
        reasoning_start = False

        request_kwargs = {"model": self.model_name, "messages": history, "stream": True, **gen_conf}
        stop = kwargs.get("stop")
        if stop:
            request_kwargs["stop"] = stop

        response = await self.async_client.chat.completions.create(**request_kwargs)
        async for resp in response:
            if not resp.choices:
                continue
            if not resp.choices[0].delta.content:
                resp.choices[0].delta.content = ""
            # Extract reasoning/thinking content from models that support it
            if kwargs.get("with_reasoning", True) and hasattr(resp.choices[0].delta, "reasoning_content") and resp.choices[0].delta.reasoning_content:
                ans = ""
                if not reasoning_start:
                    reasoning_start = True
                    ans = "<think>"
                ans += resp.choices[0].delta.reasoning_content + "</think>"
            else:
                reasoning_start = False
                ans = resp.choices[0].delta.content
            tol = total_token_count_from_response(resp)
            if not tol:
                tol = num_tokens_from_string(resp.choices[0].delta.content)

            # Append truncation notice if the model hit its context length limit
            finish_reason = resp.choices[0].finish_reason if hasattr(resp.choices[0], "finish_reason") else ""
            if finish_reason == "length":
                if is_chinese(ans):
                    ans += LENGTH_NOTIFICATION_CN
                else:
                    ans += LENGTH_NOTIFICATION_EN
            yield ans, tol

    async def async_chat_streamly(self, system, history, gen_conf: dict = {}, **kwargs):
        """Stream chat completions with automatic retry on transient errors.

        Prepends the system prompt, cleans configuration, and wraps the
        internal streaming method with retry logic.

        Args:
            system: System prompt text. Prepended to history if not already present.
            history: Conversation history as a list of message dicts.
            gen_conf: Generation configuration (will be sanitized).
            **kwargs: Additional parameters passed to internal streaming.

        Yields:
            Text deltas as strings, followed by the total token count
            as the final yielded value.
        """
        # Prepend system message if not already in history
        if system and history and history[0].get("role") != "system":
            history.insert(0, {"role": "system", "content": system})
        gen_conf = self._clean_conf(gen_conf)
        ans = ""
        total_tokens = 0

        for attempt in range(self.max_retries + 1):
            try:
                async for delta_ans, tol in self._async_chat_streamly(history, gen_conf, **kwargs):
                    ans = delta_ans
                    total_tokens += tol
                    yield ans

                yield total_tokens
                return
            except Exception as e:
                e = await self._exceptions_async(e, attempt)
                if e:
                    yield e
                    yield total_tokens
                    return

    def _length_stop(self, ans):
        """Append a language-appropriate truncation notification to a response.

        Args:
            ans: The response text to append the notification to.

        Returns:
            The response text with a truncation notice appended.
        """
        if is_chinese([ans]):
            return ans + LENGTH_NOTIFICATION_CN
        return ans + LENGTH_NOTIFICATION_EN

    @property
    def _retryable_errors(self) -> set[str]:
        """Set of error codes that should trigger automatic retry.

        Returns:
            Set containing rate limit and server error codes.
        """
        return {
            LLMErrorCode.ERROR_RATE_LIMIT,
            LLMErrorCode.ERROR_SERVER,
        }

    def _should_retry(self, error_code: str) -> bool:
        """Determine whether an error code warrants a retry attempt.

        Args:
            error_code: The classified LLMErrorCode value.

        Returns:
            True if the error is transient and should be retried.
        """
        return error_code in self._retryable_errors

    def _exceptions(self, e, attempt) -> str | None:
        """Handle synchronous exceptions with retry logic.

        Classifies the error, determines if retry is appropriate,
        and either sleeps before returning None (retry) or returns
        a formatted error message (give up).

        Args:
            e: The exception that occurred.
            attempt: Current attempt number (0-based).

        Returns:
            None to indicate retry, or an error message string to give up.
        """
        logging.exception("OpenAI chat_with_tools")
        # Classify the error
        error_code = self._classify_error(e)
        if attempt == self.max_retries:
            error_code = LLMErrorCode.ERROR_MAX_RETRIES

        if self._should_retry(error_code):
            delay = self._get_delay()
            logging.warning(f"Error: {error_code}. Retrying in {delay:.2f} seconds... (Attempt {attempt + 1}/{self.max_retries})")
            time.sleep(delay)
            return None

        msg = f"{ERROR_PREFIX}: {error_code} - {str(e)}"
        logging.error(f"sync base giving up: {msg}")
        return msg

    async def _exceptions_async(self, e, attempt):
        """Handle asynchronous exceptions with retry logic.

        Same behavior as _exceptions but uses asyncio.sleep for
        non-blocking delay during retry.

        Args:
            e: The exception that occurred.
            attempt: Current attempt number (0-based).

        Returns:
            None to indicate retry, or an error message string to give up.
        """
        logging.exception("OpenAI async completion")
        error_code = self._classify_error(e)
        if attempt == self.max_retries:
            error_code = LLMErrorCode.ERROR_MAX_RETRIES

        if self._should_retry(error_code):
            delay = self._get_delay()
            logging.warning(f"Error: {error_code}. Retrying in {delay:.2f} seconds... (Attempt {attempt + 1}/{self.max_retries})")
            await asyncio.sleep(delay)
            return None

        msg = f"{ERROR_PREFIX}: {error_code} - {str(e)}"
        logging.error(f"async base giving up: {msg}")
        return msg

    def _verbose_tool_use(self, name, args, res):
        """Format a tool call and its result as an XML-tagged JSON string.

        Used to provide verbose tool call logging in the streamed output
        so users can see what tools were invoked and their results.

        Args:
            name: The tool/function name.
            args: Arguments passed to the tool.
            res: The tool's return value.

        Returns:
            XML-tagged JSON string with tool call details.
        """
        return "<tool_call>" + json.dumps({"name": name, "args": args, "result": res}, ensure_ascii=False, indent=2) + "</tool_call>"

    def _append_history(self, hist, tool_call, tool_res):
        """Append a tool call and its response to the conversation history.

        Adds both the assistant's tool_calls message and the tool's
        response message to maintain proper conversation flow for
        multi-turn tool calling.

        Args:
            hist: The conversation history list to extend.
            tool_call: The tool call object from the API response.
            tool_res: The result returned by the tool.

        Returns:
            The updated history list.
        """
        hist.append(
            {
                "role": "assistant",
                "tool_calls": [
                    {
                        "index": tool_call.index,
                        "id": tool_call.id,
                        "function": {
                            "name": tool_call.function.name,
                            "arguments": tool_call.function.arguments,
                        },
                        "type": "function",
                    },
                ],
            }
        )
        try:
            if isinstance(tool_res, dict):
                tool_res = json.dumps(tool_res, ensure_ascii=False)
        finally:
            hist.append({"role": "tool", "tool_call_id": tool_call.id, "content": str(tool_res)})
        return hist

    def bind_tools(self, toolcall_session, tools):
        """Register tools and a tool session for function calling.

        Args:
            toolcall_session: A session object with a ``tool_call(name, args)``
                method for invoking tools.
            tools: List of tool definitions in OpenAI function calling format.
        """
        if not (toolcall_session and tools):
            return
        self.is_tools = True
        self.toolcall_session = toolcall_session
        self.tools = tools

    async def async_chat_with_tools(self, system: str, history: list, gen_conf: dict = {}):
        """Non-streaming chat with automatic tool calling support.

        Runs a multi-round conversation where the model can invoke
        tools, receive results, and continue generating. Stops when the
        model produces a final text response or exceeds max_rounds.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation configuration.

        Returns:
            A tuple of (full_response_text, total_token_count) where
            the response includes verbose tool call logs.
        """
        gen_conf = self._clean_conf(gen_conf)
        if system and history and history[0].get("role") != "system":
            history.insert(0, {"role": "system", "content": system})

        ans = ""
        tk_count = 0
        # Deep copy history so retries start from the original state
        hist = deepcopy(history)
        for attempt in range(self.max_retries + 1):
            history = deepcopy(hist)
            try:
                for _ in range(self.max_rounds + 1):
                    logging.info(f"{self.tools=}")
                    response = await self.async_client.chat.completions.create(model=self.model_name, messages=history, tools=self.tools, tool_choice="auto", **gen_conf)
                    tk_count += total_token_count_from_response(response)
                    if any([not response.choices, not response.choices[0].message]):
                        raise Exception(f"500 response structure error. Response: {response}")

                    # If no tool calls, extract the final text response
                    if not hasattr(response.choices[0].message, "tool_calls") or not response.choices[0].message.tool_calls:
                        if hasattr(response.choices[0].message, "reasoning_content") and response.choices[0].message.reasoning_content:
                            ans += "<think>" + response.choices[0].message.reasoning_content + "</think>"

                        ans += response.choices[0].message.content
                        if response.choices[0].finish_reason == "length":
                            ans = self._length_stop(ans)

                        return ans, tk_count

                    # Run each tool call and append results to history
                    for tool_call in response.choices[0].message.tool_calls:
                        logging.info(f"Response {tool_call=}")
                        name = tool_call.function.name
                        try:
                            args = json_repair.loads(tool_call.function.arguments)
                            tool_response = await thread_pool_exec(self.toolcall_session.tool_call, name, args)
                            history = self._append_history(history, tool_call, tool_response)
                            ans += self._verbose_tool_use(name, args, tool_response)
                        except Exception as e:
                            logging.exception(msg=f"Wrong JSON argument format in LLM tool call response: {tool_call}")
                            history.append({"role": "tool", "tool_call_id": tool_call.id, "content": f"Tool call error: \n{tool_call}\nException:\n" + str(e)})
                            ans += self._verbose_tool_use(name, {}, str(e))

                # Exceeded max rounds; force a final response without tools
                logging.warning(f"Exceed max rounds: {self.max_rounds}")
                history.append({"role": "user", "content": f"Exceed max rounds: {self.max_rounds}"})
                response, token_count = await self._async_chat(history, gen_conf)
                ans += response
                tk_count += token_count
                return ans, tk_count
            except Exception as e:
                e = await self._exceptions_async(e, attempt)
                if e:
                    return e, tk_count

        assert False, "Shouldn't be here."

    async def async_chat_streamly_with_tools(self, system: str, history: list, gen_conf: dict = {}):
        """Streaming chat with automatic tool calling support.

        Similar to async_chat_with_tools but yields text deltas as they
        arrive, providing real-time output while tools are called.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation configuration.

        Yields:
            Text deltas (including tool call logs) followed by the
            total token count as the final value.
        """
        gen_conf = self._clean_conf(gen_conf)
        tools = self.tools
        if system and history and history[0].get("role") != "system":
            history.insert(0, {"role": "system", "content": system})

        total_tokens = 0
        hist = deepcopy(history)

        for attempt in range(self.max_retries + 1):
            history = deepcopy(hist)
            try:
                for _ in range(self.max_rounds + 1):
                    reasoning_start = False
                    logging.info(f"{tools=}")

                    response = await self.async_client.chat.completions.create(model=self.model_name, messages=history, stream=True, tools=tools, tool_choice="auto", **gen_conf)

                    # Accumulate streamed tool call arguments across chunks
                    final_tool_calls = {}
                    answer = ""

                    async for resp in response:
                        if not hasattr(resp, "choices") or not resp.choices:
                            continue

                        delta = resp.choices[0].delta

                        # Collect tool call chunks (arguments arrive in fragments)
                        if hasattr(delta, "tool_calls") and delta.tool_calls:
                            for tool_call in delta.tool_calls:
                                index = tool_call.index
                                if index not in final_tool_calls:
                                    if not tool_call.function.arguments:
                                        tool_call.function.arguments = ""
                                    final_tool_calls[index] = tool_call
                                else:
                                    final_tool_calls[index].function.arguments += tool_call.function.arguments or ""
                            continue

                        if not hasattr(delta, "content") or delta.content is None:
                            delta.content = ""

                        # Handle reasoning/thinking content blocks
                        if hasattr(delta, "reasoning_content") and delta.reasoning_content:
                            ans = ""
                            if not reasoning_start:
                                reasoning_start = True
                                ans = "<think>"
                            ans += delta.reasoning_content + "</think>"
                            yield ans
                        else:
                            reasoning_start = False
                            answer += delta.content
                            yield delta.content

                        tol = total_token_count_from_response(resp)
                        if not tol:
                            total_tokens += num_tokens_from_string(delta.content)
                        else:
                            total_tokens = tol

                        finish_reason = getattr(resp.choices[0], "finish_reason", "")
                        if finish_reason == "length":
                            yield self._length_stop("")

                    # If we got a text answer (no tool calls), we're done
                    if answer:
                        yield total_tokens
                        return

                    # Run accumulated tool calls and feed results back
                    for tool_call in final_tool_calls.values():
                        name = tool_call.function.name
                        try:
                            args = json_repair.loads(tool_call.function.arguments)
                            yield self._verbose_tool_use(name, args, "Begin to call...")
                            tool_response = await thread_pool_exec(self.toolcall_session.tool_call, name, args)
                            history = self._append_history(history, tool_call, tool_response)
                            yield self._verbose_tool_use(name, args, tool_response)
                        except Exception as e:
                            logging.exception(msg=f"Wrong JSON argument format in LLM tool call response: {tool_call}")
                            history.append({"role": "tool", "tool_call_id": tool_call.id, "content": f"Tool call error: \n{tool_call}\nException:\n" + str(e)})
                            yield self._verbose_tool_use(name, {}, str(e))

                # Exceeded max rounds; force a final streaming response
                logging.warning(f"Exceed max rounds: {self.max_rounds}")
                history.append({"role": "user", "content": f"Exceed max rounds: {self.max_rounds}"})

                response = await self.async_client.chat.completions.create(model=self.model_name, messages=history, stream=True, tools=tools, tool_choice="auto", **gen_conf)

                async for resp in response:
                    if not hasattr(resp, "choices") or not resp.choices:
                        continue
                    delta = resp.choices[0].delta
                    if not hasattr(delta, "content") or delta.content is None:
                        continue
                    tol = total_token_count_from_response(resp)
                    if not tol:
                        total_tokens += num_tokens_from_string(delta.content)
                    else:
                        total_tokens = tol
                    yield delta.content

                yield total_tokens
                return

            except Exception as e:
                e = await self._exceptions_async(e, attempt)
                if e:
                    logging.error(f"async_chat_streamly failed: {e}")
                    yield e
                    yield total_tokens
                    return

        assert False, "Shouldn't be here."

    async def _async_chat(self, history, gen_conf, **kwargs):
        """Internal non-streaming chat implementation.

        Handles special cases for reasoning models (QwQ, Qwen3) that
        require streaming or thinking-mode adjustments.

        Args:
            history: Complete message history.
            gen_conf: Cleaned generation configuration.
            **kwargs: Additional parameters passed to the API.

        Returns:
            A tuple of (response_text, total_tokens).
        """
        logging.info("[HISTORY]" + json.dumps(history, ensure_ascii=False, indent=2))
        # QwQ reasoning models need streaming to produce output
        if self.model_name.lower().find("qwq") >= 0:
            logging.info(f"[INFO] {self.model_name} detected as reasoning model, using async_chat_streamly")

            final_ans = ""
            tol_token = 0
            async for delta, tol in self._async_chat_streamly(history, gen_conf, with_reasoning=False, **kwargs):
                # Filter out thinking content for non-streaming response
                if delta.startswith("<think>") or delta.endswith("</think>"):
                    continue
                final_ans += delta
                tol_token = tol

            if len(final_ans.strip()) == 0:
                final_ans = "**ERROR**: Empty response from reasoning model"

            return final_ans.strip(), tol_token

        # Qwen3 models need thinking disabled for non-streaming chat
        if self.model_name.lower().find("qwen3") >= 0:
            kwargs["extra_body"] = {"enable_thinking": False}

        response = await self.async_client.chat.completions.create(model=self.model_name, messages=history, **gen_conf, **kwargs)

        if not response.choices or not response.choices[0].message or not response.choices[0].message.content:
            return "", 0
        ans = response.choices[0].message.content.strip()
        if response.choices[0].finish_reason == "length":
            ans = self._length_stop(ans)
        return ans, total_token_count_from_response(response)

    async def async_chat(self, system, history, gen_conf={}, **kwargs):
        """Non-streaming chat completion with retry logic.

        Args:
            system: System prompt text. Prepended to history if not present.
            history: Conversation history.
            gen_conf: Generation configuration (will be sanitized).
            **kwargs: Additional parameters passed to internal chat.

        Returns:
            A tuple of (response_text, total_tokens).
        """
        if system and history and history[0].get("role") != "system":
            history.insert(0, {"role": "system", "content": system})
        gen_conf = self._clean_conf(gen_conf)

        for attempt in range(self.max_retries + 1):
            try:
                return await self._async_chat(history, gen_conf, **kwargs)
            except Exception as e:
                e = await self._exceptions_async(e, attempt)
                if e:
                    return e, 0
        assert False, "Shouldn't be here."


class GoogleChat(Base):
    """Google Cloud Vertex AI chat provider.

    Supports both Claude (via Anthropic Vertex) and Gemini (via google-genai
    SDK) models through Google Cloud's Vertex AI service. Uses service
    account credentials for authentication.
    """

    _FACTORY_NAME = "Google Cloud"

    def __init__(self, key, model_name, base_url=None, **kwargs):
        """Initialize the Google Cloud chat client.

        Parses service account credentials and routes to either
        AnthropicVertex (for Claude models) or google-genai Client
        (for Gemini models) based on the model name.

        Args:
            key: JSON string containing google_service_account_key
                (base64-encoded), google_project_id, and google_region.
            model_name: Model name (e.g. "claude-3-opus" or "gemini-2.0-flash").
            base_url: Unused (passed to Base for interface consistency).
            **kwargs: Additional configuration passed to Base.
        """
        super().__init__(key, model_name, base_url=base_url, **kwargs)

        import base64

        from google.oauth2 import service_account

        key = json.loads(key)
        access_token = json.loads(base64.b64decode(key.get("google_service_account_key", "")))
        project_id = key.get("google_project_id", "")
        region = key.get("google_region", "")

        scopes = ["https://www.googleapis.com/auth/cloud-platform"]
        self.model_name = model_name

        # Route to the appropriate client based on model type
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

    def _clean_conf(self, gen_conf):
        """Sanitize generation config for Google Cloud models.

        Handles Claude and Gemini differently: Claude strips max_tokens,
        Gemini renames max_tokens to max_output_tokens and removes
        unsupported parameters.

        Args:
            gen_conf: Raw generation configuration.

        Returns:
            Provider-appropriate configuration dictionary.
        """
        if "claude" in self.model_name:
            if "max_tokens" in gen_conf:
                del gen_conf["max_tokens"]
        else:
            # Gemini uses max_output_tokens instead of max_tokens
            if "max_tokens" in gen_conf:
                gen_conf["max_output_tokens"] = gen_conf["max_tokens"]
                del gen_conf["max_tokens"]
            # Only keep Gemini-supported parameters
            for k in list(gen_conf.keys()):
                if k not in ["temperature", "top_p", "max_output_tokens"]:
                    del gen_conf[k]
        return gen_conf

    def _chat(self, history, gen_conf={}, **kwargs):
        """Synchronous chat implementation for Google Cloud models.

        Routes to either Anthropic Messages API or google-genai SDK
        based on model type. For Gemini, uses ThinkingConfig to control
        reasoning behavior.

        Args:
            history: Complete message history.
            gen_conf: Generation configuration.
            **kwargs: Additional parameters.

        Returns:
            A tuple of (response_text, total_tokens).
        """
        system = history[0]["content"] if history and history[0]["role"] == "system" else ""

        # Claude path: use Anthropic Messages API
        if "claude" in self.model_name:
            gen_conf = self._clean_conf(gen_conf)
            response = self.client.messages.create(
                model=self.model_name,
                messages=[h for h in history if h["role"] != "system"],
                system=system,
                stream=False,
                **gen_conf,
            ).json()
            ans = response["content"][0]["text"]
            if response["stop_reason"] == "max_tokens":
                ans += "...\nFor the content length reason, it stopped, continue?" if is_english([ans]) else "......\n\u7531\u4e8e\u957f\u5ea6\u7684\u539f\u56e0\uff0c\u56de\u7b54\u88ab\u622a\u65ad\u4e86\uff0c\u8981\u7ee7\u7eed\u5417\uff1f"
            return (
                ans,
                response["usage"]["input_tokens"] + response["usage"]["output_tokens"],
            )

        # Gemini path: use google-genai SDK with ThinkingConfig
        # Set default thinking_budget=0 if not specified
        if "thinking_budget" not in gen_conf:
            gen_conf["thinking_budget"] = 0

        thinking_budget = gen_conf.pop("thinking_budget", 0)
        gen_conf = self._clean_conf(gen_conf)

        # Build GenerateContentConfig with optional thinking support
        try:
            from google.genai.types import Content, GenerateContentConfig, Part, ThinkingConfig
        except ImportError as e:
            logging.error(f"[GoogleChat] Failed to import google-genai: {e}. Please install: pip install google-genai>=1.41.0")
            raise

        config_dict = {}
        if system:
            config_dict["system_instruction"] = system
        if "temperature" in gen_conf:
            config_dict["temperature"] = gen_conf["temperature"]
        if "top_p" in gen_conf:
            config_dict["top_p"] = gen_conf["top_p"]
        if "max_output_tokens" in gen_conf:
            config_dict["max_output_tokens"] = gen_conf["max_output_tokens"]

        # Add ThinkingConfig to control reasoning behavior
        config_dict["thinking_config"] = ThinkingConfig(thinking_budget=thinking_budget)

        config = GenerateContentConfig(**config_dict)

        # Convert history to google-genai Content format
        contents = []
        for item in history:
            if item["role"] == "system":
                continue
            # google-genai uses 'model' instead of 'assistant'
            role = "model" if item["role"] == "assistant" else item["role"]
            content = Content(
                role=role,
                parts=[Part(text=item["content"])],
            )
            contents.append(content)

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=contents,
            config=config,
        )

        ans = response.text
        # Get token count from response metadata
        try:
            total_tokens = response.usage_metadata.total_token_count
        except Exception:
            total_tokens = 0

        return ans, total_tokens

    def chat_streamly(self, system, history, gen_conf={}, **kwargs):
        """Streaming chat for Google Cloud models.

        Routes to either Anthropic streaming or Gemini streaming
        based on the model type.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation configuration.
            **kwargs: Additional parameters.

        Yields:
            Text deltas followed by the total token count.
        """
        # Claude streaming path
        if "claude" in self.model_name:
            if "max_tokens" in gen_conf:
                del gen_conf["max_tokens"]
            ans = ""
            total_tokens = 0
            try:
                response = self.client.messages.create(
                    model=self.model_name,
                    messages=history,
                    system=system,
                    stream=True,
                    **gen_conf,
                )
                for res in response.iter_lines():
                    res = res.decode("utf-8")
                    # Parse SSE content_block_delta events
                    if "content_block_delta" in res and "data" in res:
                        text = json.loads(res[6:])["delta"]["text"]
                        ans = text
                        total_tokens += num_tokens_from_string(text)
            except Exception as e:
                yield ans + "\n**ERROR**: " + str(e)

            yield total_tokens
        else:
            # Gemini streaming path with ThinkingConfig
            ans = ""
            total_tokens = 0

            # Set default thinking_budget=0 if not specified
            if "thinking_budget" not in gen_conf:
                gen_conf["thinking_budget"] = 0

            thinking_budget = gen_conf.pop("thinking_budget", 0)
            gen_conf = self._clean_conf(gen_conf)

            # Build GenerateContentConfig
            try:
                from google.genai.types import Content, GenerateContentConfig, Part, ThinkingConfig
            except ImportError as e:
                logging.error(f"[GoogleChat] Failed to import google-genai: {e}. Please install: pip install google-genai>=1.41.0")
                raise

            config_dict = {}
            if system:
                config_dict["system_instruction"] = system
            if "temperature" in gen_conf:
                config_dict["temperature"] = gen_conf["temperature"]
            if "top_p" in gen_conf:
                config_dict["top_p"] = gen_conf["top_p"]
            if "max_output_tokens" in gen_conf:
                config_dict["max_output_tokens"] = gen_conf["max_output_tokens"]

            # Add ThinkingConfig
            config_dict["thinking_config"] = ThinkingConfig(thinking_budget=thinking_budget)

            config = GenerateContentConfig(**config_dict)

            # Convert history to google-genai Content format
            contents = []
            for item in history:
                # google-genai uses 'model' instead of 'assistant'
                role = "model" if item["role"] == "assistant" else item["role"]
                content = Content(
                    role=role,
                    parts=[Part(text=item["content"])],
                )
                contents.append(content)

            try:
                for chunk in self.client.models.generate_content_stream(
                    model=self.model_name,
                    contents=contents,
                    config=config,
                ):
                    text = chunk.text
                    ans = text
                    total_tokens += num_tokens_from_string(text)
                    yield ans

            except Exception as e:
                yield ans + "\n**ERROR**: " + str(e)

            yield total_tokens


class LiteLLMBase(ABC):
    """Abstract base class for LiteLLM-based chat model implementations.

    Uses the LiteLLM library as a unified proxy layer to support multiple
    LLM providers (Ollama, OpenAI, Azure-OpenAI, Gemini) through a single
    interface. Handles provider-specific URL prefixing, authentication,
    and parameter mapping.

    Mirrors the same retry, error classification, and tool calling
    infrastructure as Base, but routes all API calls through litellm
    instead of the OpenAI SDK directly.
    """

    _FACTORY_NAME = [
        "Ollama",
        "OpenAI",
        "Azure-OpenAI",
        "Gemini",
    ]

    def __init__(self, key, model_name, base_url=None, **kwargs):
        """Initialize the LiteLLM-based chat model.

        Configures the model name with provider-specific prefixes (e.g.
        "ollama/" for Ollama models), sets up authentication, and handles
        Azure-specific credential parsing.

        Args:
            key: API key for the provider. For Azure, this is a JSON
                string with api_key and api_version fields.
            model_name: Raw model identifier (provider prefix added automatically).
            base_url: Provider API base URL. Falls back to factory defaults.
            **kwargs: Additional configuration including:
                - provider: SupportedLiteLLMProvider enum value.
                - max_retries: Maximum retry attempts.
                - retry_interval: Base delay for backoff.
                - max_rounds: Maximum tool calling rounds.
        """
        self.timeout = int(os.environ.get("LLM_TIMEOUT_SECONDS", 600))
        self.provider = kwargs.get("provider", "")
        # Add provider-specific prefix to model name (e.g. "ollama/llama3")
        self.prefix = LITELLM_PROVIDER_PREFIX.get(self.provider, "")
        self.model_name = f"{self.prefix}{model_name}"
        self.api_key = key
        self.base_url = (base_url or FACTORY_DEFAULT_BASE_URL.get(self.provider, "")).rstrip("/")
        # Configure retry parameters
        self.max_retries = kwargs.get("max_retries", int(os.environ.get("LLM_MAX_RETRIES", 5)))
        self.base_delay = kwargs.get("retry_interval", float(os.environ.get("LLM_BASE_DELAY", 2.0)))
        self.max_rounds = kwargs.get("max_rounds", 5)
        self.is_tools = False
        self.tools = []
        self.toolcall_sessions = {}

        # Azure-OpenAI requires special credential extraction from JSON key
        if self.provider == SupportedLiteLLMProvider.Azure_OpenAI:
            self.api_key = json.loads(key).get("api_key", "")
            self.api_version = json.loads(key).get("api_version", "2024-02-01")

    def _get_delay(self):
        """Calculate a randomized retry delay.

        Returns:
            Delay in seconds, randomized between 10x and 150x the base delay.
        """
        return self.base_delay * random.uniform(10, 150)

    def _classify_error(self, error):
        """Classify an exception into a standardized LLMErrorCode.

        Args:
            error: The exception to classify.

        Returns:
            An LLMErrorCode enum value representing the error category.
        """
        error_str = str(error).lower()

        keywords_mapping = [
            (["quota", "capacity", "credit", "billing", "balance", "\u6b20\u8d39"], LLMErrorCode.ERROR_QUOTA),
            (["rate limit", "429", "tpm limit", "too many requests", "requests per minute"], LLMErrorCode.ERROR_RATE_LIMIT),
            (["auth", "key", "apikey", "401", "forbidden", "permission"], LLMErrorCode.ERROR_AUTHENTICATION),
            (["invalid", "bad request", "400", "format", "malformed", "parameter"], LLMErrorCode.ERROR_INVALID_REQUEST),
            (["server", "503", "502", "504", "500", "unavailable"], LLMErrorCode.ERROR_SERVER),
            (["timeout", "timed out"], LLMErrorCode.ERROR_TIMEOUT),
            (["connect", "network", "unreachable", "dns"], LLMErrorCode.ERROR_CONNECTION),
            (["filter", "content", "policy", "blocked", "safety", "inappropriate"], LLMErrorCode.ERROR_CONTENT_FILTER),
            (["model", "not found", "does not exist", "not available"], LLMErrorCode.ERROR_MODEL),
            (["max rounds"], LLMErrorCode.ERROR_MODEL),
        ]
        for words, code in keywords_mapping:
            if re.search("({})".format("|".join(words)), error_str):
                return code

        return LLMErrorCode.ERROR_GENERIC

    def _clean_conf(self, gen_conf):
        """Sanitize generation configuration for LiteLLM compatibility.

        Handles model-specific quirks (e.g. Kimi-K2.5 thinking mode)
        and removes the max_tokens parameter.

        Args:
            gen_conf: Raw generation configuration.

        Returns:
            Deep-copied and sanitized configuration dictionary.
        """
        gen_conf = deepcopy(gen_conf) if gen_conf else {}

        # Kimi-K2.5 requires special thinking mode configuration
        if "kimi-k2.5" in self.model_name.lower():
            reasoning = gen_conf.pop("reasoning", None) # will never get one here, handle this later
            thinking = {"type": "enabled"} # enable thinking by default
            if reasoning is not None:
                thinking = {"type": "enabled"} if reasoning else {"type": "disabled"}
            elif not isinstance(thinking, dict) or thinking.get("type") not in {"enabled", "disabled"}:
                thinking = {"type": "disabled"}
            gen_conf["thinking"] = thinking

            # Set fixed parameters required by Kimi-K2.5
            thinking_enabled = thinking.get("type") == "enabled"
            gen_conf["temperature"] = 1.0 if thinking_enabled else 0.6
            gen_conf["top_p"] = 0.95
            gen_conf["n"] = 1
            gen_conf["presence_penalty"] = 0.0
            gen_conf["frequency_penalty"] = 0.0

        gen_conf.pop("max_tokens", None)
        return gen_conf

    async def async_chat(self, system, history, gen_conf, **kwargs):
        """Non-streaming chat via LiteLLM with retry logic.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation configuration.
            **kwargs: Additional parameters passed to litellm.acompletion.

        Returns:
            A tuple of (response_text, total_tokens).
        """
        hist = list(history) if history else []
        if system:
            if not hist or hist[0].get("role") != "system":
                hist.insert(0, {"role": "system", "content": system})

        logging.info("[HISTORY]" + json.dumps(hist, ensure_ascii=False, indent=2))
        # Disable thinking for Qwen3 in non-streaming mode
        if self.model_name.lower().find("qwen3") >= 0:
            kwargs["extra_body"] = {"enable_thinking": False}

        completion_args = self._construct_completion_args(history=hist, stream=False, tools=False, **{**gen_conf, **kwargs})

        for attempt in range(self.max_retries + 1):
            try:
                response = await litellm.acompletion(
                    **completion_args,
                    drop_params=True,
                    timeout=self.timeout,
                )

                if any([not response.choices, not response.choices[0].message, not response.choices[0].message.content]):
                    return "", 0
                ans = response.choices[0].message.content.strip()
                if response.choices[0].finish_reason == "length":
                    ans = self._length_stop(ans)

                return ans, total_token_count_from_response(response)
            except Exception as e:
                e = await self._exceptions_async(e, attempt)
                if e:
                    return e, 0

        assert False, "Shouldn't be here."

    async def async_chat_streamly(self, system, history, gen_conf, **kwargs):
        """Streaming chat via LiteLLM with retry logic.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation configuration.
            **kwargs: Additional parameters including:
                - with_reasoning: Whether to include reasoning content.
                - stop: Optional stop sequences.

        Yields:
            Text deltas followed by the total token count.
        """
        if system and history and history[0].get("role") != "system":
            history.insert(0, {"role": "system", "content": system})
        logging.info("[HISTORY STREAMLY]" + json.dumps(history, ensure_ascii=False, indent=4))
        gen_conf = self._clean_conf(gen_conf)
        reasoning_start = False
        total_tokens = 0

        completion_args = self._construct_completion_args(history=history, stream=True, tools=False, **gen_conf)
        stop = kwargs.get("stop")
        if stop:
            completion_args["stop"] = stop

        for attempt in range(self.max_retries + 1):
            try:
                stream = await litellm.acompletion(
                    **completion_args,
                    drop_params=True,
                    timeout=self.timeout,
                )

                async for resp in stream:
                    if not hasattr(resp, "choices") or not resp.choices:
                        continue

                    delta = resp.choices[0].delta
                    if not hasattr(delta, "content") or delta.content is None:
                        delta.content = ""

                    # Extract reasoning/thinking content from supported models
                    if kwargs.get("with_reasoning", True) and hasattr(delta, "reasoning_content") and delta.reasoning_content:
                        ans = ""
                        if not reasoning_start:
                            reasoning_start = True
                            ans = "<think>"
                        ans += delta.reasoning_content + "</think>"
                    else:
                        reasoning_start = False
                        ans = delta.content

                    tol = total_token_count_from_response(resp)
                    if not tol:
                        tol = num_tokens_from_string(delta.content)
                    total_tokens += tol

                    finish_reason = resp.choices[0].finish_reason if hasattr(resp.choices[0], "finish_reason") else ""
                    if finish_reason == "length":
                        if is_chinese(ans):
                            ans += LENGTH_NOTIFICATION_CN
                        else:
                            ans += LENGTH_NOTIFICATION_EN

                    yield ans
                yield total_tokens
                return
            except Exception as e:
                e = await self._exceptions_async(e, attempt)
                if e:
                    yield e
                    yield total_tokens
                    return

    def _length_stop(self, ans):
        """Append a language-appropriate truncation notification.

        Args:
            ans: The response text to append the notification to.

        Returns:
            The response text with a truncation notice.
        """
        if is_chinese([ans]):
            return ans + LENGTH_NOTIFICATION_CN
        return ans + LENGTH_NOTIFICATION_EN

    @property
    def _retryable_errors(self) -> set[str]:
        """Set of error codes that should trigger automatic retry.

        Returns:
            Set containing rate limit and server error codes.
        """
        return {
            LLMErrorCode.ERROR_RATE_LIMIT,
            LLMErrorCode.ERROR_SERVER,
        }

    def _should_retry(self, error_code: str) -> bool:
        """Determine whether an error code warrants a retry.

        Args:
            error_code: The classified LLMErrorCode value.

        Returns:
            True if the error is transient and should be retried.
        """
        return error_code in self._retryable_errors

    async def _exceptions_async(self, e, attempt):
        """Handle asynchronous exceptions with retry logic.

        Args:
            e: The exception that occurred.
            attempt: Current attempt number (0-based).

        Returns:
            None to indicate retry, or an error message string to give up.
        """
        logging.exception("LiteLLMBase async completion")
        error_code = self._classify_error(e)
        if attempt == self.max_retries:
            error_code = LLMErrorCode.ERROR_MAX_RETRIES

        if self._should_retry(error_code):
            delay = self._get_delay()
            logging.warning(f"Error: {error_code}. Retrying in {delay:.2f} seconds... (Attempt {attempt + 1}/{self.max_retries})")
            await asyncio.sleep(delay)
            return None
        msg = f"{ERROR_PREFIX}: {error_code} - {str(e)}"
        logging.error(f"async_chat_streamly giving up: {msg}")
        return msg

    def _verbose_tool_use(self, name, args, res):
        """Format a tool call and its result as an XML-tagged JSON string.

        Args:
            name: The tool/function name.
            args: Arguments passed to the tool.
            res: The tool's return value.

        Returns:
            XML-tagged JSON string with tool call details.
        """
        return "<tool_call>" + json.dumps({"name": name, "args": args, "result": res}, ensure_ascii=False, indent=2) + "</tool_call>"

    def _append_history(self, hist, tool_call, tool_res):
        """Append a tool call and its response to the conversation history.

        Args:
            hist: The conversation history list to extend.
            tool_call: The tool call object from the API response.
            tool_res: The result returned by the tool.

        Returns:
            The updated history list.
        """
        hist.append(
            {
                "role": "assistant",
                "tool_calls": [
                    {
                        "index": tool_call.index,
                        "id": tool_call.id,
                        "function": {
                            "name": tool_call.function.name,
                            "arguments": tool_call.function.arguments,
                        },
                        "type": "function",
                    },
                ],
            }
        )
        try:
            if isinstance(tool_res, dict):
                tool_res = json.dumps(tool_res, ensure_ascii=False)
        finally:
            hist.append({"role": "tool", "tool_call_id": tool_call.id, "content": str(tool_res)})
        return hist

    def bind_tools(self, toolcall_session, tools):
        """Register tools and a tool session for function calling.

        Args:
            toolcall_session: A session object with a tool_call method.
            tools: List of tool definitions in OpenAI function calling format.
        """
        if not (toolcall_session and tools):
            return
        self.is_tools = True
        self.toolcall_session = toolcall_session
        self.tools = tools

    async def async_chat_with_tools(self, system: str, history: list, gen_conf: dict = {}):
        """Non-streaming chat with tool calling via LiteLLM.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation configuration.

        Returns:
            A tuple of (full_response_text, total_token_count).
        """
        gen_conf = self._clean_conf(gen_conf)
        if system and history and history[0].get("role") != "system":
            history.insert(0, {"role": "system", "content": system})

        ans = ""
        tk_count = 0
        hist = deepcopy(history)
        for attempt in range(self.max_retries + 1):
            history = deepcopy(hist)
            try:
                for _ in range(self.max_rounds + 1):
                    logging.info(f"{self.tools=}")

                    completion_args = self._construct_completion_args(history=history, stream=False, tools=True, **gen_conf)
                    response = await litellm.acompletion(
                        **completion_args,
                        drop_params=True,
                        timeout=self.timeout,
                    )

                    tk_count += total_token_count_from_response(response)

                    if not hasattr(response, "choices") or not response.choices or not response.choices[0].message:
                        raise Exception(f"500 response structure error. Response: {response}")

                    message = response.choices[0].message

                    # If no tool calls, extract the final text response
                    if not hasattr(message, "tool_calls") or not message.tool_calls:
                        if hasattr(message, "reasoning_content") and message.reasoning_content:
                            ans += f"<think>{message.reasoning_content}</think>"
                        ans += message.content or ""
                        if response.choices[0].finish_reason == "length":
                            ans = self._length_stop(ans)
                        return ans, tk_count

                    # Run each tool call and append results to history
                    for tool_call in message.tool_calls:
                        logging.info(f"Response {tool_call=}")
                        name = tool_call.function.name
                        try:
                            args = json_repair.loads(tool_call.function.arguments)
                            tool_response = await thread_pool_exec(self.toolcall_session.tool_call, name, args)
                            history = self._append_history(history, tool_call, tool_response)
                            ans += self._verbose_tool_use(name, args, tool_response)
                        except Exception as e:
                            logging.exception(msg=f"Wrong JSON argument format in LLM tool call response: {tool_call}")
                            history.append({"role": "tool", "tool_call_id": tool_call.id, "content": f"Tool call error: \n{tool_call}\nException:\n" + str(e)})
                            ans += self._verbose_tool_use(name, {}, str(e))

                # Exceeded max rounds; force a final response
                logging.warning(f"Exceed max rounds: {self.max_rounds}")
                history.append({"role": "user", "content": f"Exceed max rounds: {self.max_rounds}"})

                response, token_count = await self.async_chat("", history, gen_conf)
                ans += response
                tk_count += token_count
                return ans, tk_count

            except Exception as e:
                e = await self._exceptions_async(e, attempt)
                if e:
                    return e, tk_count

        assert False, "Shouldn't be here."

    async def async_chat_streamly_with_tools(self, system: str, history: list, gen_conf: dict = {}):
        """Streaming chat with tool calling via LiteLLM.

        Args:
            system: System prompt text.
            history: Conversation history.
            gen_conf: Generation configuration.

        Yields:
            Text deltas (including tool call logs) followed by the
            total token count.
        """
        gen_conf = self._clean_conf(gen_conf)
        tools = self.tools
        if system and history and history[0].get("role") != "system":
            history.insert(0, {"role": "system", "content": system})

        total_tokens = 0
        hist = deepcopy(history)

        for attempt in range(self.max_retries + 1):
            history = deepcopy(hist)
            try:
                for _ in range(self.max_rounds + 1):
                    reasoning_start = False
                    logging.info(f"{tools=}")

                    completion_args = self._construct_completion_args(history=history, stream=True, tools=True, **gen_conf)
                    response = await litellm.acompletion(
                        **completion_args,
                        drop_params=True,
                        timeout=self.timeout,
                    )

                    # Accumulate streamed tool call arguments
                    final_tool_calls = {}
                    answer = ""

                    async for resp in response:
                        if not hasattr(resp, "choices") or not resp.choices:
                            continue

                        delta = resp.choices[0].delta

                        # Collect tool call chunks
                        if hasattr(delta, "tool_calls") and delta.tool_calls:
                            for tool_call in delta.tool_calls:
                                index = tool_call.index
                                if index not in final_tool_calls:
                                    if not tool_call.function.arguments:
                                        tool_call.function.arguments = ""
                                    final_tool_calls[index] = tool_call
                                else:
                                    final_tool_calls[index].function.arguments += tool_call.function.arguments or ""
                            continue

                        if not hasattr(delta, "content") or delta.content is None:
                            delta.content = ""

                        # Handle reasoning/thinking content
                        if hasattr(delta, "reasoning_content") and delta.reasoning_content:
                            ans = ""
                            if not reasoning_start:
                                reasoning_start = True
                                ans = "<think>"
                            ans += delta.reasoning_content + "</think>"
                            yield ans
                        else:
                            reasoning_start = False
                            answer += delta.content
                            yield delta.content

                        tol = total_token_count_from_response(resp)
                        if not tol:
                            total_tokens += num_tokens_from_string(delta.content)
                        else:
                            total_tokens = tol

                        finish_reason = getattr(resp.choices[0], "finish_reason", "")
                        if finish_reason == "length":
                            yield self._length_stop("")

                    # If we got a text answer, we're done
                    if answer:
                        yield total_tokens
                        return

                    # Run accumulated tool calls
                    for tool_call in final_tool_calls.values():
                        name = tool_call.function.name
                        try:
                            args = json_repair.loads(tool_call.function.arguments)
                            yield self._verbose_tool_use(name, args, "Begin to call...")
                            tool_response = await thread_pool_exec(self.toolcall_session.tool_call, name, args)
                            history = self._append_history(history, tool_call, tool_response)
                            yield self._verbose_tool_use(name, args, tool_response)
                        except Exception as e:
                            logging.exception(msg=f"Wrong JSON argument format in LLM tool call response: {tool_call}")
                            history.append({"role": "tool", "tool_call_id": tool_call.id, "content": f"Tool call error: \n{tool_call}\nException:\n" + str(e)})
                            yield self._verbose_tool_use(name, {}, str(e))

                # Exceeded max rounds; force a final streaming response
                logging.warning(f"Exceed max rounds: {self.max_rounds}")
                history.append({"role": "user", "content": f"Exceed max rounds: {self.max_rounds}"})

                completion_args = self._construct_completion_args(history=history, stream=True, tools=True, **gen_conf)
                response = await litellm.acompletion(
                    **completion_args,
                    drop_params=True,
                    timeout=self.timeout,
                )

                async for resp in response:
                    if not hasattr(resp, "choices") or not resp.choices:
                        continue
                    delta = resp.choices[0].delta
                    if not hasattr(delta, "content") or delta.content is None:
                        continue
                    tol = total_token_count_from_response(resp)
                    if not tol:
                        total_tokens += num_tokens_from_string(delta.content)
                    else:
                        total_tokens = tol
                    yield delta.content

                yield total_tokens
                return

            except Exception as e:
                e = await self._exceptions_async(e, attempt)
                if e:
                    yield e
                    yield total_tokens
                    return

        assert False, "Shouldn't be here."

    def _construct_completion_args(self, history, stream: bool, tools: bool, **kwargs):
        """Build the complete argument dictionary for litellm.acompletion.

        Handles provider-specific configuration including API base URLs,
        Azure credentials, Ollama auth headers, and tool definitions.

        Args:
            history: Message history to send.
            stream: Whether to enable streaming.
            tools: Whether to include tool definitions.
            **kwargs: Additional parameters merged into the completion args.

        Returns:
            Complete kwargs dictionary ready for litellm.acompletion.
        """
        completion_args = {
            "model": self.model_name,
            "messages": history,
            "api_key": self.api_key,
            "num_retries": self.max_retries,
            **kwargs,
        }
        if stream:
            completion_args.update(
                {
                    "stream": stream,
                }
            )
        if tools and self.tools:
            completion_args.update(
                {
                    "tools": self.tools,
                    "tool_choice": "auto",
                }
            )
        # Set provider-specific base URL
        if self.provider in FACTORY_DEFAULT_BASE_URL:
            completion_args.update({"api_base": self.base_url})
        elif self.provider == SupportedLiteLLMProvider.Azure_OpenAI:
            # Azure needs special credential handling
            completion_args.pop("api_key", None)
            completion_args.pop("api_base", None)
            completion_args.update(
                {
                    "api_key": self.api_key,
                    "api_base": self.base_url,
                    "api_version": self.api_version,
                }
            )

        # Ollama deployments commonly sit behind a reverse proxy that enforces
        # Bearer auth. Ensure the Authorization header is set when an API key
        # is provided, while respecting any user-supplied headers. #11350
        extra_headers = deepcopy(completion_args.get("extra_headers") or {})
        if self.provider == SupportedLiteLLMProvider.Ollama and self.api_key and "Authorization" not in extra_headers:
            extra_headers["Authorization"] = f"Bearer {self.api_key}"
        if extra_headers:
            completion_args["extra_headers"] = extra_headers
        return completion_args

class RAGconChat(Base):
    """RAGcon chat provider - routes through LiteLLM proxy.

    All model types are handled through a unified LiteLLM endpoint
    on the RAGcon gateway server. Inherits all chat, streaming, and
    tool calling capabilities from Base.

    Default Base URL: https://connect.ragcon.com/v1
    """

    _FACTORY_NAME = "RAGcon"

    def __init__(self, key, model_name, base_url=None, **kwargs):
        """Initialize the RAGcon chat client.

        Args:
            key: RAGcon API key for authentication.
            model_name: Model identifier routed through LiteLLM.
            base_url: RAGcon proxy URL. Falls back to default if not provided.
            **kwargs: Additional configuration passed to Base.
        """
        if not base_url:
            base_url = "https://connect.ragcon.com/v1"

        super().__init__(key, model_name, base_url, **kwargs)
