"""ADR (Architecture Decision Record) parser module for the RAG pipeline.

Template-aware parser for MADR, Nygard, and Y-statement ADR formats.
Splits ADR documents into per-section chunks (Context, Decision,
Consequences) with structured metadata. Uses regex heuristics to detect
heading variations and ADR format type.
"""

import logging
import re
from copy import deepcopy

from rag.nlp import rag_tokenizer

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Canonical section types with heading pattern variations.
# Each pattern matches markdown headings (## Heading) to a section type.
# Uses re.IGNORECASE for case-insensitive matching.
# ---------------------------------------------------------------------------
ADR_SECTION_PATTERNS = {
    "context": re.compile(
        r"^#+\s*(context|background|problem|motivation|issue|forces)",
        re.IGNORECASE,
    ),
    "decision": re.compile(
        r"^#+\s*(decision|decided|decision\s+outcome|chosen\s+option|resolution)",
        re.IGNORECASE,
    ),
    "status": re.compile(
        r"^#+\s*(status|state)",
        re.IGNORECASE,
    ),
    # Options checked before consequences so "Pros and Cons of the Options"
    # maps to options (MADR heading) rather than consequences
    "options": re.compile(
        r"^#+\s*(options?\s*considered|alternatives?|considered\s+options?|pros?\s+and\s+cons?\s+of\s+the\s+options?)",
        re.IGNORECASE,
    ),
    "consequences": re.compile(
        r"^#+\s*(consequences|implications|results?|outcome|pros?\s+and\s+cons?)",
        re.IGNORECASE,
    ),
}

# Y-statement pattern: "In the context of ... facing ... we decided ... to achieve ..."
Y_STATEMENT_PATTERN = re.compile(
    r"[Ii]n\s+the\s+context\s+of\s+(.+?)"
    r",?\s*facing\s+(.+?)"
    r",?\s*we\s+decided\s+(.+?)"
    r",?\s*to\s+achieve\s+(.+?)(?:\.|,\s*accepting\s+(.+?))?$",
    re.DOTALL,
)


def _extract_adr_metadata(text: str) -> dict:
    """Extract ADR-level metadata from the document text.

    Scans for the document title (first H1), status line, date, and
    superseded-by references using regex patterns.

    Args:
        text: Full ADR document text.

    Returns:
        Dict with adr_title, adr_status, adr_date, superseded_by fields.
        Values are empty strings if not found.
    """
    metadata = {
        "adr_title": "",
        "adr_status": "",
        "adr_date": "",
        "superseded_by": "",
    }

    # Extract title from first H1 heading
    title_match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    if title_match:
        metadata["adr_title"] = title_match.group(1).strip()

    # Extract status from heading section or standalone line
    # Matches "## Status\nAccepted" or "## Status: Accepted" or "Status: Accepted"
    status_match = re.search(
        r"^#+\s*[Ss]tatus[:\s]*(.+?)$", text, re.MULTILINE
    )
    if status_match:
        status_val = status_match.group(1).strip()
        # If status is on same line as heading
        if status_val:
            metadata["adr_status"] = status_val.lower()
        else:
            # Status might be on the next non-empty line
            status_section = re.search(
                r"^#+\s*[Ss]tatus\s*\n+\s*(.+?)$", text, re.MULTILINE
            )
            if status_section:
                metadata["adr_status"] = status_section.group(1).strip().lower()
    else:
        # Try standalone "Status: value" line
        standalone = re.search(r"^[Ss]tatus[:\s]+(.+?)$", text, re.MULTILINE)
        if standalone:
            metadata["adr_status"] = standalone.group(1).strip().lower()

    # Extract date from "Date: YYYY-MM-DD" or similar patterns
    date_match = re.search(
        r"(?:^[Dd]ate[:\s]+|^#+\s*[Dd]ate[:\s]+)(\d{4}[-/]\d{1,2}[-/]\d{1,2})",
        text,
        re.MULTILINE,
    )
    if date_match:
        metadata["adr_date"] = date_match.group(1).strip()

    # Extract superseded_by reference
    superseded_match = re.search(
        r"[Ss]uperseded\s+by\s+\[?([^\]\n]+)",
        text,
    )
    if superseded_match:
        metadata["superseded_by"] = superseded_match.group(1).strip()

    return metadata


def _detect_format(text: str) -> str:
    """Detect the ADR template format from the document text.

    Checks for Y-statement pattern first (most specific), then MADR-style
    headings, then Nygard-style headings.

    Args:
        text: Full ADR document text.

    Returns:
        Format identifier: 'y_statement', 'madr', 'nygard', or 'unknown'.
    """
    # Y-statement is the most specific pattern
    if Y_STATEMENT_PATTERN.search(text):
        return "y_statement"

    # MADR uses compound headings like "Context and Problem Statement", "Decision Outcome"
    if re.search(r"^#+\s*(Context\s+and\s+Problem|Decision\s+Outcome|Chosen\s+Option)", text, re.MULTILINE | re.IGNORECASE):
        return "madr"

    # Nygard uses simple headings: Context, Decision, Consequences
    if re.search(r"^#+\s*Context\s*$", text, re.MULTILINE | re.IGNORECASE):
        return "nygard"

    # Check if any ADR section headings are present at all
    for pattern in ADR_SECTION_PATTERNS.values():
        if pattern.search(text):
            return "nygard"

    return "unknown"


def _classify_heading(heading: str) -> str:
    """Classify a markdown heading into an ADR section type.

    Matches the heading text against ADR_SECTION_PATTERNS. Returns the
    matching section type or 'other' if no pattern matches.

    Args:
        heading: The full heading line including '#' markers.

    Returns:
        Section type string (context, decision, consequences, status, options, other).
    """
    for section_type, pattern in ADR_SECTION_PATTERNS.items():
        if pattern.match(heading):
            return section_type
    return "other"


def _heading_level(heading: str) -> int:
    """Return the heading level (number of # characters).

    Args:
        heading: Markdown heading line.

    Returns:
        Integer heading level (1-6).
    """
    match = re.match(r"^(#+)", heading)
    return len(match.group(1)) if match else 0


def _split_by_sections(text: str) -> list[tuple[str, str, str]]:
    """Split ADR markdown into sections by top-level headings.

    Splits the text at heading boundaries. Sub-headings (###, ####) are
    kept as part of their parent section's content rather than creating
    separate sections. Only H1 (title) and H2 (ADR sections) trigger
    section boundaries.

    Args:
        text: Full ADR document text.

    Returns:
        List of (section_type, heading_text, section_content) tuples.
        Unmatched headings get section_type='other'.
    """
    # Split at heading boundaries (all levels)
    heading_pattern = re.compile(r"^(#{1,6}\s+.+)$", re.MULTILINE)
    parts = heading_pattern.split(text)

    # First pass: collect all heading/content pairs with their levels
    raw_sections = []

    # First element is content before any heading (preamble)
    if parts[0].strip():
        raw_sections.append((0, "", parts[0].strip()))

    i = 1
    while i < len(parts):
        heading = parts[i].strip()
        content = parts[i + 1].strip() if i + 1 < len(parts) else ""
        level = _heading_level(heading)
        raw_sections.append((level, heading, content))
        i += 2

    # Second pass: merge sub-headings (level > 2) into their parent section
    # ADR structure uses H1 for title and H2 for sections
    merged = []
    for level, heading, content in raw_sections:
        if level <= 2:
            # This is a top-level ADR section boundary
            section_type = _classify_heading(heading) if heading else "other"
            merged.append((section_type, heading, content))
        else:
            # Sub-heading: append to the most recent parent section
            if merged:
                prev_type, prev_heading, prev_content = merged[-1]
                # Append the sub-heading and its content to the parent
                sub_text = f"\n\n{heading}\n{content}" if content else f"\n\n{heading}"
                merged[-1] = (prev_type, prev_heading, prev_content + sub_text)
            else:
                # No parent section yet; treat as standalone
                section_type = _classify_heading(heading)
                merged.append((section_type, heading, content))

    return merged


def _parse_y_statement(text: str) -> list[tuple[str, str, str]]:
    """Parse a Y-statement format ADR into synthetic sections.

    Extracts context, decision, and consequences from the Y-statement
    pattern: "In the context of X, facing Y, we decided Z, to achieve W,
    accepting Q."

    Args:
        text: Full ADR document text.

    Returns:
        List of (section_type, heading, content) tuples derived from the
        Y-statement. Falls back to heading-based splitting if the pattern
        does not match.
    """
    match = Y_STATEMENT_PATTERN.search(text)
    if not match:
        # Fall back to heading-based splitting
        return _split_by_sections(text)

    sections = []

    # Also include any heading-based sections found in the document
    heading_sections = _split_by_sections(text)
    for st, heading, content in heading_sections:
        if st != "other":
            sections.append((st, heading, content))

    # Extract from Y-statement if sections not already covered
    existing_types = {s[0] for s in sections}

    context_text = match.group(1).strip()
    facing_text = match.group(2).strip()
    decision_text = match.group(3).strip()
    achieve_text = match.group(4).strip()
    accepting_text = match.group(5).strip() if match.group(5) else ""

    if "context" not in existing_types:
        sections.append(("context", "Context", f"In the context of {context_text}, facing {facing_text}"))

    if "decision" not in existing_types:
        sections.append(("decision", "Decision", f"We decided {decision_text}, to achieve {achieve_text}"))

    if "consequences" not in existing_types and accepting_text:
        sections.append(("consequences", "Consequences", f"Accepting {accepting_text}"))

    # Include the full Y-statement as a decision chunk if no sections were extracted
    if not sections:
        sections.append(("decision", "Y-Statement", match.group(0).strip()))

    return sections


def chunk(filename, binary=None, from_page=0, to_page=100000,
          lang="Chinese", callback=None, **kwargs):
    """Parse an ADR document into section-based chunks.

    Detects MADR, Nygard, and Y-statement formats. Splits the document
    into per-section chunks (Context, Decision, Consequences, etc.) with
    section_type metadata. ADR-level metadata (status, title, date,
    superseded_by) is attached to every chunk.

    Args:
        filename: Name of the ADR file (Markdown or text).
        binary: Raw file content as bytes.
        from_page: Unused (kept for interface compatibility).
        to_page: Unused (kept for interface compatibility).
        lang: Language hint for tokenization.
        callback: Progress callback function(progress_float, message_str).
        **kwargs: Additional config including parser_config, kb_id, tenant_id.

    Returns:
        List of chunk dicts, each containing content_with_weight, tokenized
        fields, filename, section_type, and ADR metadata (adr_status,
        adr_title, adr_date, superseded_by).
    """
    if callback is None:
        callback = lambda prog, msg="": None

    # Handle empty input
    if not binary:
        return []

    # Decode binary to text
    try:
        text = binary.decode("utf-8")
    except UnicodeDecodeError:
        text = binary.decode("utf-8", errors="replace")

    if not text.strip():
        return []

    # Base document fields shared across all chunks
    doc = {
        "docnm_kwd": filename,
        "title_tks": rag_tokenizer.tokenize(re.sub(r"\.[a-zA-Z]+$", "", filename)),
    }

    callback(0.1, "Start to parse ADR document.")

    # Extract ADR-level metadata
    metadata = _extract_adr_metadata(text)

    # Detect format and split into sections
    fmt = _detect_format(text)
    logger.debug("ADR format detected: %s for file %s", fmt, filename)

    if fmt == "y_statement":
        sections = _parse_y_statement(text)
    else:
        sections = _split_by_sections(text)

    # Filter out empty or trivially short sections
    sections = [(st, heading, content) for st, heading, content in sections if content.strip()]

    # If no ADR sections detected, return single chunk with full content (fallback)
    adr_section_types = {st for st, _, _ in sections if st != "other"}
    if not adr_section_types:
        d = deepcopy(doc)
        d["content_with_weight"] = text.strip()
        d["content_ltks"] = rag_tokenizer.tokenize(text.strip())
        d["content_sm_ltks"] = rag_tokenizer.fine_grained_tokenize(d["content_ltks"])
        d["section_type"] = "full"
        d["tag_kwd"] = ["adr"]
        d.update(metadata)
        callback(0.6, "No ADR sections detected, returning single chunk.")
        return [d]

    # Build one chunk per section
    res = []
    total = len(sections)
    for idx, (section_type, heading, content) in enumerate(sections):
        # Include heading in chunk content for context
        chunk_text = f"{heading}\n\n{content}".strip() if heading else content.strip()

        d = deepcopy(doc)
        d["content_with_weight"] = chunk_text
        d["content_ltks"] = rag_tokenizer.tokenize(chunk_text)
        d["content_sm_ltks"] = rag_tokenizer.fine_grained_tokenize(d["content_ltks"])
        d["section_type"] = section_type
        d["tag_kwd"] = ["adr", section_type]

        # Attach ADR metadata to every chunk
        d.update(metadata)

        res.append(d)

        if total > 0:
            callback(0.1 + 0.5 * (idx + 1) / total,
                     f"Parsed section {idx + 1}/{total}: {section_type}")

    callback(0.6, f"Parsed {len(res)} sections from ADR document ({fmt} format).")
    return res
