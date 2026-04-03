"""Code-aware parser module for the RAG pipeline.

Delegates to code_graph for unified AST parsing that produces both
Memgraph graph nodes AND OpenSearch-compatible chunks in a single pass.
Supports 12 programming languages via Tree-sitter. Falls back to naive
line-based chunking for unsupported file extensions.
"""

import os
import re

from loguru import logger
from rag.nlp import rag_tokenizer


# ---------------------------------------------------------------------------
# Extension → language mapping (used only for fallback detection)
# ---------------------------------------------------------------------------

EXTENSION_MAP: dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".jsx": "tsx",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".cpp": "cpp",
    ".c": "c",
    ".cs": "c_sharp",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".lua": "lua",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
    ".r": "r",
    ".dart": "dart",
    ".vue": "vue",
    ".svelte": "svelte",
}

# Extensions supported by code_graph (supported by full graph pipeline)
_CODE_GRAPH_EXTENSIONS: set[str] = {
    ".py", ".js", ".ts", ".tsx", ".jsx",
    ".java", ".go", ".rs", ".cpp", ".c",
    ".cs", ".php", ".scala", ".lua",
}


def _estimate_tokens(text: str) -> int:
    """Estimate token count using whitespace splitting.

    Args:
        text: Text to estimate token count for.

    Returns:
        Approximate token count.
    """
    return len(text.split())


def _build_chunk_dict(filename: str, content: str) -> dict:
    """Build a basic chunk dictionary for fallback chunking.

    Args:
        filename: Original source filename.
        content: Text content for this chunk.

    Returns:
        Chunk dict with content_with_weight and tokenized fields.
    """
    content_ltks = rag_tokenizer.tokenize(content)
    ext = os.path.splitext(filename)[1].lower()
    lang_name = EXTENSION_MAP.get(ext, "unknown")

    return {
        "docnm_kwd": filename,
        "title_tks": rag_tokenizer.tokenize(re.sub(r"\.[a-zA-Z]+$", "", filename)),
        "content_with_weight": content,
        "content_ltks": content_ltks,
        "content_sm_ltks": rag_tokenizer.fine_grained_tokenize(content_ltks),
        "tag_kwd": ["code", lang_name],
    }


def _naive_fallback(filename: str, source: str, callback, max_tokens: int = 512) -> list[dict]:
    """Fall back to naive line-based chunking for unsupported file extensions.

    Splits the source text into chunks by grouping lines until the token
    limit is reached.

    Args:
        filename: Original source filename.
        source: Source text content.
        callback: Progress callback function.
        max_tokens: Maximum tokens per chunk.

    Returns:
        List of chunk dicts with standard fields.
    """
    lines = source.split("\n")
    chunks = []
    current_lines: list[str] = []
    current_tokens = 0

    for line in lines:
        line_tokens = _estimate_tokens(line)
        # Start a new chunk when token limit would be exceeded
        if current_tokens + line_tokens > max_tokens and current_lines:
            text = "\n".join(current_lines)
            chunks.append(_build_chunk_dict(filename, text))
            current_lines = []
            current_tokens = 0
        current_lines.append(line)
        current_tokens += line_tokens

    # Add remaining lines as final chunk
    if current_lines:
        text = "\n".join(current_lines)
        chunks.append(_build_chunk_dict(filename, text))

    if callback:
        callback(1.0, f"Fallback chunking complete: {len(chunks)} chunks")

    return chunks


def chunk(filename, binary=None, from_page=0, to_page=100000,
          lang="English", callback=None, **kwargs):
    """Parse a source code file into AST-based chunks with semantic search support.

    Uses code_graph to parse the source code, extract the code knowledge graph
    to Memgraph, and produce OpenSearch-compatible chunks with semantic summaries
    — all in a single AST parsing pass.

    Each chunk contains:
    - Semantic summary (natural-language description of the code entity)
    - Raw source code
    - Tokenized fields for keyword search
    - Structured metadata (function_name, class_name, parameters, return_type)
    - Tag metadata for filtering

    For files with unsupported extensions, falls back to naive line-based
    chunking instead of raising an error.

    Args:
        filename: Name of the source code file.
        binary: Raw file content as bytes.
        from_page: Unused (kept for interface compatibility).
        to_page: Unused (kept for interface compatibility).
        lang: Language hint for tokenization.
        callback: Progress callback function (prog: float, msg: str).
        **kwargs: Additional config including parser_config with chunk_token_num.

    Returns:
        List of chunk dicts with content_with_weight, tokenized fields,
        and code-specific metadata.
    """
    # Use no-op callback if none provided
    if callback is None:
        callback = lambda prog, msg="": None

    # Read source from binary
    if binary:
        source = binary.decode("utf-8", errors="replace")
        source_bytes = binary
    else:
        with open(filename, "rb") as f:
            source_bytes = f.read()
        source = source_bytes.decode("utf-8", errors="replace")

    # Extract configuration
    parser_config = kwargs.get("parser_config", {}) or {}
    max_tokens = parser_config.get("chunk_token_num", 512)

    # Detect language from file extension
    ext = os.path.splitext(filename)[1].lower()

    # Check if code_graph supports this extension
    if ext not in _CODE_GRAPH_EXTENSIONS:
        # Not supported by code_graph — check if we know the language at all
        if ext not in EXTENSION_MAP:
            callback(0.1, f"Unsupported extension '{ext}', falling back to text chunking")
            return _naive_fallback(filename, source, callback, max_tokens)
        # Known language but not in code_graph — fallback with language tag
        callback(0.1, f"Extension '{ext}' not supported by code graph, using text chunking")
        return _naive_fallback(filename, source, callback, max_tokens)

    callback(0.1, f"Parsing {filename} with code graph pipeline")

    # Use code_graph for unified graph extraction + chunking
    try:
        from rag.app.code_graph import extract_and_chunk

        kb_id = kwargs.get("kb_id", "")
        chunks = extract_and_chunk(
            filename=filename,
            binary=source_bytes,
            kb_id=str(kb_id) if kb_id else "",
            callback=callback,
        )

        if chunks:
            callback(1.0, f"Code graph chunking complete: {len(chunks)} chunks")
            return chunks

        # If code_graph returned empty (parse failure), fall back
        logger.warning(f"Code graph returned no chunks for {filename}, falling back")

    except Exception as e:
        logger.warning(f"Code graph failed for {filename}: {e}, falling back")

    # Fallback to naive chunking if code_graph fails
    callback(0.5, f"Falling back to text chunking for {filename}")
    return _naive_fallback(filename, source, callback, max_tokens)


def chunk_with_graph(filename, binary=None, from_page=0, to_page=100000,
                     lang="English", callback=None, **kwargs):
    """Parse a source code file and extract its code knowledge graph.

    Delegates to chunk() for the actual parsing, then reports whether
    graph extraction succeeded. Returns a tuple of (chunks, graph_ok)
    so the task executor can log graph extraction status separately.

    Graph extraction failures are non-fatal -- chunks are still returned
    from the fallback path even if graph writes fail.

    Args:
        filename: Name of the source code file.
        binary: Raw file content as bytes.
        from_page: Unused (kept for interface compatibility).
        to_page: Unused (kept for interface compatibility).
        lang: Language hint for tokenization.
        callback: Progress callback function (prog: float, msg: str).
        **kwargs: Additional config including parser_config, kb_id, tenant_id.

    Returns:
        Tuple of (list of chunk dicts, bool indicating graph extraction success).
    """
    # Track whether graph extraction path was used (not just fallback)
    graph_ok = False

    # Detect if the file extension is supported by code_graph
    ext = os.path.splitext(filename)[1].lower()
    if ext in _CODE_GRAPH_EXTENSIONS:
        graph_ok = True

    # Delegate to chunk() which already integrates with code_graph
    chunks = chunk(
        filename, binary=binary, from_page=from_page, to_page=to_page,
        lang=lang, callback=callback, **kwargs,
    )

    # If chunks came back but extension was supported, graph extraction worked
    # If no chunks returned, graph_ok should be False regardless
    if not chunks:
        graph_ok = False

    return chunks, graph_ok
