"""Node execution dispatch table for agent workflow nodes.

Maps each OperatorType to a handler function that executes the node's logic.
Compute-heavy nodes (LLM generation, retrieval, code execution) are handled here
in Python, while lightweight nodes (switch, condition, merge) are handled inline
by the Node.js orchestrator and never dispatched to this worker.

LLM handlers call into the existing LLMBundle infrastructure.  Retrieval
handlers delegate to the ``search.Dealer`` stored in ``common.settings``.
External-tool handlers use ``requests``, subprocess, or third-party client
libraries (wrapped in try/except for missing dependencies).
"""

import asyncio
import json
import re
import smtplib
import subprocess
import textwrap
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests
from loguru import logger

from rag.agent.tools import (
    AkShareTool,
    ArxivTool,
    BingTool,
    CodeExecTool,
    CrawlerTool,
    DeepLTool,
    DuckDuckGoTool,
    EmailTool,
    ExeSQLTool,
    GitHubTool,
    GoogleMapsTool,
    GoogleScholarTool,
    GoogleTool,
    Jin10Tool,
    PubMedTool,
    QWeatherTool,
    RetrievalTool,
    SearxNGTool,
    TavilyTool,
    TuShareTool,
    WenCaiTool,
    WikipediaTool,
    YahooFinanceTool,
)

# Instantiate concrete tool implementations for handler registration
_tavily_tool = TavilyTool()
_wikipedia_tool = WikipediaTool()
_arxiv_tool = ArxivTool()
_bing_tool = BingTool()
_code_exec_tool = CodeExecTool()
_crawler_tool = CrawlerTool()
_deepl_tool = DeepLTool()
_duckduckgo_tool = DuckDuckGoTool()
_email_tool = EmailTool()
_exesql_tool = ExeSQLTool()
_github_tool = GitHubTool()
_google_tool = GoogleTool()
_google_maps_tool = GoogleMapsTool()
_google_scholar_tool = GoogleScholarTool()
_jin10_tool = Jin10Tool()
_pubmed_tool = PubMedTool()
_qweather_tool = QWeatherTool()
_retrieval_tool = RetrievalTool()
_searxng_tool = SearxNGTool()
_akshare_tool = AkShareTool()
_tushare_tool = TuShareTool()
_wencai_tool = WenCaiTool()
_yahoofinance_tool = YahooFinanceTool()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_chat_model(tenant_id: str, config: dict):
    """Instantiate an LLMBundle for chat using tenant credentials.

    Resolves the model by explicit name in *config* or falls back to the
    tenant's default chat model.

    Args:
        tenant_id: Multi-tenant isolation identifier.
        config: Node config that may contain ``model_name`` or ``llm_id``.

    Returns:
        An ``LLMBundle`` ready for ``async_chat``.

    Raises:
        LookupError: If no suitable model is found for the tenant.
    """
    from common.constants import LLMType
    from db.joint_services.tenant_model_service import (
        get_model_config_by_type_and_name,
        get_tenant_default_model_by_type,
    )
    from db.services.llm_service import LLMBundle

    model_name = config.get("model_name") or config.get("llm_id", "")
    lang = config.get("language", "English")

    # Resolve model config by explicit name or tenant default
    if model_name:
        model_config = get_model_config_by_type_and_name(tenant_id, LLMType.CHAT, model_name)
    else:
        model_config = get_tenant_default_model_by_type(tenant_id, LLMType.CHAT)

    return LLMBundle(tenant_id, model_config, lang=lang)


def _get_embedding_model(tenant_id: str, config: dict):
    """Instantiate an LLMBundle for embedding using tenant credentials.

    Args:
        tenant_id: Multi-tenant isolation identifier.
        config: Node config that may contain ``embedding_model``.

    Returns:
        An ``LLMBundle`` ready for ``encode_queries``.
    """
    from common.constants import LLMType
    from db.joint_services.tenant_model_service import (
        get_model_config_by_type_and_name,
        get_tenant_default_model_by_type,
    )
    from db.services.llm_service import LLMBundle

    model_name = config.get("embedding_model", "")
    if model_name:
        model_config = get_model_config_by_type_and_name(tenant_id, LLMType.EMBEDDING, model_name)
    else:
        model_config = get_tenant_default_model_by_type(tenant_id, LLMType.EMBEDDING)

    return LLMBundle(tenant_id, model_config)


def _run_async(coro):
    """Run an async coroutine synchronously.

    Uses ``asyncio.run`` when no loop is running, otherwise spawns a
    background thread so that nested async calls do not deadlock.

    Args:
        coro: Awaitable coroutine to execute.

    Returns:
        The coroutine's return value.
    """
    import queue
    import threading

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        # No event loop — safe to use asyncio.run directly
        return asyncio.run(coro)

    # An event loop is already running; bridge via a background thread
    result_queue: queue.Queue = queue.Queue()

    def _runner():
        try:
            result_queue.put((True, asyncio.run(coro)))
        except Exception as exc:
            result_queue.put((False, exc))

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    thread.join()

    success, value = result_queue.get_nowait()
    if success:
        return value
    raise value


# ---------------------------------------------------------------------------
# Node Handler: execute_node (dispatch entry point)
# ---------------------------------------------------------------------------


def execute_node(task: dict) -> dict:
    """Execute a single agent node based on its type.

    Dispatches to the appropriate handler function from the NODE_HANDLERS
    registry. Returns a result dict with 'output_data' on success or 'error'
    on failure.

    Args:
        task: Agent node task containing node_type, input_data, config, tenant_id.
            Expected keys: node_type (str), input_data (dict), config (dict),
            tenant_id (str), run_id (str), node_id (str).

    Returns:
        Dict with 'output_data' key containing the node's execution result,
        or 'error' key if execution failed.
    """
    node_type = task.get("node_type", "")
    input_data = task.get("input_data", {})
    config = task.get("config", {})
    tenant_id = task.get("tenant_id", "")

    # Look up the handler for this node type
    handler = NODE_HANDLERS.get(node_type)
    if not handler:
        logger.warning(f"Unknown node type: {node_type}")
        return {"error": f"Unknown node type: {node_type}"}

    try:
        result = handler(input_data, config, tenant_id)
        return result
    except Exception as e:
        logger.exception(f"Node execution failed: type={node_type}, error={e}")
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# Node Handlers (LLM / AI)
# ---------------------------------------------------------------------------


def handle_generate(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute an LLM generation node.

    Resolves the tenant's chat model via ``LLMBundle`` and calls
    ``async_chat`` with the prompt, system message, and generation
    parameters from *config*.

    Args:
        input_data: Input from upstream nodes, typically containing 'output' text.
        config: Node configuration including model_name, temperature, max_tokens,
            system_prompt, etc.
        tenant_id: Multi-tenant isolation identifier for LLM credential lookup.

    Returns:
        Dict with 'output_data' containing the generated text.
    """
    prompt = str(input_data.get("output", ""))
    system_prompt = config.get("system_prompt", "You are a helpful assistant.")
    temperature = config.get("temperature", 0.7)
    max_tokens = config.get("max_tokens", 2048)

    logger.info(f"generate node: prompt length={len(prompt)}, model={config.get('model_name', 'default')}")

    chat_mdl = _get_chat_model(tenant_id, config)

    # Build chat history from input
    history = [{"role": "user", "content": prompt}]
    gen_conf = {"temperature": temperature, "max_tokens": max_tokens}

    answer = _run_async(chat_mdl.async_chat(system_prompt, history, gen_conf))
    return {"output_data": {"output": answer}}


def handle_categorize(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute an LLM categorization node.

    Builds a classification prompt from the configured categories and uses
    the tenant's chat model to pick the best-matching category.

    Args:
        input_data: Input text to categorize (under 'output' key).
        config: Must include ``categories`` (list of dicts with 'name' and
            optional 'description') and optional ``system_prompt``.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing the input text and matched_branch.
    """
    text = str(input_data.get("output", ""))
    categories = config.get("categories", [])

    # Build a structured classification prompt listing each category
    if categories:
        cat_descriptions = "\n".join(
            f"- {c['name']}: {c.get('description', '')}" for c in categories
        )
        cat_names = [c["name"] for c in categories]
    else:
        cat_descriptions = "No categories defined."
        cat_names = []

    system_prompt = config.get("system_prompt", textwrap.dedent("""\
        You are a text classifier. Given the input text, classify it into
        exactly ONE of the following categories. Reply with only the category
        name, nothing else.

        Categories:
        {categories}""")).format(categories=cat_descriptions)

    logger.info(f"categorize node: text length={len(text)}, categories={cat_names}")

    chat_mdl = _get_chat_model(tenant_id, config)
    history = [{"role": "user", "content": text}]
    gen_conf = {"temperature": 0.1, "max_tokens": 256}

    answer = _run_async(chat_mdl.async_chat(system_prompt, history, gen_conf))
    answer_text = str(answer).strip()

    # Match the LLM response to a known category name (case-insensitive)
    matched_branch = "default"
    for name in cat_names:
        if name.lower() in answer_text.lower():
            matched_branch = name
            break

    return {"output_data": {"output": text, "matched_branch": matched_branch}}


def handle_rewrite(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a query rewrite node using LLM.

    Applies a rewrite prompt template (from config or default) to the input
    query to improve retrieval quality.

    Args:
        input_data: Original query text to rewrite (under 'output' key).
        config: Rewrite prompt template (``prompt_template``) and parameters.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing the rewritten query.
    """
    query = str(input_data.get("output", ""))

    default_template = (
        "Rewrite the following query to make it more suitable for "
        "information retrieval. Keep the meaning but improve clarity "
        "and add relevant keywords.\n\nOriginal query: {query}\n\nRewritten query:"
    )
    prompt_template = config.get("prompt_template", default_template)

    # Render the template with the query
    prompt = prompt_template.replace("{query}", query)

    logger.info(f"rewrite node: query length={len(query)}")

    chat_mdl = _get_chat_model(tenant_id, config)
    history = [{"role": "user", "content": prompt}]
    gen_conf = {"temperature": 0.3, "max_tokens": 512}

    answer = _run_async(chat_mdl.async_chat(
        "You are a query rewriting assistant.", history, gen_conf
    ))
    return {"output_data": {"output": str(answer).strip()}}


def handle_relevant(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a relevance check node using LLM.

    Asks the LLM to judge whether the retrieved context is relevant to
    the query and returns a boolean flag plus a numeric score.

    Args:
        input_data: Must contain 'output' (context) and optionally 'query'.
        config: Relevance threshold (``threshold``, default 0.5).
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing 'output', 'is_relevant', and 'score'.
    """
    context = str(input_data.get("output", ""))
    query_text = str(input_data.get("query", input_data.get("question", "")))
    threshold = config.get("threshold", 0.5)

    system_prompt = (
        "You are a relevance judge. Given a query and a context passage, "
        "rate how relevant the context is to the query on a scale of 0.0 to 1.0. "
        "Reply with ONLY a JSON object: {\"score\": <float>, \"reason\": \"<brief>\"}"
    )
    user_msg = f"Query: {query_text}\n\nContext: {context}"

    logger.info(f"relevant node: query length={len(query_text)}, context length={len(context)}")

    chat_mdl = _get_chat_model(tenant_id, config)
    history = [{"role": "user", "content": user_msg}]
    gen_conf = {"temperature": 0.1, "max_tokens": 256}

    answer = _run_async(chat_mdl.async_chat(system_prompt, history, gen_conf))

    # Parse the LLM response to extract score
    score = threshold
    try:
        # Attempt to extract JSON from the response
        json_match = re.search(r"\{[^}]+\}", str(answer))
        if json_match:
            parsed = json.loads(json_match.group())
            score = float(parsed.get("score", threshold))
    except (json.JSONDecodeError, ValueError):
        # Fall back to searching for a bare float in the response
        float_match = re.search(r"(\d+\.?\d*)", str(answer))
        if float_match:
            score = float(float_match.group(1))

    is_relevant = score >= threshold
    return {"output_data": {
        "output": context,
        "is_relevant": is_relevant,
        "score": score,
    }}


# ---------------------------------------------------------------------------
# Node Handlers (Retrieval)
# ---------------------------------------------------------------------------


def handle_retrieval(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a RAG retrieval node using the existing search infrastructure.

    Performs hybrid search (BM25 + vector) against OpenSearch using the
    ``search.Dealer`` stored in ``common.settings.retriever``.

    Args:
        input_data: Query text (under 'output' key) and optional filters.
        config: Knowledge base IDs (``kb_ids``), ``top_k``, ``similarity``
            threshold, ``embedding_model``, etc.
        tenant_id: Multi-tenant isolation identifier for ABAC filtering.

    Returns:
        Dict with 'output_data' containing retrieved chunks and output text.
    """
    from common import settings
    from rag.nlp.search import index_name

    query_text = str(input_data.get("output", ""))
    kb_ids = config.get("kb_ids", [])
    top_k = int(config.get("top_k", config.get("topk", 10)))
    similarity = float(config.get("similarity", 0.1))

    logger.info(f"retrieval node: query='{query_text[:80]}', kb_ids={kb_ids}, top_k={top_k}")

    # Ensure the retriever has been initialized
    if not settings.retriever:
        return {"error": "Search retriever not initialized. Ensure settings.init_settings() was called."}

    # Build index names from knowledge base IDs
    if kb_ids:
        idx_names = [index_name(kid) for kid in kb_ids]
    else:
        # Fall back to tenant-level index
        idx_names = [index_name(tenant_id)]

    # Prepare embedding model for vector search (optional)
    emb_mdl = None
    try:
        emb_mdl = _get_embedding_model(tenant_id, config)
    except Exception as emb_err:
        logger.warning(f"Could not load embedding model, falling back to text-only search: {emb_err}")

    # Build the search request
    req = {
        "question": query_text,
        "topk": top_k,
        "similarity": similarity,
        "size": top_k,
        "page": 1,
        "kb_ids": kb_ids or None,
    }

    search_result = _run_async(settings.retriever.search(req, idx_names, kb_ids, emb_mdl))

    # Format chunks from field data
    chunks = []
    if search_result.field:
        for doc_id in search_result.ids:
            chunk_data = {}
            for field_name, field_dict in search_result.field.items():
                if doc_id in field_dict:
                    chunk_data[field_name] = field_dict[doc_id]
            chunk_data["id"] = doc_id
            # Use highlight content if available, else fall back to raw content
            if search_result.highlight and doc_id in search_result.highlight:
                chunk_data["highlight"] = search_result.highlight[doc_id]
            chunks.append(chunk_data)

    # Build a concatenated text output from retrieved chunks
    output_parts = []
    for c in chunks:
        content = c.get("content_ltks", c.get("highlight", ""))
        if content:
            output_parts.append(str(content))

    output_text = "\n\n---\n\n".join(output_parts) if output_parts else ""

    return {"output_data": {
        "output": output_text,
        "chunks": chunks,
        "total": search_result.total,
        "keywords": search_result.keywords or [],
    }}


def handle_wikipedia(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a Wikipedia search node using the WikipediaTool.

    Args:
        input_data: Search query text (uses 'query' or 'output' key).
        config: Language and result count settings.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing Wikipedia search results.
    """
    # Delegate to the WikipediaTool implementation (no credentials needed)
    result = _wikipedia_tool.execute(input_data, config)

    # Check for errors from the tool
    if "error" in result:
        return {"error": result["error"]}

    return {"output_data": {"output": str(result.get("result", [])), "results": result.get("result", [])}}


def handle_tavily(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a Tavily web search node using the TavilyTool.

    Credentials are expected in config['credentials'] (injected by the
    Node.js orchestrator from the tool credential service).

    Args:
        input_data: Search query text (uses 'query' or 'output' key).
        config: Tavily search parameters and optional credentials dict.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing web search results.
    """
    # Extract credentials from config (injected by Node.js orchestrator)
    credentials = config.get("credentials")
    result = _tavily_tool.execute(input_data, config, credentials)

    # Check for errors from the tool
    if "error" in result:
        return {"error": result["error"]}

    return {"output_data": {
        "output": result.get("answer", str(result.get("result", []))),
        "results": result.get("result", []),
    }}


def handle_pubmed(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a PubMed search node using Biopython Entrez or direct API.

    Searches the NCBI PubMed database for biomedical literature matching
    the query. Falls back to the REST API if Biopython is unavailable.

    Args:
        input_data: Medical/scientific search query (under 'output' key).
        config: ``max_results`` (default 5) and optional ``email`` for Entrez.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing PubMed article results.
    """
    query_text = str(input_data.get("output", input_data.get("query", "")))
    max_results = int(config.get("max_results", 5))
    email = config.get("email", "agent@b-knowledge.local")

    logger.info(f"pubmed node: query='{query_text[:80]}', max_results={max_results}")

    try:
        from Bio import Entrez

        Entrez.email = email
        # Search PubMed for matching article IDs
        search_handle = Entrez.esearch(db="pubmed", term=query_text, retmax=max_results)
        search_results = Entrez.read(search_handle)
        search_handle.close()

        id_list = search_results.get("IdList", [])
        if not id_list:
            return {"output_data": {"output": "No PubMed results found.", "results": []}}

        # Fetch article summaries
        fetch_handle = Entrez.efetch(db="pubmed", id=",".join(id_list), rettype="abstract", retmode="xml")
        from Bio import Medline
        records = Medline.parse(fetch_handle)
        articles = []
        for record in records:
            articles.append({
                "pmid": record.get("PMID", ""),
                "title": record.get("TI", ""),
                "abstract": record.get("AB", ""),
                "authors": record.get("AU", []),
                "source": record.get("SO", ""),
            })
        fetch_handle.close()

        output_text = "\n\n".join(
            f"**{a['title']}** (PMID: {a['pmid']})\n{a['abstract']}"
            for a in articles
        )
        return {"output_data": {"output": output_text, "results": articles}}

    except ImportError:
        # Biopython not installed — fall back to NCBI E-utilities REST API
        logger.info("Biopython not available, falling back to PubMed REST API")

    try:
        # NCBI E-utilities REST search
        search_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
        search_resp = requests.get(search_url, params={
            "db": "pubmed", "term": query_text, "retmax": max_results,
            "retmode": "json",
        }, timeout=30)
        search_resp.raise_for_status()
        id_list = search_resp.json().get("esearchresult", {}).get("idlist", [])

        if not id_list:
            return {"output_data": {"output": "No PubMed results found.", "results": []}}

        # Fetch summaries
        summary_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
        summary_resp = requests.get(summary_url, params={
            "db": "pubmed", "id": ",".join(id_list), "retmode": "json",
        }, timeout=30)
        summary_resp.raise_for_status()
        result_data = summary_resp.json().get("result", {})

        articles = []
        for pmid in id_list:
            article = result_data.get(pmid, {})
            articles.append({
                "pmid": pmid,
                "title": article.get("title", ""),
                "source": article.get("source", ""),
                "authors": [a.get("name", "") for a in article.get("authors", [])],
            })

        output_text = "\n\n".join(
            f"**{a['title']}** (PMID: {a['pmid']}) - {a['source']}"
            for a in articles
        )
        return {"output_data": {"output": output_text, "results": articles}}

    except Exception as e:
        logger.error(f"PubMed search failed: {e}")
        return {"error": f"PubMed search failed: {e}"}


# ---------------------------------------------------------------------------
# Node Handlers (Code / Tools)
# ---------------------------------------------------------------------------


def handle_code(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a Python code snippet in a subprocess with timeout.

    Runs the code string from *config* as a subprocess, passing input_data
    as a JSON environment variable.  Captures stdout/stderr.

    Args:
        input_data: Input variables accessible to the code via the
            ``INPUT_DATA`` environment variable (JSON-encoded).
        config: Must include ``code`` (Python source string).  Optional
            ``timeout`` in seconds (default 30).
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing stdout, stderr, and return_code.
    """
    code = config.get("code", "")
    timeout_sec = int(config.get("timeout", 30))

    if not code.strip():
        return {"error": "No code provided in config.code"}

    logger.info(f"code node: code length={len(code)}, timeout={timeout_sec}s")

    # Inject input_data as JSON in the environment
    env_copy = {"INPUT_DATA": json.dumps(input_data)}

    # Wrap code with a preamble that makes input_data available
    wrapped_code = (
        "import json, os\n"
        "input_data = json.loads(os.environ.get('INPUT_DATA', '{}'))\n"
        + code
    )

    try:
        result = subprocess.run(
            ["python3", "-c", wrapped_code],
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            env={**dict(__import__("os").environ), **env_copy},
        )
        stdout = result.stdout.strip()
        stderr = result.stderr.strip()

        # Log non-zero exit codes as warnings
        if result.returncode != 0:
            logger.warning(f"code node exited with code {result.returncode}: {stderr[:200]}")

        return {"output_data": {
            "output": stdout or stderr,
            "stdout": stdout,
            "stderr": stderr,
            "return_code": result.returncode,
        }}
    except subprocess.TimeoutExpired:
        return {"error": f"Code execution timed out after {timeout_sec}s"}
    except Exception as e:
        return {"error": f"Code execution failed: {e}"}


def handle_github(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a GitHub API interaction node.

    Uses the GitHub REST API (v3) to perform operations such as listing
    issues, getting file contents, or searching code.

    Args:
        input_data: GitHub operation parameters (under 'output' key).
        config: Must include ``token`` (GitHub PAT).  Optional: ``repo``
            (owner/name), ``operation`` (list_issues, get_file, search_code,
            list_repos, get_repo), ``endpoint`` (raw API path override).
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing the GitHub API response.
    """
    token = config.get("token", config.get("credentials", {}).get("token", ""))
    repo = config.get("repo", "")
    operation = config.get("operation", "list_issues")
    endpoint = config.get("endpoint", "")

    if not token:
        return {"error": "GitHub token is required in config.token"}

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    base_url = "https://api.github.com"

    logger.info(f"github node: operation={operation}, repo={repo}")

    try:
        # Allow raw endpoint override for flexibility
        if endpoint:
            url = f"{base_url}{endpoint}" if endpoint.startswith("/") else endpoint
            resp = requests.get(url, headers=headers, timeout=30)
        elif operation == "list_issues":
            if not repo:
                return {"error": "repo is required for list_issues"}
            resp = requests.get(f"{base_url}/repos/{repo}/issues", headers=headers, timeout=30)
        elif operation == "get_file":
            if not repo:
                return {"error": "repo is required for get_file"}
            file_path = config.get("path", input_data.get("output", ""))
            resp = requests.get(
                f"{base_url}/repos/{repo}/contents/{file_path}",
                headers=headers, timeout=30,
            )
        elif operation == "search_code":
            query_text = input_data.get("output", "")
            q = f"{query_text} repo:{repo}" if repo else query_text
            resp = requests.get(
                f"{base_url}/search/code",
                params={"q": q},
                headers=headers, timeout=30,
            )
        elif operation == "list_repos":
            resp = requests.get(f"{base_url}/user/repos", headers=headers, timeout=30)
        elif operation == "get_repo":
            if not repo:
                return {"error": "repo is required for get_repo"}
            resp = requests.get(f"{base_url}/repos/{repo}", headers=headers, timeout=30)
        else:
            return {"error": f"Unknown GitHub operation: {operation}"}

        resp.raise_for_status()
        data = resp.json()

        return {"output_data": {
            "output": json.dumps(data, ensure_ascii=False)[:10000],
            "data": data,
        }}
    except requests.RequestException as e:
        return {"error": f"GitHub API error: {e}"}


def handle_sql(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a SQL query against PostgreSQL.

    Uses ``psycopg2`` to run a read-only query.  The connection string
    comes from *config* or falls back to the default database settings
    from ``config.py``.

    Args:
        input_data: May contain ``query`` key with the SQL text.
        config: Optional ``connection_string``, ``database``, ``host``,
            ``port``, ``user``, ``password``.  ``query`` if not in input_data.
            ``readonly`` (default True) to enforce read-only mode.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing query rows and column names.
    """
    import psycopg2

    sql = config.get("query", input_data.get("query", input_data.get("output", "")))
    readonly = config.get("readonly", True)

    if not sql.strip():
        return {"error": "No SQL query provided"}

    # Reject write operations when readonly is True
    if readonly:
        sql_upper = sql.strip().upper()
        if any(sql_upper.startswith(kw) for kw in ("INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE")):
            return {"error": "Write operations are not allowed in readonly mode"}

    logger.info(f"sql node: query length={len(sql)}, readonly={readonly}")

    # Resolve connection parameters from config or defaults
    conn_string = config.get("connection_string", "")
    if not conn_string:
        import config as app_config
        host = config.get("host", app_config.DB_HOST)
        port = config.get("port", app_config.DB_PORT)
        db_name = config.get("database", app_config.DB_NAME)
        user = config.get("user", app_config.DB_USER)
        password = config.get("password", app_config.DB_PASSWORD)
        conn_string = f"host={host} port={port} dbname={db_name} user={user} password={password}"

    try:
        conn = psycopg2.connect(conn_string)
        # Set read-only if configured
        if readonly:
            conn.set_session(readonly=True)

        cur = conn.cursor()
        cur.execute(sql)

        # Fetch results for SELECT queries
        if cur.description:
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            # Convert to list of dicts for JSON serialization
            results = [dict(zip(columns, row)) for row in rows]
            output_text = json.dumps(results, default=str, ensure_ascii=False)
        else:
            results = []
            output_text = f"Query executed successfully. Rows affected: {cur.rowcount}"

        cur.close()
        conn.close()

        return {"output_data": {
            "output": output_text[:10000],
            "rows": results[:1000],
            "columns": columns if cur.description else [],
        }}
    except Exception as e:
        return {"error": f"SQL execution failed: {e}"}


def handle_api(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute an HTTP API call node.

    Makes an HTTP request using ``requests`` with method, URL, headers,
    and body from *config*.

    Args:
        input_data: Request body override or query parameters.
        config: Must include ``url``.  Optional: ``method`` (GET/POST/PUT/DELETE,
            default GET), ``headers`` (dict), ``body`` (dict or string),
            ``timeout`` (seconds, default 30), ``params`` (query params dict).
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing the API response.
    """
    url = config.get("url", "")
    method = config.get("method", "GET").upper()
    headers = config.get("headers", {})
    body = config.get("body", input_data.get("output", None))
    timeout_sec = int(config.get("timeout", 30))
    params = config.get("params", {})

    if not url:
        return {"error": "URL is required in config.url"}

    logger.info(f"api node: {method} {url}")

    try:
        resp = requests.request(
            method=method,
            url=url,
            headers=headers,
            json=body if isinstance(body, dict) else None,
            data=body if isinstance(body, str) else None,
            params=params,
            timeout=timeout_sec,
        )

        # Try to parse response as JSON, fall back to text
        try:
            resp_data = resp.json()
            output_text = json.dumps(resp_data, ensure_ascii=False)[:10000]
        except (json.JSONDecodeError, ValueError):
            resp_data = resp.text
            output_text = resp.text[:10000]

        return {"output_data": {
            "output": output_text,
            "status_code": resp.status_code,
            "data": resp_data,
            "headers": dict(resp.headers),
        }}
    except requests.RequestException as e:
        return {"error": f"API call failed: {e}"}


def handle_email(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute an email sending node via SMTP.

    Sends an email using ``smtplib`` with settings from *config*.
    Supports TLS via STARTTLS.

    Args:
        input_data: May contain ``to``, ``subject``, ``body`` overrides.
        config: SMTP settings: ``smtp_host``, ``smtp_port`` (default 587),
            ``smtp_user``, ``smtp_password``, ``from_addr``, ``to``,
            ``subject``, ``body``, ``use_tls`` (default True).
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' confirming send status.
    """
    smtp_host = config.get("smtp_host", "")
    smtp_port = int(config.get("smtp_port", 587))
    smtp_user = config.get("smtp_user", "")
    smtp_password = config.get("smtp_password", "")
    from_addr = config.get("from_addr", smtp_user)
    to_addr = config.get("to", input_data.get("to", ""))
    subject = config.get("subject", input_data.get("subject", "Agent Notification"))
    body = config.get("body", input_data.get("body", input_data.get("output", "")))
    use_tls = config.get("use_tls", True)

    if not smtp_host:
        return {"error": "SMTP host is required in config.smtp_host"}
    if not to_addr:
        return {"error": "Recipient address is required"}

    logger.info(f"email node: to={to_addr}, subject={subject}")

    try:
        msg = MIMEMultipart()
        msg["From"] = from_addr
        msg["To"] = to_addr
        msg["Subject"] = subject
        msg.attach(MIMEText(str(body), "plain", "utf-8"))

        server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)
        # Upgrade to TLS if configured
        if use_tls:
            server.starttls()
        # Authenticate if credentials provided
        if smtp_user and smtp_password:
            server.login(smtp_user, smtp_password)
        server.sendmail(from_addr, to_addr.split(","), msg.as_string())
        server.quit()

        return {"output_data": {"output": f"Email sent to {to_addr}"}}
    except Exception as e:
        return {"error": f"Email sending failed: {e}"}


# ---------------------------------------------------------------------------
# Node Handlers (Data / Search)
# ---------------------------------------------------------------------------


def handle_template(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a string template interpolation node.

    Replaces {{variable}} placeholders in the template with input values.
    This is a lightweight operation but may be dispatched to Python if
    the orchestrator determines it should run here.

    Args:
        input_data: Variable values for template substitution.
        config: Template string with {{variable}} placeholders.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing the interpolated string.
    """
    template_str = config.get("template", "")
    # Replace {{key}} placeholders with input values
    for key, value in input_data.items():
        template_str = template_str.replace(f"{{{{{key}}}}}", str(value))
    return {"output_data": {"output": template_str}}


def handle_keyword_extract(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a keyword extraction node using NLP term weight infrastructure.

    Uses the ``Dealer`` from ``rag.nlp.term_weight`` to compute weighted
    keywords via TF-IDF, NER, and POS features.

    Args:
        input_data: Text to extract keywords from (under 'output' key).
        config: ``top_n`` (default 10) for max keywords to return.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing extracted keywords with weights.
    """
    from rag.nlp.term_weight import Dealer as TermWeightDealer

    text = str(input_data.get("output", ""))
    top_n = int(config.get("top_n", config.get("topn", 10)))

    if not text.strip():
        return {"output_data": {"output": text, "keywords": []}}

    logger.info(f"keyword_extract node: text length={len(text)}, top_n={top_n}")

    dealer = TermWeightDealer()
    # Tokenize and compute term weights
    tokens = dealer.pretoken(text, num=True)
    merged = dealer.token_merge(tokens)

    if not merged:
        return {"output_data": {"output": text, "keywords": []}}

    # Compute normalized weights and sort by weight descending
    weighted = dealer.weights(merged, preprocess=False)
    weighted.sort(key=lambda x: x[1], reverse=True)

    # Take top_n keywords
    keywords = [{"term": t, "weight": round(w, 4)} for t, w in weighted[:top_n]]
    keyword_terms = [kw["term"] for kw in keywords]

    return {"output_data": {
        "output": ", ".join(keyword_terms),
        "keywords": keywords,
    }}


def handle_loop(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a loop control node.

    Manages iteration state for loop constructs in the graph.
    The actual loop orchestration (re-enqueueing body nodes) is handled
    by the Node.js graph executor.

    Args:
        input_data: Current iteration data and loop counter.
        config: Max iterations and break conditions.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing iteration state.
    """
    max_iterations = config.get("max_iterations", 10)
    current_iteration = input_data.get("iteration", 0)

    # Increment iteration counter for the next pass
    next_iteration = current_iteration + 1

    logger.info(f"Loop node: iteration {next_iteration}/{max_iterations}")
    return {"output_data": {
        "output": input_data.get("output", ""),
        "iteration": next_iteration,
        "max_iterations": max_iterations,
        "should_continue": next_iteration < max_iterations,
    }}


# ---------------------------------------------------------------------------
# External Tool Handlers
# ---------------------------------------------------------------------------


def handle_duckduckgo(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a DuckDuckGo web search using the duckduckgo_search library.

    Args:
        input_data: Search query (under 'output' key).
        config: ``max_results`` (default 5).
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing search results.
    """
    query_text = str(input_data.get("output", input_data.get("query", "")))
    max_results = int(config.get("max_results", 5))

    logger.info(f"duckduckgo node: query='{query_text[:80]}'")

    try:
        from duckduckgo_search import DDGS
    except ImportError:
        return {"error": "duckduckgo_search library is not installed. Run: pip install duckduckgo-search"}

    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query_text, max_results=max_results))

        output_text = "\n\n".join(
            f"**{r.get('title', '')}**\n{r.get('body', '')}\n{r.get('href', '')}"
            for r in results
        )
        return {"output_data": {"output": output_text, "results": results}}
    except Exception as e:
        return {"error": f"DuckDuckGo search failed: {e}"}


def handle_google(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a Google Custom Search API query.

    Args:
        input_data: Search query (under 'output' key).
        config: ``api_key`` and ``cx`` (Custom Search Engine ID) required.
            Optional ``max_results`` (default 5).
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing search results.
    """
    query_text = str(input_data.get("output", input_data.get("query", "")))
    api_key = config.get("api_key", config.get("credentials", {}).get("api_key", ""))
    cx = config.get("cx", config.get("credentials", {}).get("cx", ""))
    max_results = int(config.get("max_results", 5))

    if not api_key or not cx:
        return {"error": "Google Custom Search requires config.api_key and config.cx"}

    logger.info(f"google node: query='{query_text[:80]}'")

    try:
        resp = requests.get(
            "https://www.googleapis.com/customsearch/v1",
            params={"key": api_key, "cx": cx, "q": query_text, "num": min(max_results, 10)},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        results = [
            {"title": item.get("title", ""), "link": item.get("link", ""), "snippet": item.get("snippet", "")}
            for item in data.get("items", [])
        ]
        output_text = "\n\n".join(f"**{r['title']}**\n{r['snippet']}\n{r['link']}" for r in results)
        return {"output_data": {"output": output_text, "results": results}}
    except requests.RequestException as e:
        return {"error": f"Google search failed: {e}"}


def handle_google_scholar(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a Google Scholar search via scholarly library or SerpAPI.

    Falls back to a basic web scrape if scholarly is unavailable.

    Args:
        input_data: Search query (under 'output' key).
        config: Optional ``max_results`` (default 5), ``api_key`` for SerpAPI.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing scholar article results.
    """
    query_text = str(input_data.get("output", input_data.get("query", "")))
    max_results = int(config.get("max_results", 5))

    logger.info(f"google_scholar node: query='{query_text[:80]}'")

    # Try using the scholarly library first
    try:
        from scholarly import scholarly

        search_results = scholarly.search_pubs(query_text)
        articles = []
        for i, result in enumerate(search_results):
            if i >= max_results:
                break
            bib = result.get("bib", {})
            articles.append({
                "title": bib.get("title", ""),
                "author": bib.get("author", ""),
                "abstract": bib.get("abstract", ""),
                "year": bib.get("pub_year", ""),
                "url": result.get("pub_url", result.get("eprint_url", "")),
            })

        output_text = "\n\n".join(
            f"**{a['title']}** ({a['year']})\n{a['abstract'][:300]}"
            for a in articles
        )
        return {"output_data": {"output": output_text, "results": articles}}
    except ImportError:
        logger.info("scholarly library not available, falling back to SerpAPI")
    except Exception as e:
        logger.warning(f"scholarly search failed: {e}")

    # Fall back to SerpAPI if api_key is provided
    api_key = config.get("api_key", config.get("credentials", {}).get("api_key", ""))
    if api_key:
        try:
            resp = requests.get(
                "https://serpapi.com/search",
                params={"engine": "google_scholar", "q": query_text, "api_key": api_key, "num": max_results},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            results = [
                {"title": r.get("title", ""), "snippet": r.get("snippet", ""), "link": r.get("link", "")}
                for r in data.get("organic_results", [])
            ]
            output_text = "\n\n".join(f"**{r['title']}**\n{r['snippet']}" for r in results)
            return {"output_data": {"output": output_text, "results": results}}
        except requests.RequestException as e:
            return {"error": f"SerpAPI Google Scholar search failed: {e}"}

    return {"error": "Google Scholar requires the 'scholarly' library or config.api_key for SerpAPI"}


def handle_arxiv(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute an arXiv paper search using the arXiv API.

    Uses the ``arxiv`` Python library if available, otherwise falls back
    to the Atom XML REST API.

    Args:
        input_data: Search query (under 'output' key).
        config: Optional ``max_results`` (default 5), ``sort_by``.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing arXiv paper results.
    """
    query_text = str(input_data.get("output", input_data.get("query", "")))
    max_results = int(config.get("max_results", 5))

    logger.info(f"arxiv node: query='{query_text[:80]}'")

    # Try using the arxiv library
    try:
        import arxiv

        client = arxiv.Client()
        search = arxiv.Search(query=query_text, max_results=max_results)
        papers = []
        for result in client.results(search):
            papers.append({
                "title": result.title,
                "summary": result.summary[:500],
                "authors": [a.name for a in result.authors],
                "published": str(result.published.date()),
                "url": result.entry_id,
                "pdf_url": result.pdf_url,
            })

        output_text = "\n\n".join(
            f"**{p['title']}** ({p['published']})\n{p['summary'][:300]}\n{p['url']}"
            for p in papers
        )
        return {"output_data": {"output": output_text, "results": papers}}
    except ImportError:
        logger.info("arxiv library not available, falling back to REST API")
    except Exception as e:
        logger.warning(f"arxiv library search failed: {e}")

    # Fall back to arXiv Atom API
    try:
        resp = requests.get(
            "http://export.arxiv.org/api/query",
            params={"search_query": f"all:{query_text}", "max_results": max_results},
            timeout=30,
        )
        resp.raise_for_status()

        # Parse Atom XML response
        import xml.etree.ElementTree as ET
        root = ET.fromstring(resp.text)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        papers = []
        for entry in root.findall("atom:entry", ns):
            papers.append({
                "title": (entry.find("atom:title", ns).text or "").strip(),
                "summary": (entry.find("atom:summary", ns).text or "").strip()[:500],
                "url": entry.find("atom:id", ns).text or "",
                "published": (entry.find("atom:published", ns).text or "")[:10],
            })

        output_text = "\n\n".join(
            f"**{p['title']}** ({p['published']})\n{p['summary'][:300]}\n{p['url']}"
            for p in papers
        )
        return {"output_data": {"output": output_text, "results": papers}}
    except Exception as e:
        return {"error": f"arXiv search failed: {e}"}


def handle_deepl(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a DeepL translation node via the DeepL REST API.

    Args:
        input_data: Text to translate (under 'output' key).
        config: Must include ``auth_key`` (DeepL API key).  Optional:
            ``target_lang`` (default 'EN'), ``source_lang``.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing translated text.
    """
    text = str(input_data.get("output", ""))
    auth_key = config.get("auth_key", config.get("credentials", {}).get("auth_key", ""))
    target_lang = config.get("target_lang", "EN")
    source_lang = config.get("source_lang", "")

    if not auth_key:
        return {"error": "DeepL auth_key is required in config.auth_key"}

    logger.info(f"deepl node: text length={len(text)}, target_lang={target_lang}")

    # Use free or pro endpoint based on key suffix
    if auth_key.endswith(":fx"):
        api_url = "https://api-free.deepl.com/v2/translate"
    else:
        api_url = "https://api.deepl.com/v2/translate"

    try:
        payload = {
            "text": [text],
            "target_lang": target_lang,
        }
        if source_lang:
            payload["source_lang"] = source_lang

        resp = requests.post(
            api_url,
            headers={"Authorization": f"DeepL-Auth-Key {auth_key}"},
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        translations = resp.json().get("translations", [])
        translated_text = translations[0]["text"] if translations else ""

        return {"output_data": {"output": translated_text, "detected_source_lang": translations[0].get("detected_source_language", "") if translations else ""}}
    except requests.RequestException as e:
        return {"error": f"DeepL translation failed: {e}"}


def handle_qweather(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a QWeather API query for weather data.

    Args:
        input_data: Location query (under 'output' key, e.g. city name or coords).
        config: Must include ``api_key``.  Optional: ``location``,
            ``weather_type`` (now/3d/7d, default 'now').
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing weather information.
    """
    location = config.get("location", input_data.get("output", ""))
    api_key = config.get("api_key", config.get("credentials", {}).get("api_key", ""))
    weather_type = config.get("weather_type", "now")

    if not api_key:
        return {"error": "QWeather API key is required in config.api_key"}

    logger.info(f"qweather node: location={location}, type={weather_type}")

    try:
        # First resolve city to location ID via GeoAPI
        geo_resp = requests.get(
            "https://geoapi.qweather.com/v2/city/lookup",
            params={"key": api_key, "location": location},
            timeout=15,
        )
        geo_resp.raise_for_status()
        geo_data = geo_resp.json()

        # Extract location ID from first match
        locations = geo_data.get("location", [])
        if not locations:
            return {"error": f"Location '{location}' not found in QWeather"}
        location_id = locations[0]["id"]
        location_name = locations[0].get("name", location)

        # Fetch weather data
        weather_endpoints = {
            "now": "https://devapi.qweather.com/v7/weather/now",
            "3d": "https://devapi.qweather.com/v7/weather/3d",
            "7d": "https://devapi.qweather.com/v7/weather/7d",
        }
        url = weather_endpoints.get(weather_type, weather_endpoints["now"])

        weather_resp = requests.get(
            url, params={"key": api_key, "location": location_id}, timeout=15,
        )
        weather_resp.raise_for_status()
        weather_data = weather_resp.json()

        return {"output_data": {
            "output": json.dumps(weather_data, ensure_ascii=False),
            "data": weather_data,
            "location": location_name,
        }}
    except requests.RequestException as e:
        return {"error": f"QWeather API error: {e}"}


def handle_crawler(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Crawl a URL and extract text content using requests + BeautifulSoup.

    Args:
        input_data: URL to crawl (under 'output' key).
        config: Optional ``url`` override, ``timeout`` (default 30),
            ``extract_links`` (bool, default False).
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing extracted text and metadata.
    """
    from bs4 import BeautifulSoup

    url = config.get("url", input_data.get("output", input_data.get("url", "")))
    timeout_sec = int(config.get("timeout", 30))
    extract_links = config.get("extract_links", False)

    if not url:
        return {"error": "URL is required for crawling"}

    # Ensure the URL has a scheme
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    logger.info(f"crawler node: url={url}")

    try:
        resp = requests.get(
            url,
            timeout=timeout_sec,
            headers={"User-Agent": "Mozilla/5.0 (compatible; BKnowledgeBot/1.0)"},
        )
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove script and style elements before extracting text
        for element in soup(["script", "style", "nav", "footer", "header"]):
            element.decompose()

        title = soup.title.string if soup.title else ""
        text = soup.get_text(separator="\n", strip=True)

        result = {
            "output": text[:10000],
            "title": title,
            "url": url,
            "status_code": resp.status_code,
        }

        # Optionally extract all links from the page
        if extract_links:
            links = [
                {"text": a.get_text(strip=True), "href": a.get("href", "")}
                for a in soup.find_all("a", href=True)
            ]
            result["links"] = links[:100]

        return {"output_data": result}
    except requests.RequestException as e:
        return {"error": f"Crawling failed: {e}"}


def handle_invoke(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Placeholder for sub-agent invocation.

    Sub-agent orchestration is handled by the Node.js orchestrator.
    This handler passes through the input data unchanged.

    Args:
        input_data: Input from upstream nodes.
        config: Sub-agent configuration (processed by orchestrator).
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' passing through the input.
    """
    logger.info("invoke node: passing through to orchestrator")
    return {"output_data": {"output": input_data.get("output", "")}}


def handle_akshare(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Fetch Chinese financial data using the akshare library.

    Args:
        input_data: Query text or symbol (under 'output' key).
        config: ``function`` (akshare function name, e.g. 'stock_zh_a_spot_em'),
            optional ``params`` (dict of function arguments).
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing financial data.
    """
    func_name = config.get("function", "stock_zh_a_spot_em")
    params = config.get("params", {})

    logger.info(f"akshare node: function={func_name}")

    try:
        import akshare as ak
    except ImportError:
        return {"error": "akshare library is not installed. Run: pip install akshare"}

    try:
        # Dynamically call the akshare function
        func = getattr(ak, func_name, None)
        if not func:
            return {"error": f"akshare function '{func_name}' not found"}

        df = func(**params)

        # Convert DataFrame to JSON-serializable format
        if hasattr(df, "to_dict"):
            records = df.head(100).to_dict(orient="records")
            output_text = json.dumps(records, ensure_ascii=False, default=str)[:10000]
        else:
            records = []
            output_text = str(df)[:10000]

        return {"output_data": {"output": output_text, "data": records}}
    except Exception as e:
        return {"error": f"akshare call failed: {e}"}


def handle_yahoofinance(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Fetch financial data using the yfinance library.

    Args:
        input_data: Stock symbol or query (under 'output' key).
        config: Optional ``symbol`` override, ``period`` (default '1mo'),
            ``info_only`` (bool, return only ticker info).
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing financial data.
    """
    symbol = config.get("symbol", input_data.get("output", "").strip())
    period = config.get("period", "1mo")
    info_only = config.get("info_only", False)

    if not symbol:
        return {"error": "Stock symbol is required"}

    logger.info(f"yahoofinance node: symbol={symbol}, period={period}")

    try:
        import yfinance as yf
    except ImportError:
        return {"error": "yfinance library is not installed. Run: pip install yfinance"}

    try:
        ticker = yf.Ticker(symbol)

        if info_only:
            info = ticker.info
            output_text = json.dumps(info, ensure_ascii=False, default=str)[:10000]
            return {"output_data": {"output": output_text, "data": info}}

        # Fetch historical data
        hist = ticker.history(period=period)
        if hist.empty:
            return {"output_data": {"output": f"No data found for {symbol}", "data": []}}

        records = hist.reset_index().to_dict(orient="records")
        output_text = json.dumps(records[-20:], ensure_ascii=False, default=str)[:10000]

        return {"output_data": {
            "output": output_text,
            "data": records[-100:],
            "info": ticker.info,
        }}
    except Exception as e:
        return {"error": f"Yahoo Finance query failed: {e}"}


def handle_jin10(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Fetch Chinese financial news from Jin10 data API.

    Args:
        input_data: Query or filter (under 'output' key).
        config: Optional ``max_results`` (default 10), ``category``.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing news articles.
    """
    max_results = int(config.get("max_results", 10))

    logger.info(f"jin10 node: max_results={max_results}")

    try:
        resp = requests.get(
            "https://flash-api.jin10.com/get",
            params={"max_time": "", "channel": "-8200", "vip": 1},
            headers={
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://www.jin10.com",
                "x-app-id": "bVBF4FyRTn5NJF5n",
                "x-version": "1.0.0",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])[:max_results]

        articles = []
        for item in data:
            content = item.get("data", {})
            articles.append({
                "id": item.get("id", ""),
                "time": item.get("time", ""),
                "content": content.get("content", content.get("title", "")),
            })

        output_text = "\n\n".join(f"[{a['time']}] {a['content']}" for a in articles)
        return {"output_data": {"output": output_text, "results": articles}}
    except requests.RequestException as e:
        return {"error": f"Jin10 API error: {e}"}


def handle_tushare(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Fetch Chinese stock market data using the tushare library.

    Args:
        input_data: Stock code or query (under 'output' key).
        config: Must include ``token`` (Tushare API token).  Optional:
            ``api_name`` (default 'daily'), ``params`` (dict).
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing stock data.
    """
    token = config.get("token", config.get("credentials", {}).get("token", ""))
    api_name = config.get("api_name", "daily")
    params = config.get("params", {})

    if not token:
        return {"error": "Tushare API token is required in config.token"}

    logger.info(f"tushare node: api_name={api_name}")

    try:
        import tushare as ts
    except ImportError:
        return {"error": "tushare library is not installed. Run: pip install tushare"}

    try:
        ts.set_token(token)
        pro = ts.pro_api()

        # Dynamically call the tushare API
        func = getattr(pro, api_name, None)
        if not func:
            return {"error": f"tushare API '{api_name}' not found"}

        df = func(**params)

        if df is None or df.empty:
            return {"output_data": {"output": "No data returned", "data": []}}

        records = df.head(100).to_dict(orient="records")
        output_text = json.dumps(records, ensure_ascii=False, default=str)[:10000]

        return {"output_data": {"output": output_text, "data": records}}
    except Exception as e:
        return {"error": f"Tushare query failed: {e}"}


def handle_wencai(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a Wencai (i-wencai.com) Chinese stock screening query.

    Uses the HTTP API to perform natural-language stock screening queries.

    Args:
        input_data: Natural language query (under 'output' key).
        config: Optional ``max_results`` (default 20).
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing stock screening results.
    """
    query_text = str(input_data.get("output", ""))
    max_results = int(config.get("max_results", 20))

    if not query_text:
        return {"error": "Query text is required for Wencai"}

    logger.info(f"wencai node: query='{query_text[:80]}'")

    try:
        # Try using the pywencai library first
        import pywencai

        result = pywencai.get(query=query_text, loop=True)
        if hasattr(result, "to_dict"):
            records = result.head(max_results).to_dict(orient="records")
            output_text = json.dumps(records, ensure_ascii=False, default=str)[:10000]
        else:
            records = []
            output_text = str(result)[:10000]

        return {"output_data": {"output": output_text, "data": records}}
    except ImportError:
        logger.info("pywencai not available, falling back to HTTP API")
    except Exception as e:
        logger.warning(f"pywencai query failed: {e}")

    # Fall back to HTTP API
    try:
        resp = requests.post(
            "https://www.iwencai.com/unifiedwap/unified-wap/v2/result/get-robot-data",
            json={
                "question": query_text,
                "perpage": max_results,
                "page": 1,
                "secondary_intent": "stock",
                "log_info": '{"input_type":"typewrite"}',
            },
            headers={
                "User-Agent": "Mozilla/5.0",
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json().get("data", {})
        answer = data.get("answer", [])

        # Extract tabular data from the response
        results = []
        if answer:
            txt = answer[0].get("txt", [])
            if txt:
                results = txt[0].get("content", {}).get("components", [])

        output_text = json.dumps(results[:max_results], ensure_ascii=False, default=str)[:10000]
        return {"output_data": {"output": output_text, "data": results[:max_results]}}
    except requests.RequestException as e:
        return {"error": f"Wencai query failed: {e}"}


# ---------------------------------------------------------------------------
# Tool-to-Handler Adapter
# ---------------------------------------------------------------------------


def _make_tool_handler(tool_instance):
    """Create a node handler function that delegates to a BaseTool instance.

    Extracts credentials from config['credentials'] (injected by the Node.js
    orchestrator) and wraps the tool's execute() return value in the standard
    node handler output format.

    Args:
        tool_instance: A concrete BaseTool implementation.

    Returns:
        Handler function compatible with the NODE_HANDLERS registry.
    """
    def handler(input_data: dict, config: dict, tenant_id: str) -> dict:
        """Delegate to tool.execute() and wrap the result.

        Args:
            input_data: Input from upstream nodes.
            config: Node configuration with optional 'credentials' dict.
            tenant_id: Multi-tenant isolation identifier.

        Returns:
            Dict with 'output_data' or 'error'.
        """
        credentials = config.get("credentials")
        result = tool_instance.execute(input_data, config, credentials)

        # Check for errors from the tool
        if "error" in result:
            return {"error": result["error"]}

        tool_result = result.get("result", "")
        # Serialize non-string results to a string for the output field
        if isinstance(tool_result, str):
            output_str = tool_result
        else:
            import json as _json
            output_str = _json.dumps(tool_result, ensure_ascii=False, default=str)[:10000]

        return {"output_data": {"output": output_str, "result": tool_result}}

    return handler


# ---------------------------------------------------------------------------
# Memory Handlers
# ---------------------------------------------------------------------------


def handle_memory_read(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Read relevant memories for the given query via the BE memory API.

    Extracts the query from upstream node output and performs a hybrid search
    against the specified memory pool.

    Args:
        input_data: Input from upstream nodes containing 'query', 'input', or 'message' text.
        config: Node configuration with memory_id, top_k (default 5), and api_base_url.
        tenant_id: Multi-tenant isolation identifier for auth header.

    Returns:
        Dict with 'output_data' containing 'memories' list and 'raw_results'.
    """
    memory_id = config.get("memory_id", "")
    if not memory_id:
        return {"error": "memory_id is required in node config"}

    # Extract query from input data, trying common field names
    query = (
        input_data.get("query")
        or input_data.get("input")
        or input_data.get("message")
        or input_data.get("output", "")
    )
    if not query:
        return {"error": "No query found in input_data"}

    api_base_url = config.get("api_base_url", "http://localhost:3001")
    auth_token = config.get("auth_token", "")
    top_k = config.get("top_k", 5)

    try:
        resp = requests.post(
            f"{api_base_url}/api/memory/{memory_id}/search",
            json={"query": query, "top_k": top_k},
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=30,
        )
        resp.raise_for_status()
        results = resp.json()

        # Extract content strings from search results
        memories = [item.get("content", "") for item in results if item.get("content")]
        return {
            "output_data": {
                "output": "\n\n".join(memories),
                "memories": memories,
                "raw_results": results,
            }
        }
    except requests.RequestException as e:
        logger.error(f"Memory read failed: memory_id={memory_id}, error={e}")
        return {"error": f"Memory read failed: {e}"}


def handle_memory_write(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Write content to a memory pool via the BE memory API.

    Stores the provided content as a new memory message in the specified pool.

    Args:
        input_data: Input containing 'content' or 'output' text to store as memory.
        config: Node configuration with memory_id, message_type (default 1), and api_base_url.
        tenant_id: Multi-tenant isolation identifier for auth header.

    Returns:
        Dict with 'output_data' containing 'status' and 'memory_id'.
    """
    memory_id = config.get("memory_id", "")
    if not memory_id:
        return {"error": "memory_id is required in node config"}

    # Extract content to store from input data
    content = (
        input_data.get("content")
        or input_data.get("output")
        or input_data.get("message", "")
    )
    if not content:
        return {"error": "No content found in input_data to write"}

    api_base_url = config.get("api_base_url", "http://localhost:3001")
    auth_token = config.get("auth_token", "")
    message_type = config.get("message_type", 1)

    try:
        resp = requests.post(
            f"{api_base_url}/api/memory/{memory_id}/messages",
            json={"content": content, "message_type": message_type},
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=30,
        )
        resp.raise_for_status()
        result = resp.json()

        return {
            "output_data": {
                "output": f"Memory stored: {result.get('message_id', '')}",
                "status": "stored",
                "memory_id": memory_id,
                "message_id": result.get("message_id", ""),
            }
        }
    except requests.RequestException as e:
        logger.error(f"Memory write failed: memory_id={memory_id}, error={e}")
        return {"error": f"Memory write failed: {e}"}


# ---------------------------------------------------------------------------
# Handler Registry
# ---------------------------------------------------------------------------

NODE_HANDLERS: dict[str, callable] = {
    # LLM / AI nodes
    "generate": handle_generate,
    "categorize": handle_categorize,
    "rewrite": handle_rewrite,
    "relevant": handle_relevant,

    # Retrieval nodes
    "retrieval": handle_retrieval,
    "wikipedia": handle_wikipedia,
    "tavily": handle_tavily,
    "pubmed": handle_pubmed,

    # Code / Tool nodes
    "code": handle_code,
    "github": handle_github,
    "sql": handle_sql,
    "api": handle_api,
    "email": handle_email,

    # Data nodes
    "template": handle_template,
    "keyword_extract": handle_keyword_extract,
    "loop": handle_loop,

    # External search tools
    "duckduckgo": handle_duckduckgo,
    "google": handle_google,
    "google_scholar": handle_google_scholar,
    "arxiv": handle_arxiv,

    # Translation
    "deepl": handle_deepl,

    # Weather
    "qweather": handle_qweather,

    # Web crawling
    "crawler": handle_crawler,

    # Sub-agent invocation (passthrough)
    "invoke": handle_invoke,

    # SQL alias
    "exesql": handle_sql,

    # Finance tools
    "akshare": handle_akshare,
    "yahoofinance": handle_yahoofinance,
    "jin10": handle_jin10,
    "tushare": handle_tushare,
    "wencai": handle_wencai,

    # Bing search
    "bing": _make_tool_handler(_bing_tool),

    # SearxNG metasearch
    "searxng": _make_tool_handler(_searxng_tool),

    # Google Maps / Places
    "google_maps": _make_tool_handler(_google_maps_tool),

    # Legacy alias: baidu falls back to duckduckgo
    "baidu": handle_duckduckgo,

    # Memory nodes
    "memory_read": handle_memory_read,
    "memory_write": handle_memory_write,
}
