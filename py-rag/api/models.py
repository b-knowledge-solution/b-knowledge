"""
Model provider management endpoints.

Syncs model provider config from Node.js into RAGFlow's TenantLLM table
under the system tenant. Also exposes available model factories/catalogs.
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import SYSTEM_TENANT_ID

logger = logging.getLogger(__name__)
router = APIRouter()


class SyncProviderRequest(BaseModel):
    factory_name: str
    model_type: str
    model_name: str
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    max_tokens: Optional[int] = None
    is_default: bool = False


class SetDefaultsRequest(BaseModel):
    llm_id: Optional[str] = None
    embd_id: Optional[str] = None
    asr_id: Optional[str] = None
    img2txt_id: Optional[str] = None
    rerank_id: Optional[str] = None
    tts_id: Optional[str] = None


@router.post("/models/providers", status_code=201)
async def sync_model_provider(req: SyncProviderRequest):
    """Sync a model provider config from Node.js into TenantLLM."""
    from db.db_models import TenantLLM, DB

    with DB.connection_context():
        # Upsert TenantLLM row
        existing = (
            TenantLLM.select()
            .where(
                (TenantLLM.tenant_id == SYSTEM_TENANT_ID)
                & (TenantLLM.llm_factory == req.factory_name)
                & (TenantLLM.llm_name == req.model_name)
                & (TenantLLM.model_type == req.model_type)
            )
            .first()
        )

        data = {
            "tenant_id": SYSTEM_TENANT_ID,
            "llm_factory": req.factory_name,
            "model_type": req.model_type,
            "llm_name": req.model_name,
            "api_key": req.api_key or "",
            "api_base": req.api_base or "",
            "max_tokens": req.max_tokens or 0,
            "used_tokens": 0,
        }

        if existing:
            TenantLLM.update(**data).where(
                (TenantLLM.tenant_id == SYSTEM_TENANT_ID)
                & (TenantLLM.llm_factory == req.factory_name)
                & (TenantLLM.llm_name == req.model_name)
                & (TenantLLM.model_type == req.model_type)
            ).execute()
        else:
            TenantLLM.insert(**data).execute()

        # If is_default, update system tenant's default model fields
        if req.is_default:
            _set_default_for_type(req.model_type, req.model_name)

    return {"status": "ok", "model_name": req.model_name}


@router.get("/models/providers")
async def list_model_providers():
    """List all configured model providers for system tenant."""
    from db.db_models import TenantLLM, DB

    with DB.connection_context():
        rows = (
            TenantLLM.select()
            .where(TenantLLM.tenant_id == SYSTEM_TENANT_ID)
        )
        return [
            {
                "factory_name": r.llm_factory,
                "model_type": r.model_type,
                "model_name": r.llm_name,
                "api_base": r.api_base,
                "max_tokens": r.max_tokens,
            }
            for r in rows
        ]


@router.get("/models/defaults")
async def get_model_defaults():
    """Get current default models from system tenant."""
    from db.db_models import Tenant, DB

    with DB.connection_context():
        tenant = Tenant.select().where(Tenant.id == SYSTEM_TENANT_ID).first()
        if not tenant:
            raise HTTPException(status_code=500, detail="System tenant not found")

        return {
            "llm_id": tenant.llm_id,
            "embd_id": tenant.embd_id,
            "asr_id": tenant.asr_id,
            "img2txt_id": tenant.img2txt_id,
            "rerank_id": tenant.rerank_id,
            "tts_id": tenant.tts_id,
        }


@router.post("/models/defaults")
async def set_model_defaults(req: SetDefaultsRequest):
    """Set default models on system tenant."""
    from db.db_models import Tenant, DB

    update_data = req.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    with DB.connection_context():
        Tenant.update(**update_data).where(
            Tenant.id == SYSTEM_TENANT_ID
        ).execute()

    return {"status": "ok", "updated": list(update_data.keys())}


@router.get("/models/available")
async def list_available_models():
    """List all available model factories from RAGFlow's LLM catalog."""
    try:
        from rag.llm import EmbeddingModel, ChatModel
        # Return a basic catalog — actual factories depend on ragflow internals
        return {
            "factories": [
                "OpenAI", "Azure-OpenAI", "Ollama", "HuggingFace",
                "Tongyi-Qianwen", "Moonshot", "DeepSeek", "VolcEngine",
                "ZHIPU-AI", "Minimax", "Baichuan", "Mistral",
                "Bedrock", "Gemini", "Groq", "OpenRouter",
                "LocalAI", "LM-Studio", "Nvidia",
            ],
            "model_types": ["chat", "embedding", "rerank", "speech2text", "image2text", "tts"],
        }
    except ImportError:
        return {
            "factories": [],
            "model_types": ["chat", "embedding", "rerank", "speech2text", "image2text", "tts"],
        }


def _set_default_for_type(model_type: str, model_name: str):
    """Update system tenant's default model for a given type."""
    from db.db_models import Tenant, DB

    field_map = {
        "chat": "llm_id",
        "embedding": "embd_id",
        "rerank": "rerank_id",
        "speech2text": "asr_id",
        "image2text": "img2txt_id",
        "tts": "tts_id",
    }

    field = field_map.get(model_type)
    if not field:
        return

    Tenant.update(**{field: model_name}).where(
        Tenant.id == SYSTEM_TENANT_ID
    ).execute()
