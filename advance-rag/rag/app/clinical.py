"""Clinical document classification parser module for the RAG pipeline.

LLM-based classifier that auto-categorizes clinical documents into
regulatory, protocol, research, or administrative categories. Uses
naive-style text chunking for the document content, then the task
executor post-processes chunks with LLM classification stored as
metadata tags for filtering and ABAC policies.

The chunk() function produces standard chunks with a 'clinical' tag.
The classify_document() async function is called from task_executor.py
after parsing, following the same pattern as auto_keywords.
"""

import logging
import re
from copy import deepcopy

from deepdoc.parser.utils import get_text
from rag.nlp import rag_tokenizer
from common.token_utils import num_tokens_from_string

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_CATEGORIES = {"regulatory", "protocol", "research", "administrative"}

CLINICAL_CLASSIFICATION_PROMPT = """You are a clinical document classifier.
Classify the following document into exactly ONE of these categories:
- regulatory: FDA submissions, compliance docs, SOPs, audit reports
- protocol: Clinical trial protocols, study designs, amendments
- research: Journal articles, literature reviews, case studies, lab reports
- administrative: Meeting minutes, budgets, contracts, correspondence

Respond with ONLY the category name (one word, lowercase).

Document title: {title}
Document content (first page):
{content}

Category:"""

# Maximum tokens of document content sent to LLM for classification
MAX_CLASSIFY_TOKENS = 2000

# Target chunk size in tokens for naive-style splitting
DEFAULT_CHUNK_TOKEN_NUM = 512


def chunk(filename, binary=None, from_page=0, to_page=100000,
          lang="Chinese", callback=None, **kwargs):
    """Parse a clinical document using naive-style text chunking.

    Decodes the document binary to text, splits into paragraph-based
    chunks, and adds 'clinical' to tag_kwd on each chunk. The actual
    LLM-based classification (regulatory/protocol/research/administrative)
    runs as a post-parse step in task_executor.py.

    Args:
        filename: Original filename for metadata.
        binary: Raw file content as bytes.
        from_page: Starting page (unused for text files).
        to_page: Ending page (unused for text files).
        lang: Language hint for tokenization ('English', 'Chinese', etc.).
        callback: Progress callback function(progress_float, message_str).
        **kwargs: Additional params including parser_config, kb_id, tenant_id.

    Returns:
        List of chunk dicts with content_with_weight, content_ltks,
        content_sm_ltks, docnm_kwd, title_tks, and tag_kwd fields.
    """
    parser_config = kwargs.get("parser_config", {})
    chunk_token_num = int(parser_config.get("chunk_token_num", DEFAULT_CHUNK_TOKEN_NUM))

    if callback:
        callback(0.1, "Start to parse clinical document.")

    # Decode binary to text
    text = get_text(filename, binary)
    if not text or not text.strip():
        if callback:
            callback(1.0, "Empty document.")
        return []

    # Build base document metadata
    doc = {
        "docnm_kwd": filename,
        "title_tks": rag_tokenizer.tokenize(re.sub(r"\.[a-zA-Z]+$", "", filename))
    }

    # Split text into paragraphs by double-newline or section boundaries
    paragraphs = _split_into_paragraphs(text)

    if callback:
        callback(0.3, f"Split into {len(paragraphs)} paragraphs.")

    # Merge paragraphs into chunks respecting token limit
    chunks = _merge_paragraphs(paragraphs, chunk_token_num)

    if callback:
        callback(0.6, f"Merged into {len(chunks)} chunks.")

    # Build chunk dicts with tokenization fields
    res = []
    for i, chunk_text in enumerate(chunks):
        d = deepcopy(doc)
        d["content_with_weight"] = chunk_text
        d["content_ltks"] = rag_tokenizer.tokenize(chunk_text)
        d["content_sm_ltks"] = rag_tokenizer.fine_grained_tokenize(d["content_ltks"])
        # Tag every chunk as clinical for filtering
        d["tag_kwd"] = ["clinical"]
        d["top_int"] = [i]
        res.append(d)

    if callback:
        callback(0.9, f"Clinical document parsed: {len(res)} chunks.")

    return res


def _split_into_paragraphs(text):
    """Split document text into paragraphs by blank lines.

    Handles both Unix and Windows line endings. Strips leading/trailing
    whitespace from each paragraph and filters out empty results.

    Args:
        text: Full document text content.

    Returns:
        List of non-empty paragraph strings.
    """
    # Split on one or more blank lines
    raw_paragraphs = re.split(r"\n\s*\n", text)
    # Clean up and filter empty paragraphs
    return [p.strip() for p in raw_paragraphs if p.strip()]


def _merge_paragraphs(paragraphs, max_tokens):
    """Merge consecutive paragraphs until the token limit is reached.

    Combines small paragraphs into larger chunks to avoid very small
    chunks while respecting the max_tokens boundary.

    Args:
        paragraphs: List of paragraph strings.
        max_tokens: Maximum number of tokens per chunk.

    Returns:
        List of merged chunk strings.
    """
    if not paragraphs:
        return []

    chunks = []
    current = ""
    current_tokens = 0

    for para in paragraphs:
        para_tokens = num_tokens_from_string(para)

        # If adding this paragraph would exceed limit, finalize current chunk
        if current and (current_tokens + para_tokens) > max_tokens:
            chunks.append(current.strip())
            current = para
            current_tokens = para_tokens
        else:
            # Append paragraph to current chunk
            if current:
                current += "\n\n" + para
            else:
                current = para
            current_tokens += para_tokens

    # Don't forget the last chunk
    if current.strip():
        chunks.append(current.strip())

    return chunks


async def classify_document(chat_mdl, full_text, title):
    """Classify a clinical document into one of four categories using LLM.

    Sends the document title and first 2000 tokens of content to the
    LLM for classification. Returns one of: regulatory, protocol,
    research, or administrative. Falls back to 'administrative' if
    the LLM returns an invalid category or fails.

    This function is called from task_executor.py as a post-parse
    step, following the same async pattern as auto_keywords.

    Args:
        chat_mdl: LLMBundle instance for chat completion.
        full_text: Full document text content.
        title: Document title or filename.

    Returns:
        Classification category string (one of VALID_CATEGORIES).
    """
    try:
        # Truncate content to first MAX_CLASSIFY_TOKENS tokens
        words = full_text.split()
        if len(words) > MAX_CLASSIFY_TOKENS:
            content_preview = " ".join(words[:MAX_CLASSIFY_TOKENS])
        else:
            content_preview = full_text

        # Build the classification prompt
        prompt = CLINICAL_CLASSIFICATION_PROMPT.format(
            title=title,
            content=content_preview,
        )

        # Call LLM for classification
        result = await chat_mdl.async_chat(prompt, [{"role": "user", "content": prompt}], {})

        # Parse and validate the response
        if isinstance(result, tuple):
            # Some LLM implementations return (answer, token_count)
            result = result[0] if result else ""

        category = result.strip().lower() if result else ""

        # Validate against known categories
        if category in VALID_CATEGORIES:
            return category

        # Invalid response -- default to administrative
        logging.warning(
            "Clinical classifier returned invalid category '%s' for '%s', defaulting to 'administrative'",
            category, title
        )
        return "administrative"

    except Exception as e:
        # LLM failure is non-fatal -- classification is skipped
        logging.warning(
            "Clinical classification failed for '%s': %s. Defaulting to 'administrative'.",
            title, str(e)
        )
        return "administrative"
