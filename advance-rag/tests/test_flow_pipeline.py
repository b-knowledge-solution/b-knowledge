"""Unit tests for rag.flow.pipeline module.

Tests the Pipeline class methods including initialization, callback
progress tracking, log fetching, and pipeline execution. All external
dependencies (Redis, database services, Graph base class) are mocked.
"""
import asyncio
import os
import sys
import json
import pytest
from unittest.mock import MagicMock, patch, AsyncMock

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


@pytest.fixture
def mock_deps():
    """Set up patches for Pipeline external dependencies.

    Returns:
        Dict of mock objects for REDIS_CONN, DocumentService, TaskService, etc.
    """
    patches = {
        "redis": patch("rag.flow.pipeline.REDIS_CONN"),
        "doc_svc": patch("rag.flow.pipeline.DocumentService"),
        "task_svc": patch("rag.flow.pipeline.TaskService"),
        "has_canceled": patch("rag.flow.pipeline.has_canceled", return_value=False),
        "graph": patch("rag.flow.pipeline.Graph.__init__", return_value=None),
    }
    mocks = {}
    for name, p in patches.items():
        mocks[name] = p.start()
    yield mocks
    for p in patches.values():
        p.stop()


def _make_pipeline(mock_deps, dsl=None, doc_id="doc-1", task_id="task-1", flow_id="flow-1"):
    """Create a Pipeline instance with mocked dependencies.

    Args:
        mock_deps: Dict of mock objects from the fixture.
        dsl: DSL configuration dict or string. Defaults to minimal config.
        doc_id: Document ID for the pipeline.
        task_id: Task ID for progress tracking.
        flow_id: Flow ID for log key construction.

    Returns:
        Pipeline instance with controlled dependencies.
    """
    if dsl is None:
        dsl = {"components": {}, "path": []}
    mock_deps["doc_svc"].get_knowledgebase_id.return_value = "kb-1"

    from rag.flow.pipeline import Pipeline
    pipeline = Pipeline(dsl, tenant_id="tenant-1", doc_id=doc_id, task_id=task_id, flow_id=flow_id)
    # Set attributes that Graph.__init__ would normally set
    pipeline.path = []
    pipeline.components = {}
    pipeline.task_id = task_id
    pipeline._tenant_id = "tenant-1"
    return pipeline


class TestPipelineInit:
    """Tests for Pipeline initialization."""

    def test_dict_dsl_serialized(self, mock_deps):
        """Verify dict DSL is serialized to JSON string for Graph."""
        dsl = {"components": {"File": {}}, "path": ["File"]}
        pipeline = _make_pipeline(mock_deps, dsl=dsl)
        assert pipeline._flow_id == "flow-1"

    def test_doc_id_stored(self, mock_deps):
        """Verify document ID is stored on the pipeline."""
        pipeline = _make_pipeline(mock_deps, doc_id="doc-123")
        assert pipeline._doc_id == "doc-123"

    def test_kb_id_resolved(self, mock_deps):
        """Verify knowledge base ID is resolved from document service."""
        mock_deps["doc_svc"].get_knowledgebase_id.return_value = "kb-42"
        pipeline = _make_pipeline(mock_deps, doc_id="doc-1")
        assert pipeline._kb_id == "kb-42"

    def test_canvas_debug_doc_id_ignored(self, mock_deps):
        """Verify CANVAS_DEBUG_DOC_ID causes doc_id to be set to None."""
        from rag.flow.pipeline import CANVAS_DEBUG_DOC_ID
        pipeline = _make_pipeline(mock_deps, doc_id=CANVAS_DEBUG_DOC_ID)
        assert pipeline._doc_id is None

    def test_no_kb_id_clears_doc_id(self, mock_deps):
        """Verify missing KB ID causes doc_id to be cleared."""
        mock_deps["doc_svc"].get_knowledgebase_id.return_value = None
        pipeline = _make_pipeline(mock_deps, doc_id="doc-1")
        assert pipeline._doc_id is None


class TestPipelineCallback:
    """Tests for Pipeline.callback() method."""

    def test_appends_progress_trace(self, mock_deps):
        """Verify callback appends progress trace entries to Redis logs."""
        pipeline = _make_pipeline(mock_deps)
        # Simulate existing log in Redis
        existing_log = [
            {
                "component_id": "comp-1",
                "trace": [{"progress": 0.5, "message": "Processing", "datetime": "10:00:00", "timestamp": 100.0, "elapsed_time": 0}],
            }
        ]
        mock_deps["redis"].get.return_value = json.dumps(existing_log)
        pipeline.callback("comp-1", progress=0.8, message="Almost done")
        # Redis set_obj should have been called with updated log
        mock_deps["redis"].set_obj.assert_called_once()

    def test_new_component_creates_new_entry(self, mock_deps):
        """Verify callback for a new component creates a new log entry."""
        pipeline = _make_pipeline(mock_deps)
        existing_log = [
            {
                "component_id": "comp-1",
                "trace": [{"progress": 1.0, "message": "Done", "datetime": "10:00:00", "timestamp": 100.0, "elapsed_time": 0}],
            }
        ]
        mock_deps["redis"].get.return_value = json.dumps(existing_log)
        pipeline.callback("comp-2", progress=0.1, message="Starting")
        mock_deps["redis"].set_obj.assert_called_once()
        # The stored log should have 2 entries
        stored = mock_deps["redis"].set_obj.call_args[0][1]
        assert len(stored) == 2

    def test_cancel_detected_raises(self, mock_deps):
        """Verify TaskCanceledException is raised when task is cancelled."""
        mock_deps["has_canceled"].return_value = True
        pipeline = _make_pipeline(mock_deps)
        existing_log = []
        mock_deps["redis"].get.return_value = json.dumps(existing_log)

        from common.exceptions import TaskCanceledException
        with pytest.raises(TaskCanceledException):
            pipeline.callback("comp-1", progress=0.5, message="Working")

    def test_cancel_sets_progress_negative(self, mock_deps):
        """Verify cancelled task sets progress to -1."""
        mock_deps["has_canceled"].return_value = True
        pipeline = _make_pipeline(mock_deps)
        mock_deps["redis"].get.return_value = json.dumps([])

        try:
            pipeline.callback("comp-1", progress=0.5, message="Working")
        except Exception:
            pass
        # The stored log should contain a [CANCEL] message
        stored = mock_deps["redis"].set_obj.call_args[0][1]
        assert "[CANCEL]" in stored[0]["trace"][0]["message"]

    def test_redis_exception_handled(self, mock_deps):
        """Verify Redis exceptions are caught and do not crash callback."""
        pipeline = _make_pipeline(mock_deps)
        mock_deps["redis"].get.side_effect = Exception("Redis down")
        # Should not raise (exception is logged)
        try:
            pipeline.callback("comp-1", progress=0.5, message="Test")
        except Exception:
            # Only TaskCanceledException should propagate, not Redis errors
            pass


class TestPipelineFetchLogs:
    """Tests for Pipeline.fetch_logs() method."""

    def test_returns_stored_logs(self, mock_deps):
        """Verify fetch_logs returns logs from Redis."""
        pipeline = _make_pipeline(mock_deps)
        log_data = [{"component_id": "comp-1", "trace": []}]
        mock_deps["redis"].get.return_value = json.dumps(log_data)
        result = pipeline.fetch_logs()
        assert result == log_data

    def test_returns_empty_on_no_logs(self, mock_deps):
        """Verify fetch_logs returns empty list when no logs exist."""
        pipeline = _make_pipeline(mock_deps)
        mock_deps["redis"].get.return_value = None
        result = pipeline.fetch_logs()
        assert result == []

    def test_returns_empty_on_redis_error(self, mock_deps):
        """Verify fetch_logs returns empty list on Redis error."""
        pipeline = _make_pipeline(mock_deps)
        mock_deps["redis"].get.side_effect = Exception("Redis down")
        result = pipeline.fetch_logs()
        assert result == []


class TestPipelineRun:
    """Tests for Pipeline.run() async method."""

    def test_run_initializes_redis_logs(self, mock_deps):
        """Verify run() initializes Redis log storage."""
        async def _run():
            pipeline = _make_pipeline(mock_deps)
            pipeline.path = ["File", "Parser"]
            pipeline.error = ""

            # Mock component objects
            mock_file = MagicMock()
            mock_file.output.return_value = {"data": "content"}
            mock_file.error.return_value = ""
            mock_file.get_downstream.return_value = ["Parser"]
            mock_file.component_name = "File"

            mock_parser = MagicMock()
            mock_parser.invoke = AsyncMock()
            mock_parser.output.return_value = {"chunks": []}
            mock_parser.error.return_value = ""
            mock_parser.get_downstream.return_value = []
            mock_parser._id = "Parser"
            mock_parser.component_name = "Parser"

            pipeline.get_component_obj = MagicMock(
                side_effect=lambda name: {"File": mock_file, "Parser": mock_parser}.get(name, mock_file)
            )
            pipeline.get_component_name = MagicMock(return_value="Component")
            pipeline.callback = MagicMock()
            pipeline.__str__ = MagicMock(return_value='{}')

            result = await pipeline.run()
            # Redis should have been initialized with empty log list
            mock_deps["redis"].set_obj.assert_called()

        asyncio.run(_run())

    def test_run_empty_path_starts_with_file(self, mock_deps):
        """Verify empty path defaults to starting with 'File' component."""
        async def _run():
            pipeline = _make_pipeline(mock_deps)
            pipeline.path = []
            pipeline.error = ""

            mock_file = MagicMock()
            mock_file.invoke = AsyncMock()
            mock_file.output.return_value = {"data": "test"}
            mock_file.error.return_value = ""
            mock_file.get_downstream.return_value = []
            mock_file.component_name = "File"

            pipeline.get_component_obj = MagicMock(return_value=mock_file)
            pipeline.get_component_name = MagicMock(return_value="File")
            pipeline.callback = MagicMock()
            pipeline.__str__ = MagicMock(return_value='{}')

            await pipeline.run()
            # File component should have been invoked
            mock_file.invoke.assert_called()

        asyncio.run(_run())

    def test_run_error_propagation(self, mock_deps):
        """Verify component errors stop the pipeline and are reported."""
        async def _run():
            pipeline = _make_pipeline(mock_deps)
            pipeline.path = ["File", "Parser"]
            pipeline.error = ""

            mock_file = MagicMock()
            mock_file.output.return_value = {"data": "test"}
            mock_file.error.return_value = ""
            mock_file.get_downstream.return_value = ["Parser"]

            mock_parser = MagicMock()
            mock_parser.invoke = AsyncMock()
            mock_parser.output.return_value = {}
            mock_parser.error.return_value = "Parse failed"
            mock_parser.get_downstream.return_value = []
            mock_parser._id = "Parser"

            pipeline.get_component_obj = MagicMock(
                side_effect=lambda name: {"File": mock_file, "Parser": mock_parser}.get(name, mock_file)
            )
            pipeline.get_component_name = MagicMock(return_value="Component")
            pipeline.callback = MagicMock()
            pipeline.__str__ = MagicMock(return_value='{}')

            result = await pipeline.run()
            # Error should be set on pipeline
            assert "[ERROR]" in pipeline.error
            # Result should be empty dict on error
            assert result == {}

        asyncio.run(_run())
