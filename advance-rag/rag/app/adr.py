"""ADR (Architecture Decision Record) parser module for the RAG pipeline.

Template-aware parser for MADR, Nygard, and Y-statement ADR formats.
Splits ADR documents into per-section chunks (Context, Decision,
Consequences) with structured metadata. Implemented in Phase 4 Plan 03.
"""


def chunk(filename, binary=None, from_page=0, to_page=100000,
          lang="Chinese", callback=None, **kwargs):
    """Parse an ADR document into section-based chunks.

    Args:
        filename: Name of the ADR file (Markdown or text).
        binary: Raw file content as bytes.
        from_page: Unused (kept for interface compatibility).
        to_page: Unused (kept for interface compatibility).
        lang: Language hint for tokenization.
        callback: Progress callback function.
        **kwargs: Additional config including parser_config, kb_id, tenant_id.

    Raises:
        NotImplementedError: This parser is not yet implemented.
    """
    raise NotImplementedError("ADR parser not yet implemented. See Phase 4 Plan 03.")
