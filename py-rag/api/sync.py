"""
Data sync service endpoints.

Manages sync configurations for external data sources (S3, Confluence, Notion, etc.)
and triggers sync operations using RAGFlow's sync_data_source connectors.
"""
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import SYSTEM_TENANT_ID

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateSyncConfigRequest(BaseModel):
    dataset_id: str
    source_type: str  # s3, confluence, notion, discord, google_cloud_storage, etc.
    config: dict  # Source-specific config (bucket, prefix, token, etc.)
    schedule: Optional[str] = None  # Cron expression, None = manual only


class UpdateSyncConfigRequest(BaseModel):
    config: Optional[dict] = None
    schedule: Optional[str] = None
    enabled: Optional[bool] = None


@router.get("/sync-configs")
async def list_sync_configs(dataset_id: Optional[str] = None):
    """List all sync configurations, optionally filtered by dataset."""
    from db.db_models import DB

    try:
        from db.services.knowledgebase_service import KnowledgebaseService

        # For now, return sync configs from knowledgebase metadata
        # RAGFlow stores sync info in the knowledgebase's parser_config or separate fields
        if dataset_id:
            found, kb = KnowledgebaseService.get_by_id(dataset_id)
            if not found:
                raise HTTPException(status_code=404, detail="Dataset not found")
            # Return parser_config sync-related fields
            cfg = kb.parser_config if isinstance(kb.parser_config, dict) else {}
            return [{
                "dataset_id": dataset_id,
                "source_type": cfg.get("source_type", "local"),
                "config": cfg.get("sync_config", {}),
                "schedule": cfg.get("sync_schedule"),
                "enabled": cfg.get("sync_enabled", False),
            }]

        # List all datasets with sync configs
        kbs = KnowledgebaseService.query(tenant_id=SYSTEM_TENANT_ID, status="1")
        results = []
        for kb in kbs:
            cfg = kb.parser_config if isinstance(kb.parser_config, dict) else {}
            if cfg.get("source_type") and cfg.get("source_type") != "local":
                results.append({
                    "dataset_id": str(kb.id),
                    "dataset_name": kb.name,
                    "source_type": cfg.get("source_type"),
                    "config": cfg.get("sync_config", {}),
                    "schedule": cfg.get("sync_schedule"),
                    "enabled": cfg.get("sync_enabled", False),
                })
        return results
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list sync configs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-configs", status_code=201)
async def create_sync_config(req: CreateSyncConfigRequest):
    """Create a sync configuration for a dataset."""
    from db.services.knowledgebase_service import KnowledgebaseService

    found, kb = KnowledgebaseService.get_by_id(req.dataset_id)
    if not found:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Store sync config in parser_config
    current_config = kb.parser_config if isinstance(kb.parser_config, dict) else {}
    current_config["source_type"] = req.source_type
    current_config["sync_config"] = req.config
    current_config["sync_schedule"] = req.schedule
    current_config["sync_enabled"] = True

    KnowledgebaseService.update_by_id(req.dataset_id, {"parser_config": current_config})

    return {
        "dataset_id": req.dataset_id,
        "source_type": req.source_type,
        "config": req.config,
        "schedule": req.schedule,
        "enabled": True,
    }


@router.post("/sync-configs/{dataset_id}/trigger")
async def trigger_sync(dataset_id: str):
    """Trigger an immediate sync for a dataset."""
    from db.services.knowledgebase_service import KnowledgebaseService

    found, kb = KnowledgebaseService.get_by_id(dataset_id)
    if not found:
        raise HTTPException(status_code=404, detail="Dataset not found")

    cfg = kb.parser_config if isinstance(kb.parser_config, dict) else {}
    source_type = cfg.get("source_type")
    sync_config = cfg.get("sync_config", {})

    if not source_type or source_type == "local":
        raise HTTPException(status_code=400, detail="No sync configuration found for this dataset")

    try:
        from rag.svr.sync_data_source import SyncBase

        # Build task dict for the connector
        task = {
            "id": str(uuid.uuid4()).replace("-", ""),
            "kb_id": dataset_id,
            "tenant_id": SYSTEM_TENANT_ID,
            "source_type": source_type,
            **sync_config,
        }

        # Get the appropriate connector class
        connector_map = _get_connector_map()
        connector_cls = connector_map.get(source_type.upper())
        if not connector_cls:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported source type: {source_type}. Available: {list(connector_map.keys())}",
            )

        connector = connector_cls(sync_config)
        # Run sync asynchronously
        await connector(task)

        return {"status": "triggered", "dataset_id": dataset_id, "source_type": source_type}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to trigger sync: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _get_connector_map() -> dict:
    """Get available sync connector classes."""
    try:
        from rag.svr import sync_data_source as sds
        connectors = {}
        for name in dir(sds):
            obj = getattr(sds, name)
            if isinstance(obj, type) and issubclass(obj, sds.SyncBase) and obj is not sds.SyncBase:
                connectors[name.upper()] = obj
        return connectors
    except ImportError:
        return {}


@router.get("/sync-configs/connectors")
async def list_available_connectors():
    """List available data source connector types."""
    connectors = _get_connector_map()
    return {
        "connectors": list(connectors.keys()),
    }
