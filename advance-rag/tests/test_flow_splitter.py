"""Unit tests for rag.flow.splitter.splitter module.

Tests the SplitterParam validation and the Splitter component's
_invoke method for different input formats (text, markdown, json).
External dependencies (storage, upstream schemas, pipeline) are mocked.
"""
import asyncio
import os
import sys
import pytest
from unittest.mock import MagicMock, patch, AsyncMock

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestSplitterParam:
    """Tests for SplitterParam validation and defaults."""

    def test_default_values(self):
        """Verify SplitterParam has sensible defaults."""
        from rag.flow.splitter.splitter import SplitterParam
        param = SplitterParam()
        assert param.chunk_token_size == 512
        assert param.delimiters == ["\n"]
        assert param.overlapped_percent == 0
        assert param.children_delimiters == []
        assert param.table_context_size == 0
        assert param.image_context_size == 0

    def test_check_valid_params(self):
        """Verify valid parameters pass check without raising."""
        from rag.flow.splitter.splitter import SplitterParam
        param = SplitterParam()
        # Should not raise
        param.check()

    def test_get_input_form_empty(self):
        """Verify get_input_form returns empty dict."""
        from rag.flow.splitter.splitter import SplitterParam
        param = SplitterParam()
        assert param.get_input_form() == {}


def _make_splitter(delimiters=None, chunk_token_size=128,
                   children_delimiters=None, table_context_size=0,
                   image_context_size=0):
    """Create a Splitter with mocked pipeline and params.

    Args:
        delimiters: List of delimiter strings.
        chunk_token_size: Target chunk token count.
        children_delimiters: Sub-splitting delimiters.
        table_context_size: Context size for table chunks.
        image_context_size: Context size for image chunks.

    Returns:
        Splitter instance with mocked dependencies.
    """
    from rag.flow.splitter.splitter import Splitter, SplitterParam
    param = SplitterParam()
    param.chunk_token_size = chunk_token_size
    param.delimiters = delimiters or ["\n"]
    param.children_delimiters = children_delimiters or []
    param.table_context_size = table_context_size
    param.image_context_size = image_context_size

    # Mock the pipeline (canvas) and component infrastructure
    mock_pipeline = MagicMock()
    mock_pipeline.callback = MagicMock()
    mock_pipeline._tenant_id = "tenant-1"

    splitter = Splitter.__new__(Splitter)
    splitter._param = param
    splitter._canvas = mock_pipeline
    splitter._id = "splitter-1"
    splitter._output = {}
    splitter.callback = MagicMock()
    splitter.set_output = MagicMock()
    return splitter


class TestSplitter:
    """Tests for the Splitter component _invoke method."""

    @patch("rag.flow.splitter.splitter.naive_merge")
    def test_text_format_uses_naive_merge(self, mock_naive_merge):
        """Verify text format input calls naive_merge for chunking."""
        async def _run():
            mock_naive_merge.return_value = ["chunk 1", "chunk 2"]
            splitter = _make_splitter()

            # Mock the upstream validation
            with patch("rag.flow.splitter.splitter.SplitterFromUpstream") as MockSchema:
                mock_upstream = MagicMock()
                mock_upstream.output_format = "text"
                mock_upstream.text_result = "Some long text content here."
                MockSchema.model_validate.return_value = mock_upstream

                await splitter._invoke(
                    name="test.txt",
                    output_format="text",
                    text="Some long text content here.",
                    _created_time=0,
                )

            mock_naive_merge.assert_called_once()
            # set_output should be called with chunks
            splitter.set_output.assert_any_call("output_format", "chunks")

        asyncio.run(_run())

    @patch("rag.flow.splitter.splitter.naive_merge")
    def test_markdown_format_processed(self, mock_naive_merge):
        """Verify markdown format input is processed through naive_merge."""
        async def _run():
            mock_naive_merge.return_value = ["# Title\nContent"]
            splitter = _make_splitter()

            with patch("rag.flow.splitter.splitter.SplitterFromUpstream") as MockSchema:
                mock_upstream = MagicMock()
                mock_upstream.output_format = "markdown"
                mock_upstream.markdown_result = "# Title\nContent paragraph."
                MockSchema.model_validate.return_value = mock_upstream

                await splitter._invoke(
                    name="test.md",
                    output_format="markdown",
                    markdown="# Title\nContent paragraph.",
                    _created_time=0,
                )

            mock_naive_merge.assert_called_once()

        asyncio.run(_run())

    def test_invalid_input_sets_error(self):
        """Verify invalid upstream input sets an error output."""
        async def _run():
            splitter = _make_splitter()

            with patch("rag.flow.splitter.splitter.SplitterFromUpstream") as MockSchema:
                MockSchema.model_validate.side_effect = ValueError("Invalid input")

                await splitter._invoke(invalid_key="bad data")

            # Should set error output
            calls = [c for c in splitter.set_output.call_args_list if c[0][0] == "_ERROR"]
            assert len(calls) >= 1

        asyncio.run(_run())

    @patch("rag.flow.splitter.splitter.naive_merge")
    def test_empty_text_produces_empty_chunks(self, mock_naive_merge):
        """Verify empty text input produces empty chunk list."""
        async def _run():
            mock_naive_merge.return_value = [""]
            splitter = _make_splitter()

            with patch("rag.flow.splitter.splitter.SplitterFromUpstream") as MockSchema:
                mock_upstream = MagicMock()
                mock_upstream.output_format = "text"
                mock_upstream.text_result = ""
                MockSchema.model_validate.return_value = mock_upstream

                await splitter._invoke(
                    name="empty.txt",
                    output_format="text",
                    text="",
                    _created_time=0,
                )

            # Chunks list should have been set (possibly empty after strip)
            assert splitter.set_output.called

        asyncio.run(_run())

    @patch("rag.flow.splitter.splitter.naive_merge")
    def test_children_delimiters_sub_split(self, mock_naive_merge):
        """Verify children delimiters cause sub-splitting of chunks."""
        async def _run():
            mock_naive_merge.return_value = ["Part A---Part B", "Part C"]
            splitter = _make_splitter(children_delimiters=["---"])

            with patch("rag.flow.splitter.splitter.SplitterFromUpstream") as MockSchema:
                mock_upstream = MagicMock()
                mock_upstream.output_format = "text"
                mock_upstream.text_result = "Part A---Part B\nPart C"
                MockSchema.model_validate.return_value = mock_upstream

                await splitter._invoke(
                    name="test.txt",
                    output_format="text",
                    text="Part A---Part B\nPart C",
                    _created_time=0,
                )

            # set_output should be called with chunks that include sub-split results
            calls = [c for c in splitter.set_output.call_args_list if c[0][0] == "chunks"]
            assert len(calls) >= 1

        asyncio.run(_run())

    @patch("rag.flow.splitter.splitter.naive_merge")
    def test_html_format_processed(self, mock_naive_merge):
        """Verify html format input uses html_result payload."""
        async def _run():
            mock_naive_merge.return_value = ["<p>Content</p>"]
            splitter = _make_splitter()

            with patch("rag.flow.splitter.splitter.SplitterFromUpstream") as MockSchema:
                mock_upstream = MagicMock()
                mock_upstream.output_format = "html"
                mock_upstream.html_result = "<p>Content</p>"
                MockSchema.model_validate.return_value = mock_upstream

                await splitter._invoke(
                    name="test.html",
                    output_format="html",
                    html="<p>Content</p>",
                    _created_time=0,
                )

            mock_naive_merge.assert_called_once()

        asyncio.run(_run())

    @patch("rag.flow.splitter.splitter.naive_merge")
    def test_none_payload_treated_as_empty(self, mock_naive_merge):
        """Verify None payload is converted to empty string."""
        async def _run():
            mock_naive_merge.return_value = [""]
            splitter = _make_splitter()

            with patch("rag.flow.splitter.splitter.SplitterFromUpstream") as MockSchema:
                mock_upstream = MagicMock()
                mock_upstream.output_format = "text"
                mock_upstream.text_result = None
                MockSchema.model_validate.return_value = mock_upstream

                await splitter._invoke(
                    name="test.txt",
                    output_format="text",
                    text=None,
                    _created_time=0,
                )

            # naive_merge should receive empty string
            args = mock_naive_merge.call_args[0]
            assert args[0] == ""

        asyncio.run(_run())
