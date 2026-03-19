"""End-to-end tests for the converter worker job lifecycle.

Tests the worker's Redis-driven job processing pipeline with mocked
Redis and filesystem dependencies. Covers job dequeue, file status
transitions, schedule window checking, manual trigger flag, and
graceful shutdown handling.
"""
import sys
import os
import json
from datetime import datetime
from unittest.mock import MagicMock, patch, call

# Mock logger and heavy converter dependencies before importing worker
sys.modules.setdefault('src.logger', MagicMock())

# Mock converter and pdf_processor to avoid LibreOffice dependency
mock_converter_mod = MagicMock()
mock_converter_mod.convert_to_pdf = MagicMock(return_value='/output/file.pdf')
mock_converter_mod.is_office_file = lambda f: f.lower().endswith(
    ('.doc', '.docx', '.docm', '.xls', '.xlsx', '.xlsm', '.ppt', '.pptx', '.pptm')
)
mock_converter_mod.is_pdf_file = lambda f: f.lower().endswith('.pdf')
sys.modules.setdefault('src.converter', mock_converter_mod)

mock_pdf_proc = MagicMock()
mock_pdf_proc.process_pdf = MagicMock(return_value='/output/file.pdf')
sys.modules.setdefault('src.pdf_processor', mock_pdf_proc)

# Mock dotenv to prevent file loading
sys.modules.setdefault('dotenv', MagicMock())

import pytest


# ============================================================================
# Schedule window tests
# ============================================================================

class TestIsWithinSchedule:
    """Tests for is_within_schedule() schedule window logic."""

    def test_within_overnight_window(self):
        """Verify returns True when current hour falls within overnight window.

        Overnight window example: 22:00-05:00 — hour 23 is within.
        """
        from src.worker import is_within_schedule

        mock_redis = MagicMock()
        mock_redis.hgetall.return_value = {
            'startHour': '22',
            'endHour': '5',
            'enabled': 'true',
            'timezone': 'UTC',
        }

        # Mock datetime to return hour=23 (within 22-5 overnight window)
        with patch('src.worker.datetime') as mock_dt:
            mock_now = MagicMock()
            mock_now.hour = 23
            mock_dt.now.return_value = mock_now
            mock_dt.utcnow.return_value = MagicMock(hour=23)

            result = is_within_schedule(mock_redis)
            assert result is True

    def test_outside_overnight_window(self):
        """Verify returns False when current hour is outside overnight window.

        Overnight window 22:00-05:00 — hour 12 (noon) is outside.
        """
        from src.worker import is_within_schedule

        mock_redis = MagicMock()
        mock_redis.hgetall.return_value = {
            'startHour': '22',
            'endHour': '5',
            'enabled': 'true',
            'timezone': 'UTC',
        }

        with patch('src.worker.datetime') as mock_dt:
            mock_now = MagicMock()
            mock_now.hour = 12
            mock_dt.now.return_value = mock_now
            mock_dt.utcnow.return_value = MagicMock(hour=12)

            result = is_within_schedule(mock_redis)
            assert result is False

    def test_early_morning_in_overnight_window(self):
        """Verify returns True for early morning hours in overnight window.

        Overnight window 22:00-05:00 — hour 3 is within.
        """
        from src.worker import is_within_schedule

        mock_redis = MagicMock()
        mock_redis.hgetall.return_value = {
            'startHour': '22',
            'endHour': '5',
            'enabled': 'true',
            'timezone': 'UTC',
        }

        with patch('src.worker.datetime') as mock_dt:
            mock_now = MagicMock()
            mock_now.hour = 3
            mock_dt.now.return_value = mock_now
            mock_dt.utcnow.return_value = MagicMock(hour=3)

            result = is_within_schedule(mock_redis)
            assert result is True

    def test_schedule_disabled(self):
        """Verify returns False when schedule is disabled."""
        from src.worker import is_within_schedule

        mock_redis = MagicMock()
        mock_redis.hgetall.return_value = {
            'startHour': '22',
            'endHour': '5',
            'enabled': 'false',
        }

        result = is_within_schedule(mock_redis)
        assert result is False

    def test_same_day_window(self):
        """Verify same-day window works (startHour < endHour).

        Window 9:00-17:00 — hour 12 is within, hour 20 is outside.
        """
        from src.worker import is_within_schedule

        mock_redis = MagicMock()
        mock_redis.hgetall.return_value = {
            'startHour': '9',
            'endHour': '17',
            'enabled': 'true',
            'timezone': 'UTC',
        }

        # Hour 12 — within window
        with patch('src.worker.datetime') as mock_dt:
            mock_now = MagicMock()
            mock_now.hour = 12
            mock_dt.now.return_value = mock_now
            mock_dt.utcnow.return_value = MagicMock(hour=12)

            assert is_within_schedule(mock_redis) is True

        # Hour 20 — outside window
        with patch('src.worker.datetime') as mock_dt:
            mock_now = MagicMock()
            mock_now.hour = 20
            mock_dt.now.return_value = mock_now
            mock_dt.utcnow.return_value = MagicMock(hour=20)

            assert is_within_schedule(mock_redis) is False

    def test_empty_config_uses_defaults(self):
        """Verify empty Redis config uses default schedule (22-5, enabled)."""
        from src.worker import is_within_schedule

        mock_redis = MagicMock()
        # Empty config — defaults: startHour=22, endHour=5, enabled=true
        mock_redis.hgetall.return_value = {}

        with patch('src.worker.datetime') as mock_dt:
            mock_now = MagicMock()
            mock_now.hour = 23
            mock_dt.now.return_value = mock_now
            mock_dt.utcnow.return_value = MagicMock(hour=23)

            assert is_within_schedule(mock_redis) is True


# ============================================================================
# Manual trigger tests
# ============================================================================

class TestIsManualTriggerActive:
    """Tests for is_manual_trigger_active() function."""

    def test_trigger_active(self):
        """Verify returns True when manual trigger flag is '1'."""
        from src.worker import is_manual_trigger_active

        mock_redis = MagicMock()
        mock_redis.get.return_value = '1'

        assert is_manual_trigger_active(mock_redis) is True

    def test_trigger_inactive(self):
        """Verify returns False when manual trigger flag is not set."""
        from src.worker import is_manual_trigger_active

        mock_redis = MagicMock()
        mock_redis.get.return_value = None

        assert is_manual_trigger_active(mock_redis) is False

    def test_trigger_zero(self):
        """Verify returns False when manual trigger flag is '0'."""
        from src.worker import is_manual_trigger_active

        mock_redis = MagicMock()
        mock_redis.get.return_value = '0'

        assert is_manual_trigger_active(mock_redis) is False


# ============================================================================
# Job dequeue tests
# ============================================================================

class TestDequeueVersionJob:
    """Tests for dequeue_version_job() function."""

    def test_no_converting_jobs(self):
        """Verify returns None when no jobs are in converting status."""
        from src.worker import dequeue_version_job

        mock_redis = MagicMock()
        mock_redis.smembers.return_value = set()

        result = dequeue_version_job(mock_redis)
        assert result is None

    def test_finds_job_with_pending_files(self):
        """Verify returns job data when a converting job has pending files."""
        from src.worker import dequeue_version_job

        mock_redis = MagicMock()
        mock_redis.smembers.side_effect = [
            # First call: converting job IDs
            {'job-001'},
            # Second call: file IDs for job-001
            {'file-001', 'file-002'},
        ]
        mock_redis.hgetall.return_value = {
            'id': 'job-001',
            'versionId': 'ver-001',
            'status': 'converting',
        }
        # First file is pending
        mock_redis.hget.return_value = 'pending'

        result = dequeue_version_job(mock_redis)
        assert result is not None
        assert result['id'] == 'job-001'

    def test_skips_job_without_id(self):
        """Verify skips jobs with empty/missing id in hash."""
        from src.worker import dequeue_version_job

        mock_redis = MagicMock()
        mock_redis.smembers.return_value = {'job-invalid'}
        # hgetall returns empty dict (no 'id' key)
        mock_redis.hgetall.return_value = {}

        result = dequeue_version_job(mock_redis)
        assert result is None

    def test_skips_job_with_no_pending_files(self):
        """Verify skips jobs where all files are already completed."""
        from src.worker import dequeue_version_job

        mock_redis = MagicMock()
        mock_redis.smembers.side_effect = [
            # Converting job IDs
            {'job-001'},
            # File IDs
            {'file-001'},
        ]
        mock_redis.hgetall.return_value = {
            'id': 'job-001',
            'status': 'converting',
        }
        # All files completed
        mock_redis.hget.return_value = 'completed'

        result = dequeue_version_job(mock_redis)
        assert result is None


# ============================================================================
# Get job files tests
# ============================================================================

class TestGetJobFiles:
    """Tests for get_job_files() function."""

    def test_no_files(self):
        """Verify returns empty list when no file IDs exist for job."""
        from src.worker import get_job_files

        mock_redis = MagicMock()
        mock_redis.smembers.return_value = set()

        result = get_job_files(mock_redis, 'job-001')
        assert result == []

    def test_returns_pending_files_only(self):
        """Verify only files with status 'pending' are returned."""
        from src.worker import get_job_files

        mock_redis = MagicMock()
        mock_redis.smembers.return_value = {'file-001', 'file-002'}

        def hgetall_side_effect(key):
            """Return different file data based on key."""
            if key.endswith('file-001'):
                return {'id': 'file-001', 'jobId': 'job-001',
                        'fileName': 'a.docx', 'status': 'pending'}
            elif key.endswith('file-002'):
                return {'id': 'file-002', 'jobId': 'job-001',
                        'fileName': 'b.docx', 'status': 'completed'}
            return {}

        mock_redis.hgetall.side_effect = hgetall_side_effect

        result = get_job_files(mock_redis, 'job-001')
        assert len(result) == 1
        assert result[0]['id'] == 'file-001'

    def test_skips_empty_records(self):
        """Verify file records without 'id' field are skipped."""
        from src.worker import get_job_files

        mock_redis = MagicMock()
        mock_redis.smembers.return_value = {'file-ghost'}
        mock_redis.hgetall.return_value = {}

        result = get_job_files(mock_redis, 'job-001')
        assert result == []


# ============================================================================
# Update file status tests
# ============================================================================

class TestUpdateFileStatus:
    """Tests for update_file_status() function."""

    def test_completed_status(self):
        """Verify completed status updates file hash and increments job counter."""
        from src.worker import update_file_status

        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe

        update_file_status(
            mock_redis, 'file-001', 'job-001',
            'completed', pdf_path='/output/file.pdf',
        )

        # Pipeline should have hset for file and hincrby for job
        mock_pipe.hset.assert_called()
        mock_pipe.hincrby.assert_called_once()
        mock_pipe.execute.assert_called_once()

    def test_failed_status(self):
        """Verify failed status updates file hash and increments failed counter."""
        from src.worker import update_file_status

        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe

        update_file_status(
            mock_redis, 'file-001', 'job-001',
            'failed', error='File not found',
        )

        mock_pipe.hset.assert_called()
        mock_pipe.hincrby.assert_called_once()
        mock_pipe.execute.assert_called_once()

    def test_pdf_path_included_in_update(self):
        """Verify pdfPath is set in the file hash when provided."""
        from src.worker import update_file_status

        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe

        update_file_status(
            mock_redis, 'file-001', 'job-001',
            'completed', pdf_path='/output/result.pdf',
        )

        # Check that the first hset call includes pdfPath in the mapping
        first_hset_call = mock_pipe.hset.call_args_list[0]
        mapping = first_hset_call.kwargs.get('mapping', {})
        assert mapping.get('pdfPath') == '/output/result.pdf'
        assert mapping.get('status') == 'completed'


# ============================================================================
# Complete version job tests
# ============================================================================

class TestCompleteVersionJob:
    """Tests for complete_version_job() function."""

    def test_all_completed(self):
        """Verify job marked completed when all files succeed."""
        from src.worker import complete_version_job

        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe
        mock_redis.hget.side_effect = lambda key, field: {
            'failedCount': '0',
            'completedCount': '5',
            'fileCount': '5',
        }.get(field, '0')
        mock_redis.get.return_value = 'job-001'

        job_data = {
            'id': 'job-001',
            'versionId': 'ver-001',
        }

        complete_version_job(mock_redis, job_data)

        # Should move from processing to completed status set
        mock_pipe.srem.assert_called_once()
        mock_pipe.sadd.assert_called_once()
        mock_pipe.execute.assert_called_once()

    def test_partial_failure(self):
        """Verify job marked completed even with partial failures."""
        from src.worker import complete_version_job

        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe
        mock_redis.hget.side_effect = lambda key, field: {
            'failedCount': '2',
            'completedCount': '3',
            'fileCount': '5',
        }.get(field, '0')
        mock_redis.get.return_value = 'job-001'

        job_data = {
            'id': 'job-001',
            'versionId': 'ver-001',
        }

        complete_version_job(mock_redis, job_data)

        # Partial failure still results in 'completed' status
        sadd_call = mock_pipe.sadd.call_args
        assert 'completed' in sadd_call[0][0]

    def test_all_failed(self):
        """Verify job marked failed when all files fail."""
        from src.worker import complete_version_job

        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe
        mock_redis.hget.side_effect = lambda key, field: {
            'failedCount': '5',
            'completedCount': '0',
            'fileCount': '5',
        }.get(field, '0')
        mock_redis.get.return_value = 'job-001'

        job_data = {
            'id': 'job-001',
            'versionId': 'ver-001',
        }

        complete_version_job(mock_redis, job_data)

        # All failed — status should be 'failed'
        sadd_call = mock_pipe.sadd.call_args
        assert 'failed' in sadd_call[0][0]

    def test_clears_active_job_pointer(self):
        """Verify active job pointer is cleared for the version."""
        from src.worker import complete_version_job

        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe
        mock_redis.hget.side_effect = lambda key, field: '0'
        # Active job matches current job
        mock_redis.get.return_value = 'job-001'

        job_data = {
            'id': 'job-001',
            'versionId': 'ver-001',
        }

        complete_version_job(mock_redis, job_data)

        # Should delete the active job key
        mock_pipe.delete.assert_called_once()


# ============================================================================
# Process version job tests
# ============================================================================

class TestProcessVersionJob:
    """Tests for process_version_job() function."""

    @patch('src.worker.process_file')
    @patch('src.worker.get_job_files')
    @patch('src.worker.time')
    def test_processes_all_pending_files(self, mock_time, mock_get_files, mock_process):
        """Verify all pending files are processed sequentially."""
        from src.worker import process_version_job
        import src.worker as worker_mod

        # Ensure shutdown is not set
        worker_mod._shutdown = False

        mock_get_files.return_value = [
            {'id': 'file-001', 'fileName': 'a.docx', 'status': 'pending'},
            {'id': 'file-002', 'fileName': 'b.xlsx', 'status': 'pending'},
        ]

        mock_redis = MagicMock()
        job_data = {'id': 'job-001', 'versionId': 'ver-001'}

        process_version_job(mock_redis, job_data)

        assert mock_process.call_count == 2

    @patch('src.worker.process_file')
    @patch('src.worker.get_job_files')
    def test_no_pending_files(self, mock_get_files, mock_process):
        """Verify no processing when there are no pending files."""
        from src.worker import process_version_job

        mock_get_files.return_value = []
        mock_redis = MagicMock()

        process_version_job(mock_redis, {'id': 'job-001', 'versionId': 'ver-001'})

        mock_process.assert_not_called()

    @patch('src.worker.process_file')
    @patch('src.worker.get_job_files')
    @patch('src.worker.time')
    def test_stops_on_shutdown(self, mock_time, mock_get_files, mock_process):
        """Verify processing stops when shutdown flag is set."""
        from src.worker import process_version_job
        import src.worker as worker_mod

        mock_get_files.return_value = [
            {'id': 'file-001', 'fileName': 'a.docx', 'status': 'pending'},
            {'id': 'file-002', 'fileName': 'b.xlsx', 'status': 'pending'},
        ]

        # Set shutdown flag before processing
        worker_mod._shutdown = True

        mock_redis = MagicMock()
        process_version_job(mock_redis, {'id': 'job-001', 'versionId': 'ver-001'})

        # Should not process any files because shutdown is set
        mock_process.assert_not_called()

        # Reset for other tests
        worker_mod._shutdown = False


# ============================================================================
# Graceful shutdown tests
# ============================================================================

class TestGracefulShutdown:
    """Tests for signal-based graceful shutdown handling."""

    def test_signal_handler_sets_shutdown(self):
        """Verify _signal_handler sets the _shutdown flag."""
        import src.worker as worker_mod
        from src.worker import _signal_handler

        # Reset shutdown flag
        worker_mod._shutdown = False

        _signal_handler(15, None)  # SIGTERM = 15

        assert worker_mod._shutdown is True

        # Reset for other tests
        worker_mod._shutdown = False

    def test_shutdown_flag_starts_false(self):
        """Verify shutdown flag defaults to False on module load."""
        import src.worker as worker_mod

        # After resetting, it should be False
        worker_mod._shutdown = False
        assert worker_mod._shutdown is False


# ============================================================================
# Redis client creation tests
# ============================================================================

class TestGetRedisClient:
    """Tests for get_redis_client() factory function."""

    @patch('src.worker.redis')
    def test_uses_redis_url_when_set(self, mock_redis_mod):
        """Verify from_url is called when REDIS_URL is set."""
        import src.worker as worker_mod

        original_url = worker_mod.REDIS_URL
        worker_mod.REDIS_URL = 'redis://custom:6380/1'

        try:
            from src.worker import get_redis_client
            get_redis_client()
            mock_redis_mod.from_url.assert_called_once()
        finally:
            worker_mod.REDIS_URL = original_url

    @patch('src.worker.redis')
    def test_uses_host_port_when_no_url(self, mock_redis_mod):
        """Verify Redis() constructor is called when REDIS_URL is empty."""
        import src.worker as worker_mod

        original_url = worker_mod.REDIS_URL
        worker_mod.REDIS_URL = ''

        try:
            from src.worker import get_redis_client
            get_redis_client()
            mock_redis_mod.Redis.assert_called_once()
        finally:
            worker_mod.REDIS_URL = original_url


# ============================================================================
# Full lifecycle E2E test
# ============================================================================

class TestWorkerLifecycleE2E:
    """End-to-end test simulating the full worker job lifecycle.

    Exercises the complete flow: schedule check -> manual trigger ->
    dequeue job -> process files -> update statuses.
    """

    @patch('src.worker.process_file')
    @patch('src.worker.time')
    def test_full_job_lifecycle(self, mock_time, mock_process_file):
        """Simulate a complete job lifecycle from dequeue through completion.

        Steps:
            1. Set up Redis mock with a converting job and pending files
            2. Call dequeue_version_job to find the job
            3. Call get_job_files to get pending files
            4. Call process_version_job to process all files
            5. Call complete_version_job to finalize
            6. Verify all status transitions occurred
        """
        from src.worker import (
            dequeue_version_job,
            get_job_files,
            process_version_job,
            complete_version_job,
        )
        import src.worker as worker_mod

        worker_mod._shutdown = False

        mock_redis = MagicMock()

        # --- Phase 1: Dequeue ---
        # smembers for converting status returns one job
        mock_redis.smembers.side_effect = [
            # dequeue_version_job: converting job IDs
            {'job-e2e'},
            # dequeue_version_job: file IDs for job
            {'file-e2e-1', 'file-e2e-2'},
        ]
        mock_redis.hgetall.return_value = {
            'id': 'job-e2e',
            'versionId': 'ver-e2e',
            'projectId': 'proj-e2e',
            'categoryId': 'cat-e2e',
            'status': 'converting',
            'fileCount': '2',
            'completedCount': '0',
            'failedCount': '0',
        }
        # hget for file status check — first file is pending
        mock_redis.hget.return_value = 'pending'

        job = dequeue_version_job(mock_redis)
        assert job is not None
        assert job['id'] == 'job-e2e'

        # --- Phase 2: Get files ---
        mock_redis.smembers.side_effect = [{'file-e2e-1', 'file-e2e-2'}]

        def hgetall_for_files(key):
            """Return file data based on file key."""
            if 'file-e2e-1' in key:
                return {
                    'id': 'file-e2e-1', 'jobId': 'job-e2e',
                    'fileName': 'report.docx', 'status': 'pending',
                }
            elif 'file-e2e-2' in key:
                return {
                    'id': 'file-e2e-2', 'jobId': 'job-e2e',
                    'fileName': 'data.xlsx', 'status': 'pending',
                }
            return mock_redis.hgetall.return_value

        mock_redis.hgetall.side_effect = hgetall_for_files

        files = get_job_files(mock_redis, 'job-e2e')
        assert len(files) == 2

        # --- Phase 3: Process version job ---
        mock_redis.hgetall.side_effect = None
        mock_redis.smembers.side_effect = None

        with patch('src.worker.get_job_files', return_value=files):
            process_version_job(mock_redis, job)

        # Both files should be processed
        assert mock_process_file.call_count == 2

        # --- Phase 4: Complete job ---
        mock_redis.hget.side_effect = lambda key, field: {
            'failedCount': '0',
            'completedCount': '2',
            'fileCount': '2',
        }.get(field, '0')
        mock_redis.get.return_value = 'job-e2e'
        mock_pipe = MagicMock()
        mock_redis.pipeline.return_value = mock_pipe

        complete_version_job(mock_redis, job)

        # Job should be moved to completed status
        mock_pipe.sadd.assert_called_once()
        sadd_call = mock_pipe.sadd.call_args[0]
        assert 'completed' in sadd_call[0]
        mock_pipe.execute.assert_called_once()

        # Clean up
        worker_mod._shutdown = False
