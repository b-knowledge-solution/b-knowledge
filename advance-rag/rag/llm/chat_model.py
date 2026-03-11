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
    FUNCTION_CALL = "function_call"
    REACT = "react"


ERROR_PREFIX = "**ERROR**"
LENGTH_NOTIFICATION_CN = "······\n由于大模型的上下文窗口大小限制，回答已经被大模型截断。"
LENGTH_NOTIFICATION_EN = "...\nThe answer is truncated by your chosen LLM due to its limitation on context length."


class Base(ABC):
    def __init__(self, key, model_name, base_url, **kwargs):
        timeout = int(os.environ.get("LLM_TIMEOUT_SECONDS", 600))
        self.client = OpenAI(api_key=key, base_url=base_url, timeout=timeout)
        self.async_client = AsyncOpenAI(api_key=key, base_url=base_url, timeout=timeout)
        self.model_name = model_name
        # Configure retry parameters
        self.max_retries = kwargs.get("max_retries", int(os.environ.get("LLM_MAX_RETRIES", 5)))
        self.base_delay = kwargs.get("retry_interval", float(os.environ.get("LLM_BASE_DELAY", 2.0)))
        self.max_rounds = kwargs.get("max_rounds", 5)
        self.is_tools = False
        self.tools = []
        self.toolcall_sessions = {}

    def _get_delay(self):
        return self.base_delay * random.uniform(10, 150)

    def _classify_error(self, error):
        error_str = str(error).lower()

        keywords_mapping = [
            (["quota", "capacity", "credit", "billing", "balance", "欠费"], LLMErrorCode.ERROR_QUOTA),
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
        model_name_lower = (self.model_name or "").lower()
        # gpt-5 and gpt-5.1 endpoints have inconsistent parameter support, clear custom generation params to prevent unexpected issues
        if "gpt-5" in model_name_lower:
            gen_conf = {}
            return gen_conf

        if "max_tokens" in gen_conf:
            del gen_conf["max_tokens"]

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

            finish_reason = resp.choices[0].finish_reason if hasattr(resp.choices[0], "finish_reason") else ""
            if finish_reason == "length":
                if is_chinese(ans):
                    ans += LENGTH_NOTIFICATION_CN
                else:
                    ans += LENGTH_NOTIFICATION_EN
            yield ans, tol

    async def async_chat_streamly(self, system, history, gen_conf: dict = {}, **kwargs):
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
        if is_chinese([ans]):
            return ans + LENGTH_NOTIFICATION_CN
        return ans + LENGTH_NOTIFICATION_EN

    @property
    def _retryable_errors(self) -> set[str]:
        return {
            LLMErrorCode.ERROR_RATE_LIMIT,
            LLMErrorCode.ERROR_SERVER,
        }

    def _should_retry(self, error_code: str) -> bool:
        return error_code in self._retryable_errors

    def _exceptions(self, e, attempt) -> str | None:
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
        return "<tool_call>" + json.dumps({"name": name, "args": args, "result": res}, ensure_ascii=False, indent=2) + "</tool_call>"

    def _append_history(self, hist, tool_call, tool_res):
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
        if not (toolcall_session and tools):
            return
        self.is_tools = True
        self.toolcall_session = toolcall_session
        self.tools = tools

    async def async_chat_with_tools(self, system: str, history: list, gen_conf: dict = {}):
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
                    response = await self.async_client.chat.completions.create(model=self.model_name, messages=history, tools=self.tools, tool_choice="auto", **gen_conf)
                    tk_count += total_token_count_from_response(response)
                    if any([not response.choices, not response.choices[0].message]):
                        raise Exception(f"500 response structure error. Response: {response}")

                    if not hasattr(response.choices[0].message, "tool_calls") or not response.choices[0].message.tool_calls:
                        if hasattr(response.choices[0].message, "reasoning_content") and response.choices[0].message.reasoning_content:
                            ans += "<think>" + response.choices[0].message.reasoning_content + "</think>"

                        ans += response.choices[0].message.content
                        if response.choices[0].finish_reason == "length":
                            ans = self._length_stop(ans)

                        return ans, tk_count

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

                    final_tool_calls = {}
                    answer = ""

                    async for resp in response:
                        if not hasattr(resp, "choices") or not resp.choices:
                            continue

                        delta = resp.choices[0].delta

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

                    if answer:
                        yield total_tokens
                        return

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
        logging.info("[HISTORY]" + json.dumps(history, ensure_ascii=False, indent=2))
        if self.model_name.lower().find("qwq") >= 0:
            logging.info(f"[INFO] {self.model_name} detected as reasoning model, using async_chat_streamly")

            final_ans = ""
            tol_token = 0
            async for delta, tol in self._async_chat_streamly(history, gen_conf, with_reasoning=False, **kwargs):
                if delta.startswith("<think>") or delta.endswith("</think>"):
                    continue
                final_ans += delta
                tol_token = tol

            if len(final_ans.strip()) == 0:
                final_ans = "**ERROR**: Empty response from reasoning model"

            return final_ans.strip(), tol_token

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
    _FACTORY_NAME = "Google Cloud"

    def __init__(self, key, model_name, base_url=None, **kwargs):
        super().__init__(key, model_name, base_url=base_url, **kwargs)

        import base64

        from google.oauth2 import service_account

        key = json.loads(key)
        access_token = json.loads(base64.b64decode(key.get("google_service_account_key", "")))
        project_id = key.get("google_project_id", "")
        region = key.get("google_region", "")

        scopes = ["https://www.googleapis.com/auth/cloud-platform"]
        self.model_name = model_name

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
        if "claude" in self.model_name:
            if "max_tokens" in gen_conf:
                del gen_conf["max_tokens"]
        else:
            if "max_tokens" in gen_conf:
                gen_conf["max_output_tokens"] = gen_conf["max_tokens"]
                del gen_conf["max_tokens"]
            for k in list(gen_conf.keys()):
                if k not in ["temperature", "top_p", "max_output_tokens"]:
                    del gen_conf[k]
        return gen_conf

    def _chat(self, history, gen_conf={}, **kwargs):
        system = history[0]["content"] if history and history[0]["role"] == "system" else ""

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
                ans += "...\nFor the content length reason, it stopped, continue?" if is_english([ans]) else "······\n由于长度的原因，回答被截断了，要继续吗？"
            return (
                ans,
                response["usage"]["input_tokens"] + response["usage"]["output_tokens"],
            )

        # Gemini models with google-genai SDK
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
        # Get token count from response
        try:
            total_tokens = response.usage_metadata.total_token_count
        except Exception:
            total_tokens = 0

        return ans, total_tokens

    def chat_streamly(self, system, history, gen_conf={}, **kwargs):
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
                    if "content_block_delta" in res and "data" in res:
                        text = json.loads(res[6:])["delta"]["text"]
                        ans = text
                        total_tokens += num_tokens_from_string(text)
            except Exception as e:
                yield ans + "\n**ERROR**: " + str(e)

            yield total_tokens
        else:
            # Gemini models with google-genai SDK
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
    _FACTORY_NAME = [
        "Ollama",
        "OpenAI",
        "Azure-OpenAI",
        "Gemini",
    ]

    def __init__(self, key, model_name, base_url=None, **kwargs):
        self.timeout = int(os.environ.get("LLM_TIMEOUT_SECONDS", 600))
        self.provider = kwargs.get("provider", "")
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

        # Factory specific fields
        if self.provider == SupportedLiteLLMProvider.Azure_OpenAI:
            self.api_key = json.loads(key).get("api_key", "")
            self.api_version = json.loads(key).get("api_version", "2024-02-01")

    def _get_delay(self):
        return self.base_delay * random.uniform(10, 150)

    def _classify_error(self, error):
        error_str = str(error).lower()

        keywords_mapping = [
            (["quota", "capacity", "credit", "billing", "balance", "欠费"], LLMErrorCode.ERROR_QUOTA),
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
        gen_conf = deepcopy(gen_conf) if gen_conf else {}

        if "kimi-k2.5" in self.model_name.lower():
            reasoning = gen_conf.pop("reasoning", None) # will never get one here, handle this later
            thinking = {"type": "enabled"} # enable thinking by default
            if reasoning is not None:
                thinking = {"type": "enabled"} if reasoning else {"type": "disabled"}
            elif not isinstance(thinking, dict) or thinking.get("type") not in {"enabled", "disabled"}:
                thinking = {"type": "disabled"}
            gen_conf["thinking"] = thinking

            thinking_enabled = thinking.get("type") == "enabled"
            gen_conf["temperature"] = 1.0 if thinking_enabled else 0.6
            gen_conf["top_p"] = 0.95
            gen_conf["n"] = 1
            gen_conf["presence_penalty"] = 0.0
            gen_conf["frequency_penalty"] = 0.0

        gen_conf.pop("max_tokens", None)
        return gen_conf

    async def async_chat(self, system, history, gen_conf, **kwargs):
        hist = list(history) if history else []
        if system:
            if not hist or hist[0].get("role") != "system":
                hist.insert(0, {"role": "system", "content": system})

        logging.info("[HISTORY]" + json.dumps(hist, ensure_ascii=False, indent=2))
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
        if is_chinese([ans]):
            return ans + LENGTH_NOTIFICATION_CN
        return ans + LENGTH_NOTIFICATION_EN

    @property
    def _retryable_errors(self) -> set[str]:
        return {
            LLMErrorCode.ERROR_RATE_LIMIT,
            LLMErrorCode.ERROR_SERVER,
        }

    def _should_retry(self, error_code: str) -> bool:
        return error_code in self._retryable_errors

    async def _exceptions_async(self, e, attempt):
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
        return "<tool_call>" + json.dumps({"name": name, "args": args, "result": res}, ensure_ascii=False, indent=2) + "</tool_call>"

    def _append_history(self, hist, tool_call, tool_res):
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
        if not (toolcall_session and tools):
            return
        self.is_tools = True
        self.toolcall_session = toolcall_session
        self.tools = tools

    async def async_chat_with_tools(self, system: str, history: list, gen_conf: dict = {}):
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

                    if not hasattr(message, "tool_calls") or not message.tool_calls:
                        if hasattr(message, "reasoning_content") and message.reasoning_content:
                            ans += f"<think>{message.reasoning_content}</think>"
                        ans += message.content or ""
                        if response.choices[0].finish_reason == "length":
                            ans = self._length_stop(ans)
                        return ans, tk_count

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

                    final_tool_calls = {}
                    answer = ""

                    async for resp in response:
                        if not hasattr(resp, "choices") or not resp.choices:
                            continue

                        delta = resp.choices[0].delta

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

                    if answer:
                        yield total_tokens
                        return

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
        if self.provider in FACTORY_DEFAULT_BASE_URL:
            completion_args.update({"api_base": self.base_url})
        elif self.provider == SupportedLiteLLMProvider.Azure_OpenAI:
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
    """
    RAGcon Chat Provider - routes through LiteLLM proxy
    
    All model types are handled through a unified LiteLLM endpoint.
    Default Base URL: https://connect.ragcon.com/v1
    """
    _FACTORY_NAME = "RAGcon"
    
    def __init__(self, key, model_name, base_url=None, **kwargs):
        if not base_url:
            base_url = "https://connect.ragcon.com/v1"
        
        super().__init__(key, model_name, base_url, **kwargs)
