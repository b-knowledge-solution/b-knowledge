"""
Document management endpoints.

Handles file upload, document listing, parsing triggers, and deletion.
"""
import logging
import os
import uuid
from typing import List

from fastapi import APIRouter, HTTPException, UploadFile, File

from config import SYSTEM_TENANT_ID

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/datasets/{dataset_id}/documents")
async def list_documents(dataset_id: str):
    """List all documents in a dataset."""
    from db.services.document_service import DocumentService

    docs = DocumentService.query(kb_id=dataset_id, status="1", order_by="create_time", reverse=True)
    return [doc.to_dict() for doc in docs]


@router.post("/datasets/{dataset_id}/documents", status_code=201)
async def upload_documents(dataset_id: str, files: List[UploadFile] = File(...)):
    """Upload files to a dataset. Stores in MinIO and creates Document rows."""
    from db.services.knowledgebase_service import KnowledgebaseService
    from db.services.document_service import DocumentService
    from db.services.file_service import FileService
    from db.services.file2document_service import File2DocumentService
    from common.settings import STORAGE_IMPL

    # Verify dataset exists
    found, kb = KnowledgebaseService.get_by_id(dataset_id)
    if not found:
        raise HTTPException(status_code=404, detail="Dataset not found")

    results = []
    for upload_file in files:
        file_id = str(uuid.uuid4()).replace("-", "")
        doc_id = str(uuid.uuid4()).replace("-", "")
        filename = upload_file.filename or "unknown"
        content = await upload_file.read()
        size = len(content)

        # Determine file type from extension
        suffix = os.path.splitext(filename)[1].lower().lstrip(".")
        file_type = _get_file_type(suffix)

        # Store file in MinIO
        storage_path = f"{SYSTEM_TENANT_ID}/{dataset_id}/{file_id}/{filename}"
        try:
            STORAGE_IMPL.put(storage_path, content)
        except Exception as e:
            logger.error(f"Failed to store file {filename}: {e}")
            raise HTTPException(status_code=500, detail=f"Storage error: {e}")

        # Create File record
        FileService.save(**{
            "id": file_id,
            "parent_id": "",
            "tenant_id": SYSTEM_TENANT_ID,
            "created_by": SYSTEM_TENANT_ID,
            "name": filename,
            "location": storage_path,
            "size": size,
            "type": file_type,
        })

        # Create Document record
        DocumentService.save(**{
            "id": doc_id,
            "kb_id": dataset_id,
            "parser_id": kb.parser_id,
            "parser_config": kb.parser_config,
            "source_type": "local",
            "type": file_type,
            "created_by": SYSTEM_TENANT_ID,
            "name": filename,
            "location": storage_path,
            "size": size,
            "suffix": suffix,
            "run": "0",
            "status": "1",
        })

        # Create File2Document link
        File2DocumentService.save(**{
            "id": str(uuid.uuid4()).replace("-", ""),
            "file_id": file_id,
            "document_id": doc_id,
        })

        found, doc = DocumentService.get_by_id(doc_id)
        results.append(doc.to_dict())

    # Update doc count on knowledgebase
    KnowledgebaseService.update_by_id(
        dataset_id,
        {"doc_num": kb.doc_num + len(results)}
    )

    return results


@router.post("/datasets/{dataset_id}/documents/{doc_id}/parse")
async def parse_document(dataset_id: str, doc_id: str):
    """Trigger parsing for a document. Creates tasks and queues to Redis Stream."""
    from db.services.document_service import DocumentService

    found, doc = DocumentService.get_by_id(doc_id)
    if not found:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        DocumentService.begin2parse([doc_id])
    except Exception as e:
        logger.error(f"Failed to start parsing: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "parsing", "doc_id": doc_id}


@router.delete("/datasets/{dataset_id}/documents/{doc_id}", status_code=204)
async def delete_document(dataset_id: str, doc_id: str):
    """Delete a document."""
    from db.services.document_service import DocumentService

    found, doc = DocumentService.get_by_id(doc_id)
    if not found:
        raise HTTPException(status_code=404, detail="Document not found")

    DocumentService.update_by_id(doc_id, {"status": "0"})
    return None


def _get_file_type(suffix: str) -> str:
    """Map file extension to RAGFlow file type."""
    pdf_types = {"pdf"}
    doc_types = {"doc", "docx", "txt", "md", "csv", "json", "html", "htm", "xlsx", "xls", "pptx", "ppt", "eml"}
    visual_types = {"jpg", "jpeg", "png", "bmp", "tiff", "gif"}
    aural_types = {"mp3", "wav", "ogg", "flac"}

    if suffix in pdf_types:
        return "pdf"
    if suffix in doc_types:
        return "doc"
    if suffix in visual_types:
        return "visual"
    if suffix in aural_types:
        return "aural"
    return "other"
