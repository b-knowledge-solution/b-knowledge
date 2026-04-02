"""
Code Graph RAG — Public API

Provides `extract_and_chunk()` for unified pipeline integration.
Produces both Memgraph graph nodes AND OpenSearch-compatible chunks
with semantic summaries in a single AST parsing pass.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

from loguru import logger

from .constants import (
    SupportedLanguage, detect_language,
    KEY_QUALIFIED_NAME, KEY_NAME, KEY_SOURCE_CODE,
    KEY_START_LINE, KEY_END_LINE, KEY_PARAMETERS,
    KEY_RETURN_TYPE, KEY_LANGUAGE, KEY_RELATIVE_PATH,
    NodeLabel,
)
from .memgraph_client import MemgraphIngestor
from .models import GraphNode, GraphRelationship
from .services import IngestorProtocol, InMemoryIngestor
from .factory import ProcessorFactory
from . import logs as ls


__all__ = [
    "extract_and_chunk",
    "extract_code_graph",
    "SupportedLanguage",
    "detect_language",
]


# ── Collecting ingestor ──────────────────────────────────────────────────────

class _CollectingIngestor:
    """
    Wraps a real ingestor and collects definition nodes for chunk conversion.

    Intercepts ensure_node() calls to capture Function/Method/Class nodes,
    then delegates everything to the wrapped ingestor.
    """

    # Labels that should become searchable chunks
    _CHUNK_LABELS = {
        NodeLabel.FUNCTION, NodeLabel.METHOD, NodeLabel.CLASS,
        NodeLabel.INTERFACE, NodeLabel.STRUCT, NodeLabel.TRAIT,
        NodeLabel.ENUM, NodeLabel.TYPE,
    }

    def __init__(self, delegate: IngestorProtocol) -> None:
        self._delegate = delegate
        self.collected_nodes: list[GraphNode] = []

    def ensure_node(self, node: GraphNode) -> None:
        """Capture definition nodes, then delegate."""
        if any(label in self._CHUNK_LABELS for label in node.labels):
            self.collected_nodes.append(node)
        self._delegate.ensure_node(node)

    def ensure_relationship(self, rel: GraphRelationship) -> None:
        """Pass through to delegate."""
        self._delegate.ensure_relationship(rel)

    def flush(self) -> None:
        """Best-effort flush to delegate. Graph writes are optional."""
        try:
            self._delegate.flush()
        except Exception as e:
            logger.warning(f"Graph flush failed (chunks still collected): {e}")

    def close(self) -> None:
        """Best-effort close delegate connection."""
        try:
            self._delegate.close()
        except Exception:
            pass


# ── Chunk building ───────────────────────────────────────────────────────────

# language label → human-readable name for semantic summaries
_LANG_DISPLAY: dict[str, str] = {
    "python": "python", "javascript": "javascript", "typescript": "typescript",
    "rust": "rust", "java": "java", "c": "c", "cpp": "c++",
    "lua": "lua", "go": "go", "scala": "scala", "c_sharp": "c#", "php": "php",
}


def _build_semantic_summary(node: GraphNode) -> str:
    """
    Build a natural-language summary from a graph node for embedding quality.

    Creates a human-readable description from structured AST metadata so
    embedding models produce semantically meaningful vectors for code chunks.

    @param node: GraphNode with properties from definition processor.
    @returns: Natural-language summary string.
    """
    props = node.properties
    label = node.labels[0] if node.labels else NodeLabel.FUNCTION
    name = props.get(KEY_NAME, "")
    lang = _LANG_DISPLAY.get(str(props.get(KEY_LANGUAGE, "")), "code")
    params = str(props.get(KEY_PARAMETERS, ""))
    return_type = str(props.get(KEY_RETURN_TYPE, ""))
    qn = str(props.get(KEY_QUALIFIED_NAME, ""))

    parts: list[str] = []

    # Determine parent class from QN (e.g., "proj.module.Class.method" → "Class")
    parent_class = ""
    if label == NodeLabel.METHOD and "." in qn:
        qn_parts = qn.rsplit(".", 2)
        if len(qn_parts) >= 2:
            parent_class = qn_parts[-2].rsplit(".", 1)[-1]

    # Build the main description line
    if label in (NodeLabel.CLASS, NodeLabel.INTERFACE, NodeLabel.STRUCT,
                 NodeLabel.TRAIT, NodeLabel.ENUM, NodeLabel.TYPE):
        desc = f"{lang} {label.lower()} {name}"
        parts.append(desc)
    else:
        if parent_class:
            desc = f"{lang} method {parent_class}.{name}"
        else:
            desc = f"{lang} function {name}"

        if params:
            clean_params = params.strip("()")
            if clean_params:
                desc += f" with parameters: {clean_params}"
        if return_type:
            desc += f", returns {return_type}"
        parts.append(desc)

    # Extract docstring from source code (first string/comment in body)
    source_code = str(props.get(KEY_SOURCE_CODE, ""))
    docstring = _extract_docstring_from_source(source_code, lang)
    if docstring:
        parts.append(docstring)

    return "\n".join(parts)


def _extract_docstring_from_source(source: str, language: str) -> str:
    """
    Extract docstring from source code text using regex patterns.

    @param source: Raw source code of the function/class.
    @param language: Language name.
    @returns: Extracted docstring text, or empty string.
    """
    if not source:
        return ""

    # Python triple-quoted docstrings
    if language == "python":
        match = re.search(r'"""(.*?)"""', source, re.DOTALL)
        if not match:
            match = re.search(r"'''(.*?)'''", source, re.DOTALL)
        if match:
            return match.group(1).strip()

    # Java/JS/TS block comments (/** ... */)
    if language in ("java", "javascript", "typescript", "c++", "c#", "go", "php"):
        match = re.search(r'/\*\*(.*?)\*/', source, re.DOTALL)
        if match:
            # Strip * prefixes from each line
            raw = match.group(1)
            lines = [re.sub(r'^\s*\*\s?', '', line) for line in raw.split('\n')]
            return '\n'.join(line for line in lines if line.strip()).strip()

    # Rust /// doc comments
    if language == "rust":
        doc_lines = []
        for line in source.split('\n'):
            stripped = line.strip()
            if stripped.startswith('///'):
                doc_lines.append(stripped[3:].strip())
            elif doc_lines:
                break
        if doc_lines:
            return '\n'.join(doc_lines)

    # Lua -- comments
    if language == "lua":
        match = re.search(r'--\[\[(.*?)\]\]', source, re.DOTALL)
        if match:
            return match.group(1).strip()

    return ""


def _node_to_chunk(node: GraphNode, filename: str) -> dict:
    """
    Convert a GraphNode into an OpenSearch-compatible chunk dict.

    @param node: GraphNode from the definition processor.
    @param filename: Original source filename.
    @returns: Chunk dict with content_with_weight, tokenized fields, and metadata.
    """
    # Lazy import to avoid circular dependency at module level
    from rag.nlp import rag_tokenizer

    props = node.properties
    label = node.labels[0] if node.labels else ""
    name = str(props.get(KEY_NAME, ""))
    source_code = str(props.get(KEY_SOURCE_CODE, ""))
    params = str(props.get(KEY_PARAMETERS, ""))
    return_type = str(props.get(KEY_RETURN_TYPE, ""))
    lang = str(props.get(KEY_LANGUAGE, "unknown"))
    qn = str(props.get(KEY_QUALIFIED_NAME, ""))
    relative_path = str(props.get(KEY_RELATIVE_PATH, ""))

    # Build semantic-enriched content for embedding
    summary = _build_semantic_summary(node)
    enriched_content = f"{summary}\n---\n{source_code}" if summary else source_code

    # Tokenize for keyword search (use raw source code, not enriched)
    content_ltks = rag_tokenizer.tokenize(source_code)

    # Determine parent class from QN
    parent_class = ""
    if label == NodeLabel.METHOD and "." in qn:
        qn_parts = qn.rsplit(".", 2)
        if len(qn_parts) >= 2:
            parent_class = qn_parts[-2].rsplit(".", 1)[-1]

    chunk = {
        "docnm_kwd": filename,
        "title_tks": rag_tokenizer.tokenize(re.sub(r"\.[a-zA-Z]+$", "", filename)),
        "content_with_weight": enriched_content,
        "content_ltks": content_ltks,
        "content_sm_ltks": rag_tokenizer.fine_grained_tokenize(content_ltks),
        "function_name": name,
        "class_name": parent_class,
        "parameters": params,
        "return_type": return_type,
        "tag_kwd": ["code", lang],
        "qualified_name": qn,
    }

    return chunk


# ── Public API ───────────────────────────────────────────────────────────────

def extract_and_chunk(
    filename: str,
    binary: bytes,
    kb_id: str = "",
    project_name: str = "",
    project_root: str | Path | None = None,
    use_memgraph: bool = True,
    callback=None,
) -> list[dict]:
    """
    Parse code, extract graph to Memgraph, and return OpenSearch chunks.

    This is the unified entry point that replaces both code.py's chunk()
    and chunk_with_graph(). It:
    1. Detects the programming language
    2. Parses the AST with Tree-sitter (once)
    3. Extracts definitions → Memgraph graph + OpenSearch chunks
    4. Resolves imports and calls → Memgraph relationships
    5. Returns chunks with semantic summaries for embedding

    @param filename: Source file name (used for language detection).
    @param binary: Raw file contents as bytes.
    @param kb_id: Knowledge base ID for tenant isolation.
    @param project_name: Project name for qualified name prefix.
    @param project_root: Root path of the project.
    @param use_memgraph: If True, writes to Memgraph; if False, in-memory only.
    @param callback: Optional progress callback(progress, msg).
    @returns: List of OpenSearch-compatible chunk dicts, or empty list on failure.
    """
    # Detect language
    language = detect_language(filename)
    if language is None:
        logger.debug(ls.LOG_LANGUAGE_UNSUPPORTED.format(filename))
        return []

    logger.info(ls.LOG_PIPELINE_START.format(filename))
    if callback:
        callback(0.1, f"Extracting code graph for {filename}")

    # Set defaults
    if not project_name:
        project_name = kb_id or "project"

    # Create project root
    if project_root:
        project_root = Path(project_root)
    else:
        import tempfile
        project_root = Path(tempfile.mkdtemp(prefix="code_graph_"))

    filepath = project_root / filename
    if not filepath.exists():
        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_bytes(binary)

    # Create the base ingestor (auto-detect Memgraph availability)
    if use_memgraph:
        try:
            bolt_url = os.environ.get("MEMGRAPH_BOLT_URL", "bolt://localhost:7687")
            base_ingestor = MemgraphIngestor(bolt_url=bolt_url, kb_id=kb_id)
        except Exception as e:
            logger.debug(f"Memgraph unavailable ({e}), using in-memory ingestor")
            base_ingestor = InMemoryIngestor()
    else:
        base_ingestor = InMemoryIngestor()

    # Wrap with collecting ingestor to capture nodes for chunks
    collecting = _CollectingIngestor(base_ingestor)

    try:
        factory = ProcessorFactory(
            ingestor=collecting,
            project_root=project_root,
            project_name=project_name,
            kb_id=kb_id,
        )

        if callback:
            callback(0.3, "Parsing AST and extracting definitions")

        success = factory.process_file(filepath, binary)

        if callback:
            callback(0.6, "Flushing graph to database")

        collecting.flush()

        if not success:
            logger.warning(f"Code graph extraction failed for {filename}")
            return []

        if callback:
            callback(0.7, "Converting graph nodes to search chunks")

        # Convert collected graph nodes to OpenSearch chunks
        chunks: list[dict] = []
        for node in collecting.collected_nodes:
            chunk = _node_to_chunk(node, filename)
            chunks.append(chunk)

        # Add module-level content as a fallback chunk if no definitions found
        if not chunks:
            from rag.nlp import rag_tokenizer
            source = binary.decode("utf-8", errors="replace")
            content_ltks = rag_tokenizer.tokenize(source)
            chunks.append({
                "docnm_kwd": filename,
                "title_tks": rag_tokenizer.tokenize(
                    re.sub(r"\.[a-zA-Z]+$", "", filename)
                ),
                "content_with_weight": source,
                "content_ltks": content_ltks,
                "content_sm_ltks": rag_tokenizer.fine_grained_tokenize(content_ltks),
                "tag_kwd": ["code", language.value],
            })

        node_count = len(collecting.collected_nodes)
        logger.info(ls.LOG_PIPELINE_COMPLETE.format(node_count, len(chunks)))

        if callback:
            callback(0.9, f"Code graph: {node_count} nodes, {len(chunks)} chunks")

        return chunks

    except Exception as e:
        logger.error(ls.LOG_PIPELINE_ERROR.format(filename, str(e)))
        return []

    finally:
        collecting.close()


def extract_code_graph(
    filename: str,
    binary: bytes,
    kb_id: str = "",
    project_name: str = "",
    project_root: str | Path | None = None,
    use_memgraph: bool = True,
    callback=None,
) -> bool:
    """
    Extract code knowledge graph (backward-compatible API).

    Delegates to extract_and_chunk() but returns bool instead of chunks.

    @param filename: Source file name.
    @param binary: Raw file contents as bytes.
    @param kb_id: Knowledge base ID.
    @param project_name: Project name prefix.
    @param project_root: Root path of the project.
    @param use_memgraph: If True, writes to Memgraph.
    @param callback: Optional progress callback.
    @returns: True if extraction succeeded.
    """
    chunks = extract_and_chunk(
        filename=filename,
        binary=binary,
        kb_id=kb_id,
        project_name=project_name,
        project_root=project_root,
        use_memgraph=use_memgraph,
        callback=callback,
    )
    return len(chunks) > 0
