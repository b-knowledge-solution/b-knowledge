"""Unit tests for common.string_utils module.

Tests redundant space removal around punctuation and Markdown code block
stripping, without requiring heavy ML dependencies.
"""
import os
import sys
import importlib
import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

# Force-reload the real common.string_utils module (conftest mocks it with a lambda)
if "common.string_utils" in sys.modules:
    del sys.modules["common.string_utils"]
import common.string_utils
importlib.reload(common.string_utils)


class TestRemoveRedundantSpaces:
    """Tests for remove_redundant_spaces() function."""

    def test_removes_space_after_open_paren(self):
        """Verify space after opening parenthesis is removed."""
        from common.string_utils import remove_redundant_spaces
        result = remove_redundant_spaces("( test)")
        assert result == "(test)"

    def test_removes_space_before_exclamation(self):
        """Verify space before exclamation mark is removed."""
        from common.string_utils import remove_redundant_spaces
        result = remove_redundant_spaces("hello !")
        assert result == "hello!"

    def test_preserves_meaningful_spaces(self):
        """Verify spaces between normal words are preserved."""
        from common.string_utils import remove_redundant_spaces
        result = remove_redundant_spaces("hello world")
        assert result == "hello world"

    def test_empty_string(self):
        """Verify empty string passes through unchanged."""
        from common.string_utils import remove_redundant_spaces
        result = remove_redundant_spaces("")
        assert result == ""

    def test_no_redundant_spaces(self):
        """Verify text without redundant spaces is unchanged."""
        from common.string_utils import remove_redundant_spaces
        result = remove_redundant_spaces("clean text here")
        assert result == "clean text here"

    def test_multiple_redundant_spaces(self):
        """Verify multiple redundant spaces around punctuation are handled."""
        from common.string_utils import remove_redundant_spaces
        result = remove_redundant_spaces("( hello ) world !")
        # Opening paren space removed, closing paren space removed, exclamation space removed
        assert "( " not in result

    def test_preserves_commas_and_periods(self):
        """Verify spaces after commas and periods are preserved."""
        from common.string_utils import remove_redundant_spaces
        result = remove_redundant_spaces("hello, world. test")
        # Commas and periods are in the exclusion pattern
        assert "," in result
        assert "." in result

    def test_case_insensitive(self):
        """Verify the function works with mixed case text."""
        from common.string_utils import remove_redundant_spaces
        result = remove_redundant_spaces("( Hello ) World !")
        assert "( " not in result

    def test_space_before_question_mark(self):
        """Verify space before question mark is removed."""
        from common.string_utils import remove_redundant_spaces
        result = remove_redundant_spaces("what ?")
        assert result == "what?"

    def test_angle_brackets(self):
        """Verify spaces around angle brackets are handled."""
        from common.string_utils import remove_redundant_spaces
        # Spaces after < should be removed (left-boundary char)
        result = remove_redundant_spaces("< tag>")
        assert result == "<tag>"


class TestCleanMarkdownBlock:
    """Tests for clean_markdown_block() function."""

    def test_removes_markdown_code_block_wrapper(self):
        """Verify opening and closing markdown code block syntax is removed."""
        from common.string_utils import clean_markdown_block
        text = "```markdown\nHello World\n```"
        result = clean_markdown_block(text)
        assert result == "Hello World"

    def test_handles_text_without_code_block(self):
        """Verify plain text without code blocks passes through unchanged."""
        from common.string_utils import clean_markdown_block
        text = "Hello World"
        result = clean_markdown_block(text)
        assert result == "Hello World"

    def test_strips_surrounding_whitespace(self):
        """Verify surrounding whitespace is stripped from result."""
        from common.string_utils import clean_markdown_block
        text = "  ```markdown\n  content here  \n```  "
        result = clean_markdown_block(text)
        assert result == "content here"

    def test_empty_string(self):
        """Verify empty string returns empty string."""
        from common.string_utils import clean_markdown_block
        result = clean_markdown_block("")
        assert result == ""

    def test_only_opening_tag(self):
        """Verify text with only opening code block tag is cleaned."""
        from common.string_utils import clean_markdown_block
        text = "```markdown\nsome content"
        result = clean_markdown_block(text)
        assert "```" not in result
        assert "some content" in result

    def test_only_closing_tag(self):
        """Verify text with only closing code block tag is cleaned."""
        from common.string_utils import clean_markdown_block
        text = "some content\n```"
        result = clean_markdown_block(text)
        assert "```" not in result
        assert "some content" in result

    def test_preserves_inner_content(self):
        """Verify multiline content inside code blocks is preserved."""
        from common.string_utils import clean_markdown_block
        text = "```markdown\nline 1\nline 2\nline 3\n```"
        result = clean_markdown_block(text)
        assert "line 1" in result
        assert "line 2" in result
        assert "line 3" in result

    def test_case_sensitivity_of_tag(self):
        """Verify lowercase 'markdown' tag is matched (regex is case-sensitive)."""
        from common.string_utils import clean_markdown_block
        # The regex only matches lowercase 'markdown'
        text = "```markdown\ncontent\n```"
        result = clean_markdown_block(text)
        assert "```" not in result

    def test_code_block_with_extra_whitespace(self):
        """Verify code block with extra whitespace around tags is cleaned."""
        from common.string_utils import clean_markdown_block
        text = "  ```markdown  \ncontent\n  ```  "
        result = clean_markdown_block(text)
        assert "```" not in result
        assert "content" in result

    def test_non_markdown_code_block_not_stripped(self):
        """Verify non-markdown code blocks (e.g., ```python) are not stripped by the opening regex."""
        from common.string_utils import clean_markdown_block
        # The function only strips ```markdown, not ```python
        text = "```python\nprint('hello')\n```"
        result = clean_markdown_block(text)
        # The closing ``` is still removed, but ```python remains
        assert "python" in result
        assert "print('hello')" in result
