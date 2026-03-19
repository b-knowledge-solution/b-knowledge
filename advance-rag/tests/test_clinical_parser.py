"""Tests for the clinical document classification parser.

Validates that the clinical parser:
- Chunks documents using naive-style text splitting
- Adds 'clinical' tag to all chunks
- Produces chunks with all required tokenization fields
- Classifies documents via LLM into one of four categories
- Handles invalid LLM responses gracefully
- Handles LLM unavailability without failing
"""

import asyncio
import os
import sys
import types
from unittest.mock import MagicMock, AsyncMock, patch

import pytest

# ---------------------------------------------------------------------------
# Mock heavy NLP dependencies before importing the parser module
# ---------------------------------------------------------------------------

_mock_rag_tokenizer = MagicMock()
_mock_rag_tokenizer.tokenize = MagicMock(side_effect=lambda text: f"tokenized:{text[:30]}")
_mock_rag_tokenizer.fine_grained_tokenize = MagicMock(side_effect=lambda text: f"fine:{text[:30]}")

_mock_nlp_module = types.ModuleType("rag.nlp")
_mock_nlp_module.rag_tokenizer = _mock_rag_tokenizer

sys.modules.setdefault("rag.nlp", _mock_nlp_module)

# Mock deepdoc parser utils
_mock_deepdoc_utils = types.ModuleType("deepdoc.parser.utils")
_mock_deepdoc_utils.get_text = MagicMock(side_effect=lambda fn, binary: binary.decode("utf-8") if binary else "")
sys.modules.setdefault("deepdoc.parser.utils", _mock_deepdoc_utils)
sys.modules.setdefault("deepdoc", types.ModuleType("deepdoc"))
sys.modules.setdefault("deepdoc.parser", types.ModuleType("deepdoc.parser"))

# Mock common modules
_mock_settings = MagicMock()
sys.modules.setdefault("common", types.ModuleType("common"))
sys.modules.setdefault("common.settings", _mock_settings)
sys.modules.setdefault("common.token_utils", types.ModuleType("common.token_utils"))
sys.modules["common.token_utils"].num_tokens_from_string = MagicMock(side_effect=lambda text, *a: len(text.split()))

from rag.app.clinical import (
    chunk,
    classify_document,
    CLINICAL_CLASSIFICATION_PROMPT,
    VALID_CATEGORIES,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


@pytest.fixture
def clinical_protocol_binary():
    """Load the sample clinical protocol fixture as bytes."""
    path = os.path.join(FIXTURE_DIR, "sample_clinical_protocol.txt")
    with open(path, "rb") as f:
        return f.read()


@pytest.fixture
def progress_callback():
    """Create a no-op progress callback."""
    return MagicMock()


# ---------------------------------------------------------------------------
# Test: chunk() produces chunks with required fields
# ---------------------------------------------------------------------------

class TestClinicalChunk:
    """Tests for the clinical parser chunk() function."""

    def test_chunk_returns_list_of_dicts(self, clinical_protocol_binary, progress_callback):
        """chunk() returns a non-empty list of chunk dicts."""
        result = chunk(
            "protocol.txt",
            binary=clinical_protocol_binary,
            lang="English",
            callback=progress_callback,
        )
        assert isinstance(result, list)
        assert len(result) > 0

    def test_chunk_has_required_fields(self, clinical_protocol_binary, progress_callback):
        """Every chunk dict has content_with_weight, content_ltks, content_sm_ltks, docnm_kwd, title_tks."""
        result = chunk(
            "protocol.txt",
            binary=clinical_protocol_binary,
            lang="English",
            callback=progress_callback,
        )
        required_fields = {"content_with_weight", "content_ltks", "content_sm_ltks", "docnm_kwd", "title_tks"}
        for d in result:
            missing = required_fields - set(d.keys())
            assert not missing, f"Chunk missing fields: {missing}"

    def test_chunk_has_clinical_tag(self, clinical_protocol_binary, progress_callback):
        """Every chunk has tag_kwd containing 'clinical'."""
        result = chunk(
            "protocol.txt",
            binary=clinical_protocol_binary,
            lang="English",
            callback=progress_callback,
        )
        for d in result:
            assert "tag_kwd" in d, "Chunk missing tag_kwd field"
            assert "clinical" in d["tag_kwd"], f"tag_kwd {d['tag_kwd']} missing 'clinical'"

    def test_chunk_uses_naive_text_splitting(self, clinical_protocol_binary, progress_callback):
        """Chunks are produced by splitting text into paragraphs (naive style)."""
        result = chunk(
            "protocol.txt",
            binary=clinical_protocol_binary,
            lang="English",
            callback=progress_callback,
        )
        # Each chunk should have non-empty content
        for d in result:
            assert len(d["content_with_weight"].strip()) > 0

    def test_chunk_content_is_tokenized(self, clinical_protocol_binary, progress_callback):
        """content_ltks and content_sm_ltks are populated via rag_tokenizer."""
        result = chunk(
            "protocol.txt",
            binary=clinical_protocol_binary,
            lang="English",
            callback=progress_callback,
        )
        for d in result:
            assert d["content_ltks"].startswith("tokenized:")
            assert d["content_sm_ltks"].startswith("fine:")


# ---------------------------------------------------------------------------
# Test: classify_document() LLM classification
# ---------------------------------------------------------------------------

class TestClassifyDocument:
    """Tests for the async classify_document() function."""

    def test_classify_returns_protocol(self):
        """LLM returning 'protocol' is accepted as valid category."""
        chat_mdl = AsyncMock()
        chat_mdl.async_chat = AsyncMock(return_value="protocol")
        chat_mdl.llm_name = "test-model"

        result = asyncio.run(classify_document(
            chat_mdl,
            "Protocol XYZ-001: Phase III Randomized Controlled Trial\n\nStudy design content here...",
            "Protocol XYZ-001",
        ))
        assert result == "protocol"

    def test_classify_strips_whitespace(self):
        """LLM response with extra whitespace is cleaned."""
        chat_mdl = AsyncMock()
        chat_mdl.async_chat = AsyncMock(return_value="  regulatory  \n")
        chat_mdl.llm_name = "test-model"

        result = asyncio.run(classify_document(chat_mdl, "content", "title"))
        assert result == "regulatory"

    def test_classify_only_first_2000_tokens(self):
        """Only the first 2000 tokens of content are sent to the LLM."""
        chat_mdl = AsyncMock()
        chat_mdl.async_chat = AsyncMock(return_value="research")
        chat_mdl.llm_name = "test-model"

        # Create content with >2000 tokens (words)
        long_content = "word " * 5000

        result = asyncio.run(classify_document(chat_mdl, long_content, "title"))
        assert result == "research"

        # Verify the prompt sent to LLM does not contain the full 5000-word content
        call_args = chat_mdl.async_chat.call_args
        # Extract the system prompt (first positional arg)
        system_prompt = call_args[0][0] if call_args[0] else ""
        # Count occurrences of "word" in the prompt -- should be ~2000, not ~5000
        word_count = system_prompt.count("word")
        assert word_count <= 2100, f"Expected ~2000 words in prompt, got {word_count}"
        assert word_count >= 1900, f"Expected ~2000 words in prompt, got {word_count}"

    def test_classify_invalid_category_defaults_to_administrative(self):
        """LLM returning an invalid category falls back to 'administrative'."""
        chat_mdl = AsyncMock()
        chat_mdl.async_chat = AsyncMock(return_value="unknown_category")
        chat_mdl.llm_name = "test-model"

        result = asyncio.run(classify_document(chat_mdl, "content", "title"))
        assert result == "administrative"

    def test_classify_llm_failure_defaults_to_administrative(self):
        """When LLM call raises an exception, classification defaults to 'administrative'."""
        chat_mdl = AsyncMock()
        chat_mdl.async_chat = AsyncMock(side_effect=Exception("LLM unavailable"))
        chat_mdl.llm_name = "test-model"

        result = asyncio.run(classify_document(chat_mdl, "content", "title"))
        assert result == "administrative"


# ---------------------------------------------------------------------------
# Test: Constants
# ---------------------------------------------------------------------------

class TestConstants:
    """Tests for clinical parser constants."""

    def test_valid_categories(self):
        """VALID_CATEGORIES contains all four expected categories."""
        assert VALID_CATEGORIES == {"regulatory", "protocol", "research", "administrative"}

    def test_prompt_contains_categories(self):
        """CLINICAL_CLASSIFICATION_PROMPT mentions all four categories."""
        for cat in VALID_CATEGORIES:
            assert cat in CLINICAL_CLASSIFICATION_PROMPT
