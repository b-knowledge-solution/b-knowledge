"""
End-to-end test: PDF Parse -> Chunk -> Embed -> Index -> DB verification.

Bootstraps the advance-rag environment, creates the required database records,
runs the full pipeline on a test PDF, and verifies that:
  - Chunks are produced from parsing
  - Embeddings are generated (if model configured)
  - Chunks are indexed in OpenSearch (if model configured)
  - Database records are updated (document, task, knowledgebase counts)
  - Cleanup removes all test artifacts

Usage:
    cd advance-rag
    python -m tests.test_e2e_parse_index

Requires: PostgreSQL, Redis, OpenSearch, RustFS all running.
"""
import asyncio
import logging
import os
import sys
import time
import traceback
from datetime import datetime
from functools import partial
from pathlib import Path
from timeit import default_timer as timer

# ---------------------------------------------------------------------------
# Bootstrap: load .env and set sys.path before importing anything else
# ---------------------------------------------------------------------------
from dotenv import load_dotenv

# Resolve paths relative to advance-rag root
_ROOT = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _ROOT.parent

load_dotenv(_ROOT / ".env")
os.environ.setdefault("DB_TYPE", "postgres")

sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / "memory"))

# ---------------------------------------------------------------------------
# Now import RAG modules
# ---------------------------------------------------------------------------
from loguru import logger
from common.log_utils import init_root_logger
from common.settings import init_settings
from common import settings
from common.misc_utils import get_uuid
from common.time_utils import current_timestamp, datetime_format, get_format_time
from common.constants import TaskStatus, StatusEnum, ParserType, FileSource, LLMType
from db.db_models import (
    DB, init_database_tables,
    Tenant, Knowledgebase, Document, File, File2Document, Task,
)
from db.services.document_service import DocumentService
from db.services.task_service import TaskService, queue_tasks
from db.services.knowledgebase_service import KnowledgebaseService
from db.services.file2document_service import File2DocumentService
from db.joint_services.tenant_model_service import get_model_config_by_type_and_name
from db.services.llm_service import LLMBundle
from db.db_utils import bulk_insert_into_db
from system_tenant import ensure_system_tenant
from config import SYSTEM_TENANT_ID
from rag.nlp import search
from rag.svr.task_executor import (
    build_chunks, embedding, init_kb, insert_chunks, set_progress, chunk_limiter,
)

# ---------------------------------------------------------------------------
# Test constants
# ---------------------------------------------------------------------------
TEST_PDF_PATH = _PROJECT_ROOT / "test-data" / "nvidia-rtx-blackwell-gpu-architecture.pdf"
TEST_KB_ID = get_uuid()
TEST_DOC_ID = get_uuid()
TEST_FILE_ID = get_uuid()
TEST_F2D_ID = get_uuid()

# Use only 12 pages for speed (page range 1..12)
# Use PlainText layout recognizer to avoid XGBoost model compatibility issues
# (DeepDOC requires xgb binary format models removed in XGBoost 3.1+)
TEST_PARSER_CONFIG = {
    "pages": [[1, 12]],
    "layout_recognize": "Plain Text",
    "task_page_size": 12,
}


# Path for test results log (always readable even when console is garbled)
_RESULTS_LOG = _ROOT / "tests" / "e2e_results.log"

def _log(msg: str):
    """Write to both console and results log file."""
    print(msg, flush=True)
    with open(_RESULTS_LOG, "a", encoding="utf-8") as f:
        f.write(msg + "\n")


class TestResult:
    """Simple test result tracker."""
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.errors: list[str] = []
        # Clear results log
        _RESULTS_LOG.write_text("", encoding="utf-8")

    def ok(self, name: str, detail: str = ""):
        self.passed += 1
        msg = f"  [PASS] {name}"
        if detail:
            msg += f" -- {detail}"
        _log(msg)

    def fail(self, name: str, detail: str = ""):
        self.failed += 1
        msg = f"  [FAIL] {name}"
        if detail:
            msg += f" -- {detail}"
        _log(msg)
        self.errors.append(msg)

    def skip(self, name: str, reason: str = ""):
        self.skipped += 1
        msg = f"  [SKIP] {name}"
        if reason:
            msg += f" -- {reason}"
        _log(msg)

    def summary(self):
        total = self.passed + self.failed + self.skipped
        _log(f"\n{'='*60}")
        _log(f"Results: {self.passed} passed, {self.failed} failed, {self.skipped} skipped (total: {total})")
        if self.errors:
            _log("Failures:")
            for e in self.errors:
                _log(f"  {e}")
        _log(f"{'='*60}")
        return self.failed == 0


# ---------------------------------------------------------------------------
# Setup helpers
# ---------------------------------------------------------------------------

def setup_infrastructure():
    """Initialize settings, DB tables, and verify system tenant."""
    _log("\n[Step 1] Bootstrapping infrastructure...")
    # Suppress loguru's default stderr sink to keep test output clean
    logger.remove()
    init_root_logger("e2e_test")
    init_settings()
    init_database_tables()
    ensure_system_tenant()
    _log("  Infrastructure ready.")



def get_system_tenant() -> dict | None:
    """Fetch system tenant from DB."""
    with DB.connection_context():
        tenant = Tenant.select().where(Tenant.id == SYSTEM_TENANT_ID).first()
        return tenant.to_dict() if tenant else None


def create_test_knowledgebase(tenant: dict) -> str:
    """Create a test knowledgebase in the DB."""
    kb_data = {
        "id": TEST_KB_ID,
        "name": f"e2e_test_kb_{int(time.time())}",
        "tenant_id": tenant["id"],
        "language": "English",
        "embd_id": tenant.get("embd_id", ""),
        "tenant_embd_id": tenant.get("tenant_embd_id", ""),
        "permission": "me",
        "created_by": tenant["id"],
        "doc_num": 0,
        "token_num": 0,
        "chunk_num": 0,
        "similarity_threshold": 0.2,
        "vector_similarity_weight": 0.3,
        "parser_id": ParserType.NAIVE.value,
        "parser_config": {"pages": [[1, 1000000]]},
        "pagerank": 0,
        "status": "1",
        "create_time": current_timestamp(),
        "create_date": datetime_format(datetime.now()),
        "update_time": current_timestamp(),
        "update_date": datetime_format(datetime.now()),
    }
    with DB.connection_context():
        Knowledgebase.insert(kb_data).execute()
    return TEST_KB_ID


def upload_pdf_to_storage(pdf_path: Path, kb_id: str) -> tuple[str, str]:
    """Upload the test PDF to object storage (RustFS/MinIO).

    For LOCAL source files, File2DocumentService.get_storage_address returns
    (file.parent_id, file.location).  file.parent_id = kb_id, so we must
    upload with bucket=kb_id so that retrieval works.

    Returns:
        Tuple of (bucket, storage_key).
    """
    binary = pdf_path.read_bytes()
    storage_key = f"e2e_test/{TEST_DOC_ID}/{pdf_path.name}"
    settings.STORAGE_IMPL.put(kb_id, storage_key, binary)
    return kb_id, storage_key


def create_test_document(kb_id: str, tenant_id: str, storage_key: str, file_size: int) -> dict:
    """Create Document, File, and File2Document records in the DB."""
    now = current_timestamp()
    now_dt = datetime_format(datetime.now())

    doc_data = {
        "id": TEST_DOC_ID,
        "kb_id": kb_id,
        "parser_id": ParserType.NAIVE.value,
        "parser_config": TEST_PARSER_CONFIG,
        "source_type": "local",
        "type": "pdf",
        "created_by": tenant_id,
        "name": TEST_PDF_PATH.name,
        "location": storage_key,
        "size": file_size,
        "token_num": 0,
        "chunk_num": 0,
        "progress": 0,
        "progress_msg": "",
        "suffix": "pdf",
        "run": "0",
        "status": StatusEnum.VALID.value,
        "create_time": now,
        "create_date": now_dt,
        "update_time": now,
        "update_date": now_dt,
    }

    file_data = {
        "id": TEST_FILE_ID,
        "parent_id": kb_id,
        "tenant_id": tenant_id,
        "created_by": tenant_id,
        "name": TEST_PDF_PATH.name,
        "location": storage_key,
        "size": file_size,
        "type": "pdf",
        "source_type": FileSource.LOCAL if hasattr(FileSource, "LOCAL") else "local",
        "create_time": now,
        "create_date": now_dt,
        "update_time": now,
        "update_date": now_dt,
    }

    f2d_data = {
        "id": TEST_F2D_ID,
        "file_id": TEST_FILE_ID,
        "document_id": TEST_DOC_ID,
        "create_time": now,
        "create_date": now_dt,
        "update_time": now,
        "update_date": now_dt,
    }

    with DB.connection_context():
        Document.insert(doc_data).execute()
        File.insert(file_data).execute()
        File2Document.insert(f2d_data).execute()

    return doc_data


def cleanup_test_data():
    """Remove all test records from DB and storage."""
    print("\n[Cleanup] Removing test data...")
    with DB.connection_context():
        # Delete tasks
        Task.delete().where(Task.doc_id == TEST_DOC_ID).execute()
        # Delete file2document
        File2Document.delete().where(File2Document.id == TEST_F2D_ID).execute()
        # Delete file
        File.delete().where(File.id == TEST_FILE_ID).execute()
        # Delete document
        Document.delete().where(Document.id == TEST_DOC_ID).execute()
        # Delete knowledgebase
        Knowledgebase.delete().where(Knowledgebase.id == TEST_KB_ID).execute()

    # Delete chunks from OpenSearch (if index exists)
    try:
        idx = search.index_name(SYSTEM_TENANT_ID)
        if settings.docStoreConn.index_exist(idx, TEST_KB_ID):
            settings.docStoreConn.delete({"doc_id": TEST_DOC_ID}, idx, TEST_KB_ID)
    except Exception as e:
        print(f"  [WARN] OpenSearch cleanup: {e}")

    # Delete file from storage
    try:
        storage_key = f"e2e_test/{TEST_DOC_ID}/{TEST_PDF_PATH.name}"
        if settings.STORAGE_IMPL.obj_exist(TEST_KB_ID, storage_key):
            settings.STORAGE_IMPL.rm(TEST_KB_ID, storage_key)
    except Exception as e:
        print(f"  [WARN] Storage cleanup: {e}")

    print("  Cleanup done.")


# ---------------------------------------------------------------------------
# Test execution
# ---------------------------------------------------------------------------

async def run_e2e_test():
    """Main e2e test flow."""
    result = TestResult()
    start_time = timer()

    # -----------------------------------------------------------------------
    # Step 1: Bootstrap
    # -----------------------------------------------------------------------
    try:
        setup_infrastructure()
        result.ok("Infrastructure bootstrap")
    except Exception as e:
        result.fail("Infrastructure bootstrap", str(e))
        traceback.print_exc()
        return result

    # -----------------------------------------------------------------------
    # Step 2: Verify system tenant
    # -----------------------------------------------------------------------
    print("\n[Step 2] Verifying system tenant...")
    tenant = get_system_tenant()
    if tenant:
        result.ok("System tenant exists", f"id={tenant['id']}")
    else:
        result.fail("System tenant exists", "Tenant not found. Run backend migrations first.")
        return result

    # -----------------------------------------------------------------------
    # Step 3: Create knowledgebase first (needed as storage bucket)
    # -----------------------------------------------------------------------
    _log("\n[Step 3] Creating knowledgebase...")
    try:
        kb_id = create_test_knowledgebase(tenant)
        result.ok("Create knowledgebase", f"kb_id={kb_id}")
    except Exception as e:
        result.fail("Create knowledgebase", str(e))
        _log(traceback.format_exc())
        cleanup_test_data()
        return result

    # -----------------------------------------------------------------------
    # Step 4: Upload PDF to storage (uses kb_id as bucket)
    # -----------------------------------------------------------------------
    _log("\n[Step 4] Uploading test PDF to storage...")
    if not TEST_PDF_PATH.exists():
        result.fail("Test PDF exists", f"{TEST_PDF_PATH} not found")
        cleanup_test_data()
        return result
    result.ok("Test PDF exists", f"{TEST_PDF_PATH.name} ({TEST_PDF_PATH.stat().st_size // 1024}KB)")

    try:
        bucket, storage_key = upload_pdf_to_storage(TEST_PDF_PATH, kb_id)
        result.ok("Upload to storage", f"bucket={bucket}, key={storage_key}")
    except Exception as e:
        result.fail("Upload to storage", str(e))
        _log(traceback.format_exc())
        cleanup_test_data()
        return result

    # -----------------------------------------------------------------------
    # Step 5: Create DB records (Document, File, File2Document)
    # -----------------------------------------------------------------------
    _log("\n[Step 5] Creating document records...")
    try:
        doc = create_test_document(kb_id, tenant["id"], storage_key, TEST_PDF_PATH.stat().st_size)
        result.ok("Create document + file + file2document", f"doc_id={TEST_DOC_ID}")
    except Exception as e:
        result.fail("Create DB records", str(e))
        _log(traceback.format_exc())
        cleanup_test_data()
        return result

    # -----------------------------------------------------------------------
    # Step 6: Queue tasks (creates Task rows, sets doc to RUNNING)
    # -----------------------------------------------------------------------
    _log("\n[Step 6] Queuing tasks...")
    try:
        queue_tasks(doc, bucket, storage_key, priority=0)
        result.ok("Queue tasks")

        # Verify DB: document.run should be RUNNING
        with DB.connection_context():
            e, doc_obj = DocumentService.get_by_id(TEST_DOC_ID)
            if doc_obj and doc_obj.run == TaskStatus.RUNNING.value:
                result.ok("DB: document.run = RUNNING")
            else:
                result.fail("DB: document.run = RUNNING", f"got run={doc_obj.run if doc_obj else 'None'}")

            # Get task IDs created
            tasks = TaskService.get_tasks(TEST_DOC_ID)
            if tasks:
                result.ok("DB: tasks created", f"count={len(tasks)}")
            else:
                result.fail("DB: tasks created", "No tasks found")
                cleanup_test_data()
                return result
    except Exception as e:
        result.fail("Queue tasks", str(e))
        traceback.print_exc()
        cleanup_test_data()
        return result

    # -----------------------------------------------------------------------
    # Step 7: Execute the task -- parse, chunk, embed, index
    # -----------------------------------------------------------------------
    _log("\n[Step 6] Executing pipeline (parse -> chunk -> embed -> index)...")
    task_id = tasks[0]["id"]
    embedding_id = ""
    token_count = 0
    vector_size = 0

    try:
        # Get enriched task dict (same as task_executor does)
        task = TaskService.get_task(task_id)
        if not task:
            result.fail("Get enriched task", "TaskService.get_task returned None")
            cleanup_test_data()
            return result
        result.ok("Get enriched task", f"parser={task['parser_id']}, lang={task['language']}")

        # Progress callback that just logs
        def progress_callback(prog=None, msg="Processing..."):
            set_progress(task_id, task["from_page"], task["to_page"], prog, msg)

        # Step 6a: Parse and chunk
        _log("  [6a] Parsing document into chunks...")
        st = timer()
        chunks = await build_chunks(task, progress_callback)
        parse_time = timer() - st

        if chunks and len(chunks) > 0:
            result.ok("Parse & chunk", f"{len(chunks)} chunks in {parse_time:.2f}s")
        else:
            result.fail("Parse & chunk", "No chunks produced")
            cleanup_test_data()
            return result

        # Verify chunk structure
        sample = chunks[0]
        required_fields = ["content_with_weight", "doc_id", "kb_id", "id"]
        missing = [f for f in required_fields if f not in sample]
        if not missing:
            result.ok("Chunk structure", f"has required fields: {required_fields}")
        else:
            result.fail("Chunk structure", f"missing: {missing}")

        # Step 6b: Embed (requires embedding model)
        _log("  [6b] Generating embeddings...")
        embedding_id = task.get("embd_id", "")

        if not embedding_id:
            result.skip("Embedding", "No embedding model configured in tenant")
        else:
            try:
                embd_model_config = get_model_config_by_type_and_name(
                    task["tenant_id"], LLMType.EMBEDDING, embedding_id
                )
                embd_model = LLMBundle(task["tenant_id"], embd_model_config, lang=task["language"])
                # Quick test to get vector size
                vts, _ = embd_model.encode(["test"])
                vector_size = len(vts[0])
                result.ok("Embedding model bound", f"vector_size={vector_size}")

                st = timer()
                token_count, vector_size = await embedding(
                    chunks, embd_model, task.get("parser_config"), progress_callback
                )
                embed_time = timer() - st
                result.ok("Generate embeddings", f"tokens={token_count}, dim={vector_size}, time={embed_time:.2f}s")

                # Verify vectors in chunks
                vec_key = f"q_{vector_size}_vec"
                has_vectors = all(vec_key in c for c in chunks)
                if has_vectors:
                    result.ok("Chunks have vectors", f"key={vec_key}")
                else:
                    result.fail("Chunks have vectors", f"key={vec_key} missing in some chunks")
            except Exception as e:
                result.fail("Embedding", str(e))
                _log(traceback.format_exc())

        # Step 6c: Create index and insert chunks
        if vector_size > 0:
            _log("  [6c] Indexing to OpenSearch...")
            try:
                init_kb(task, vector_size)
                result.ok("Init KB index in OpenSearch")

                st = timer()
                insert_ok = await insert_chunks(
                    task_id, task["tenant_id"], task["kb_id"],
                    chunks, partial(set_progress, task_id, 0, 100000000)
                )
                idx_time = timer() - st

                if insert_ok:
                    result.ok("Insert chunks to OpenSearch", f"{len(chunks)} chunks in {idx_time:.2f}s")
                else:
                    result.fail("Insert chunks to OpenSearch", "insert_chunks returned False")
            except Exception as e:
                result.fail("Insert chunks to OpenSearch", str(e))
                traceback.print_exc()
        else:
            result.skip("Index to OpenSearch", "No embedding model -- skipping indexing")

        # Step 6d: Update DB counters (simulating what do_handle_task does)
        _log("  [6d] Updating DB counters...")
        try:
            chunk_count = len(set(c["id"] for c in chunks))
            DocumentService.increment_chunk_num(
                TEST_DOC_ID, TEST_KB_ID, token_count, chunk_count, timer() - start_time
            )
            # Mark task as done
            set_progress(task_id, prog=1.0, msg="E2E test task done.")
            result.ok("Update DB counters", f"chunk_count={chunk_count}, token_count={token_count}")
        except Exception as e:
            result.fail("Update DB counters", str(e))
            _log(traceback.format_exc())

    except Exception as e:
        tb = traceback.format_exc()
        result.fail("Execute pipeline", f"{type(e).__name__}: {e}")
        _log(tb)

    # -----------------------------------------------------------------------
    # Step 7: Verify DB state after pipeline
    # -----------------------------------------------------------------------
    _log("\n[Step 8] Verifying DB state...")
    try:
        with DB.connection_context():
            # Verify document.chunk_num > 0
            e, doc_obj = DocumentService.get_by_id(TEST_DOC_ID)
            if doc_obj:
                if doc_obj.chunk_num > 0:
                    result.ok("DB: document.chunk_num > 0", f"chunk_num={doc_obj.chunk_num}")
                else:
                    result.fail("DB: document.chunk_num > 0", f"chunk_num={doc_obj.chunk_num}")

                if doc_obj.token_num > 0:
                    result.ok("DB: document.token_num > 0", f"token_num={doc_obj.token_num}")
                elif not embedding_id:
                    result.skip("DB: document.token_num > 0", "No embedding -- token_num=0 expected")
                else:
                    result.fail("DB: document.token_num > 0", f"token_num={doc_obj.token_num}")
            else:
                result.fail("DB: document exists", "document not found")

            # Verify task.progress = 1.0
            task_obj = Task.get_or_none(Task.id == task_id)
            if task_obj:
                if task_obj.progress == 1.0:
                    result.ok("DB: task.progress = 1.0")
                else:
                    result.fail("DB: task.progress = 1.0", f"progress={task_obj.progress}")

                if task_obj.chunk_ids and len(task_obj.chunk_ids.strip()) > 0:
                    chunk_id_count = len(task_obj.chunk_ids.strip().split())
                    result.ok("DB: task.chunk_ids populated", f"count={chunk_id_count}")
                elif not embedding_id:
                    result.skip("DB: task.chunk_ids populated", "No embedding -- no indexing")
                else:
                    result.fail("DB: task.chunk_ids populated", "chunk_ids is empty")
            else:
                result.fail("DB: task exists", "task not found")

            # Verify knowledgebase counters updated
            kb_obj = Knowledgebase.get_or_none(Knowledgebase.id == TEST_KB_ID)
            if kb_obj:
                if kb_obj.chunk_num > 0:
                    result.ok("DB: knowledgebase.chunk_num > 0", f"chunk_num={kb_obj.chunk_num}")
                else:
                    result.fail("DB: knowledgebase.chunk_num > 0", f"chunk_num={kb_obj.chunk_num}")
            else:
                result.fail("DB: knowledgebase exists", "kb not found")

        # Sync document progress (simlate the periodic _sync_progress)
        DocumentService.update_progress_immediately([{"id": TEST_DOC_ID}])
        with DB.connection_context():
            e, doc_obj = DocumentService.get_by_id(TEST_DOC_ID)
            if doc_obj:
                if doc_obj.run == TaskStatus.DONE.value:
                    result.ok("DB: document.run = DONE after sync")
                else:
                    result.fail("DB: document.run = DONE after sync", f"run={doc_obj.run}")

                if doc_obj.progress == 1.0:
                    result.ok("DB: document.progress = 1.0 after sync")
                elif doc_obj.progress > 0:
                    result.ok("DB: document.progress > 0 after sync", f"progress={doc_obj.progress}")
                else:
                    result.fail("DB: document.progress after sync", f"progress={doc_obj.progress}")

    except Exception as e:
        result.fail("Verify DB state", str(e))
        traceback.print_exc()

    # -----------------------------------------------------------------------
    # Step 8: Cleanup
    # -----------------------------------------------------------------------
    cleanup_test_data()

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    total_time = timer() - start_time
    print(f"\nTotal time: {total_time:.2f}s")
    return result


def main():
    """Entry point."""
    print("=" * 60)
    print("E2E Test: PDF Parse -> Chunk -> Embed -> Index -> DB Verify")
    print("=" * 60)

    result = asyncio.run(run_e2e_test())
    success = result.summary()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
