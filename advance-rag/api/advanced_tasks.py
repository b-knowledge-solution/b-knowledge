"""
Advanced RAG task endpoints.

Triggers for GraphRAG, RAPTOR, Mindmap, keyword extraction,
question generation, content tagging, and metadata generation.
These tasks run asynchronously via the task executor.
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import SYSTEM_TENANT_ID

logger = logging.getLogger(__name__)
router = APIRouter()

GRAPH_RAPTOR_FAKE_DOC_ID = "graph_raptor_x"


class RunAdvancedTaskRequest(BaseModel):
    doc_ids: list[str] | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_kb_documents(dataset_id: str):
    """Get all parsed documents for a dataset, return (kb, documents) or raise."""
    from db.services.knowledgebase_service import KnowledgebaseService
    from db.services.document_service import DocumentService

    found, kb = KnowledgebaseService.get_by_id(dataset_id)
    if not found:
        raise HTTPException(status_code=404, detail="Dataset not found")

    documents, _ = DocumentService.get_by_kb_id(
        kb_id=dataset_id,
        page_number=0,
        items_per_page=0,
        orderby="create_time",
        desc=False,
        keywords="",
        run_status=[],
        types=[],
        suffix=[],
    )
    if not documents:
        raise HTTPException(status_code=400, detail="No documents in dataset")

    return kb, documents


def _check_existing_task(task_id: str | None, task_type: str):
    """Check if an existing task of this type is already running."""
    if not task_id:
        return
    from db.services.task_service import TaskService
    found, task = TaskService.get_by_id(task_id)
    if not found:
        return
    if task and task.progress not in [-1, 1]:
        raise HTTPException(
            status_code=409,
            detail=f"A {task_type} task is already running (task_id={task_id}, progress={task.progress})",
        )


def _run_advanced_task(dataset_id: str, task_type: str, req: RunAdvancedTaskRequest):
    """Generic runner for graphrag/raptor/mindmap tasks."""
    from db.services.knowledgebase_service import KnowledgebaseService
    from db.services.document_service import queue_raptor_o_graphrag_tasks

    kb, documents = _get_kb_documents(dataset_id)

    # Check if same type is already running
    task_id_field = f"{task_type}_task_id"
    existing_task_id = getattr(kb, task_id_field, None)
    _check_existing_task(existing_task_id, task_type)

    # Filter to specific doc_ids if provided
    if req.doc_ids:
        doc_id_set = set(req.doc_ids)
        documents = [d for d in documents if d["id"] in doc_id_set]
        if not documents:
            raise HTTPException(status_code=400, detail="No matching documents found")

    sample_document = documents[0]
    document_ids = [d["id"] for d in documents]

    task_id = queue_raptor_o_graphrag_tasks(
        sample_doc_id=sample_document,
        ty=task_type,
        priority=0,
        fake_doc_id=GRAPH_RAPTOR_FAKE_DOC_ID,
        doc_ids=document_ids,
    )

    KnowledgebaseService.update_by_id(kb.id, {task_id_field: task_id})

    return {"task_id": task_id, "task_type": task_type, "doc_count": len(document_ids)}


def _trace_task(dataset_id: str, task_type: str):
    """Get status of an advanced task."""
    from db.services.knowledgebase_service import KnowledgebaseService
    from db.services.task_service import TaskService

    found, kb = KnowledgebaseService.get_by_id(dataset_id)
    if not found:
        raise HTTPException(status_code=404, detail="Dataset not found")

    task_id = getattr(kb, f"{task_type}_task_id", None)
    if not task_id:
        return {"task_id": None, "task_type": task_type, "status": "not_started"}

    found, task = TaskService.get_by_id(task_id)
    if not found:
        return {"task_id": task_id, "task_type": task_type, "status": "not_found"}

    return {
        "task_id": task_id,
        "task_type": task_type,
        "progress": task.progress,
        "progress_msg": task.progress_msg,
        "status": "done" if task.progress == 1 else "failed" if task.progress == -1 else "running",
    }


# ---------------------------------------------------------------------------
# GraphRAG endpoints
# ---------------------------------------------------------------------------

@router.post("/datasets/{dataset_id}/graphrag")
async def run_graphrag(dataset_id: str, req: RunAdvancedTaskRequest = RunAdvancedTaskRequest()):
    """Trigger GraphRAG knowledge graph construction for a dataset."""
    return _run_advanced_task(dataset_id, "graphrag", req)


@router.get("/datasets/{dataset_id}/graphrag/status")
async def trace_graphrag(dataset_id: str):
    """Get GraphRAG task status."""
    return _trace_task(dataset_id, "graphrag")


# ---------------------------------------------------------------------------
# RAPTOR endpoints
# ---------------------------------------------------------------------------

@router.post("/datasets/{dataset_id}/raptor")
async def run_raptor(dataset_id: str, req: RunAdvancedTaskRequest = RunAdvancedTaskRequest()):
    """Trigger RAPTOR hierarchical summarization for a dataset."""
    return _run_advanced_task(dataset_id, "raptor", req)


@router.get("/datasets/{dataset_id}/raptor/status")
async def trace_raptor(dataset_id: str):
    """Get RAPTOR task status."""
    return _trace_task(dataset_id, "raptor")


# ---------------------------------------------------------------------------
# Mindmap endpoints
# ---------------------------------------------------------------------------

@router.post("/datasets/{dataset_id}/mindmap")
async def run_mindmap(dataset_id: str, req: RunAdvancedTaskRequest = RunAdvancedTaskRequest()):
    """Trigger mindmap generation for a dataset."""
    return _run_advanced_task(dataset_id, "mindmap", req)


@router.get("/datasets/{dataset_id}/mindmap/status")
async def trace_mindmap(dataset_id: str):
    """Get mindmap task status."""
    return _trace_task(dataset_id, "mindmap")


# ---------------------------------------------------------------------------
# Per-document enrichment tasks
# ---------------------------------------------------------------------------

@router.post("/datasets/{dataset_id}/documents/{doc_id}/keywords")
async def run_keyword_extraction(dataset_id: str, doc_id: str):
    """Trigger keyword extraction for a single document."""
    from db.services.document_service import DocumentService
    from db.services.task_service import TaskService
    from db.db_utils import bulk_insert_into_db, get_uuid
    from db.db_models import Task
    from rag import settings
    from datetime import datetime

    found, doc = DocumentService.get_by_id(doc_id)
    if not found:
        raise HTTPException(status_code=404, detail="Document not found")

    task = {
        "id": get_uuid(),
        "doc_id": doc_id,
        "from_page": 0,
        "to_page": 100000000,
        "task_type": "keyword",
        "progress": 0.0,
        "progress_msg": datetime.now().strftime("%H:%M:%S") + " created task keyword",
        "begin_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    bulk_insert_into_db(Task, [task], True)

    from common.settings import REDIS_CONN
    REDIS_CONN.queue_product(settings.get_svr_queue_name(0), message=task)

    return {"task_id": task["id"], "task_type": "keyword", "doc_id": doc_id}


@router.post("/datasets/{dataset_id}/documents/{doc_id}/questions")
async def run_question_generation(dataset_id: str, doc_id: str):
    """Trigger auto question generation for a single document."""
    from db.services.document_service import DocumentService
    from db.db_utils import bulk_insert_into_db, get_uuid
    from db.db_models import Task
    from rag import settings
    from datetime import datetime

    found, doc = DocumentService.get_by_id(doc_id)
    if not found:
        raise HTTPException(status_code=404, detail="Document not found")

    task = {
        "id": get_uuid(),
        "doc_id": doc_id,
        "from_page": 0,
        "to_page": 100000000,
        "task_type": "question",
        "progress": 0.0,
        "progress_msg": datetime.now().strftime("%H:%M:%S") + " created task question",
        "begin_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    bulk_insert_into_db(Task, [task], True)

    from common.settings import REDIS_CONN
    REDIS_CONN.queue_product(settings.get_svr_queue_name(0), message=task)

    return {"task_id": task["id"], "task_type": "question", "doc_id": doc_id}


@router.post("/datasets/{dataset_id}/documents/{doc_id}/tags")
async def run_content_tagging(dataset_id: str, doc_id: str):
    """Trigger content tagging for a single document."""
    from db.services.document_service import DocumentService
    from db.db_utils import bulk_insert_into_db, get_uuid
    from db.db_models import Task
    from rag import settings
    from datetime import datetime

    found, doc = DocumentService.get_by_id(doc_id)
    if not found:
        raise HTTPException(status_code=404, detail="Document not found")

    task = {
        "id": get_uuid(),
        "doc_id": doc_id,
        "from_page": 0,
        "to_page": 100000000,
        "task_type": "tag",
        "progress": 0.0,
        "progress_msg": datetime.now().strftime("%H:%M:%S") + " created task tag",
        "begin_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    bulk_insert_into_db(Task, [task], True)

    from common.settings import REDIS_CONN
    REDIS_CONN.queue_product(settings.get_svr_queue_name(0), message=task)

    return {"task_id": task["id"], "task_type": "tag", "doc_id": doc_id}


@router.post("/datasets/{dataset_id}/documents/{doc_id}/metadata")
async def run_metadata_generation(dataset_id: str, doc_id: str):
    """Trigger metadata generation for a single document."""
    from db.services.document_service import DocumentService
    from db.db_utils import bulk_insert_into_db, get_uuid
    from db.db_models import Task
    from rag import settings
    from datetime import datetime

    found, doc = DocumentService.get_by_id(doc_id)
    if not found:
        raise HTTPException(status_code=404, detail="Document not found")

    task = {
        "id": get_uuid(),
        "doc_id": doc_id,
        "from_page": 0,
        "to_page": 100000000,
        "task_type": "metadata",
        "progress": 0.0,
        "progress_msg": datetime.now().strftime("%H:%M:%S") + " created task metadata",
        "begin_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    bulk_insert_into_db(Task, [task], True)

    from common.settings import REDIS_CONN
    REDIS_CONN.queue_product(settings.get_svr_queue_name(0), message=task)

    return {"task_id": task["id"], "task_type": "metadata", "doc_id": doc_id}


# ---------------------------------------------------------------------------
# Generic task status
# ---------------------------------------------------------------------------

@router.get("/tasks/{task_id}/status")
async def get_task_status(task_id: str):
    """Get status of any task by ID."""
    from db.services.task_service import TaskService

    found, task = TaskService.get_by_id(task_id)
    if not found:
        raise HTTPException(status_code=404, detail="Task not found")

    return {
        "task_id": task_id,
        "task_type": task.task_type or "parse",
        "progress": task.progress,
        "progress_msg": task.progress_msg,
        "status": "done" if task.progress == 1 else "failed" if task.progress == -1 else "running",
    }
