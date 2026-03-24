"""
Code Graph RAG — Public API

Provides the `extract_code_graph()` function for pipeline integration.
This is the entry point called by code.py's `chunk_with_graph()`.
"""
from __future__ import annotations

from loguru import logger
import os
from pathlib import Path

from .constants import SupportedLanguage, detect_language
from .memgraph_client import MemgraphIngestor
from .services import InMemoryIngestor
from .factory import ProcessorFactory
from . import logs as ls



__all__ = [
    "extract_code_graph",
    "SupportedLanguage",
    "detect_language",
]


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
    Extract code knowledge graph from a source file and store in Memgraph.

    This is the main entry point for the code graph pipeline. It:
    1. Detects the programming language from the file extension
    2. Parses the AST using Tree-sitter
    3. Extracts definitions (functions, classes, methods) with FQN
    4. Resolves imports and call relationships
    5. Writes the graph to Memgraph via Bolt protocol

    @param filename: Source file name (used for language detection).
    @param binary: Raw file contents as bytes.
    @param kb_id: Knowledge base ID for tenant isolation in Memgraph.
    @param project_name: Project name for qualified name prefix.
    @param project_root: Root path of the project (for relative paths).
    @param use_memgraph: If True, writes to Memgraph; if False, uses in-memory store.
    @param callback: Optional progress callback(progress, msg).
    @returns: True if graph extraction succeeded, False otherwise.
    """
    # Detect language
    language = detect_language(filename)
    if language is None:
        logger.debug(ls.LOG_LANGUAGE_UNSUPPORTED.format(filename))
        return False

    logger.info(ls.LOG_PIPELINE_START.format(filename))

    if callback:
        callback(0.1, f"Extracting code graph for {filename}")

    # Set defaults
    if not project_name:
        project_name = kb_id or "project"

    # Create a temporary file path for processing
    if project_root:
        project_root = Path(project_root)
    else:
        # Use a temp directory structure
        import tempfile
        project_root = Path(tempfile.mkdtemp(prefix="code_graph_"))

    filepath = project_root / filename

    # Write the file to temp location if it doesn't exist
    if not filepath.exists():
        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_bytes(binary)

    # Create ingestor
    if use_memgraph:
        bolt_url = os.environ.get("MEMGRAPH_BOLT_URL", "bolt://localhost:7687")
        ingestor = MemgraphIngestor(bolt_url=bolt_url, kb_id=kb_id)
    else:
        ingestor = InMemoryIngestor()

    try:
        # Create processor factory
        factory = ProcessorFactory(
            ingestor=ingestor,
            project_root=project_root,
            project_name=project_name,
            kb_id=kb_id,
        )

        if callback:
            callback(0.3, "Parsing AST and extracting definitions")

        # Run the pipeline for this file
        success = factory.process_file(filepath, binary)

        if callback:
            callback(0.8, "Flushing graph to database")

        # Flush remaining batched data
        ingestor.flush()

        if callback:
            callback(1.0, "Code graph extraction complete")

        if success:
            # Count what we extracted
            if isinstance(ingestor, InMemoryIngestor):
                node_count = len(ingestor.nodes)
                rel_count = len(ingestor.relationships)
            else:
                node_count = len(factory._function_registry)
                rel_count = 0  # Not easily counted without querying

            logger.info(ls.LOG_PIPELINE_COMPLETE.format(node_count, rel_count))

        return success

    except Exception as e:
        logger.error(ls.LOG_PIPELINE_ERROR.format(filename, str(e)))
        return False

    finally:
        ingestor.close()
