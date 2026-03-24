"""Unit tests for the Q&A document parser module.

Tests FAQ extraction logic, prefix removal, document formatting helpers,
markdown question level detection, and file extension dispatch in
rag/app/qa.py. External parsers and databases are mocked.
"""

import os
import sys
import types
import pytest
from unittest.mock import MagicMock, patch

_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


# ---------------------------------------------------------------------------
# Stub heavy dependencies
# ---------------------------------------------------------------------------
def _ensure_mock_module(name: str):
    """Register a mock module in sys.modules if not already importable.

    Args:
        name: Dotted module path to mock.
    """
    if name not in sys.modules:
        try:
            __import__(name)
        except (ImportError, ModuleNotFoundError):
            mod = types.ModuleType(name)
            sys.modules[name] = mod
            parts = name.split(".")
            for i in range(1, len(parts)):
                parent = ".".join(parts[:i])
                if parent not in sys.modules:
                    sys.modules[parent] = types.ModuleType(parent)


_mock_rag_tokenizer = MagicMock()
_mock_rag_tokenizer.tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()
_mock_rag_tokenizer.fine_grained_tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()

_ensure_mock_module("common.settings")
_ensure_mock_module("common.token_utils")
_ensure_mock_module("rag.nlp")
sys.modules["rag.nlp"].rag_tokenizer = _mock_rag_tokenizer

for _fn_name in [
    "is_english", "random_choices", "qbullets_category", "add_positions",
    "has_qbullet", "docx_question_level", "tokenize_table", "concat_img",
]:
    if not hasattr(sys.modules["rag.nlp"], _fn_name):
        setattr(sys.modules["rag.nlp"], _fn_name, MagicMock())

# Default is_english to return False
sys.modules["rag.nlp"].is_english = lambda x: False
sys.modules["rag.nlp"].random_choices = lambda lst, k=30: lst[:k]

dummy_callback = lambda prog=None, msg="": None


# ---------------------------------------------------------------------------
# Import functions under test
# ---------------------------------------------------------------------------
from rag.app.qa import rmPrefix, beAdoc, beAdocDocx, beAdocPdf, mdQuestionLevel


class TestRmPrefix:
    """Tests for the rmPrefix helper that strips Q&A prefixes."""

    def test_removes_chinese_question_prefix(self):
        """Should remove '问题：' prefix."""
        assert rmPrefix("问题：什么是AI？") == "什么是AI？"

    def test_removes_english_question_prefix(self):
        """Should remove 'Question: ' prefix."""
        assert rmPrefix("Question: What is AI?") == "What is AI?"

    def test_removes_q_prefix(self):
        """Should remove 'Q: ' prefix."""
        assert rmPrefix("Q: What is ML?") == "What is ML?"

    def test_removes_answer_prefix(self):
        """Should remove 'Answer: ' prefix."""
        assert rmPrefix("Answer: AI is artificial intelligence.") == "AI is artificial intelligence."

    def test_removes_chinese_answer_prefix(self):
        """Should remove '回答：' prefix."""
        assert rmPrefix("回答：人工智能是...") == "人工智能是..."

    def test_removes_a_prefix(self):
        """Should remove 'A: ' prefix."""
        assert rmPrefix("A: It stands for AI") == "It stands for AI"

    def test_preserves_text_without_prefix(self):
        """Text without a known prefix should be unchanged."""
        assert rmPrefix("No prefix here") == "No prefix here"

    def test_strips_whitespace(self):
        """Should strip leading and trailing whitespace."""
        assert rmPrefix("  Q: spaced  ") == "spaced"

    def test_case_insensitive(self):
        """Prefix matching should be case-insensitive."""
        assert rmPrefix("question: lowercase?") == "lowercase?"
        assert rmPrefix("QUESTION: UPPER?") == "UPPER?"

    def test_handles_user_prefix(self):
        """Should remove 'user: ' prefix."""
        assert rmPrefix("user: my question") == "my question"

    def test_handles_assistant_prefix(self):
        """Should remove 'assistant: ' prefix."""
        assert rmPrefix("assistant: my answer") == "my answer"


class TestMdQuestionLevel:
    """Tests for mdQuestionLevel markdown heading detection."""

    def test_h1_heading(self):
        """Should detect level-1 heading."""
        level, text = mdQuestionLevel("# Main Title")
        assert level == 1
        assert text == "Main Title"

    def test_h2_heading(self):
        """Should detect level-2 heading."""
        level, text = mdQuestionLevel("## Section")
        assert level == 2
        assert text == "Section"

    def test_h3_heading(self):
        """Should detect level-3 heading."""
        level, text = mdQuestionLevel("### Subsection")
        assert level == 3
        assert text == "Subsection"

    def test_no_heading(self):
        """Non-heading text should return level 0."""
        level, text = mdQuestionLevel("Regular text")
        assert level == 0
        assert text == "Regular text"

    def test_empty_string(self):
        """Empty string should return level 0."""
        level, text = mdQuestionLevel("")
        assert level == 0

    def test_heading_with_extra_spaces(self):
        """Heading should strip leading spaces after hash marks."""
        level, text = mdQuestionLevel("##   Spaced  ")
        assert level == 2
        assert text == "Spaced  "


class TestBeAdoc:
    """Tests for the beAdoc document formatting helper."""

    def test_english_format(self):
        """English format should use 'Question: ' and 'Answer: ' prefixes."""
        d = {}
        result = beAdoc(d, "What is AI?", "AI is artificial intelligence.", True)

        assert "Question: " in result["content_with_weight"]
        assert "Answer: " in result["content_with_weight"]
        assert "content_ltks" in result
        assert "content_sm_ltks" in result

    def test_chinese_format(self):
        """Chinese format should use '问题：' and '回答：' prefixes."""
        d = {}
        result = beAdoc(d, "什么是AI？", "AI是人工智能。", False)

        assert "问题：" in result["content_with_weight"]
        assert "回答：" in result["content_with_weight"]

    def test_row_num_stored_when_positive(self):
        """When row_num >= 0, it should be stored in top_int."""
        d = {}
        result = beAdoc(d, "Q", "A", True, row_num=5)

        assert result["top_int"] == [5]

    def test_row_num_not_stored_when_negative(self):
        """When row_num < 0, top_int should not be set."""
        d = {}
        result = beAdoc(d, "Q", "A", True, row_num=-1)

        assert "top_int" not in result

    def test_prefix_removed_from_question(self):
        """Q&A prefixes should be stripped from the content."""
        d = {}
        result = beAdoc(d, "Q: What is ML?", "A: Machine learning", True)

        # The rmPrefix should strip the Q/A prefixes
        assert "Q: Q:" not in result["content_with_weight"]


class TestBeAdocDocx:
    """Tests for the beAdocDocx document formatting helper."""

    def test_image_stored_when_present(self):
        """When image is provided, it should be stored in the doc dict."""
        d = {}
        mock_image = MagicMock()
        result = beAdocDocx(d, "Question", "Answer", True, mock_image)

        assert result["image"] is mock_image
        assert result["doc_type_kwd"] == "image"

    def test_no_image_field_when_none(self):
        """When image is None, image field should not be set."""
        d = {}
        result = beAdocDocx(d, "Question", "Answer", True, None)

        assert "image" not in result

    def test_row_num_stored(self):
        """Row number should be stored in top_int."""
        d = {}
        result = beAdocDocx(d, "Q", "A", True, None, row_num=3)

        assert result["top_int"] == [3]


class TestBeAdocPdf:
    """Tests for the beAdocPdf document formatting helper."""

    def test_image_stored_when_present(self):
        """When image is provided, it should be stored in the doc dict."""
        d = {}
        mock_image = MagicMock()
        result = beAdocPdf(d, "Question", "Answer", True, mock_image, [(0, 0, 0, 0, 0)])

        assert result["image"] is mock_image
        assert result["doc_type_kwd"] == "image"

    def test_no_image_field_when_none(self):
        """When image is None, image field should not be set."""
        d = {}
        result = beAdocPdf(d, "Question", "Answer", True, None, [(0, 0, 0, 0, 0)])

        assert "image" not in result


class TestQaChunkDispatch:
    """Tests for the chunk() function's file extension dispatch."""

    def test_unsupported_extension_raises_not_implemented(self):
        """An unsupported extension should raise NotImplementedError."""
        from rag.app.qa import chunk

        with pytest.raises(NotImplementedError):
            chunk("data.xyz", binary=b"content", callback=dummy_callback)

    @patch("rag.app.qa.get_text", return_value="Q1\tA1\nQ2\tA2")
    def test_txt_file_tab_delimited(self, mock_get_text):
        """A .txt file with tab-delimited Q&A should extract pairs."""
        from rag.app.qa import chunk

        result = chunk("faq.txt", binary=b"Q1\tA1\nQ2\tA2", callback=dummy_callback)

        # Should produce at least one Q&A pair
        assert len(result) >= 1
        # Each result should have content_with_weight
        for r in result:
            assert "content_with_weight" in r

    @patch("rag.app.qa.get_text", return_value="Q1,A1\nQ2,A2")
    def test_txt_file_comma_delimited(self, mock_get_text):
        """A .txt file with comma-delimited Q&A should extract pairs."""
        from rag.app.qa import chunk

        result = chunk("faq.txt", binary=b"Q1,A1\nQ2,A2", callback=dummy_callback)

        assert len(result) >= 1

    @patch("rag.app.qa.get_text", return_value="# FAQ\n## What is AI?\nAI is artificial intelligence.\n## What is ML?\nML is machine learning.")
    def test_markdown_file_extracts_qa_pairs(self, mock_get_text):
        """A markdown file should extract Q&A pairs from headings."""
        from rag.app.qa import chunk

        result = chunk("faq.md", binary=b"# FAQ\n## What is AI?\nAI is...", callback=dummy_callback)

        # Should produce at least one Q&A pair from headings
        assert len(result) >= 1

    @patch("rag.app.qa.get_text", return_value="Q1\tA1\nQ2\tA2")
    def test_csv_file_tab_delimited(self, mock_get_text):
        """A .csv file with tab-delimited Q&A should extract pairs."""
        from rag.app.qa import chunk

        result = chunk("faq.csv", binary=b"Q1\tA1\nQ2\tA2", callback=dummy_callback)

        assert len(result) >= 1


class TestQaMarkdownParsing:
    """Tests for markdown Q&A parsing edge cases."""

    @patch("rag.app.qa.get_text", return_value="# Top\nno answer yet\n## Q1\nAnswer 1\n## Q2\nAnswer 2")
    def test_question_stack_builds_hierarchy(self, mock_get_text):
        """Nested headings should build a question hierarchy."""
        from rag.app.qa import chunk

        result = chunk("faq.md", binary=b"content", callback=dummy_callback)

        # Should extract Q&A pairs; h2 headings under h1
        assert len(result) >= 1

    @patch("rag.app.qa.get_text", return_value="No headings\nJust plain text\nNothing to parse")
    def test_no_headings_produces_no_results(self, mock_get_text):
        """Markdown with no headings should produce no Q&A pairs."""
        from rag.app.qa import chunk

        result = chunk("plain.md", binary=b"content", callback=dummy_callback)

        assert len(result) == 0

    @patch("rag.app.qa.get_text", return_value="# Q1\nA1\n```\n## not a heading\n```\n# Q2\nA2")
    def test_code_blocks_skip_heading_detection(self, mock_get_text):
        """Headings inside code blocks should not be treated as questions."""
        from rag.app.qa import chunk

        result = chunk("faq.md", binary=b"content", callback=dummy_callback)

        # The ## inside code block should not be a separate question
        assert len(result) == 2
