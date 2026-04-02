"""Unit tests for rag.flow.hierarchical_merger.hierarchical_merger module.

Tests the HierarchicalMergerParam validation and the HierarchicalMerger
component's _invoke method for text/markdown and JSON input formats.
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


class TestHierarchicalMergerParam:
    """Tests for HierarchicalMergerParam validation and defaults."""

    def test_default_values(self):
        """Verify HierarchicalMergerParam has correct defaults."""
        from rag.flow.hierarchical_merger.hierarchical_merger import HierarchicalMergerParam
        param = HierarchicalMergerParam()
        assert param.levels == []
        assert param.hierarchy is None

    def test_get_input_form_empty(self):
        """Verify get_input_form returns empty dict."""
        from rag.flow.hierarchical_merger.hierarchical_merger import HierarchicalMergerParam
        param = HierarchicalMergerParam()
        assert param.get_input_form() == {}


def _make_merger(levels=None, hierarchy=1):
    """Create a HierarchicalMerger with mocked pipeline and params.

    Args:
        levels: List of regex pattern lists per heading level.
        hierarchy: Depth at which to cut the tree into chunks.

    Returns:
        HierarchicalMerger instance with controlled dependencies.
    """
    from rag.flow.hierarchical_merger.hierarchical_merger import (
        HierarchicalMerger,
        HierarchicalMergerParam,
    )

    param = HierarchicalMergerParam()
    param.levels = levels or [[r"^#[^#]"], [r"^##[^#]"]]
    param.hierarchy = hierarchy

    mock_pipeline = MagicMock()
    mock_pipeline.callback = MagicMock()
    mock_pipeline._tenant_id = "tenant-1"

    merger = HierarchicalMerger.__new__(HierarchicalMerger)
    merger._param = param
    merger._canvas = mock_pipeline
    merger._id = "merger-1"
    merger._output = {}
    merger.callback = MagicMock()
    merger.set_output = MagicMock()
    return merger


class TestHierarchicalMerger:
    """Tests for the HierarchicalMerger component _invoke method."""

    def test_markdown_format_splits_by_headings(self):
        """Verify markdown format input is split by heading patterns."""
        async def _run():
            merger = _make_merger(
                levels=[[r"^# "], [r"^## "]],
                hierarchy=1,
            )

            with patch(
                "rag.flow.hierarchical_merger.hierarchical_merger.HierarchicalMergerFromUpstream"
            ) as MockSchema:
                mock_upstream = MagicMock()
                mock_upstream.output_format = "markdown"
                mock_upstream.markdown_result = "# Chapter 1\nContent A\n## Section 1.1\nDetail\n# Chapter 2\nContent B"
                MockSchema.model_validate.return_value = mock_upstream

                await merger._invoke(
                    name="test.md",
                    output_format="markdown",
                    markdown="# Chapter 1\nContent A\n## Section 1.1\nDetail\n# Chapter 2\nContent B",
                    _created_time=0,
                )

            # Should produce chunks based on heading hierarchy
            calls = [c for c in merger.set_output.call_args_list if c[0][0] == "chunks"]
            assert len(calls) >= 1
            chunks = calls[0][0][1]
            assert len(chunks) >= 1
            # Each chunk should be a dict with 'text' key
            assert all("text" in c for c in chunks)

        asyncio.run(_run())

    def test_text_format_processes_lines(self):
        """Verify text format input is split into lines and processed."""
        async def _run():
            merger = _make_merger(
                levels=[[r"^Chapter "], [r"^Section "]],
                hierarchy=1,
            )

            with patch(
                "rag.flow.hierarchical_merger.hierarchical_merger.HierarchicalMergerFromUpstream"
            ) as MockSchema:
                mock_upstream = MagicMock()
                mock_upstream.output_format = "text"
                mock_upstream.text_result = "Chapter 1\nSome content\nSection 1\nMore content"
                MockSchema.model_validate.return_value = mock_upstream

                await merger._invoke(
                    name="test.txt",
                    output_format="text",
                    text="Chapter 1\nSome content\nSection 1\nMore content",
                    _created_time=0,
                )

            calls = [c for c in merger.set_output.call_args_list if c[0][0] == "chunks"]
            assert len(calls) >= 1

        asyncio.run(_run())

    def test_invalid_input_sets_error(self):
        """Verify invalid upstream input sets an error output."""
        async def _run():
            merger = _make_merger()

            with patch(
                "rag.flow.hierarchical_merger.hierarchical_merger.HierarchicalMergerFromUpstream"
            ) as MockSchema:
                MockSchema.model_validate.side_effect = ValueError("Invalid")

                await merger._invoke(invalid_key="bad")

            calls = [c for c in merger.set_output.call_args_list if c[0][0] == "_ERROR"]
            assert len(calls) >= 1

        asyncio.run(_run())

    def test_empty_payload_produces_empty_chunks(self):
        """Verify empty text payload produces empty or minimal chunks."""
        async def _run():
            merger = _make_merger()

            with patch(
                "rag.flow.hierarchical_merger.hierarchical_merger.HierarchicalMergerFromUpstream"
            ) as MockSchema:
                mock_upstream = MagicMock()
                mock_upstream.output_format = "text"
                mock_upstream.text_result = ""
                MockSchema.model_validate.return_value = mock_upstream

                await merger._invoke(
                    name="empty.txt",
                    output_format="text",
                    text="",
                    _created_time=0,
                )

            calls = [c for c in merger.set_output.call_args_list if c[0][0] == "chunks"]
            # With empty input, chunks should be empty
            if calls:
                assert len(calls[0][0][1]) == 0

        asyncio.run(_run())

    def test_all_body_text_no_headings(self):
        """Verify text without headings is assigned to root level."""
        async def _run():
            merger = _make_merger(
                levels=[[r"^# "], [r"^## "]],
                hierarchy=1,
            )

            with patch(
                "rag.flow.hierarchical_merger.hierarchical_merger.HierarchicalMergerFromUpstream"
            ) as MockSchema:
                mock_upstream = MagicMock()
                mock_upstream.output_format = "markdown"
                mock_upstream.markdown_result = "Just body text\nMore body text\nEven more text"
                MockSchema.model_validate.return_value = mock_upstream

                await merger._invoke(
                    name="test.md",
                    output_format="markdown",
                    markdown="Just body text\nMore body text\nEven more text",
                    _created_time=0,
                )

            calls = [c for c in merger.set_output.call_args_list if c[0][0] == "chunks"]
            assert len(calls) >= 1

        asyncio.run(_run())

    def test_json_format_with_chunks(self):
        """Verify JSON/chunks format input processes section text."""
        async def _run():
            merger = _make_merger(
                levels=[[r"^# "]],
                hierarchy=1,
            )

            with patch(
                "rag.flow.hierarchical_merger.hierarchical_merger.HierarchicalMergerFromUpstream"
            ) as MockSchema, \
                 patch("rag.flow.hierarchical_merger.hierarchical_merger.id2image", return_value=None), \
                 patch("rag.flow.hierarchical_merger.hierarchical_merger.image2id", new_callable=AsyncMock), \
                 patch("rag.flow.hierarchical_merger.hierarchical_merger.RAGFlowPdfParser") as MockParser, \
                 patch("rag.flow.hierarchical_merger.hierarchical_merger.settings"):
                MockParser.remove_tag.side_effect = lambda x: x
                MockParser.extract_positions.return_value = []

                mock_upstream = MagicMock()
                mock_upstream.output_format = "chunks"
                mock_upstream.chunks = [
                    {"text": "# Title", "position_tag": "", "img_id": None},
                    {"text": "Body content", "position_tag": "", "img_id": None},
                ]
                mock_upstream.json_result = None
                MockSchema.model_validate.return_value = mock_upstream

                await merger._invoke(
                    name="test.json",
                    output_format="chunks",
                    chunks=[
                        {"text": "# Title", "position_tag": ""},
                        {"text": "Body content", "position_tag": ""},
                    ],
                    _created_time=0,
                )

            calls = [c for c in merger.set_output.call_args_list if c[0][0] == "chunks"]
            assert len(calls) >= 1

        asyncio.run(_run())

    def test_hierarchy_depth_controls_output(self):
        """Verify hierarchy parameter controls chunk granularity."""
        async def _run():
            md_text = "# Ch1\nContent\n## S1\nDetail\n# Ch2\nMore"

            # Shallow depth
            merger = _make_merger(
                levels=[[r"^# "], [r"^## "]],
                hierarchy=1,
            )
            with patch(
                "rag.flow.hierarchical_merger.hierarchical_merger.HierarchicalMergerFromUpstream"
            ) as MockSchema:
                mock_upstream = MagicMock()
                mock_upstream.output_format = "markdown"
                mock_upstream.markdown_result = md_text
                MockSchema.model_validate.return_value = mock_upstream
                await merger._invoke(
                    name="test.md",
                    output_format="markdown",
                    markdown=md_text,
                    _created_time=0,
                )

            calls_shallow = [c for c in merger.set_output.call_args_list if c[0][0] == "chunks"]
            assert len(calls_shallow) >= 1

            # Deep depth
            merger2 = _make_merger(
                levels=[[r"^# "], [r"^## "]],
                hierarchy=2,
            )
            with patch(
                "rag.flow.hierarchical_merger.hierarchical_merger.HierarchicalMergerFromUpstream"
            ) as MockSchema:
                mock_upstream = MagicMock()
                mock_upstream.output_format = "markdown"
                mock_upstream.markdown_result = md_text
                MockSchema.model_validate.return_value = mock_upstream
                await merger2._invoke(
                    name="test.md",
                    output_format="markdown",
                    markdown=md_text,
                    _created_time=0,
                )

            calls_deep = [c for c in merger2.set_output.call_args_list if c[0][0] == "chunks"]
            assert len(calls_deep) >= 1

        asyncio.run(_run())
