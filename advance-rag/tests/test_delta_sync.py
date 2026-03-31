"""Unit tests for the delta sync logic in connector_sync_worker.py.

Tests the three core delta sync functions:
- _is_doc_unchanged: timestamp-based and hash-based change detection
- _get_existing_docs_manifest: building the lookup manifest from DB
- _delete_orphaned_docs: removing documents absent from source
- _ingest_documents: delta-aware ingestion (new, modified, skipped)
- _publish_progress: progress reporting with delta sync fields
- handle_sync_task: full orchestration with LoadConnector and PollConnector

All database, Redis, and file service dependencies are mocked.
"""

import json
import os
import sys
import types
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch, call

_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


# ---------------------------------------------------------------------------
# Stub heavy dependencies before importing the worker module
# ---------------------------------------------------------------------------
def _ensure_mock_module(name: str):
    """Register a mock module in sys.modules if not already importable.

    Args:
        name: Dotted module path to mock.
    """
    if name in sys.modules:
        return
    try:
        __import__(name)
        return
    except Exception:
        pass
    mod = types.ModuleType(name)
    mod.__path__ = []
    sys.modules[name] = mod
    parts = name.split(".")
    for i in range(1, len(parts)):
        parent = ".".join(parts[:i])
        if parent not in sys.modules:
            parent_mod = types.ModuleType(parent)
            parent_mod.__path__ = []
            sys.modules[parent] = parent_mod


# Mock config module before importing connector_sync_worker
_ensure_mock_module("config")
sys.modules["config"].REDIS_HOST = "localhost"
sys.modules["config"].REDIS_PORT = 6379
sys.modules["config"].REDIS_PASSWORD = None

# Mock dotenv
_ensure_mock_module("dotenv")
sys.modules["dotenv"].load_dotenv = lambda: None

# Mock loguru
_ensure_mock_module("loguru")
mock_logger = MagicMock()
sys.modules["loguru"].logger = mock_logger

# Mock redis with Redis class
_ensure_mock_module("redis")
sys.modules["redis"].Redis = MagicMock

# Mock xxhash (provide real-like behavior)
_ensure_mock_module("xxhash")


class _FakeXXH128:
    """Fake xxhash digest that returns a predictable hex string."""

    def __init__(self, data):
        # Use Python's built-in hash for determinism in tests
        self._data = data

    def hexdigest(self):
        """Return a 32-char hex string derived from the data."""
        import hashlib
        return hashlib.md5(self._data).hexdigest()


sys.modules["xxhash"].xxh128 = _FakeXXH128

# Mock DB and services
_ensure_mock_module("db")
_ensure_mock_module("db.db_models")
_ensure_mock_module("db.services")
_ensure_mock_module("db.services.document_service")
_ensure_mock_module("db.services.file_service")
_ensure_mock_module("db.services.knowledgebase_service")
_ensure_mock_module("db.services.doc_metadata_service")

# Mock common modules
_ensure_mock_module("common")
_ensure_mock_module("common.log_utils")
_ensure_mock_module("common.settings")
_ensure_mock_module("common.data_source")
_ensure_mock_module("common.data_source.interfaces")
_ensure_mock_module("common.data_source.models")
_ensure_mock_module("common.misc_utils")

# Provide a mock DB with connection_context as a context manager
mock_DB = MagicMock()
mock_DB.connection_context.return_value.__enter__ = MagicMock()
mock_DB.connection_context.return_value.__exit__ = MagicMock()
sys.modules["db.db_models"].DB = mock_DB

# Provide mock services
mock_DocumentService = MagicMock()
mock_FileService = MagicMock()
mock_KnowledgebaseService = MagicMock()
mock_DocMetadataService = MagicMock()

sys.modules["db.services.document_service"].DocumentService = mock_DocumentService
sys.modules["db.services.file_service"].FileService = mock_FileService
sys.modules["db.services.knowledgebase_service"].KnowledgebaseService = mock_KnowledgebaseService
sys.modules["db.services.doc_metadata_service"].DocMetadataService = mock_DocMetadataService

# Provide mock interfaces
mock_LoadConnector = type("LoadConnector", (), {})
mock_PollConnector = type("PollConnector", (), {})
mock_CheckpointedConnector = type("CheckpointedConnector", (), {})
mock_CheckpointedConnectorWithPermSync = type("CheckpointedConnectorWithPermSync", (), {})
mock_CheckpointOutputWrapper = MagicMock()

sys.modules["common.data_source.interfaces"].LoadConnector = mock_LoadConnector
sys.modules["common.data_source.interfaces"].PollConnector = mock_PollConnector
sys.modules["common.data_source.interfaces"].CheckpointedConnector = mock_CheckpointedConnector
sys.modules["common.data_source.interfaces"].CheckpointedConnectorWithPermSync = mock_CheckpointedConnectorWithPermSync
sys.modules["common.data_source.interfaces"].CheckpointOutputWrapper = mock_CheckpointOutputWrapper

sys.modules["common.misc_utils"].get_uuid = lambda: "new-uuid-001"

# Now import the module under test
import connector_sync_worker as csw


# ---------------------------------------------------------------------------
# Helpers to build test data
# ---------------------------------------------------------------------------

class FakeSourceDoc:
    """Mimics a Document from a connector with the fields delta sync uses."""

    def __init__(self, id, blob=b"content", doc_updated_at=None,
                 semantic_identifier=None, extension=".txt", metadata=None):
        self.id = id
        self.blob = blob
        self.doc_updated_at = doc_updated_at
        self.semantic_identifier = semantic_identifier or id
        self.extension = extension
        self.metadata = metadata


class FakeDBDoc:
    """Mimics a Peewee Document model instance returned from queries."""

    def __init__(self, id, source_doc_id=None, source_updated_at=None,
                 content_hash="", name="doc.txt", status="1"):
        self.id = id
        self.source_doc_id = source_doc_id
        self.source_updated_at = source_updated_at
        self.content_hash = content_hash
        self.name = name
        self.status = status


def _compute_hash(data: bytes) -> str:
    """Compute the same hash as the fake xxhash mock."""
    import hashlib
    return hashlib.md5(data).hexdigest()


# ===========================================================================
# _is_doc_unchanged
# ===========================================================================

class TestIsDocUnchanged:
    """Tests for _is_doc_unchanged — timestamp and hash-based detection."""

    def test_unchanged_by_timestamp_equal(self):
        """Should return True when source timestamp equals stored timestamp."""
        ts = datetime(2026, 3, 28, 12, 0, 0, tzinfo=timezone.utc)
        source = FakeSourceDoc("doc-1", doc_updated_at=ts)
        existing = {"source_updated_at": ts, "content_hash": ""}

        assert csw._is_doc_unchanged(source, existing) is True

    def test_unchanged_by_timestamp_older(self):
        """Should return True when source timestamp is older than stored."""
        stored = datetime(2026, 3, 28, 12, 0, 0, tzinfo=timezone.utc)
        source_ts = stored - timedelta(hours=1)
        source = FakeSourceDoc("doc-1", doc_updated_at=source_ts)
        existing = {"source_updated_at": stored, "content_hash": ""}

        assert csw._is_doc_unchanged(source, existing) is True

    def test_changed_by_timestamp_newer(self):
        """Should return False when source timestamp is newer than stored."""
        stored = datetime(2026, 3, 28, 12, 0, 0, tzinfo=timezone.utc)
        source_ts = stored + timedelta(hours=1)
        source = FakeSourceDoc("doc-1", doc_updated_at=source_ts)
        existing = {"source_updated_at": stored, "content_hash": ""}

        assert csw._is_doc_unchanged(source, existing) is False

    def test_unchanged_by_hash_same_content(self):
        """Should return True when content hash matches (no timestamp available)."""
        blob = b"same content"
        source = FakeSourceDoc("doc-1", blob=blob, doc_updated_at=None)
        existing = {
            "source_updated_at": None,
            "content_hash": _compute_hash(blob),
        }

        assert csw._is_doc_unchanged(source, existing) is True

    def test_changed_by_hash_different_content(self):
        """Should return False when content hash differs."""
        source = FakeSourceDoc("doc-1", blob=b"new content", doc_updated_at=None)
        existing = {
            "source_updated_at": None,
            "content_hash": _compute_hash(b"old content"),
        }

        assert csw._is_doc_unchanged(source, existing) is False

    def test_assumes_changed_when_no_info(self):
        """Should return False when neither timestamp nor hash is available."""
        source = FakeSourceDoc("doc-1", blob=b"", doc_updated_at=None)
        existing = {"source_updated_at": None, "content_hash": ""}

        assert csw._is_doc_unchanged(source, existing) is False

    def test_timestamp_tz_naive_vs_aware(self):
        """Should handle comparison between naive and aware datetimes."""
        # Source is tz-aware, stored is tz-naive
        stored_naive = datetime(2026, 3, 28, 12, 0, 0)
        source_aware = datetime(2026, 3, 28, 12, 0, 0, tzinfo=timezone.utc)

        source = FakeSourceDoc("doc-1", doc_updated_at=source_aware)
        existing = {"source_updated_at": stored_naive, "content_hash": ""}

        # Should not raise, and equal timestamps mean unchanged
        assert csw._is_doc_unchanged(source, existing) is True

    def test_timestamp_both_naive(self):
        """Should handle comparison between two naive datetimes."""
        stored = datetime(2026, 3, 28, 12, 0, 0)
        source_ts = datetime(2026, 3, 28, 11, 0, 0)

        source = FakeSourceDoc("doc-1", doc_updated_at=source_ts)
        existing = {"source_updated_at": stored, "content_hash": ""}

        assert csw._is_doc_unchanged(source, existing) is True

    def test_string_blob_hash_fallback(self):
        """Should handle string blobs by encoding to utf-8 for hashing."""
        text = "string content"
        source = FakeSourceDoc("doc-1", blob=text, doc_updated_at=None)
        existing = {
            "source_updated_at": None,
            "content_hash": _compute_hash(text.encode("utf-8")),
        }

        assert csw._is_doc_unchanged(source, existing) is True

    def test_prefers_timestamp_over_hash(self):
        """Should use timestamp check and not compute hash when timestamp available."""
        ts = datetime(2026, 3, 28, 12, 0, 0, tzinfo=timezone.utc)
        # Blob content differs, but timestamp says unchanged
        source = FakeSourceDoc("doc-1", blob=b"new", doc_updated_at=ts)
        existing = {
            "source_updated_at": ts,
            "content_hash": _compute_hash(b"old"),
        }

        # Timestamp wins — doc is unchanged despite different hash
        assert csw._is_doc_unchanged(source, existing) is True


# ===========================================================================
# _get_existing_docs_manifest
# ===========================================================================

class TestGetExistingDocsManifest:
    """Tests for _get_existing_docs_manifest — building the lookup dict."""

    def test_builds_manifest_by_source_doc_id(self):
        """Should index documents by source_doc_id when available."""
        docs = [
            FakeDBDoc("db-1", source_doc_id="src-1", content_hash="aaa", source_updated_at=datetime(2026, 1, 1)),
            FakeDBDoc("db-2", source_doc_id="src-2", content_hash="bbb", source_updated_at=datetime(2026, 2, 1)),
        ]
        mock_DocumentService.query.return_value = docs

        result = csw._get_existing_docs_manifest("kb-1", "confluence", "conn-1")

        mock_DocumentService.query.assert_called_once_with(
            kb_id="kb-1", source_type="confluence/conn-1", status="1"
        )
        assert "src-1" in result
        assert "src-2" in result
        assert result["src-1"]["doc_id"] == "db-1"
        assert result["src-2"]["content_hash"] == "bbb"

    def test_fallback_by_name_when_no_source_doc_id(self):
        """Should index by __name__:docname when source_doc_id is None."""
        docs = [
            FakeDBDoc("db-1", source_doc_id=None, name="report.pdf"),
        ]
        mock_DocumentService.query.return_value = docs

        result = csw._get_existing_docs_manifest("kb-1", "github", "conn-2")

        assert "__name__:report.pdf" in result
        assert result["__name__:report.pdf"]["doc_id"] == "db-1"

    def test_empty_manifest_when_no_docs(self):
        """Should return empty dict when no documents exist for the connector."""
        mock_DocumentService.query.return_value = []

        result = csw._get_existing_docs_manifest("kb-1", "jira", "conn-3")

        assert result == {}

    def test_mixed_source_ids_and_names(self):
        """Should handle a mix of docs with and without source_doc_id."""
        docs = [
            FakeDBDoc("db-1", source_doc_id="src-1"),
            FakeDBDoc("db-2", source_doc_id=None, name="file.txt"),
            FakeDBDoc("db-3", source_doc_id="src-3"),
        ]
        mock_DocumentService.query.return_value = docs

        result = csw._get_existing_docs_manifest("kb-1", "notion", "conn-4")

        assert "src-1" in result
        assert "__name__:file.txt" in result
        assert "src-3" in result
        assert len(result) == 3


# ===========================================================================
# _delete_orphaned_docs
# ===========================================================================

class TestDeleteOrphanedDocs:
    """Tests for _delete_orphaned_docs — removing docs absent from source."""

    def setup_method(self):
        """Reset mocks before each test."""
        mock_DocumentService.reset_mock()
        mock_FileService.reset_mock()

    def test_deletes_orphaned_documents(self):
        """Should delete docs with source_doc_id not in seen_source_ids."""
        docs = [
            FakeDBDoc("db-1", source_doc_id="src-1"),
            FakeDBDoc("db-2", source_doc_id="src-2"),
            FakeDBDoc("db-3", source_doc_id="src-3"),
        ]
        mock_DocumentService.query.return_value = docs
        mock_FileService.delete_docs.return_value = ""

        # Only src-1 and src-3 were seen — src-2 is orphaned
        result = csw._delete_orphaned_docs(
            "kb-1", "tenant-1", "confluence", "conn-1", {"src-1", "src-3"}
        )

        assert result == 1
        mock_FileService.delete_docs.assert_called_once_with(["db-2"], "tenant-1")

    def test_no_deletion_when_all_seen(self):
        """Should return 0 and not call delete when all docs are still in source."""
        docs = [
            FakeDBDoc("db-1", source_doc_id="src-1"),
            FakeDBDoc("db-2", source_doc_id="src-2"),
        ]
        mock_DocumentService.query.return_value = docs

        result = csw._delete_orphaned_docs(
            "kb-1", "tenant-1", "github", "conn-2", {"src-1", "src-2"}
        )

        assert result == 0
        mock_FileService.delete_docs.assert_not_called()

    def test_skips_docs_without_source_doc_id(self):
        """Should not delete pre-migration docs (no source_doc_id)."""
        docs = [
            FakeDBDoc("db-1", source_doc_id=None),  # Pre-migration
            FakeDBDoc("db-2", source_doc_id="src-2"),
        ]
        mock_DocumentService.query.return_value = docs

        # src-2 is seen, db-1 has no source_doc_id so should be skipped
        result = csw._delete_orphaned_docs(
            "kb-1", "tenant-1", "notion", "conn-3", {"src-2"}
        )

        assert result == 0
        mock_FileService.delete_docs.assert_not_called()

    def test_handles_delete_errors_gracefully(self):
        """Should return count even when delete_docs returns errors."""
        docs = [FakeDBDoc("db-1", source_doc_id="src-1")]
        mock_DocumentService.query.return_value = docs
        mock_FileService.delete_docs.return_value = "Some error"

        result = csw._delete_orphaned_docs(
            "kb-1", "tenant-1", "s3", "conn-4", set()
        )

        # Still reports the count even with errors
        assert result == 1

    def test_empty_seen_ids_deletes_all_tracked(self):
        """Should delete all tracked docs when seen_source_ids is empty (full purge)."""
        docs = [
            FakeDBDoc("db-1", source_doc_id="src-1"),
            FakeDBDoc("db-2", source_doc_id="src-2"),
        ]
        mock_DocumentService.query.return_value = docs
        mock_FileService.delete_docs.return_value = ""

        result = csw._delete_orphaned_docs(
            "kb-1", "tenant-1", "dropbox", "conn-5", set()
        )

        assert result == 2


# ===========================================================================
# _publish_progress
# ===========================================================================

class TestPublishProgress:
    """Tests for _publish_progress — Redis pub/sub with delta sync fields."""

    def test_publishes_all_delta_fields(self):
        """Should include docs_skipped and docs_deleted in the published payload."""
        mock_redis = MagicMock()

        csw._publish_progress(
            mock_redis, "conn-1", "sl-1",
            progress=75, message="Syncing...",
            docs_synced=10, docs_failed=2, docs_skipped=5, docs_deleted=3,
        )

        mock_redis.publish.assert_called_once()
        channel, payload_str = mock_redis.publish.call_args[0]
        assert channel == "connector:conn-1:progress"

        payload = json.loads(payload_str)
        assert payload["docs_synced"] == 10
        assert payload["docs_failed"] == 2
        assert payload["docs_skipped"] == 5
        assert payload["docs_deleted"] == 3
        assert payload["progress"] == 75
        assert payload["status"] == "running"

    def test_default_values_are_zero(self):
        """Should default docs_skipped and docs_deleted to 0."""
        mock_redis = MagicMock()

        csw._publish_progress(mock_redis, "conn-1", "sl-1", 50, "msg")

        payload = json.loads(mock_redis.publish.call_args[0][1])
        assert payload["docs_skipped"] == 0
        assert payload["docs_deleted"] == 0

    def test_handles_redis_error_gracefully(self):
        """Should not raise when Redis publish fails."""
        mock_redis = MagicMock()
        mock_redis.publish.side_effect = Exception("Redis down")

        # Should not raise
        csw._publish_progress(mock_redis, "conn-1", "sl-1", 50, "msg")


# ===========================================================================
# _ingest_documents (delta-aware)
# ===========================================================================

class TestIngestDocuments:
    """Tests for _ingest_documents with delta sync awareness."""

    def setup_method(self):
        """Reset mocks before each test."""
        mock_DocumentService.reset_mock()
        mock_FileService.reset_mock()
        mock_KnowledgebaseService.reset_mock()

        # Default: KB exists
        mock_kb = MagicMock()
        mock_kb.id = "kb-1"
        mock_kb.parser_id = "naive"
        mock_kb.pipeline_id = None
        mock_kb.parser_config = {}
        mock_kb.tenant_id = "tenant-1"
        mock_kb.name = "Test KB"
        mock_KnowledgebaseService.get_by_id.return_value = (True, mock_kb)

    def test_new_document_ingested(self):
        """Should ingest a new document when not in manifest."""
        doc_record = {"id": "new-doc-1", "name": "file.txt"}
        mock_FileService.upload_document.return_value = ([], [(doc_record, b"blob")])

        docs = [FakeSourceDoc("src-new", blob=b"content")]
        seen = set()

        synced, failed, skipped = csw._ingest_documents(
            docs, "kb-1", "tenant-1", "confluence", "conn-1",
            auto_parse=False, existing_manifest={}, seen_source_ids=seen,
        )

        assert synced == 1
        assert failed == 0
        assert skipped == 0
        assert "src-new" in seen
        # Verify delta fields were updated
        mock_DocumentService.update_by_id.assert_called_once()

    def test_unchanged_document_skipped(self):
        """Should skip a document when timestamp shows no change."""
        ts = datetime(2026, 3, 28, 12, 0, 0, tzinfo=timezone.utc)
        manifest = {
            "src-1": {
                "doc_id": "db-1",
                "content_hash": "",
                "source_updated_at": ts,
                "name": "doc.txt",
            }
        }
        docs = [FakeSourceDoc("src-1", blob=b"content", doc_updated_at=ts)]
        seen = set()

        synced, failed, skipped = csw._ingest_documents(
            docs, "kb-1", "tenant-1", "confluence", "conn-1",
            auto_parse=False, existing_manifest=manifest, seen_source_ids=seen,
        )

        assert synced == 0
        assert skipped == 1
        assert "src-1" in seen
        # Should NOT call upload_document for skipped docs
        mock_FileService.upload_document.assert_not_called()

    def test_modified_document_reingested(self):
        """Should re-ingest a document when timestamp is newer."""
        stored_ts = datetime(2026, 3, 28, 10, 0, 0, tzinfo=timezone.utc)
        new_ts = datetime(2026, 3, 28, 14, 0, 0, tzinfo=timezone.utc)
        manifest = {
            "src-1": {
                "doc_id": "db-existing",
                "content_hash": "",
                "source_updated_at": stored_ts,
                "name": "doc.txt",
            }
        }
        doc_record = {"id": "db-existing", "name": "file.txt"}
        mock_FileService.upload_document.return_value = ([], [(doc_record, b"new")])

        docs = [FakeSourceDoc("src-1", blob=b"new content", doc_updated_at=new_ts)]
        seen = set()

        synced, failed, skipped = csw._ingest_documents(
            docs, "kb-1", "tenant-1", "confluence", "conn-1",
            auto_parse=False, existing_manifest=manifest, seen_source_ids=seen,
        )

        assert synced == 1
        assert skipped == 0
        # Should use existing doc_id for the file_obj
        call_args = mock_FileService.upload_document.call_args
        file_obj = call_args[0][1][0]  # kb, [file_obj], ...
        assert file_obj.id == "db-existing"

    def test_kb_not_found_returns_all_failed(self):
        """Should return all docs as failed when KB not found."""
        mock_KnowledgebaseService.get_by_id.return_value = (False, None)

        docs = [FakeSourceDoc("src-1"), FakeSourceDoc("src-2")]

        synced, failed, skipped = csw._ingest_documents(
            docs, "kb-missing", "tenant-1", "confluence", "conn-1",
        )

        assert synced == 0
        assert failed == 2
        assert skipped == 0

    def test_empty_blob_counts_as_failed(self):
        """Should count documents with empty blob as failed."""
        docs = [FakeSourceDoc("src-1", blob=b"")]

        synced, failed, skipped = csw._ingest_documents(
            docs, "kb-1", "tenant-1", "confluence", "conn-1",
            existing_manifest={},
        )

        assert failed == 1
        assert synced == 0

    def test_name_fallback_for_pre_migration_docs(self):
        """Should match by __name__:filename when source_doc_id is not in manifest."""
        ts = datetime(2026, 3, 28, 12, 0, 0, tzinfo=timezone.utc)
        manifest = {
            "__name__:report.txt": {
                "doc_id": "db-old",
                "content_hash": "",
                "source_updated_at": ts,
                "name": "report.txt",
            }
        }
        # Source doc has same name, same timestamp — should be skipped
        docs = [FakeSourceDoc("src-new-id", blob=b"content",
                              doc_updated_at=ts, semantic_identifier="report")]
        seen = set()

        synced, failed, skipped = csw._ingest_documents(
            docs, "kb-1", "tenant-1", "confluence", "conn-1",
            auto_parse=False, existing_manifest=manifest, seen_source_ids=seen,
        )

        assert skipped == 1

    def test_metadata_only_change_updates_delta_fields(self):
        """Should update delta sync fields even when content hash matches (metadata-only change).

        When a document has a newer timestamp but identical content, upload_document
        returns empty doc_blob_pairs (hash matches). Delta fields must still be updated
        to prevent perpetual re-upload on subsequent syncs.
        """
        stored_ts = datetime(2026, 3, 28, 10, 0, 0, tzinfo=timezone.utc)
        new_ts = datetime(2026, 3, 28, 14, 0, 0, tzinfo=timezone.utc)
        manifest = {
            "src-1": {
                "doc_id": "db-existing",
                "content_hash": "",
                "source_updated_at": stored_ts,
                "name": "doc.txt",
            }
        }
        # upload_document returns empty doc_blob_pairs (hash matched)
        mock_FileService.upload_document.return_value = ([], [])

        docs = [FakeSourceDoc("src-1", blob=b"same content", doc_updated_at=new_ts)]
        seen = set()

        synced, failed, skipped = csw._ingest_documents(
            docs, "kb-1", "tenant-1", "confluence", "conn-1",
            auto_parse=False, existing_manifest=manifest, seen_source_ids=seen,
        )

        assert synced == 1
        assert failed == 0
        assert skipped == 0
        # Delta sync fields should still be updated via the fallback path
        mock_DocumentService.update_by_id.assert_called_once_with(
            "db-existing",
            {"source_doc_id": "src-1", "source_updated_at": new_ts},
        )

    def test_new_doc_upload_failure_counts_as_failed(self):
        """Should count new doc as failed when upload_document returns no doc_blob_pairs."""
        # upload_document returns errors but no doc pairs — upload failed
        mock_FileService.upload_document.return_value = (["upload error"], [])

        docs = [FakeSourceDoc("src-new", blob=b"content")]
        seen = set()

        synced, failed, skipped = csw._ingest_documents(
            docs, "kb-1", "tenant-1", "confluence", "conn-1",
            auto_parse=False, existing_manifest={}, seen_source_ids=seen,
        )

        assert synced == 0
        assert failed == 1
        assert skipped == 0

    def test_mixed_batch_new_modified_skipped(self):
        """Should handle a batch with new, modified, and unchanged docs."""
        ts = datetime(2026, 3, 28, 12, 0, 0, tzinfo=timezone.utc)
        new_ts = ts + timedelta(hours=2)
        manifest = {
            "src-unchanged": {
                "doc_id": "db-1", "content_hash": "",
                "source_updated_at": ts, "name": "a.txt",
            },
            "src-modified": {
                "doc_id": "db-2", "content_hash": "",
                "source_updated_at": ts, "name": "b.txt",
            },
        }

        doc_record = {"id": "db-2", "name": "b.txt"}
        doc_record_new = {"id": "src-new", "name": "c.txt"}
        mock_FileService.upload_document.side_effect = [
            ([], [(doc_record, b"mod")]),     # Modified
            ([], [(doc_record_new, b"new")]), # New
        ]

        docs = [
            FakeSourceDoc("src-unchanged", blob=b"content", doc_updated_at=ts),
            FakeSourceDoc("src-modified", blob=b"modified", doc_updated_at=new_ts),
            FakeSourceDoc("src-new", blob=b"brand new"),
        ]
        seen = set()

        synced, failed, skipped = csw._ingest_documents(
            docs, "kb-1", "tenant-1", "confluence", "conn-1",
            auto_parse=False, existing_manifest=manifest, seen_source_ids=seen,
        )

        assert skipped == 1   # src-unchanged
        assert synced == 2    # src-modified + src-new
        assert failed == 0
        assert seen == {"src-unchanged", "src-modified", "src-new"}


# ===========================================================================
# handle_sync_task (integration-level with mocks)
# ===========================================================================

class TestHandleSyncTask:
    """Tests for handle_sync_task — full delta sync orchestration."""

    def setup_method(self):
        """Reset all mocks before each test."""
        mock_DocumentService.reset_mock()
        mock_FileService.reset_mock()
        mock_KnowledgebaseService.reset_mock()

        # Default KB setup
        mock_kb = MagicMock()
        mock_kb.id = "kb-1"
        mock_kb.parser_id = "naive"
        mock_kb.pipeline_id = None
        mock_kb.parser_config = {}
        mock_kb.tenant_id = "tenant-1"
        mock_kb.name = "Test KB"
        mock_KnowledgebaseService.get_by_id.return_value = (True, mock_kb)

    def test_unsupported_source_type_publishes_failure(self):
        """Should publish failure when source_type is not supported."""
        mock_redis = MagicMock()
        task = {
            "sync_log_id": "sl-1",
            "connector_id": "conn-1",
            "kb_id": "kb-1",
            "source_type": "unsupported_source",
            "config": {},
        }

        csw.handle_sync_task(task, mock_redis)

        # Should publish a failed status
        mock_redis.publish.assert_called()
        last_payload = json.loads(mock_redis.publish.call_args[0][1])
        assert last_payload["status"] == "failed"
        assert "Unsupported source type" in last_payload["message"]

    @patch("connector_sync_worker._get_connector_class")
    @patch("connector_sync_worker._get_existing_docs_manifest")
    def test_full_sync_triggers_orphan_deletion(self, mock_manifest, mock_get_cls):
        """Should delete orphaned docs during full sync (since=None)."""
        # Set up a fake LoadConnector
        fake_connector = MagicMock()
        fake_connector.load_from_state.return_value = iter([[]])  # No docs
        mock_get_cls.return_value = lambda **kw: fake_connector
        fake_connector.load_credentials = MagicMock()

        # Make connector pass isinstance checks
        fake_connector.__class__ = type("FakeLoad", (mock_LoadConnector,), {})

        mock_manifest.return_value = {}

        # Pre-existing orphaned doc
        mock_DocumentService.query.return_value = [
            FakeDBDoc("db-orphan", source_doc_id="src-orphan")
        ]
        mock_FileService.delete_docs.return_value = ""

        mock_redis = MagicMock()
        task = {
            "sync_log_id": "sl-1",
            "connector_id": "conn-1",
            "kb_id": "kb-1",
            "source_type": "confluence",
            "config": {"wiki_base": "https://x.atlassian.net/wiki", "space": "ENG"},
            "tenant_id": "tenant-1",
            "since": None,  # Full sync
            "auto_parse": False,
        }

        csw.handle_sync_task(task, mock_redis)

        # Verify completion was published
        completed_calls = [
            c for c in mock_redis.publish.call_args_list
            if "completed" in str(c)
        ]
        assert len(completed_calls) > 0

    @patch("connector_sync_worker._get_connector_class")
    @patch("connector_sync_worker._get_existing_docs_manifest")
    def test_incremental_sync_skips_deletion(self, mock_manifest, mock_get_cls):
        """Should NOT delete orphaned docs during incremental sync (since is set)."""
        fake_connector = MagicMock()
        fake_connector.poll_source.return_value = iter([[]])
        mock_get_cls.return_value = lambda **kw: fake_connector
        fake_connector.load_credentials = MagicMock()

        fake_connector.__class__ = type("FakePoll", (mock_PollConnector,), {})
        mock_manifest.return_value = {}

        mock_redis = MagicMock()
        task = {
            "sync_log_id": "sl-1",
            "connector_id": "conn-1",
            "kb_id": "kb-1",
            "source_type": "confluence",
            "config": {},
            "tenant_id": "tenant-1",
            "since": "2026-03-01T00:00:00+00:00",  # Incremental
            "auto_parse": False,
        }

        csw.handle_sync_task(task, mock_redis)

        # Should NOT call delete_docs since this is an incremental sync
        mock_FileService.delete_docs.assert_not_called()

    @patch("connector_sync_worker._get_connector_class")
    @patch("connector_sync_worker._get_existing_docs_manifest")
    def test_checkpointed_with_perm_sync_connector_dispatches(self, mock_manifest, mock_get_cls):
        """Should dispatch CheckpointedConnectorWithPermSync connectors (Jira, SharePoint, etc.)."""
        fake_connector = MagicMock()
        # Simulate load_from_checkpoint yielding no docs and returning a checkpoint
        fake_connector.build_dummy_checkpoint.return_value = MagicMock()
        fake_connector.load_from_checkpoint.return_value = iter([])
        mock_get_cls.return_value = lambda **kw: fake_connector
        fake_connector.load_credentials = MagicMock()

        # Make connector pass isinstance check for CheckpointedConnectorWithPermSync
        fake_connector.__class__ = type(
            "FakeCheckpointPerm", (mock_CheckpointedConnectorWithPermSync,), {}
        )
        mock_manifest.return_value = {}

        mock_redis = MagicMock()
        task = {
            "sync_log_id": "sl-1",
            "connector_id": "conn-1",
            "kb_id": "kb-1",
            "source_type": "jira",
            "config": {},
            "tenant_id": "tenant-1",
            "since": None,
            "auto_parse": False,
        }

        csw.handle_sync_task(task, mock_redis)

        # Should NOT hit the "unsupported fetch method" error
        last_payload = json.loads(mock_redis.publish.call_args[0][1])
        assert last_payload["status"] == "completed"

    @patch("connector_sync_worker._get_connector_class")
    @patch("connector_sync_worker._get_existing_docs_manifest")
    def test_exception_publishes_failure(self, mock_manifest, mock_get_cls):
        """Should publish failure status when an exception occurs during sync."""
        mock_get_cls.return_value = MagicMock(side_effect=RuntimeError("Boom"))

        mock_redis = MagicMock()
        task = {
            "sync_log_id": "sl-1",
            "connector_id": "conn-1",
            "kb_id": "kb-1",
            "source_type": "confluence",
            "config": {},
        }

        csw.handle_sync_task(task, mock_redis)

        # Should publish failure
        last_payload = json.loads(mock_redis.publish.call_args[0][1])
        assert last_payload["status"] == "failed"


# ===========================================================================
# _FileObj
# ===========================================================================

class TestFileObj:
    """Tests for the _FileObj wrapper class."""

    def test_read_returns_blob(self):
        """Should return the blob bytes on read()."""
        obj = csw._FileObj(id="id-1", filename="test.pdf", blob=b"pdf content")

        assert obj.read() == b"pdf content"
        assert obj.id == "id-1"
        assert obj.filename == "test.pdf"


# ===========================================================================
# _extract_constructor_kwargs / _extract_credentials
# ===========================================================================

class TestExtractors:
    """Tests for connector config extraction functions."""

    def test_confluence_kwargs(self):
        """Should extract Confluence constructor kwargs correctly."""
        config = {"wiki_base": "https://x.atlassian.net/wiki", "space": "ENG", "is_cloud": True}

        result = csw._extract_constructor_kwargs("confluence", config)

        assert result["wiki_base"] == "https://x.atlassian.net/wiki"
        assert result["space"] == "ENG"
        assert result["is_cloud"] is True

    def test_confluence_credentials(self):
        """Should extract Confluence credentials correctly."""
        config = {"confluence_token": "token123", "confluence_user_email": "user@example.com"}

        result = csw._extract_credentials("confluence", config)

        assert result["confluence_access_token"] == "token123"
        assert result["confluence_username"] == "user@example.com"

    def test_github_kwargs(self):
        """Should extract GitHub constructor kwargs correctly."""
        config = {"repo_owner": "org", "repositories": "repo1,repo2"}

        result = csw._extract_constructor_kwargs("github", config)

        assert result["repo_owner"] == "org"
        assert result["repositories"] == "repo1,repo2"

    def test_bitbucket_kwargs(self):
        """Should extract Bitbucket constructor kwargs correctly."""
        config = {"workspace": "myteam", "repositories": "repo1,repo2", "projects": "PROJ"}

        result = csw._extract_constructor_kwargs("bitbucket", config)

        assert result["workspace"] == "myteam"
        assert result["repositories"] == "repo1,repo2"
        assert result["projects"] == "PROJ"

    def test_bitbucket_credentials(self):
        """Should extract Bitbucket credentials correctly."""
        config = {"bitbucket_email": "user@example.com", "bitbucket_api_token": "tok123"}

        result = csw._extract_credentials("bitbucket", config)

        assert result["bitbucket_email"] == "user@example.com"
        assert result["bitbucket_api_token"] == "tok123"

    def test_rdbms_kwargs(self):
        """Should extract RDBMS constructor kwargs correctly."""
        config = {"db_type": "postgres", "host": "localhost", "port": 5432,
                  "database": "mydb", "query": "SELECT *", "content_columns": "body"}

        result = csw._extract_constructor_kwargs("rdbms", config)

        assert result["db_type"] == "postgres"
        assert result["database"] == "mydb"
        assert result["content_columns"] == "body"

    def test_unknown_source_returns_empty_kwargs(self):
        """Should return empty dict for unsupported source types."""
        result = csw._extract_constructor_kwargs("unknown_source", {"key": "val"})

        assert result == {}

    def test_unknown_source_returns_full_config_as_credentials(self):
        """Should pass full config as credentials for unsupported source types."""
        config = {"api_key": "secret"}

        result = csw._extract_credentials("unknown_source", config)

        assert result == config
