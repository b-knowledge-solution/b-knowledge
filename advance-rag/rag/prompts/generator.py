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
"""RAG prompt generator module for building and managing LLM prompts.

This module provides the core prompt generation pipeline for Retrieval-Augmented
Generation (RAG). It handles:

- Formatting retrieved knowledge-base chunks into structured prompt context
- Fitting messages within LLM token limits via truncation strategies
- Extracting keywords and generating questions from content via LLM calls
- Resolving multi-turn conversations into standalone queries
- Cross-language query translation for multilingual search
- Content tagging using LLM-based classification
- Vision LLM prompt construction for image/figure description
- Agentic workflows: task analysis, step planning, reflection, and memory
- Table of contents (TOC) detection, extraction, transformation, and indexing
- Metadata filter generation for structured search constraints
- Sufficiency checking and multi-query generation for iterative retrieval

All prompt templates are loaded from Markdown files via ``template.load_prompt``
and rendered using Jinja2. LLM interactions strip ``</think>`` reasoning tags
and check for ``**ERROR**`` markers to handle failures gracefully.
"""

import asyncio
import datetime
import json
import logging
import re
from copy import deepcopy
from typing import Tuple
import jinja2
import json_repair
from common.misc_utils import hash_str2int
from rag.nlp import rag_tokenizer
from rag.prompts.template import load_prompt
from common.constants import TAG_FLD
from common.token_utils import encoder, num_tokens_from_string

# Sentinel token used to signal stream completion in agentic workflows
STOP_TOKEN = "<|STOP|>"

# Function name used by agents to indicate task completion
COMPLETE_TASK = "complete_task"

# Fraction of the model's max context window reserved for input content
# (the remaining 50% is left for the model's output and system overhead)
INPUT_UTILIZATION = 0.5


def get_value(d, k1, k2):
    """Retrieve a value from a dict, trying two alternative keys.

    This accommodates inconsistent field naming between internal chunk
    representations (e.g. ``chunk_id``) and external API formats (e.g. ``id``).

    Args:
        d: The dictionary to look up.
        k1: Primary key to try first.
        k2: Fallback key if ``k1`` is not present.

    Returns:
        The value associated with ``k1`` if it exists, otherwise the value
        for ``k2``, or ``None`` if neither key is found.
    """
    return d.get(k1, d.get(k2))


def chunks_format(reference):
    """Normalize retrieved chunks into a uniform list of dicts.

    Converts the internal chunk representation (which may use different
    field names depending on the source) into a consistent format suitable
    for API responses and downstream consumers.

    Args:
        reference: A dict containing a ``chunks`` list, or ``None``/non-dict.

    Returns:
        A list of normalized chunk dictionaries with standardized field names
        (``id``, ``content``, ``document_id``, ``document_name``, etc.).
        Returns an empty list if the reference is invalid.
    """
    if not reference or not isinstance(reference, dict):
        return []
    return [
        {
            "id": get_value(chunk, "chunk_id", "id"),
            "content": get_value(chunk, "content", "content_with_weight"),
            "document_id": get_value(chunk, "doc_id", "document_id"),
            "document_name": get_value(chunk, "docnm_kwd", "document_name"),
            "dataset_id": get_value(chunk, "kb_id", "dataset_id"),
            "image_id": get_value(chunk, "image_id", "img_id"),
            "positions": get_value(chunk, "positions", "position_int"),
            "url": chunk.get("url"),
            "similarity": chunk.get("similarity"),
            "vector_similarity": chunk.get("vector_similarity"),
            "term_similarity": chunk.get("term_similarity"),
            "doc_type": get_value(chunk, "doc_type_kwd", "doc_type"),
        }
        for chunk in reference.get("chunks", [])
    ]


def message_fit_in(msg, max_length=4000):
    """Truncate a message list to fit within the given token budget.

    Uses a multi-pass truncation strategy:
    1. If the full message list fits, return it as-is.
    2. Keep only the system message and the last user message.
    3. If still over budget, truncate whichever message dominates
       (system vs. user) based on an 80/20 ratio heuristic.

    Args:
        msg: A list of message dicts with ``role`` and ``content`` keys.
        max_length: Maximum allowed token count for the entire message list.

    Returns:
        A tuple of ``(token_count, truncated_messages)`` where
        ``token_count`` is the final token count and ``truncated_messages``
        is the (possibly shortened) message list.
    """
    def count():
        nonlocal msg
        tks_cnts = []
        for m in msg:
            tks_cnts.append({"role": m["role"], "count": num_tokens_from_string(m["content"])})
        total = 0
        for m in tks_cnts:
            total += m["count"]
        return total

    c = count()
    if c < max_length:
        return c, msg

    # Keep only system prompt and last message to reduce token usage
    msg_ = [m for m in msg if m["role"] == "system"]
    if len(msg) > 1:
        msg_.append(msg[-1])
    msg = msg_
    c = count()
    if c < max_length:
        return c, msg

    # Compute individual token counts for system and last message
    ll = num_tokens_from_string(msg_[0]["content"])
    ll2 = num_tokens_from_string(msg_[-1]["content"])
    # If the system prompt dominates (>80% of total), truncate it
    if ll / (ll + ll2) > 0.8:
        m = msg_[0]["content"]
        m = encoder.decode(encoder.encode(m)[: max_length - ll2])
        msg[0]["content"] = m
        return max_length, msg

    # Otherwise truncate the user message
    m = msg_[-1]["content"]
    m = encoder.decode(encoder.encode(m)[: max_length - ll2])
    msg[-1]["content"] = m
    return max_length, msg


def kb_prompt(kbinfos, max_tokens, hash_id=False):
    """Build a structured knowledge-base prompt from retrieved chunks.

    Formats each chunk as a tree-style text block containing its title,
    URL, metadata fields, and content. Truncates at the token budget
    boundary (97% of ``max_tokens``) and logs a warning if not all
    chunks fit.

    Args:
        kbinfos: A dict with a ``chunks`` list of retrieved chunk dicts.
        max_tokens: Maximum token budget for the combined knowledge text.
        hash_id: If ``True``, display a deterministic hashed ID (0-499)
            instead of the sequential index.

    Returns:
        A list of formatted knowledge strings, one per included chunk.
    """
    # Lazy imports to avoid circular dependencies at module load time
    from db.services.document_service import DocumentService
    from db.services.doc_metadata_service import DocMetadataService

    knowledges = [get_value(ck, "content", "content_with_weight") for ck in kbinfos["chunks"]]
    kwlg_len = len(knowledges)
    used_token_count = 0
    chunks_num = 0
    # Accumulate chunks until the token budget (97% threshold) is reached
    for i, c in enumerate(knowledges):
        if not c:
            continue
        used_token_count += num_tokens_from_string(c)
        chunks_num += 1
        if max_tokens * 0.97 < used_token_count:
            knowledges = knowledges[:i]
            logging.warning(f"Not all the retrieval into prompt: {len(knowledges)}/{kwlg_len}")
            break

    # Fetch document records and their metadata for contextual display
    docs = DocumentService.get_by_ids([get_value(ck, "doc_id", "document_id") for ck in kbinfos["chunks"][:chunks_num]])

    docs_with_meta = {}
    for d in docs:
        meta = DocMetadataService.get_document_metadata(d.id)
        docs_with_meta[d.id] = meta if meta else {}
    docs = docs_with_meta

    def draw_node(k, line):
        """Format a single metadata field as a tree branch line.

        Args:
            k: The field label/key name.
            line: The field value (converted to string if needed).

        Returns:
            A formatted tree-branch string, or empty string if no value.
        """
        if line is not None and not isinstance(line, str):
            line = str(line)
        if not line:
            return ""
        return f"\n├── {k}: " + re.sub(r"\n+", " ", line, flags=re.DOTALL)

    # Build the final formatted knowledge list with tree-style structure
    knowledges = []
    for i, ck in enumerate(kbinfos["chunks"][:chunks_num]):
        cnt = "\nID: {}".format(i if not hash_id else hash_str2int(get_value(ck, "id", "chunk_id"), 500))
        cnt += draw_node("Title", get_value(ck, "docnm_kwd", "document_name"))
        cnt += draw_node("URL", ck['url']) if "url" in ck else ""
        # Append any document-level metadata fields
        for k, v in docs.get(get_value(ck, "doc_id", "document_id"), {}).items():
            cnt += draw_node(k, v)
        cnt += "\n└── Content:\n"
        cnt += get_value(ck, "content", "content_with_weight")
        knowledges.append(cnt)

    return knowledges


def memory_prompt(message_list, max_tokens):
    """Extract conversation memory content within a token budget.

    Iterates through message history and accumulates content strings
    until the token budget (97% of ``max_tokens``) is exhausted.

    Args:
        message_list: A list of message dicts, each with a ``content`` key.
        max_tokens: Maximum token budget for the combined memory content.

    Returns:
        A list of content strings that fit within the budget.
    """
    used_token_count = 0
    content_list = []
    for message in message_list:
        current_content_tokens = num_tokens_from_string(message["content"])
        if used_token_count + current_content_tokens > max_tokens * 0.97:
            logging.warning(f"Not all the retrieval into prompt: {len(content_list)}/{len(message_list)}")
            break
        content_list.append(message["content"])
        used_token_count += current_content_tokens
    return content_list


# ---------------------------------------------------------------------------
# Pre-loaded prompt templates (loaded once at module import time)
# Each template is a Jinja2-compatible string loaded from a .md file.
# ---------------------------------------------------------------------------
CITATION_PROMPT_TEMPLATE = load_prompt("citation_prompt")
CITATION_PLUS_TEMPLATE = load_prompt("citation_plus")
CONTENT_TAGGING_PROMPT_TEMPLATE = load_prompt("content_tagging_prompt")
CROSS_LANGUAGES_SYS_PROMPT_TEMPLATE = load_prompt("cross_languages_sys_prompt")
CROSS_LANGUAGES_USER_PROMPT_TEMPLATE = load_prompt("cross_languages_user_prompt")
FULL_QUESTION_PROMPT_TEMPLATE = load_prompt("full_question_prompt")
KEYWORD_PROMPT_TEMPLATE = load_prompt("keyword_prompt")
QUESTION_PROMPT_TEMPLATE = load_prompt("question_prompt")
VISION_LLM_DESCRIBE_PROMPT = load_prompt("vision_llm_describe_prompt")
VISION_LLM_FIGURE_DESCRIBE_PROMPT = load_prompt("vision_llm_figure_describe_prompt")
VISION_LLM_FIGURE_DESCRIBE_PROMPT_WITH_CONTEXT = load_prompt("vision_llm_figure_describe_prompt_with_context")
STRUCTURED_OUTPUT_PROMPT = load_prompt("structured_output_prompt")

# Agentic workflow prompt templates
ANALYZE_TASK_SYSTEM = load_prompt("analyze_task_system")
ANALYZE_TASK_USER = load_prompt("analyze_task_user")
NEXT_STEP = load_prompt("next_step")
REFLECT = load_prompt("reflect")
SUMMARY4MEMORY = load_prompt("summary4memory")
RANK_MEMORY = load_prompt("rank_memory")
META_FILTER = load_prompt("meta_filter")
ASK_SUMMARY = load_prompt("ask_summary")

# Jinja2 environment configured without HTML auto-escaping (prompts are plain
# text) and with whitespace control for cleaner template output
PROMPT_JINJA_ENV = jinja2.Environment(autoescape=False, trim_blocks=True, lstrip_blocks=True)


def citation_prompt(user_defined_prompts: dict = {}) -> str:
    """Render the citation guidelines prompt.

    Supports user-customized citation guidelines via the
    ``citation_guidelines`` key in ``user_defined_prompts``.

    Args:
        user_defined_prompts: Optional dict of user-overridden prompt
            templates keyed by prompt name.

    Returns:
        The rendered citation guidelines prompt string.
    """
    template = PROMPT_JINJA_ENV.from_string(user_defined_prompts.get("citation_guidelines", CITATION_PROMPT_TEMPLATE))
    return template.render()


def citation_plus(sources: str) -> str:
    """Render an enhanced citation prompt that includes source references.

    Args:
        sources: A formatted string listing the available source documents.

    Returns:
        The rendered citation-plus prompt string with examples and sources.
    """
    template = PROMPT_JINJA_ENV.from_string(CITATION_PLUS_TEMPLATE)
    return template.render(example=citation_prompt(), sources=sources)


async def keyword_extraction(chat_mdl, content, topn=3):
    """Extract top-N keywords from content using an LLM.

    Sends the content to the chat model with a keyword extraction prompt
    and returns the extracted keywords as a raw string.

    Args:
        chat_mdl: The LLM chat model instance (must support ``async_chat``).
        content: The text content to extract keywords from.
        topn: Maximum number of keywords to extract.

    Returns:
        A string of extracted keywords, or empty string on error.
    """
    template = PROMPT_JINJA_ENV.from_string(KEYWORD_PROMPT_TEMPLATE)
    rendered_prompt = template.render(content=content, topn=topn)

    msg = [{"role": "system", "content": rendered_prompt}, {"role": "user", "content": "Output: "}]
    _, msg = message_fit_in(msg, chat_mdl.max_length)
    kwd = await chat_mdl.async_chat(rendered_prompt, msg[1:], {"temperature": 0.2})
    if isinstance(kwd, tuple):
        kwd = kwd[0]
    # Strip chain-of-thought reasoning enclosed in <think>...</think> tags
    kwd = re.sub(r"^.*</think>", "", kwd, flags=re.DOTALL)
    if kwd.find("**ERROR**") >= 0:
        return ""
    return kwd


async def question_proposal(chat_mdl, content, topn=3):
    """Generate proposed questions from content using an LLM.

    Useful for creating FAQ-style questions that a chunk of content
    can answer, which can improve retrieval relevance.

    Args:
        chat_mdl: The LLM chat model instance (must support ``async_chat``).
        content: The text content to generate questions from.
        topn: Maximum number of questions to propose.

    Returns:
        A string of proposed questions, or empty string on error.
    """
    template = PROMPT_JINJA_ENV.from_string(QUESTION_PROMPT_TEMPLATE)
    rendered_prompt = template.render(content=content, topn=topn)

    msg = [{"role": "system", "content": rendered_prompt}, {"role": "user", "content": "Output: "}]
    _, msg = message_fit_in(msg, chat_mdl.max_length)
    kwd = await chat_mdl.async_chat(rendered_prompt, msg[1:], {"temperature": 0.2})
    if isinstance(kwd, tuple):
        kwd = kwd[0]
    # Strip chain-of-thought reasoning
    kwd = re.sub(r"^.*</think>", "", kwd, flags=re.DOTALL)
    if kwd.find("**ERROR**") >= 0:
        return ""
    return kwd


async def full_question(tenant_id=None, llm_id=None, messages=[], language=None, chat_mdl=None):
    """Resolve a multi-turn conversation into a single standalone question.

    Takes the conversation history and uses an LLM to produce a
    self-contained query that captures the user's current intent,
    incorporating context from prior turns. This is essential for
    accurate retrieval in multi-turn chat scenarios.

    Args:
        tenant_id: The tenant identifier for LLM bundle resolution.
        llm_id: The specific LLM model identifier to use.
        messages: List of conversation message dicts with ``role`` and
            ``content`` keys.
        language: Optional target language for the resolved question.
        chat_mdl: Pre-configured LLM bundle instance. If provided,
            ``tenant_id`` and ``llm_id`` are ignored.

    Returns:
        The resolved standalone question string, or the last user message
        content if the LLM returns an error.
    """
    # Lazy imports to avoid circular dependencies
    from common.constants import LLMType
    from db.services.llm_service import LLMBundle
    from db.services.tenant_llm_service import TenantLLMService
    from db.joint_services.tenant_model_service import get_model_config_by_type_and_name

    # Initialize chat model if not provided
    if not chat_mdl:
        if TenantLLMService.llm_id2llm_type(llm_id) == "image2text":
            chat_model_config = get_model_config_by_type_and_name(tenant_id, LLMType.IMAGE2TEXT, llm_id)
        else:
            chat_model_config = get_model_config_by_type_and_name(tenant_id, LLMType.CHAT, llm_id)
        chat_mdl = LLMBundle(tenant_id, chat_model_config)

    # Format conversation history as "ROLE: content" lines
    conv = []
    for m in messages:
        if m["role"] not in ["user", "assistant"]:
            continue
        conv.append("{}: {}".format(m["role"].upper(), m["content"]))
    conversation = "\n".join(conv)

    # Provide date context for time-relative queries (e.g., "yesterday's report")
    today = datetime.date.today().isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

    template = PROMPT_JINJA_ENV.from_string(FULL_QUESTION_PROMPT_TEMPLATE)
    rendered_prompt = template.render(
        today=today,
        yesterday=yesterday,
        tomorrow=tomorrow,
        conversation=conversation,
        language=language,
    )

    ans = await chat_mdl.async_chat(rendered_prompt, [{"role": "user", "content": "Output: "}])
    ans = re.sub(r"^.*</think>", "", ans, flags=re.DOTALL)
    # Fall back to the raw last user message if the LLM fails
    return ans if ans.find("**ERROR**") < 0 else messages[-1]["content"]


async def cross_languages(tenant_id, llm_id, query, languages=[]):
    """Translate a query into multiple target languages for cross-lingual search.

    Uses an LLM to produce equivalent search queries in each specified
    language, enabling retrieval across multilingual document collections.

    Args:
        tenant_id: The tenant identifier for LLM bundle resolution.
        llm_id: The specific LLM model identifier to use.
        query: The original search query string.
        languages: List of target language names (e.g., ``["Japanese", "Vietnamese"]``).

    Returns:
        A newline-separated string of translated queries, or the original
        query if the LLM returns an error.
    """
    # Lazy imports to avoid circular dependencies
    from common.constants import LLMType
    from db.services.llm_service import LLMBundle
    from db.services.tenant_llm_service import TenantLLMService
    from db.joint_services.tenant_model_service import get_model_config_by_type_and_name

    # Select appropriate model type based on the LLM's registered capability
    if llm_id and TenantLLMService.llm_id2llm_type(llm_id) == "image2text":
        chat_model_config = get_model_config_by_type_and_name(tenant_id, LLMType.IMAGE2TEXT, llm_id)
    else:
        chat_model_config = get_model_config_by_type_and_name(tenant_id, LLMType.CHAT, llm_id)
    chat_mdl = LLMBundle(tenant_id, chat_model_config)
    rendered_sys_prompt = PROMPT_JINJA_ENV.from_string(CROSS_LANGUAGES_SYS_PROMPT_TEMPLATE).render()
    rendered_user_prompt = PROMPT_JINJA_ENV.from_string(CROSS_LANGUAGES_USER_PROMPT_TEMPLATE).render(query=query,
                                                                                                     languages=languages)

    ans = await chat_mdl.async_chat(rendered_sys_prompt, [{"role": "user", "content": rendered_user_prompt}],
                                    {"temperature": 0.2})
    ans = re.sub(r"^.*</think>", "", ans, flags=re.DOTALL)
    if ans.find("**ERROR**") >= 0:
        return query
    # Parse "===" delimited translations, strip the "Output:" prefix and extra newlines
    return "\n".join([a for a in re.sub(r"(^Output:|\n+)", "", ans, flags=re.DOTALL).split("===") if a.strip()])


async def content_tagging(chat_mdl, content, all_tags, examples, topn=3):
    """Classify content by assigning relevance scores to predefined tags.

    Uses an LLM to analyze content against a set of available tags,
    returning a dict mapping tag names to integer relevance scores.
    Tags with a score of 0 or below are excluded from the result.

    Args:
        chat_mdl: The LLM chat model instance.
        content: The text content to classify.
        all_tags: A list or dict of all available tag definitions.
        examples: A list of example dicts for few-shot prompting. Each
            example should contain a ``TAG_FLD`` key with tag assignments.
        topn: Maximum number of tags to assign.

    Returns:
        A dict mapping tag name strings to positive integer scores.

    Raises:
        Exception: If the LLM returns an error or JSON parsing fails
            after all recovery attempts.
    """
    template = PROMPT_JINJA_ENV.from_string(CONTENT_TAGGING_PROMPT_TEMPLATE)

    # Serialize each example's tags to JSON for inclusion in the prompt
    for ex in examples:
        ex["tags_json"] = json.dumps(ex[TAG_FLD], indent=2, ensure_ascii=False)

    rendered_prompt = template.render(
        topn=topn,
        all_tags=all_tags,
        examples=examples,
        content=content,
    )

    msg = [{"role": "system", "content": rendered_prompt}, {"role": "user", "content": "Output: "}]
    _, msg = message_fit_in(msg, chat_mdl.max_length)
    kwd = await chat_mdl.async_chat(rendered_prompt, msg[1:], {"temperature": 0.5})
    if isinstance(kwd, tuple):
        kwd = kwd[0]
    kwd = re.sub(r"^.*</think>", "", kwd, flags=re.DOTALL)
    if kwd.find("**ERROR**") >= 0:
        raise Exception(kwd)

    # Attempt to parse the LLM output as JSON, with fallback extraction
    try:
        obj = json_repair.loads(kwd)
    except json_repair.JSONDecodeError:
        try:
            # Fallback: extract the first JSON object from the raw output
            result = kwd.replace(rendered_prompt[:-1], "").replace("user", "").replace("model", "").strip()
            result = "{" + result.split("{")[1].split("}")[0] + "}"
            obj = json_repair.loads(result)
        except Exception as e:
            logging.exception(f"JSON parsing error: {result} -> {e}")
            raise e

    # Filter to only tags with positive integer scores
    res = {}
    for k, v in obj.items():
        try:
            if int(v) > 0:
                res[str(k)] = int(v)
        except Exception:
            pass
    return res


def vision_llm_describe_prompt(page=None) -> str:
    """Render a prompt for describing a full document page via vision LLM.

    Args:
        page: Optional page number or identifier for context.

    Returns:
        The rendered vision description prompt string.
    """
    template = PROMPT_JINJA_ENV.from_string(VISION_LLM_DESCRIBE_PROMPT)

    return template.render(page=page)


def vision_llm_figure_describe_prompt() -> str:
    """Render a prompt for describing an extracted figure via vision LLM.

    Returns:
        The rendered figure description prompt string.
    """
    template = PROMPT_JINJA_ENV.from_string(VISION_LLM_FIGURE_DESCRIBE_PROMPT)
    return template.render()


def vision_llm_figure_describe_prompt_with_context(context_above: str, context_below: str) -> str:
    """Render a context-aware prompt for describing a figure via vision LLM.

    Includes surrounding text context to help the vision model produce
    more accurate and relevant figure descriptions.

    Args:
        context_above: Text content appearing above the figure in the document.
        context_below: Text content appearing below the figure in the document.

    Returns:
        The rendered context-aware figure description prompt string.
    """
    template = PROMPT_JINJA_ENV.from_string(VISION_LLM_FIGURE_DESCRIBE_PROMPT_WITH_CONTEXT)
    return template.render(context_above=context_above, context_below=context_below)


def tool_schema(tools_description: list[dict], complete_task=False):
    """Format tool definitions into a numbered schema string for LLM prompts.

    Converts a list of OpenAI-style tool/function definitions into a
    human-readable numbered list that can be included in agentic prompts.

    Args:
        tools_description: A list of tool definition dicts following the
            OpenAI function-calling schema format.
        complete_task: If ``True``, prepend a built-in ``complete_task``
            tool that agents can call to signal task completion.

    Returns:
        A formatted string of numbered tool schemas, or empty string
        if no tools are provided.
    """
    if not tools_description:
        return ""
    desc = {}
    # Optionally add the built-in complete_task tool at the front
    if complete_task:
        desc[COMPLETE_TASK] = {
            "type": "function",
            "function": {
                "name": COMPLETE_TASK,
                "description": "When you have the final answer and are ready to complete the task, call this function with your answer",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "answer": {"type": "string", "description": "The final answer to the user's question"}},
                    "required": ["answer"]
                }
            }
        }
    for idx, tool in enumerate(tools_description):
        name = tool["function"]["name"]
        desc[name] = tool

    return "\n\n".join([f"## {i + 1}. {fnm}\n{json.dumps(des, ensure_ascii=False, indent=4)}" for i, (fnm, des) in
                        enumerate(desc.items())])


def form_history(history, limit=-6):
    """Format recent conversation history into a compact text representation.

    Extracts the last ``|limit|`` messages (default 6) and formats them
    as ``USER:`` or ``AGENT:`` prefixed lines. Each message is truncated
    to 2048 characters to keep context manageable.

    Args:
        history: A list of message dicts with ``role`` and ``content`` keys.
        limit: Negative integer specifying how many recent messages to include
            (e.g., ``-6`` means the last 6 messages).

    Returns:
        A newline-separated string of formatted history entries.
    """
    context = ""
    for h in history[limit:]:
        if h["role"] == "system":
            continue
        role = "USER"
        if h["role"].upper() != role:
            role = "AGENT"
        context += f"\n{role}: {h['content'][:2048] + ('...' if len(h['content']) > 2048 else '')}"
    return context


async def analyze_task_async(chat_mdl, prompt, task_name, tools_description: list[dict],
                             user_defined_prompts: dict = {}):
    """Analyze a user task using an LLM to produce a structured task breakdown.

    Part of the agentic workflow: the LLM examines the task prompt, available
    tools, and task name to produce an analysis that guides subsequent
    step-by-step execution.

    Args:
        chat_mdl: The LLM chat model instance.
        prompt: The agent's system prompt / instructions.
        task_name: A short label describing the task type.
        tools_description: Available tool definitions for the agent.
        user_defined_prompts: Optional user-overridden prompt templates.
            Supports a ``task_analysis`` key for custom analysis prompts.

    Returns:
        The LLM's task analysis text, or empty string on error.
    """
    tools_desc = tool_schema(tools_description)
    context = ""

    # Allow user-defined prompt override for task analysis
    if user_defined_prompts.get("task_analysis"):
        template = PROMPT_JINJA_ENV.from_string(user_defined_prompts["task_analysis"])
    else:
        template = PROMPT_JINJA_ENV.from_string(ANALYZE_TASK_SYSTEM + "\n\n" + ANALYZE_TASK_USER)
    context = template.render(task=task_name, context=context, agent_prompt=prompt, tools_desc=tools_desc)
    kwd = await chat_mdl.async_chat(context, [{"role": "user", "content": "Please analyze it."}])
    if isinstance(kwd, tuple):
        kwd = kwd[0]
    kwd = re.sub(r"^.*</think>", "", kwd, flags=re.DOTALL)
    if kwd.find("**ERROR**") >= 0:
        return ""
    return kwd


async def next_step_async(chat_mdl, history: list, tools_description: list[dict], task_desc,
                          user_defined_prompts: dict = {}):
    """Determine the next tool call in an agentic execution loop.

    Given the conversation history and available tools, asks the LLM
    to decide which tool to call next (or to call ``complete_task``
    if the goal is achieved or impossible).

    Args:
        chat_mdl: The LLM chat model instance.
        history: The full conversation history as a list of message dicts.
        tools_description: Available tool definitions for the agent.
        task_desc: The task analysis/description from ``analyze_task_async``.
        user_defined_prompts: Optional user-overridden prompt templates.
            Supports a ``plan_generation`` key for custom planning prompts.

    Returns:
        A tuple of ``(json_str, token_count)`` where ``json_str`` is the
        LLM's response (typically a JSON tool call), and ``token_count``
        is the response's token count. Returns ``("", 0)`` if no tools
        are available.
    """
    if not tools_description:
        return "", 0
    desc = tool_schema(tools_description)
    template = PROMPT_JINJA_ENV.from_string(user_defined_prompts.get("plan_generation", NEXT_STEP))
    user_prompt = "\nWhat's the next tool to call? If ready OR IMPOSSIBLE TO BE READY, then call `complete_task`."
    # Deep copy to avoid mutating the original history
    hist = deepcopy(history)
    if hist[-1]["role"] == "user":
        hist[-1]["content"] += user_prompt
    else:
        hist.append({"role": "user", "content": user_prompt})
    json_str = await chat_mdl.async_chat(
        template.render(task_analysis=task_desc, desc=desc, today=datetime.datetime.now().strftime("%Y-%m-%d")),
        hist[1:],
        stop=["<|stop|>"],
    )
    tk_cnt = num_tokens_from_string(json_str)
    json_str = re.sub(r"^.*</think>", "", json_str, flags=re.DOTALL)
    return json_str, tk_cnt


async def reflect_async(chat_mdl, history: list[dict], tool_call_res: list[Tuple], user_defined_prompts: dict = {}):
    """Reflect on tool call results to produce observations and insights.

    Part of the agentic ReAct loop: after tool execution, the LLM
    reviews what happened and produces structured observations and
    reflections that inform the next step.

    Args:
        chat_mdl: The LLM chat model instance.
        history: The full conversation history as a list of message dicts.
        tool_call_res: A list of ``(tool_name, result_string)`` tuples
            representing completed tool calls and their outputs.
        user_defined_prompts: Optional user-overridden prompt templates.
            Supports a ``reflection`` key for custom reflection prompts.

    Returns:
        A formatted string containing the observation (tool call results
        as JSON) and the LLM's reflection text.
    """
    tool_calls = [{"name": p[0], "result": p[1]} for p in tool_call_res]
    # Extract the original user goal from the second message in history
    goal = history[1]["content"]
    template = PROMPT_JINJA_ENV.from_string(user_defined_prompts.get("reflection", REFLECT))
    user_prompt = template.render(goal=goal, tool_calls=tool_calls)
    hist = deepcopy(history)
    if hist[-1]["role"] == "user":
        hist[-1]["content"] += user_prompt
    else:
        hist.append({"role": "user", "content": user_prompt})
    _, msg = message_fit_in(hist, chat_mdl.max_length)
    ans = await chat_mdl.async_chat(msg[0]["content"], msg[1:])
    ans = re.sub(r"^.*</think>", "", ans, flags=re.DOTALL)
    return """
**Observation**
{}

**Reflection**
{}
    """.format(json.dumps(tool_calls, ensure_ascii=False, indent=2), ans)


def form_message(system_prompt, user_prompt):
    """Create a standard two-message list (system + user) for LLM calls.

    Args:
        system_prompt: The system-level instruction content.
        user_prompt: The user-level input content.

    Returns:
        A list of two message dicts with ``role`` and ``content`` keys.
    """
    return [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]


def structured_output_prompt(schema=None) -> str:
    """Render a prompt instructing the LLM to produce structured JSON output.

    Args:
        schema: Optional JSON schema definition that the output should
            conform to.

    Returns:
        The rendered structured output instruction prompt string.
    """
    template = PROMPT_JINJA_ENV.from_string(STRUCTURED_OUTPUT_PROMPT)
    return template.render(schema=schema)


async def tool_call_summary(chat_mdl, name: str, params: dict, result: str, user_defined_prompts: dict = {}) -> str:
    """Summarize a tool call and its result for agent memory storage.

    Produces a concise summary of what a tool did and what it returned,
    suitable for inclusion in the agent's working memory to inform
    future decisions.

    Args:
        chat_mdl: The LLM chat model instance.
        name: The name of the tool that was called.
        params: The parameters that were passed to the tool.
        result: The raw result string returned by the tool.
        user_defined_prompts: Optional user-overridden prompt templates.

    Returns:
        A concise summary string of the tool call and its outcome.
    """
    template = PROMPT_JINJA_ENV.from_string(SUMMARY4MEMORY)
    system_prompt = template.render(name=name,
                                    params=json.dumps(params, ensure_ascii=False, indent=2),
                                    result=result)
    user_prompt = "→ Summary: "
    _, msg = message_fit_in(form_message(system_prompt, user_prompt), chat_mdl.max_length)
    ans = await chat_mdl.async_chat(msg[0]["content"], msg[1:])
    return re.sub(r"^.*</think>", "", ans, flags=re.DOTALL)


async def rank_memories_async(chat_mdl, goal: str, sub_goal: str, tool_call_summaries: list[str],
                              user_defined_prompts: dict = {}):
    """Rank tool call memory summaries by relevance to the current sub-goal.

    Used in agentic workflows to prioritize which past tool results
    are most relevant when the context window is limited.

    Args:
        chat_mdl: The LLM chat model instance.
        goal: The overall task goal description.
        sub_goal: The current sub-goal or step being worked on.
        tool_call_summaries: A list of summary strings from prior tool calls.
        user_defined_prompts: Optional user-overridden prompt templates.

    Returns:
        The LLM's ranking response as a string (typically comma-separated
        indices ordered by relevance).
    """
    template = PROMPT_JINJA_ENV.from_string(RANK_MEMORY)
    system_prompt = template.render(goal=goal, sub_goal=sub_goal,
                                    results=[{"i": i, "content": s} for i, s in enumerate(tool_call_summaries)])
    user_prompt = " → rank: "
    _, msg = message_fit_in(form_message(system_prompt, user_prompt), chat_mdl.max_length)
    ans = await chat_mdl.async_chat(msg[0]["content"], msg[1:], stop="<|stop|>")
    return re.sub(r"^.*</think>", "", ans, flags=re.DOTALL)


async def gen_meta_filter(chat_mdl, meta_data: dict, query: str, constraints: dict = None) -> dict:
    """Generate metadata filters from a user query using an LLM.

    Analyzes the query and available metadata fields to produce structured
    filter conditions that can be applied to narrow search results. This
    enables automatic extraction of filters like date ranges, categories,
    or other structured constraints from natural language queries.

    Args:
        chat_mdl: The LLM chat model instance.
        meta_data: A dict mapping metadata field names to their possible
            values (dict of value -> count) or value lists.
        query: The user's search query string.
        constraints: Optional pre-existing filter constraints to consider.

    Returns:
        A dict with a ``conditions`` key containing a list of filter
        condition dicts. Returns ``{"conditions": []}`` on parse failure.
    """
    # Flatten metadata values to just their keys for the prompt
    meta_data_structure = {}
    for key, values in meta_data.items():
        meta_data_structure[key] = list(values.keys()) if isinstance(values, dict) else values

    sys_prompt = PROMPT_JINJA_ENV.from_string(META_FILTER).render(
        current_date=datetime.datetime.today().strftime('%Y-%m-%d'),
        metadata_keys=json.dumps(meta_data_structure),
        user_question=query,
        constraints=json.dumps(constraints) if constraints else None
    )
    user_prompt = "Generate filters:"
    ans = await chat_mdl.async_chat(sys_prompt, [{"role": "user", "content": user_prompt}])
    # Strip thinking tags and markdown code fences from the response
    ans = re.sub(r"(^.*</think>|```json\n|```\n*$)", "", ans, flags=re.DOTALL)
    try:
        ans = json_repair.loads(ans)
        assert isinstance(ans, dict), ans
        assert "conditions" in ans and isinstance(ans["conditions"], list), ans
        return ans
    except Exception:
        logging.exception(f"Loading json failure: {ans}")

    return {"conditions": []}


async def gen_json(system_prompt: str, user_prompt: str, chat_mdl, gen_conf={}, max_retry=2):
    """Generate and parse a JSON response from an LLM with retry logic.

    Sends a prompt to the LLM expecting a JSON response, attempts to parse
    it, and retries with error feedback if parsing fails. Results are
    cached via the LLM cache system to avoid redundant API calls.

    Args:
        system_prompt: The system-level instruction prompt.
        user_prompt: The user-level input prompt.
        chat_mdl: The LLM chat model instance.
        gen_conf: Generation configuration dict (e.g., temperature, top_p).
        max_retry: Maximum number of attempts before giving up.

    Returns:
        The parsed JSON object (dict or list), or ``None`` if all retries
        fail.
    """
    from rag.graphrag.utils import get_llm_cache, set_llm_cache
    # Check cache first to avoid redundant LLM calls
    cached = get_llm_cache(chat_mdl.llm_name, system_prompt, user_prompt, gen_conf)
    if cached:
        return json_repair.loads(cached)
    _, msg = message_fit_in(form_message(system_prompt, user_prompt), chat_mdl.max_length)
    err = ""
    ans = ""
    for _ in range(max_retry):
        # On retry, append the failed JSON and error for self-correction
        if ans and err:
            msg[-1]["content"] += f"\nGenerated JSON is as following:\n{ans}\nBut exception while loading:\n{err}\nPlease reconsider and correct it."
        ans = await chat_mdl.async_chat(msg[0]["content"], msg[1:], gen_conf=gen_conf)
        # Strip thinking tags and markdown code fences
        ans = re.sub(r"(^.*</think>|```json\n|```\n*$)", "", ans, flags=re.DOTALL)
        try:
            res = json_repair.loads(ans)
            # Cache successful result for future use
            set_llm_cache(chat_mdl.llm_name, system_prompt, ans, user_prompt, gen_conf)
            return res
        except Exception as e:
            logging.exception(f"Loading json failure: {ans}")
            err += str(e)


# ---------------------------------------------------------------------------
# Table of Contents (TOC) processing prompts and functions
# These functions handle detection, extraction, transformation, and indexing
# of document tables of contents using LLM-assisted analysis.
# ---------------------------------------------------------------------------

TOC_DETECTION = load_prompt("toc_detection")


async def detect_table_of_contents(page_1024: list[str], chat_mdl):
    """Detect which pages contain a table of contents.

    Iterates through the first 22 page sections and uses the LLM to
    determine if each contains TOC content. Stops scanning once a
    non-TOC page is found after TOC pages have been detected.

    Args:
        page_1024: A list of page text sections (each ~1024 tokens).
        chat_mdl: The LLM chat model instance.

    Returns:
        A list of page text sections that were identified as containing
        table of contents content.
    """
    toc_secs = []
    for i, sec in enumerate(page_1024[:22]):
        ans = await gen_json(PROMPT_JINJA_ENV.from_string(TOC_DETECTION).render(page_txt=sec), "Only JSON please.",
                             chat_mdl)
        # Stop scanning once we've found TOC pages and hit a non-TOC page
        if toc_secs and not ans["exists"]:
            break
        toc_secs.append(sec)
    return toc_secs


TOC_EXTRACTION = load_prompt("toc_extraction")
TOC_EXTRACTION_CONTINUE = load_prompt("toc_extraction_continue")


async def extract_table_of_contents(toc_pages, chat_mdl):
    """Extract structured TOC data from raw TOC page text.

    Combines all TOC pages into a single text block and uses the LLM
    to produce a structured JSON representation of the table of contents.

    Args:
        toc_pages: A list of page text strings containing TOC content.
        chat_mdl: The LLM chat model instance.

    Returns:
        A parsed JSON structure (list of dicts) representing the TOC,
        or an empty list if no TOC pages are provided.
    """
    if not toc_pages:
        return []

    return await gen_json(PROMPT_JINJA_ENV.from_string(TOC_EXTRACTION).render(toc_page="\n".join(toc_pages)),
                          "Only JSON please.", chat_mdl)


async def toc_index_extractor(toc: list[dict], content: str, chat_mdl):
    """Map TOC entries to physical page indices within document content.

    Uses ``<physical_index_X>`` tags embedded in the content to determine
    where each TOC section physically starts in the document.

    Args:
        toc: A list of TOC entry dicts with ``structure`` and ``title`` keys.
        content: Document content with embedded ``<physical_index_X>`` tags.
        chat_mdl: The LLM chat model instance.

    Returns:
        A parsed JSON list of TOC entries augmented with ``physical_index``
        fields indicating their location in the document.
    """
    tob_extractor_prompt = """
    You are given a table of contents in a json format and several pages of a document, your job is to add the physical_index to the table of contents in the json format.

    The provided pages contains tags like <physical_index_X> and <physical_index_X> to indicate the physical location of the page X.

    The structure variable is the numeric system which represents the index of the hierarchy section in the table of contents. For example, the first section has structure index 1, the first subsection has structure index 1.1, the second subsection has structure index 1.2, etc.

    The response should be in the following JSON format:
    [
        {
            "structure": <structure index, "x.x.x" or None> (string),
            "title": <title of the section>,
            "physical_index": "<physical_index_X>" (keep the format)
        },
        ...
    ]

    Only add the physical_index to the sections that are in the provided pages.
    If the title of the section are not in the provided pages, do not add the physical_index to it.
    Directly return the final JSON structure. Do not output anything else."""

    prompt = tob_extractor_prompt + '\nTable of contents:\n' + json.dumps(toc, ensure_ascii=False,
                                                                          indent=2) + '\nDocument pages:\n' + content
    return await gen_json(prompt, "Only JSON please.", chat_mdl)


TOC_INDEX = load_prompt("toc_index")


async def table_of_contents_index(toc_arr: list[dict], sections: list[str], chat_mdl):
    """Match TOC entries to their corresponding document section indices.

    Uses a two-phase approach:
    1. Fast matching: builds a lookup map from TOC titles to section indices
       and assigns matches via exact string comparison.
    2. DFS path finding: finds the longest monotonically increasing path
       through all possible matches to resolve ambiguities.
    3. LLM fallback: for unmatched entries, uses the LLM to check if a
       section contains the TOC title.

    Args:
        toc_arr: A list of TOC entry dicts with ``structure`` and ``title``.
        sections: A list of document section text strings.
        chat_mdl: The LLM chat model instance for fallback matching.

    Returns:
        The ``toc_arr`` list with ``indices`` fields populated, where each
        entry's ``indices`` is a list of matching section indices.
        Returns an empty list if inputs are empty.
    """
    if not toc_arr or not sections:
        return []

    # Phase 1: Build a lookup map from normalized TOC titles to candidate section indices
    toc_map = {}
    for i, it in enumerate(toc_arr):
        # Create keys with and without structure prefix for flexible matching
        k1 = (it["structure"] + it["title"]).replace(" ", "")
        k2 = it["title"].strip()
        if k1 not in toc_map:
            toc_map[k1] = []
        if k2 not in toc_map:
            toc_map[k2] = []
        toc_map[k1].append(i)
        toc_map[k2].append(i)

    # Match sections to TOC entries using the lookup map
    for it in toc_arr:
        it["indices"] = []
    for i, sec in enumerate(sections):
        sec = sec.strip()
        if sec.replace(" ", "") in toc_map:
            for j in toc_map[sec.replace(" ", "")]:
                toc_arr[j]["indices"].append(i)

    # Phase 2: Find the longest monotonically increasing path via DFS
    # This resolves ambiguities when multiple sections match a TOC entry
    all_pathes = []

    def dfs(start, path):
        """Depth-first search to find the longest valid assignment path.

        Args:
            start: Current TOC entry index to process.
            path: Current path of ``(section_index, toc_index)`` tuples.
        """
        nonlocal all_pathes
        if start >= len(toc_arr):
            if path:
                all_pathes.append(path)
            return
        # Skip TOC entries with no candidate matches
        if not toc_arr[start]["indices"]:
            dfs(start + 1, path)
            return
        added = False
        for j in toc_arr[start]["indices"]:
            # Enforce monotonically increasing section indices
            if path and j < path[-1][0]:
                continue
            _path = deepcopy(path)
            _path.append((j, start))
            added = True
            dfs(start + 1, _path)
        if not added and path:
            all_pathes.append(path)

    dfs(0, [])
    # Select the path that matches the most TOC entries
    path = max(all_pathes, key=lambda x: len(x))
    for it in toc_arr:
        it["indices"] = []
    for j, i in path:
        toc_arr[i]["indices"] = [j]
    print(json.dumps(toc_arr, ensure_ascii=False, indent=2))

    # Phase 3: LLM fallback for unmatched TOC entries
    # Search within the range bounded by adjacent matched entries
    i = 0
    while i < len(toc_arr):
        it = toc_arr[i]
        if it["indices"]:
            i += 1
            continue

        # Determine search range: between the previous and next matched entries
        if i > 0 and toc_arr[i - 1]["indices"]:
            st_i = toc_arr[i - 1]["indices"][-1]
        else:
            st_i = 0
        e = i + 1
        while e < len(toc_arr) and not toc_arr[e]["indices"]:
            e += 1
        if e >= len(toc_arr):
            e = len(sections)
        else:
            e = toc_arr[e]["indices"][0]

        # Use LLM to check each candidate section for the TOC title
        for j in range(st_i, min(e + 1, len(sections))):
            ans = await gen_json(PROMPT_JINJA_ENV.from_string(TOC_INDEX).render(
                structure=it["structure"],
                title=it["title"],
                text=sections[j]), "Only JSON please.", chat_mdl)
            if ans["exist"] == "yes":
                it["indices"].append(j)
                break

        i += 1

    return toc_arr


async def check_if_toc_transformation_is_complete(content, toc, chat_mdl):
    """Check whether a transformed TOC fully covers the raw TOC content.

    Uses an LLM to compare the original raw TOC text against the
    cleaned/structured version to determine if any entries are missing.

    Args:
        content: The raw table of contents text.
        toc: The cleaned/transformed TOC as a JSON string.
        chat_mdl: The LLM chat model instance.

    Returns:
        A string ``"yes"`` or ``"no"`` indicating completeness.
    """
    prompt = """
    You are given a raw table of contents and a  table of contents.
    Your job is to check if the  table of contents is complete.

    Reply format:
    {{
        "thinking": <why do you think the cleaned table of contents is complete or not>
        "completed": "yes" or "no"
    }}
    Directly return the final JSON structure. Do not output anything else."""

    prompt = prompt + '\n Raw Table of contents:\n' + content + '\n Cleaned Table of contents:\n' + toc
    response = await gen_json(prompt, "Only JSON please.", chat_mdl)
    return response['completed']


async def toc_transformer(toc_pages, chat_mdl):
    """Transform raw TOC pages into a structured JSON representation.

    Performs iterative LLM calls to convert raw table of contents text
    into a structured JSON array. If the initial transformation is
    incomplete, it continues generating the remaining entries until
    the full TOC is covered or no new entries are produced.

    Args:
        toc_pages: A list of raw TOC page text strings.
        chat_mdl: The LLM chat model instance.

    Returns:
        A list of dicts, each with ``structure`` (hierarchy index like
        ``"1.2.3"``) and ``title`` (section title) keys.
    """
    init_prompt = """
    You are given a table of contents, You job is to transform the whole table of content into a JSON format included table_of_contents.

    The `structure` is the numeric system which represents the index of the hierarchy section in the table of contents. For example, the first section has structure index 1, the first subsection has structure index 1.1, the second subsection has structure index 1.2, etc.
    The `title` is a short phrase or a several-words term.

    The response should be in the following JSON format:
    [
        {
            "structure": <structure index, "x.x.x" or None> (string),
            "title": <title of the section>
        },
        ...
    ],
    You should transform the full table of contents in one go.
    Directly return the final JSON structure, do not output anything else. """

    toc_content = "\n".join(toc_pages)
    prompt = init_prompt + '\n Given table of contents\n:' + toc_content

    def clean_toc(arr):
        """Remove decorative dot leaders from TOC titles.

        Args:
            arr: A list of TOC entry dicts with ``title`` keys.
        """
        for a in arr:
            a["title"] = re.sub(r"[.·….]{2,}", "", a["title"])

    # Initial transformation attempt
    last_complete = await gen_json(prompt, "Only JSON please.", chat_mdl)
    if_complete = await check_if_toc_transformation_is_complete(toc_content,
                                                                json.dumps(last_complete, ensure_ascii=False, indent=2),
                                                                chat_mdl)
    clean_toc(last_complete)
    if if_complete == "yes":
        return last_complete

    # Iteratively continue transformation until complete or no progress
    while not (if_complete == "yes"):
        prompt = f"""
        Your task is to continue the table of contents json structure, directly output the remaining part of the json structure.
        The response should be in the following JSON format:

        The raw table of contents json structure is:
        {toc_content}

        The incomplete transformed table of contents json structure is:
        {json.dumps(last_complete[-24:], ensure_ascii=False, indent=2)}

        Please continue the json structure, directly output the remaining part of the json structure."""
        new_complete = await gen_json(prompt, "Only JSON please.", chat_mdl)
        # Stop if no new entries or duplicates detected
        if not new_complete or str(last_complete).find(str(new_complete)) >= 0:
            break
        clean_toc(new_complete)
        last_complete.extend(new_complete)
        if_complete = await check_if_toc_transformation_is_complete(toc_content,
                                                                    json.dumps(last_complete, ensure_ascii=False,
                                                                               indent=2), chat_mdl)

    return last_complete


TOC_LEVELS = load_prompt("assign_toc_levels")


async def assign_toc_levels(toc_secs, chat_mdl, gen_conf={"temperature": 0.2}):
    """Assign hierarchy levels to flat TOC section titles using an LLM.

    Takes a list of section title strings and uses the LLM to determine
    each title's depth level in the document hierarchy.

    Args:
        toc_secs: A list of section title strings.
        chat_mdl: The LLM chat model instance.
        gen_conf: Generation configuration dict for the LLM call.

    Returns:
        A list of dicts with ``level`` and ``title`` keys, or an empty
        list if input is empty.
    """
    if not toc_secs:
        return []
    return await gen_json(
        PROMPT_JINJA_ENV.from_string(TOC_LEVELS).render(),
        str(toc_secs),
        chat_mdl,
        gen_conf
    )


TOC_FROM_TEXT_SYSTEM = load_prompt("toc_from_text_system")
TOC_FROM_TEXT_USER = load_prompt("toc_from_text_user")


async def gen_toc_from_text(txt_info: dict, chat_mdl, callback=None):
    """Generate a table of contents from text chunks using an LLM.

    Processes a batch of text chunks and asks the LLM to identify
    section titles and structure. Results are stored back into the
    ``txt_info`` dict under the ``toc`` key.

    Args:
        txt_info: A dict with a ``chunks`` key containing text chunk data.
            Modified in-place to add a ``toc`` key with the result.
        chat_mdl: The LLM chat model instance.
        callback: Optional progress callback function accepting a ``msg``
            keyword argument.
    """
    if callback:
        callback(msg="")
    try:
        ans = await gen_json(
            PROMPT_JINJA_ENV.from_string(TOC_FROM_TEXT_SYSTEM).render(),
            PROMPT_JINJA_ENV.from_string(TOC_FROM_TEXT_USER).render(
                text="\n".join([json.dumps(d, ensure_ascii=False) for d in txt_info["chunks"]])),
            chat_mdl,
            gen_conf={"temperature": 0.0, "top_p": 0.9}
        )
        txt_info["toc"] = ans if ans and not isinstance(ans, str) else []
    except Exception as e:
        logging.exception(e)


def split_chunks(chunks, max_length: int):
    """
    Pack chunks into batches according to max_length, returning [{"id": idx, "text": chunk_text}, ...].
    Do not split a single chunk, even if it exceeds max_length.
    """

    result = []
    batch, batch_tokens = [], 0

    for idx, chunk in enumerate(chunks):
        t = num_tokens_from_string(chunk)
        # Start a new batch if adding this chunk would exceed the budget
        if batch_tokens + t > max_length:
            result.append(batch)
            batch, batch_tokens = [], 0
        batch.append({idx: chunk})
        batch_tokens += t
    # Don't forget the last batch
    if batch:
        result.append(batch)
    return result


async def run_toc_from_text(chunks, chat_mdl, callback=None):
    """Orchestrate TOC generation from text chunks with parallel LLM calls.

    Splits chunks into batches that fit within the model's input budget,
    runs TOC generation concurrently for each batch, then filters and
    assigns hierarchy levels to the collected TOC entries.

    Args:
        chunks: A list of text chunk strings from the document.
        chat_mdl: The LLM chat model instance.
        callback: Optional progress callback function.

    Returns:
        A list of dicts with ``level``, ``title``, and ``chunk_id`` keys
        representing the document's table of contents. Returns an empty
        list if no valid TOC entries are found.
    """
    # Calculate input budget: half the model's context minus prompt overhead
    input_budget = int(chat_mdl.max_length * INPUT_UTILIZATION) - num_tokens_from_string(
        TOC_FROM_TEXT_USER + TOC_FROM_TEXT_SYSTEM
    )

    # Cap batch size at 1024 tokens to keep LLM responses focused
    input_budget = 1024 if input_budget > 1024 else input_budget
    chunk_sections = split_chunks(chunks, input_budget)
    titles = []

    # Launch parallel async tasks for each chunk batch
    chunks_res = []
    tasks = []
    for i, chunk in enumerate(chunk_sections):
        if not chunk:
            continue
        chunks_res.append({"chunks": chunk})
        tasks.append(asyncio.create_task(gen_toc_from_text(chunks_res[-1], chat_mdl, callback)))
    try:
        await asyncio.gather(*tasks, return_exceptions=False)
    except Exception as e:
        logging.error(f"Error generating TOC: {e}")
        # Cancel all remaining tasks on failure
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise

    # Collect all TOC entries from batch results
    for chunk in chunks_res:
        titles.extend(chunk.get("toc", []))

    # Filter out invalid entries (sentinel value -1, numeric-only titles, overly long titles)
    prune = len(titles) > 512
    max_len = 12 if prune else 22
    filtered = []
    for x in titles:
        if not isinstance(x, dict) or not x.get("title") or x["title"] == "-1":
            continue
        # Skip titles that are too long (likely content, not headings)
        if len(rag_tokenizer.tokenize(x["title"]).split(" ")) > max_len:
            continue
        # Skip titles that are purely numeric/punctuation (page numbers, etc.)
        if re.match(r"[0-9,.()/ -]+$", x["title"]):
            continue
        filtered.append(x)

    logging.info(f"\n\nFiltered TOC sections:\n{filtered}")
    if not filtered:
        return []

    # Extract raw title strings for hierarchy level assignment
    raw_structure = [x.get("title", "") for x in filtered]

    # Use LLM to assign hierarchy levels (e.g., 1, 1.1, 1.1.1)
    toc_with_levels = await assign_toc_levels(raw_structure, chat_mdl, {"temperature": 0.0, "top_p": 0.9})
    if not toc_with_levels:
        return []

    # Merge level assignments with source chunk IDs, optionally pruning deep levels
    prune = len(toc_with_levels) > 512
    max_lvl = "0"
    sorted_list = sorted([t.get("level", "0") for t in toc_with_levels if isinstance(t, dict)])
    if sorted_list:
        max_lvl = sorted_list[-1]
    merged = []
    for _, (toc_item, src_item) in enumerate(zip(toc_with_levels, filtered)):
        # When pruning, skip the deepest hierarchy level to reduce noise
        if prune and toc_item.get("level", "0") >= max_lvl:
            continue
        merged.append({
            "level": toc_item.get("level", "0"),
            "title": toc_item.get("title", ""),
            "chunk_id": src_item.get("chunk_id", ""),
        })

    return merged


TOC_RELEVANCE_SYSTEM = load_prompt("toc_relevance_system")
TOC_RELEVANCE_USER = load_prompt("toc_relevance_user")
async def relevant_chunks_with_toc(query: str, toc: list[dict], chat_mdl, topn: int = 6):
    """Identify relevant chunks by scoring TOC entries against a query.

    Uses the LLM to score each TOC entry's relevance to the query on a
    0-5 scale, then maps scores back to chunk IDs. Chunks are returned
    if their average TOC-based score meets a minimum threshold.

    Args:
        query: The user's search query string.
        toc: A list of TOC entry dicts, each with ``level``, ``title``,
            and ``ids`` (list of associated chunk IDs) keys.
        chat_mdl: The LLM chat model instance.
        topn: Maximum number of relevant chunks to return.

    Returns:
        A list of ``(chunk_id, score)`` tuples for chunks scoring >= 0.3,
        limited to ``topn`` entries. Returns an empty list on error.
    """
    import numpy as np
    try:
        ans = await gen_json(
            PROMPT_JINJA_ENV.from_string(TOC_RELEVANCE_SYSTEM).render(),
            PROMPT_JINJA_ENV.from_string(TOC_RELEVANCE_USER).render(query=query, toc_json="[\n%s\n]\n" % "\n".join(
                [json.dumps({"level": d["level"], "title": d["title"]}, ensure_ascii=False) for d in toc])),
            chat_mdl,
            gen_conf={"temperature": 0.0, "top_p": 0.9}
        )
        # Map TOC scores back to individual chunk IDs
        id2score = {}
        for ti, sc in zip(toc, ans):
            if not isinstance(sc, dict) or sc.get("score", -1) < 1:
                continue
            # Normalize score to 0-1 range (original is 0-5)
            for id in ti.get("ids", []):
                if id not in id2score:
                    id2score[id] = []
                id2score[id].append(sc["score"] / 5.)
        # Average multiple TOC scores for the same chunk
        for id in id2score.keys():
            id2score[id] = np.mean(id2score[id])
        # Filter by minimum threshold and limit to topn
        return [(id, sc) for id, sc in list(id2score.items()) if sc >= 0.3][:topn]
    except Exception as e:
        logging.exception(e)
    return []


META_DATA = load_prompt("meta_data")
async def gen_metadata(chat_mdl, schema: dict, content: str):
    """Extract structured metadata from content according to a JSON schema.

    Uses the LLM to analyze document content and extract metadata fields
    defined by the provided schema. For fields with enum constraints,
    the prompt enforces strict matching against the allowed values.

    Args:
        chat_mdl: The LLM chat model instance.
        schema: A JSON schema dict defining the metadata fields to extract,
            with ``properties`` containing field definitions.
        content: The document content to extract metadata from.

    Returns:
        The LLM's extracted metadata as a raw string (typically JSON).
    """
    template = PROMPT_JINJA_ENV.from_string(META_DATA)
    # Enhance enum field descriptions with strict matching instructions
    for k, desc in schema["properties"].items():
        if "enum" in desc and not desc.get("enum"):
            del desc["enum"]
        if desc.get("enum"):
            desc["description"] += "\n** Extracted values must strictly match the given list specified by `enum`. **"
    system_prompt = template.render(content=content, schema=schema)
    user_prompt = "Output: "
    _, msg = message_fit_in(form_message(system_prompt, user_prompt), chat_mdl.max_length)
    ans = await chat_mdl.async_chat(msg[0]["content"], msg[1:])
    return re.sub(r"^.*</think>", "", ans, flags=re.DOTALL)


SUFFICIENCY_CHECK = load_prompt("sufficiency_check")
async def sufficiency_check(chat_mdl, question: str, ret_content: str):
    """Check if retrieved content is sufficient to answer a question.

    Uses the LLM to evaluate whether the retrieved documents contain
    enough information to fully answer the user's question, identifying
    any missing information that might require additional retrieval.

    Args:
        chat_mdl: The LLM chat model instance.
        question: The user's question to be answered.
        ret_content: The retrieved document content to evaluate.

    Returns:
        A dict with sufficiency assessment fields (e.g., ``sufficient``,
        ``missing_info``), or an empty dict on error.
    """
    try:
        return await gen_json(
            PROMPT_JINJA_ENV.from_string(SUFFICIENCY_CHECK).render(question=question, retrieved_docs=ret_content),
            "Output:\n",
            chat_mdl
        )
    except Exception as e:
        logging.exception(e)
    return {}


MULTI_QUERIES_GEN = load_prompt("multi_queries_gen")
async def multi_queries_gen(chat_mdl, question: str, query:str, missing_infos:list[str], ret_content: str):
    """Generate additional search queries to fill information gaps.

    When a sufficiency check identifies missing information, this function
    produces targeted follow-up queries designed to retrieve the specific
    content needed to fully answer the original question.

    Args:
        chat_mdl: The LLM chat model instance.
        question: The original user question.
        query: The original search query that was used.
        missing_infos: A list of identified information gaps from the
            sufficiency check.
        ret_content: The content already retrieved by prior queries.

    Returns:
        A dict containing generated follow-up queries, or an empty dict
        on error.
    """
    try:
        return await gen_json(
            PROMPT_JINJA_ENV.from_string(MULTI_QUERIES_GEN).render(
                original_question=question,
                original_query=query,
                missing_info="\n - ".join(missing_infos),
                retrieved_docs=ret_content
            ),
            "Output:\n",
            chat_mdl
        )
    except Exception as e:
        logging.exception(e)
    return {}
