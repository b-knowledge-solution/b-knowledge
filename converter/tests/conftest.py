"""Shared fixtures and configuration for converter tests.

Provides common test fixtures including mock Redis clients, sample job data,
file tracking records, and temporary directories for PDF processing tests.
"""
import os
import sys
from unittest.mock import MagicMock
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Module-level mocks — must be installed before any src.* imports
# ---------------------------------------------------------------------------

# Mock loguru-based logger so tests never write to stderr/files
_mock_logger_module = MagicMock()
sys.modules.setdefault('src.logger', _mock_logger_module)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_redis():
    """Create a mock Redis client with common methods stubbed.

    Returns:
        MagicMock: A mock Redis client supporting hgetall, hget, hset,
            smembers, get, delete, pipeline, and ping.
    """
    r = MagicMock()
    r.ping.return_value = True
    r.pipeline.return_value = MagicMock()
    r.pipeline.return_value.execute.return_value = []
    return r


@pytest.fixture
def sample_job_data():
    """Return a minimal version job dict as stored in Redis.

    Returns:
        dict: Job data with id, versionId, projectId, categoryId,
            status, fileCount, and config fields.
    """
    return {
        'id': 'job-001',
        'versionId': 'ver-001',
        'projectId': 'proj-001',
        'categoryId': 'cat-001',
        'status': 'converting',
        'fileCount': '2',
        'completedCount': '0',
        'failedCount': '0',
        'config': '',
    }


@pytest.fixture
def sample_file_data():
    """Return a minimal file tracking dict as stored in Redis.

    Returns:
        dict: File tracking record with id, jobId, fileName, filePath,
            and status fields.
    """
    return {
        'id': 'file-001',
        'jobId': 'job-001',
        'fileName': 'document.docx',
        'filePath': '/uploads/proj-001/cat-001/ver-001/document.docx',
        'status': 'pending',
    }


@pytest.fixture
def tmp_upload_dir(tmp_path):
    """Create a temporary upload directory structure for file processing tests.

    Args:
        tmp_path: pytest built-in tmp_path fixture.

    Returns:
        Path: Root of the temporary upload directory.
    """
    upload_dir = tmp_path / 'uploads'
    upload_dir.mkdir()
    return upload_dir
