"""Node execution dispatch table for agent workflow nodes.

Maps each OperatorType to a handler function that executes the node's logic.
Compute-heavy nodes (LLM generation, retrieval, code execution) are handled here
in Python, while lightweight nodes (switch, condition, merge) are handled inline
by the Node.js orchestrator and never dispatched to this worker.

Handler implementations are stubs for now -- full wiring to existing LLM,
retrieval, and tool infrastructure happens in later plans (Plan 07-09).
"""

from loguru import logger


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

    Will be wired to existing LLM infrastructure (llm_service.py) in Plan 07.
    Currently returns a stub response indicating the node type.

    Args:
        input_data: Input from upstream nodes, typically containing 'output' text.
        config: Node configuration including model selection, temperature, etc.
        tenant_id: Multi-tenant isolation identifier for LLM credential lookup.

    Returns:
        Dict with 'output_data' containing the generated text.
    """
    # Stub: will call LLMBundle.generate() in Plan 07
    prompt = input_data.get("output", "")
    logger.info(f"[STUB] generate node: prompt length={len(str(prompt))}")
    return {"output_data": {"output": f"[LLM generate stub] Input: {str(prompt)[:100]}"}}


def handle_categorize(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute an LLM categorization node.

    Classifies input text into predefined categories using LLM.
    Will be wired to LLM infrastructure in Plan 07.

    Args:
        input_data: Input text to categorize.
        config: Categories and classification prompt configuration.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing the matched category.
    """
    prompt = input_data.get("output", "")
    logger.info(f"[STUB] categorize node: input length={len(str(prompt))}")
    return {"output_data": {"output": prompt, "matched_branch": "default"}}


def handle_rewrite(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a query rewrite node using LLM.

    Rewrites the input query for better retrieval results.
    Will be wired to LLM infrastructure in Plan 07.

    Args:
        input_data: Original query text to rewrite.
        config: Rewrite prompt template and parameters.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing the rewritten query.
    """
    query = input_data.get("output", "")
    logger.info(f"[STUB] rewrite node: query length={len(str(query))}")
    return {"output_data": {"output": f"[Rewritten] {query}"}}


def handle_relevant(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a relevance check node using LLM.

    Checks whether retrieved context is relevant to the query.
    Will be wired to LLM infrastructure in Plan 07.

    Args:
        input_data: Query and context to check.
        config: Relevance threshold and prompt.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing relevance score and boolean.
    """
    logger.info("[STUB] relevant node")
    return {"output_data": {"output": input_data.get("output", ""), "is_relevant": True, "score": 0.95}}


# ---------------------------------------------------------------------------
# Node Handlers (Retrieval)
# ---------------------------------------------------------------------------


def handle_retrieval(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a RAG retrieval node.

    Performs hybrid search (BM25 + vector) against OpenSearch using the
    existing rag search infrastructure. Will be wired in Plan 07.

    Args:
        input_data: Query text and optional filters.
        config: Knowledge base IDs, top_k, similarity threshold, etc.
        tenant_id: Multi-tenant isolation identifier for ABAC filtering.

    Returns:
        Dict with 'output_data' containing retrieved chunks.
    """
    query = input_data.get("output", "")
    logger.info(f"[STUB] retrieval node: query='{str(query)[:50]}'")
    return {"output_data": {"output": f"[Retrieved context for: {str(query)[:50]}]", "chunks": []}}


def handle_wikipedia(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a Wikipedia search node.

    Args:
        input_data: Search query text.
        config: Language and result count settings.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing Wikipedia search results.
    """
    logger.info("[STUB] wikipedia node")
    return {"output_data": {"output": "[Wikipedia stub] No results", "results": []}}


def handle_tavily(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a Tavily web search node.

    Args:
        input_data: Search query text.
        config: Tavily API key and search parameters.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing web search results.
    """
    logger.info("[STUB] tavily node")
    return {"output_data": {"output": "[Tavily stub] No results", "results": []}}


def handle_pubmed(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a PubMed search node.

    Args:
        input_data: Medical/scientific search query.
        config: Result count and filter parameters.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing PubMed article results.
    """
    logger.info("[STUB] pubmed node")
    return {"output_data": {"output": "[PubMed stub] No results", "results": []}}


# ---------------------------------------------------------------------------
# Node Handlers (Code / Tools)
# ---------------------------------------------------------------------------


def handle_code(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a code execution node.

    Will be wired to a sandboxed execution environment in Plan 09.
    Currently returns a placeholder.

    Args:
        input_data: Input variables for the code block.
        config: Code string, language, and sandbox settings.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing execution output.
    """
    code = config.get("code", "")
    logger.info(f"[STUB] code node: code length={len(str(code))}")
    return {"output_data": {"output": "[Code execution stub] Not implemented yet"}}


def handle_github(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a GitHub API interaction node.

    Args:
        input_data: GitHub operation parameters.
        config: GitHub token and repository settings.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' or 'error'.
    """
    logger.info("[STUB] github node")
    return {"error": "GitHub node not implemented yet"}


def handle_sql(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute a SQL query node.

    Args:
        input_data: SQL query text or parameters.
        config: Database connection settings.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing query results.
    """
    logger.info("[STUB] sql node")
    return {"error": "SQL node not implemented yet"}


def handle_api(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute an HTTP API call node.

    Args:
        input_data: Request body or query parameters.
        config: URL, method, headers, and auth settings.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing API response.
    """
    logger.info("[STUB] api node")
    return {"error": "API node not implemented yet"}


def handle_email(input_data: dict, config: dict, tenant_id: str) -> dict:
    """Execute an email sending node.

    Args:
        input_data: Email content (to, subject, body).
        config: SMTP settings and template.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' confirming send status.
    """
    logger.info("[STUB] email node")
    return {"error": "Email node not implemented yet"}


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
    """Execute a keyword extraction node using existing NLP infrastructure.

    Will be wired to rag/nlp/term_weight.py in Plan 07.

    Args:
        input_data: Text to extract keywords from.
        config: Extraction method and count parameters.
        tenant_id: Multi-tenant isolation identifier.

    Returns:
        Dict with 'output_data' containing extracted keywords.
    """
    text = input_data.get("output", "")
    logger.info(f"[STUB] keyword_extract node: text length={len(str(text))}")
    return {"output_data": {"output": text, "keywords": []}}


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
    logger.info(f"Loop node: iteration {current_iteration}/{max_iterations}")
    return {"output_data": {
        "output": input_data.get("output", ""),
        "iteration": current_iteration,
        "max_iterations": max_iterations,
        "should_continue": current_iteration < max_iterations,
    }}


def _stub_handler(node_type: str):
    """Create a stub handler for unimplemented external tool nodes.

    Args:
        node_type: The operator type name for logging.

    Returns:
        Handler function that returns a 'not implemented' error.
    """
    def handler(input_data: dict, config: dict, tenant_id: str) -> dict:
        """Stub handler for an unimplemented node type.

        Args:
            input_data: Input from upstream nodes.
            config: Node configuration.
            tenant_id: Multi-tenant isolation identifier.

        Returns:
            Dict with 'error' indicating the node is not yet implemented.
        """
        logger.info(f"[STUB] {node_type} node: not implemented")
        return {"error": f"{node_type} node not implemented yet"}
    return handler


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

    # External tool stubs (will be implemented in later plans)
    "baidu": _stub_handler("baidu"),
    "bing": _stub_handler("bing"),
    "duckduckgo": _stub_handler("duckduckgo"),
    "google": _stub_handler("google"),
    "google_scholar": _stub_handler("google_scholar"),
    "arxiv": _stub_handler("arxiv"),
    "deepl": _stub_handler("deepl"),
    "qweather": _stub_handler("qweather"),
    "exesql": _stub_handler("exesql"),
    "crawler": _stub_handler("crawler"),
    "invoke": _stub_handler("invoke"),
    "akshare": _stub_handler("akshare"),
    "yahoofinance": _stub_handler("yahoofinance"),
    "jin10": _stub_handler("jin10"),
    "tushare": _stub_handler("tushare"),
    "wencai": _stub_handler("wencai"),
}
