"""Tests for the test connection handler in connector_sync_worker.

Validates that the handle_test_connection function correctly instantiates
connectors, loads credentials, validates settings, and publishes results
to the expected Redis pub/sub channel.
"""
import json
import sys
import types
from unittest.mock import MagicMock, patch

import pytest

# Mock heavy dependencies before importing the module under test
_modules_to_mock = [
    "config",
    "common.log_utils",
    "common.settings",
    "common.data_source.interfaces",
    "db.db_models",
    "db.services.connector_service",
    "xxhash",
]

for mod_name in _modules_to_mock:
    if mod_name not in sys.modules:
        mod = types.ModuleType(mod_name)
        sys.modules[mod_name] = mod

# Set required config values
sys.modules["config"].REDIS_HOST = "localhost"
sys.modules["config"].REDIS_PORT = 6379
sys.modules["config"].REDIS_PASSWORD = ""

from connector_sync_worker import handle_test_connection, _get_connector_class


@pytest.fixture
def mock_redis():
    """Create a mock Redis client for testing."""
    return MagicMock()


class TestHandleTestConnection:
    """Tests for the handle_test_connection function."""

    def test_successful_connection(self, mock_redis):
        """Test connection succeeds when connector validates without errors."""
        mock_connector = MagicMock()
        mock_connector.load_credentials = MagicMock()
        mock_connector.validate_connector_settings = MagicMock()

        mock_cls = MagicMock(return_value=mock_connector)

        task = {
            "test_id": "test-123",
            "source_type": "github",
            "config": {"access_token": "ghp_test"},
        }

        with patch("connector_sync_worker._get_connector_class", return_value=mock_cls), \
             patch("connector_sync_worker._extract_constructor_kwargs", return_value={}), \
             patch("connector_sync_worker._extract_credentials", return_value={"access_token": "ghp_test"}):
            handle_test_connection(task, mock_redis)

        # Verify result was published
        mock_redis.publish.assert_called_once()
        channel, payload = mock_redis.publish.call_args[0]
        assert channel == "connector_test:test-123:result"

        result = json.loads(payload)
        assert result["success"] is True
        assert "successful" in result["message"].lower()

    def test_unsupported_source_type(self, mock_redis):
        """Test connection fails for unsupported source types."""
        task = {
            "test_id": "test-456",
            "source_type": "nonexistent_connector",
            "config": {},
        }

        with patch("connector_sync_worker._get_connector_class", return_value=None):
            handle_test_connection(task, mock_redis)

        channel, payload = mock_redis.publish.call_args[0]
        result = json.loads(payload)
        assert result["success"] is False
        assert "Unsupported" in result["message"]

    def test_credential_validation_failure(self, mock_redis):
        """Test connection fails when load_credentials raises an error."""
        mock_connector = MagicMock()
        mock_connector.load_credentials.side_effect = ValueError("Invalid API token")

        mock_cls = MagicMock(return_value=mock_connector)

        task = {
            "test_id": "test-789",
            "source_type": "confluence",
            "config": {"api_token": "bad-token"},
        }

        with patch("connector_sync_worker._get_connector_class", return_value=mock_cls), \
             patch("connector_sync_worker._extract_constructor_kwargs", return_value={}), \
             patch("connector_sync_worker._extract_credentials", return_value={"api_token": "bad-token"}):
            handle_test_connection(task, mock_redis)

        channel, payload = mock_redis.publish.call_args[0]
        result = json.loads(payload)
        assert result["success"] is False
        assert "Invalid API token" in result["message"]

    def test_settings_validation_failure(self, mock_redis):
        """Test connection fails when validate_connector_settings raises."""
        mock_connector = MagicMock()
        mock_connector.load_credentials = MagicMock()
        mock_connector.validate_connector_settings.side_effect = RuntimeError("Bad settings")

        mock_cls = MagicMock(return_value=mock_connector)

        task = {
            "test_id": "test-abc",
            "source_type": "slack",
            "config": {"token": "xoxb-test"},
        }

        with patch("connector_sync_worker._get_connector_class", return_value=mock_cls), \
             patch("connector_sync_worker._extract_constructor_kwargs", return_value={}), \
             patch("connector_sync_worker._extract_credentials", return_value={"token": "xoxb-test"}):
            handle_test_connection(task, mock_redis)

        channel, payload = mock_redis.publish.call_args[0]
        result = json.loads(payload)
        assert result["success"] is False
        assert "Bad settings" in result["message"]

    def test_result_channel_format(self, mock_redis):
        """Test that the result is published to the correct channel format."""
        task = {
            "test_id": "unique-id-42",
            "source_type": "unknown_type",
            "config": {},
        }

        with patch("connector_sync_worker._get_connector_class", return_value=None):
            handle_test_connection(task, mock_redis)

        channel = mock_redis.publish.call_args[0][0]
        assert channel == "connector_test:unique-id-42:result"
