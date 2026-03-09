"""
Dataset CRUD endpoints.

These endpoints are called by the Node.js API gateway (be/).
The Node.js layer handles RBAC/access_control; advance-rag handles the RAG pipeline.
"""
import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import SYSTEM_TENANT_ID
from common.constants import ParserType

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateDatasetRequest(BaseModel):
    id: Optional[str] = None  # Accept ID from Node.js for dual-write sync
    name: str
    description: Optional[str] = None
    language: str = "English"
    embedding_model: Optional[str] = None
    parser_id: str = ParserType.NAIVE.value
    parser_config: Optional[dict] = None


class UpdateDatasetRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    language: Optional[str] = None
    embedding_model: Optional[str] = None
    parser_id: Optional[str] = None
    parser_config: Optional[dict] = None


@router.get("/datasets")
async def list_datasets():
    """List all datasets (knowledgebases) for the system tenant."""
    from db.services.knowledgebase_service import KnowledgebaseService

    kbs = KnowledgebaseService.query(tenant_id=SYSTEM_TENANT_ID, status="1")
    return [kb.to_dict() for kb in kbs]


@router.get("/datasets/{dataset_id}")
async def get_dataset(dataset_id: str):
    """Get a single dataset by ID."""
    from db.services.knowledgebase_service import KnowledgebaseService

    found, kb = KnowledgebaseService.get_by_id(dataset_id)
    if not found:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return kb.to_dict()


@router.post("/datasets", status_code=201)
async def create_dataset(req: CreateDatasetRequest):
    """Create a new dataset (knowledgebase) under the system tenant."""
    from db.services.knowledgebase_service import KnowledgebaseService
    from db.db_models import Tenant
    import uuid

    # Get system tenant for default embedding model
    tenant = Tenant.select().where(Tenant.id == SYSTEM_TENANT_ID).first()
    if not tenant:
        raise HTTPException(status_code=500, detail="System tenant not found")

    dataset_id = req.id or str(uuid.uuid4()).replace("-", "")
    embd_id = req.embedding_model or tenant.embd_id

    try:
        KnowledgebaseService.save(**{
            "id": dataset_id,
            "tenant_id": SYSTEM_TENANT_ID,
            "name": req.name,
            "description": req.description or "",
            "language": req.language,
            "embd_id": embd_id,
            "parser_id": req.parser_id,
            "parser_config": req.parser_config or {"pages": [[1, 1000000]]},
            "created_by": SYSTEM_TENANT_ID,
            "permission": "team",
            "status": "1",
        })
    except Exception as e:
        logger.error(f"Failed to create dataset: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    found, kb = KnowledgebaseService.get_by_id(dataset_id)
    return kb.to_dict()


@router.put("/datasets/{dataset_id}")
async def update_dataset(dataset_id: str, req: UpdateDatasetRequest):
    """Update an existing dataset."""
    from db.services.knowledgebase_service import KnowledgebaseService

    found, kb = KnowledgebaseService.get_by_id(dataset_id)
    if not found:
        raise HTTPException(status_code=404, detail="Dataset not found")

    update_data = req.model_dump(exclude_none=True)
    if "embedding_model" in update_data:
        update_data["embd_id"] = update_data.pop("embedding_model")

    if update_data:
        KnowledgebaseService.update_by_id(dataset_id, update_data)

    found, kb = KnowledgebaseService.get_by_id(dataset_id)
    return kb.to_dict()


@router.delete("/datasets/{dataset_id}", status_code=204)
async def delete_dataset(dataset_id: str):
    """Delete a dataset and all its documents."""
    from db.services.knowledgebase_service import KnowledgebaseService

    found, kb = KnowledgebaseService.get_by_id(dataset_id)
    if not found:
        raise HTTPException(status_code=404, detail="Dataset not found")

    KnowledgebaseService.update_by_id(dataset_id, {"status": "0"})
    return None
