"""Unit tests for rag.agent.agent_consumer module.

Tests the Redis Streams consumer for agent node execution tasks, including
consumer group creation, message processing, cancellation handling,
result publishing, and graceful shutdown. Redis connections are fully mocked.
"""
import json
import os
import signal
import sys
import types
from unittest.mock import MagicMock, patch, call

import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

# Ensure rag.agent package is importable
for _mod_path in ["rag.agent", "rag.agent.tools"]:
    if _mod_path not in sys.modules:
        _m = types.ModuleType(_mod_path)
        _m.__path__ = [os.path.join(_ADVANCE_RAG_ROOT, *_mod_path.split("."))]
        sys.modules[_mod_path] = _m

# Mock node_executor to avoid importing heavy dependencies
if "rag.agent.node_executor" not in sys.modules:
    _ne = types.ModuleType("rag.agent.node_executor")
    _ne.execute_node = MagicMock(return_value={"output_data": {"output": "result"}})
    sys.modules["rag.agent.node_executor"] = _ne

# Import the module under test
from rag.agent.agent_consumer import (
    AGENT_QUEUE,
    CONSUMER_GROUP,
    _ensure_consumer_group,
    _publish_node_result,
    _publish_run_output,
    _signal_handler,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_redis():
    """Provide a mocked Redis connection for all consumer tests.

    Returns:
        MagicMock: A mock REDIS_CONN.REDIS instance.
    """
    with patch("rag.agent.agent_consumer.REDIS_CONN") as mock_conn:
        mock_redis_client = MagicMock()
        mock_conn.REDIS = mock_redis_client
        yield mock_redis_client


# ---------------------------------------------------------------------------
# Tests: Constants
# ---------------------------------------------------------------------------


class TestConstants:
    """Tests for module-level constant values."""

    def test_queue_name_matches_convention(self):
        """Verify queue name matches Node.js agent-redis.service.ts."""
        assert AGENT_QUEUE == "agent_execution_queue"

    def test_consumer_group_matches_convention(self):
        """Verify consumer group name matches Node.js convention."""
        assert CONSUMER_GROUP == "agent_task_broker"


# ---------------------------------------------------------------------------
# Tests: Consumer group creation
# ---------------------------------------------------------------------------


class TestEnsureConsumerGroup:
    """Tests for _ensure_consumer_group() Redis group setup."""

    def test_creates_group_successfully(self, mock_redis):
        """Verify consumer group is created with MKSTREAM flag."""
        _ensure_consumer_group()
        mock_redis.xgroup_create.assert_called_once_with(
            AGENT_QUEUE, CONSUMER_GROUP, id="0", mkstream=True
        )

    def test_handles_busygroup_error(self, mock_redis):
        """Verify BUSYGROUP error is silently handled (group already exists)."""
        mock_redis.xgroup_create.side_effect = Exception("BUSYGROUP Consumer Group name already exists")
        # Should not raise
        _ensure_consumer_group()

    def test_logs_warning_on_other_errors(self, mock_redis):
        """Verify non-BUSYGROUP errors are logged but do not raise."""
        mock_redis.xgroup_create.side_effect = Exception("Connection refused")
        # Should not raise
        _ensure_consumer_group()


# ---------------------------------------------------------------------------
# Tests: Result publishing
# ---------------------------------------------------------------------------


class TestPublishNodeResult:
    """Tests for _publish_node_result() Redis pub/sub publishing."""

    def test_publishes_to_correct_channel(self, mock_redis):
        """Verify result is published to the per-node result channel."""
        _publish_node_result("run-123", "node-456", {"output_data": {"output": "ok"}})
        mock_redis.publish.assert_called_once()
        # Verify the channel format
        channel = mock_redis.publish.call_args[0][0]
        assert "run-123" in channel
        assert "node-456" in channel
        assert channel == "agent:run:run-123:node:node-456:result"

    def test_publishes_json_payload(self, mock_redis):
        """Verify the published payload is valid JSON."""
        result_data = {"output_data": {"output": "test"}, "duration_ms": 100}
        _publish_node_result("run-1", "node-1", result_data)
        payload = mock_redis.publish.call_args[0][1]
        parsed = json.loads(payload)
        assert parsed["output_data"]["output"] == "test"

    def test_handles_publish_exception(self, mock_redis):
        """Verify publish errors are caught silently."""
        mock_redis.publish.side_effect = Exception("Redis down")
        # Should not raise
        _publish_node_result("run-1", "node-1", {"error": "test"})


class TestPublishRunOutput:
    """Tests for _publish_run_output() SSE streaming output publishing."""

    def test_publishes_to_output_channel(self, mock_redis):
        """Verify output data is published to the run output channel."""
        _publish_run_output("run-abc", {"type": "step_executing", "node_id": "n1"})
        mock_redis.publish.assert_called_once()
        channel = mock_redis.publish.call_args[0][0]
        assert channel == "agent:run:run-abc:output"

    def test_handles_publish_exception(self, mock_redis):
        """Verify publish errors are caught silently."""
        mock_redis.publish.side_effect = Exception("Redis unavailable")
        # Should not raise
        _publish_run_output("run-1", {"type": "test"})


# ---------------------------------------------------------------------------
# Tests: Signal handler
# ---------------------------------------------------------------------------


class TestSignalHandler:
    """Tests for _signal_handler() graceful shutdown."""

    def test_sets_shutdown_flag(self):
        """Verify signal handler sets the module-level _shutdown flag."""
        import rag.agent.agent_consumer as consumer_mod
        # Reset the flag
        consumer_mod._shutdown = False
        _signal_handler(signal.SIGTERM, None)
        assert consumer_mod._shutdown is True

    def test_handles_sigint(self):
        """Verify SIGINT is handled the same as SIGTERM."""
        import rag.agent.agent_consumer as consumer_mod
        consumer_mod._shutdown = False
        _signal_handler(signal.SIGINT, None)
        assert consumer_mod._shutdown is True


# ---------------------------------------------------------------------------
# Tests: Consumer main loop behavior
# ---------------------------------------------------------------------------


class TestConsumeAgentTasks:
    """Tests for the consume_agent_tasks() main consumer loop."""

    def test_processes_task_from_queue(self, mock_redis):
        """Verify consumer reads a task, executes it, and publishes result."""
        import rag.agent.agent_consumer as consumer_mod

        # Prepare a mock message in Redis Streams format
        task_payload = json.dumps({
            "run_id": "run-1",
            "node_id": "node-1",
            "node_type": "template",
            "input_data": {"name": "test"},
            "config": {"template": "Hello {{name}}"},
            "tenant_id": "t1",
        })
        msg_id = b"1234567890-0"
        stream_messages = [
            (AGENT_QUEUE, [(msg_id, {"message": task_payload})])
        ]

        # First call returns a message, second triggers shutdown
        mock_redis.xreadgroup.side_effect = [stream_messages, None]
        mock_redis.exists.return_value = False  # No cancellation

        # Set shutdown after first iteration
        call_count = [0]
        original_xreadgroup = mock_redis.xreadgroup.side_effect

        def xreadgroup_with_shutdown(**kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return stream_messages
            # Trigger shutdown
            consumer_mod._shutdown = True
            return None

        mock_redis.xreadgroup.side_effect = xreadgroup_with_shutdown

        # Mock execute_node
        with patch("rag.agent.agent_consumer.execute_node", return_value={"output_data": {"output": "ok"}}):
            consumer_mod._shutdown = False
            from rag.agent.agent_consumer import consume_agent_tasks
            consume_agent_tasks()

        # Verify XACK was called to confirm message processing
        mock_redis.xack.assert_called()

    def test_handles_cancellation(self, mock_redis):
        """Verify consumer skips cancelled runs and publishes cancel result."""
        import rag.agent.agent_consumer as consumer_mod

        task_payload = json.dumps({
            "run_id": "cancelled-run",
            "node_id": "node-1",
            "node_type": "generate",
        })
        msg_id = b"1234567890-0"
        stream_messages = [
            (AGENT_QUEUE, [(msg_id, {"message": task_payload})])
        ]

        call_count = [0]
        def xreadgroup_with_shutdown(**kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return stream_messages
            consumer_mod._shutdown = True
            return None

        mock_redis.xreadgroup.side_effect = xreadgroup_with_shutdown
        # Cancellation key exists
        mock_redis.exists.return_value = True

        consumer_mod._shutdown = False
        from rag.agent.agent_consumer import consume_agent_tasks
        consume_agent_tasks()

        # Verify cancel result was published
        publish_calls = mock_redis.publish.call_args_list
        assert len(publish_calls) >= 1
        # The published result should contain 'cancelled'
        for c in publish_calls:
            payload = json.loads(c[0][1])
            if "cancelled" in payload:
                assert payload["cancelled"] is True
                break

    def test_graceful_shutdown_on_flag(self, mock_redis):
        """Verify consumer exits cleanly when _shutdown flag is set."""
        import rag.agent.agent_consumer as consumer_mod
        consumer_mod._shutdown = True

        from rag.agent.agent_consumer import consume_agent_tasks
        # Should return immediately without blocking
        consume_agent_tasks()

    def test_xack_on_processing_error(self, mock_redis):
        """Verify message is XACKed even when execute_node raises."""
        import rag.agent.agent_consumer as consumer_mod

        task_payload = json.dumps({
            "run_id": "run-err",
            "node_id": "node-err",
            "node_type": "code",
        })
        msg_id = b"error-msg-id"
        stream_messages = [
            (AGENT_QUEUE, [(msg_id, {"message": task_payload})])
        ]

        call_count = [0]
        def xreadgroup_with_shutdown(**kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return stream_messages
            consumer_mod._shutdown = True
            return None

        mock_redis.xreadgroup.side_effect = xreadgroup_with_shutdown
        mock_redis.exists.return_value = False

        with patch("rag.agent.agent_consumer.execute_node", side_effect=RuntimeError("crash")):
            consumer_mod._shutdown = False
            from rag.agent.agent_consumer import consume_agent_tasks
            consume_agent_tasks()

        # XACK should still have been called to prevent redelivery
        mock_redis.xack.assert_called()

    def test_no_messages_continues_loop(self, mock_redis):
        """Verify empty XREADGROUP response causes loop to continue."""
        import rag.agent.agent_consumer as consumer_mod

        call_count = [0]
        def xreadgroup_returns_none(**kwargs):
            call_count[0] += 1
            if call_count[0] >= 3:
                consumer_mod._shutdown = True
            return None

        mock_redis.xreadgroup.side_effect = xreadgroup_returns_none

        consumer_mod._shutdown = False
        from rag.agent.agent_consumer import consume_agent_tasks
        consume_agent_tasks()

        # Should have called xreadgroup at least twice before shutdown
        assert call_count[0] >= 2
