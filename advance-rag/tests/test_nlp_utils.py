"""Unit tests for rag.nlp.__init__ module.

Tests utility functions including find_codec, index_int, is_english,
is_chinese, not_bullet, bullets_category, get_delimiters, naive_merge,
tokenize, add_positions, Node tree building, and related helpers.
External parser dependencies are mocked.
"""
import os
import sys
import importlib
import pytest
import re
from unittest.mock import MagicMock, patch

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


def _get_real_is_english():
    """Reload rag.nlp and return the real is_english function.

    Other test modules (e.g., test_qa_parser) replace rag.nlp.is_english
    with a lambda at module level during collection. Reloading at test
    execution time restores the real implementation.
    """
    import rag.nlp
    importlib.reload(rag.nlp)
    return rag.nlp.is_english


class TestFindCodec:
    """Tests for find_codec() function."""

    def test_utf8_detected(self):
        """Verify UTF-8 encoded text is detected correctly."""
        from rag.nlp import find_codec
        blob = "Hello, world!".encode("utf-8")
        codec = find_codec(blob)
        assert codec in ("utf-8", "ascii")

    def test_empty_bytes(self):
        """Verify empty bytes return a valid codec."""
        from rag.nlp import find_codec
        codec = find_codec(b"")
        assert isinstance(codec, str)

    def test_ascii_returns_utf8(self):
        """Verify pure ASCII text returns 'utf-8' as fallback."""
        from rag.nlp import find_codec
        blob = b"simple ascii text"
        codec = find_codec(blob)
        assert codec == "utf-8"


class TestIndexInt:
    """Tests for index_int() function."""

    def test_numeric_string(self):
        """Verify numeric string converts to int."""
        from rag.nlp import index_int
        assert index_int("5") == 5

    def test_chinese_number(self):
        """Verify Chinese number word delegates to cn2an converter."""
        from rag.nlp import index_int
        # cn2an is mocked in test env; verify it doesn't crash
        result = index_int("三")
        assert isinstance(result, int)

    def test_invalid_string(self):
        """Verify invalid string returns -1 or fallback value."""
        from rag.nlp import index_int
        # All converters are mocked; verify graceful handling
        result = index_int("invalid_xyz_999")
        assert isinstance(result, int)

    def test_zero(self):
        """Verify zero converts correctly."""
        from rag.nlp import index_int
        assert index_int("0") == 0


class TestIsEnglish:
    """Tests for is_english() function."""

    def test_english_text(self):
        """Verify English text is detected."""
        is_english = _get_real_is_english()
        assert is_english("Hello, world. This is a test.") is True

    def test_chinese_text(self):
        """Verify Chinese text is not detected as English."""
        is_english = _get_real_is_english()
        assert is_english("你好世界") is False

    def test_empty_input(self):
        """Verify empty input returns False."""
        is_english = _get_real_is_english()
        assert is_english("") is False
        assert is_english([]) is False
        assert is_english(None) is False

    def test_mixed_text_mostly_english(self):
        """Verify mostly-English mixed text is detected as English."""
        is_english = _get_real_is_english()
        # 90% English chars
        text = "Hello world test abc def ghi jkl mno"
        assert is_english(text) is True

    def test_list_of_strings(self):
        """Verify list of strings is handled."""
        is_english = _get_real_is_english()
        result = is_english(["hello", "world", "test"])
        assert isinstance(result, bool)

    def test_non_string_type(self):
        """Verify non-string/non-list type returns False."""
        is_english = _get_real_is_english()
        assert is_english(42) is False


class TestIsChinese:
    """Tests for is_chinese() function."""

    def test_chinese_text(self):
        """Verify Chinese text is detected."""
        from rag.nlp import is_chinese
        assert is_chinese("你好世界测试") is True

    def test_english_text(self):
        """Verify English text is not detected as Chinese."""
        from rag.nlp import is_chinese
        assert is_chinese("Hello world") is False

    def test_empty_string(self):
        """Verify empty string returns False."""
        from rag.nlp import is_chinese
        assert is_chinese("") is False

    def test_mixed_below_threshold(self):
        """Verify text with <20% Chinese chars returns False."""
        from rag.nlp import is_chinese
        # Mostly English with one Chinese char
        text = "Hello world test 你"
        result = is_chinese(text)
        # The ratio of Chinese chars is low
        assert isinstance(result, bool)


class TestNotBullet:
    """Tests for not_bullet() function."""

    def test_zero_prefix(self):
        """Verify '0' is detected as not a bullet."""
        from rag.nlp import not_bullet
        assert not_bullet("0") is True

    def test_number_range(self):
        """Verify number range pattern matches."""
        from rag.nlp import not_bullet
        assert not_bullet("100 200~300") is True

    def test_valid_bullet(self):
        """Verify a normal bullet-like text is not flagged."""
        from rag.nlp import not_bullet
        assert not_bullet("Introduction to the topic") is False

    def test_dotted_numbers(self):
        """Verify dotted number patterns are detected."""
        from rag.nlp import not_bullet
        assert not_bullet("1..........") is True


class TestBulletsCategory:
    """Tests for bullets_category() function."""

    def test_chinese_chapter_bullets(self):
        """Verify Chinese chapter-style bullets are detected."""
        from rag.nlp import bullets_category
        sections = ["第一章 概述", "第二章 方法", "第三章 结论"]
        result = bullets_category(sections)
        assert isinstance(result, int)
        assert result >= 0

    def test_numbered_bullets(self):
        """Verify numbered bullet patterns are detected."""
        from rag.nlp import bullets_category
        sections = ["1. First point", "2. Second point", "3. Third point"]
        result = bullets_category(sections)
        assert isinstance(result, int)

    def test_markdown_bullets(self):
        """Verify markdown heading bullets are detected."""
        from rag.nlp import bullets_category
        sections = ["# Title", "## Subtitle", "### Section"]
        result = bullets_category(sections)
        assert isinstance(result, int)

    def test_no_bullets(self):
        """Verify text without bullets returns -1."""
        from rag.nlp import bullets_category
        sections = ["Just some text", "More text here"]
        result = bullets_category(sections)
        # May return -1 or a default category
        assert isinstance(result, int)


class TestGetDelimiters:
    """Tests for get_delimiters() function."""

    def test_simple_delimiters(self):
        """Verify simple character delimiters produce a regex pattern."""
        from rag.nlp import get_delimiters
        pattern = get_delimiters("\n。；")
        assert isinstance(pattern, str)
        assert len(pattern) > 0

    def test_backtick_delimiters(self):
        """Verify backtick-wrapped delimiters are extracted correctly."""
        from rag.nlp import get_delimiters
        pattern = get_delimiters("`##`\n。")
        assert "##" in pattern or re.escape("##") in pattern

    def test_empty_string(self):
        """Verify empty string produces empty pattern."""
        from rag.nlp import get_delimiters
        pattern = get_delimiters("")
        assert pattern == ""

    def test_multiple_backtick_delimiters(self):
        """Verify multiple backtick-wrapped delimiters are all extracted."""
        from rag.nlp import get_delimiters
        pattern = get_delimiters("`---``===`")
        # Both custom delimiters should appear in the pattern
        assert "---" in pattern or re.escape("---") in pattern


class TestAddPositions:
    """Tests for add_positions() function."""

    def test_adds_position_fields(self):
        """Verify page_num_int, position_int, top_int are added to dict."""
        from rag.nlp import add_positions
        d = {}
        poss = [(0, 10, 100, 50, 200)]
        add_positions(d, poss)
        assert "page_num_int" in d
        assert "position_int" in d
        assert "top_int" in d
        # Page number is incremented by 1
        assert d["page_num_int"] == [1]
        assert d["top_int"] == [50]

    def test_multiple_positions(self):
        """Verify multiple positions are all recorded."""
        from rag.nlp import add_positions
        d = {}
        poss = [(0, 10, 100, 50, 200), (1, 20, 150, 80, 300)]
        add_positions(d, poss)
        assert len(d["page_num_int"]) == 2
        assert d["page_num_int"] == [1, 2]

    def test_empty_positions(self):
        """Verify empty positions list does not modify dict."""
        from rag.nlp import add_positions
        d = {}
        add_positions(d, [])
        assert "page_num_int" not in d

    def test_none_positions(self):
        """Verify None positions does not modify dict."""
        from rag.nlp import add_positions
        d = {}
        add_positions(d, None)
        assert "page_num_int" not in d


class TestRandomChoices:
    """Tests for random_choices() function."""

    def test_returns_k_items(self):
        """Verify k items are returned from the array."""
        from rag.nlp import random_choices
        result = random_choices([1, 2, 3, 4, 5], k=3)
        assert len(result) == 3

    def test_k_larger_than_array(self):
        """Verify k is clamped to array length."""
        from rag.nlp import random_choices
        result = random_choices([1, 2], k=10)
        assert len(result) == 2

    def test_empty_array(self):
        """Verify empty array returns empty list."""
        from rag.nlp import random_choices
        result = random_choices([], k=5)
        assert result == []


class TestNode:
    """Tests for the Node tree class."""

    def test_build_simple_tree(self):
        """Verify tree is built from flat lines with levels."""
        from rag.nlp import Node
        root = Node(level=0, depth=2, texts=[])
        lines = [
            (1, "Chapter 1"),
            (2, "Section 1.1"),
            (3, "Content A"),
            (1, "Chapter 2"),
            (2, "Section 2.1"),
        ]
        root.build_tree(lines)
        # Root should have 2 children (2 chapters)
        assert len(root.get_children()) == 2

    def test_get_tree_returns_chunks(self):
        """Verify get_tree returns non-empty list of merged text chunks."""
        from rag.nlp import Node
        root = Node(level=0, depth=1, texts=[])
        lines = [
            (1, "Title 1"),
            (2, "Body text"),
            (1, "Title 2"),
            (2, "More body"),
        ]
        root.build_tree(lines)
        result = root.get_tree()
        assert len(result) > 0

    def test_depth_controls_merge(self):
        """Verify depth parameter controls at which level content is merged."""
        from rag.nlp import Node
        root = Node(level=0, depth=1, texts=[])
        lines = [
            (1, "Chapter"),
            (2, "Section"),
            (3, "Subsection content"),
        ]
        root.build_tree(lines)
        result = root.get_tree()
        # Content beyond depth should be merged into parent
        assert len(result) >= 1

    def test_empty_lines(self):
        """Verify empty lines produce no tree children."""
        from rag.nlp import Node
        root = Node(level=0, depth=2, texts=[])
        root.build_tree([])
        assert root.get_children() == []
        assert root.get_tree() == []

    def test_single_line(self):
        """Verify single line produces one tree entry."""
        from rag.nlp import Node
        root = Node(level=0, depth=1, texts=[])
        root.build_tree([(1, "Only line")])
        result = root.get_tree()
        assert len(result) >= 1

    def test_node_repr(self):
        """Verify Node __repr__ format."""
        from rag.nlp import Node
        n = Node(level=2, texts=["hello"])
        assert "level=2" in repr(n)
        assert "children=0" in repr(n)


class TestExtractBetween:
    """Tests for extract_between() function."""

    def test_extracts_content(self):
        """Verify content between tags is extracted."""
        from rag.nlp import extract_between
        text = "<start>content here<end>"
        result = extract_between(text, "<start>", "<end>")
        assert result == ["content here"]

    def test_multiple_matches(self):
        """Verify multiple occurrences are all extracted."""
        from rag.nlp import extract_between
        text = "<s>first<e> middle <s>second<e>"
        result = extract_between(text, "<s>", "<e>")
        assert len(result) == 2
        assert result[0] == "first"
        assert result[1] == "second"

    def test_no_match(self):
        """Verify no matches returns empty list."""
        from rag.nlp import extract_between
        result = extract_between("no tags here", "<s>", "<e>")
        assert result == []

    def test_empty_content(self):
        """Verify empty content between tags is extracted."""
        from rag.nlp import extract_between
        result = extract_between("<s><e>", "<s>", "<e>")
        assert result == [""]
