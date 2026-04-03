#
#  Copyright 2026 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
"""
Tenant Model Service (Joint Service)

Provides cross-cutting functions that resolve tenant-level LLM model
configurations by combining data from the Tenant, TenantLLM, and LLM tables.
These functions are used throughout the system to look up the correct model
configuration for a given tenant and model type (chat, embedding, rerank, etc.).

This module acts as a joint service because it orchestrates logic across
multiple domain services (TenantService, TenantLLMService, LLMService).
"""
import os
import enum
from common import settings
from common.constants import LLMType
from db.services.llm_service import LLMService
from db.services.tenant_llm_service import TenantLLMService, TenantService


def get_model_config_by_id(tenant_model_id: int) -> dict:
    """Retrieve a tenant LLM model configuration by its primary key ID.

    Looks up the TenantLLM record, converts it to a dictionary, and enriches
    it with tool-calling capability information from the LLM catalog.

    Args:
        tenant_model_id (int): The auto-increment ID of the TenantLLM record.

    Returns:
        dict: The model configuration dictionary including llm_factory,
              llm_name, api_key, api_base, model_type, and is_tools.

    Raises:
        LookupError: If no TenantLLM record exists with the given ID.
    """
    found, model_config = TenantLLMService.get_by_id(tenant_model_id)
    if not found:
        raise LookupError(f"Tenant Model with id {tenant_model_id} not found")
    config_dict = model_config.to_dict()
    # Enrich with tool-calling capability from the global LLM catalog
    llm = LLMService.query(llm_name=config_dict["llm_name"])
    if llm:
        config_dict["is_tools"] = llm[0].is_tools
    return config_dict


def get_model_config_by_type_and_name(tenant_id: str, model_type: str, model_name: str):
    """Retrieve a tenant LLM model configuration by type and name.

    Resolves the model configuration for a specific model name within a tenant.
    Handles the 'name@factory' format by splitting and retrying if the initial
    lookup fails. Also handles the special case of built-in TEI embedding models.

    Args:
        tenant_id (str): The tenant ID to look up.
        model_type (str): The LLM type (e.g., LLMType.CHAT, LLMType.EMBEDDING).
        model_name (str): The model name, optionally in 'name@factory' format.

    Returns:
        dict: The model configuration dictionary.

    Raises:
        Exception: If model_name is empty.
        LookupError: If the model is not found for the tenant.
    """
    if not model_name:
        raise Exception("Model Name is required")
    model_config = TenantLLMService.get_api_key(tenant_id, model_name)
    if not model_config:
        # model_name may be in 'name@factory' format; split and try again
        pure_model_name, fid = TenantLLMService.split_model_name_and_factory(model_name)
        # Handle built-in TEI embedding model configured via environment
        if model_type == LLMType.EMBEDDING and fid == "Builtin" and "tei-" in os.getenv("COMPOSE_PROFILES", "") and pure_model_name == os.getenv("TEI_MODEL", ""):
            embedding_cfg = settings.EMBEDDING_CFG
            config_dict = {
                "llm_factory": "Builtin",
                "api_key": embedding_cfg["api_key"],
                "llm_name": pure_model_name,
                "api_base": embedding_cfg["base_url"],
                "model_type": LLMType.EMBEDDING,
            }
        else:
            model_config = TenantLLMService.get_api_key(tenant_id, pure_model_name)
            if not model_config:
                raise LookupError(f"Tenant Model with name {model_name} not found")
            config_dict = model_config.to_dict()
    else:
        config_dict = model_config.to_dict()
    # Enrich with tool-calling capability from the global LLM catalog
    llm = LLMService.query(llm_name=config_dict["llm_name"])
    if llm:
        config_dict["is_tools"] = llm[0].is_tools
    return config_dict


def get_tenant_default_model_by_type(tenant_id: str, model_type: str|enum.Enum):
    """Retrieve the tenant's default model configuration for a given type.

    Queries model_providers (TenantLLM) directly for the default model
    with is_default=True and the matching model_type. This uses the same
    table as the BE, making model_providers the single source of truth.

    Falls back to the legacy tenant.*_id columns if no default is found
    in model_providers, for backward compatibility during migration.

    Args:
        tenant_id (str): The tenant ID to look up.
        model_type (str | enum.Enum): The LLM type. Can be a string or
            LLMType enum value.

    Returns:
        dict: The model configuration dictionary for the tenant's default model.

    Raises:
        LookupError: If the tenant is not found.
        Exception: If no default model is set for the given type, or if
                  the model type is unknown or requires a name (OCR).
    """
    from db.db_models import TenantLLM

    model_type_val = model_type if isinstance(model_type, str) else model_type.value

    if model_type_val == LLMType.OCR.value:
        raise Exception("OCR model name is required")

    # Primary lookup: query model_providers directly for the default
    default_model = (TenantLLM.select()
        .where(TenantLLM.tenant_id == tenant_id,
               TenantLLM.model_type == model_type_val,
               TenantLLM.status == "active",
               TenantLLM.is_default == True)
        .first())

    if default_model:
        # Build config directly from the already-found record to avoid
        # a wasteful round-trip through get_model_config_by_type_and_name
        # which can fail to re-find the model by name@factory format
        config = default_model.to_dict() if hasattr(default_model, 'to_dict') else {
            "llm_factory": default_model.llm_factory,
            "llm_name": default_model.llm_name,
            "api_key": default_model.api_key,
            "api_base": getattr(default_model, 'api_base', ''),
            "model_type": default_model.model_type,
        }
        # Convert Peewee model to dict if to_dict returned a model object
        if not isinstance(config, dict):
            config = {
                "llm_factory": default_model.llm_factory,
                "llm_name": default_model.llm_name,
                "api_key": default_model.api_key,
                "api_base": getattr(default_model, 'api_base', ''),
                "model_type": default_model.model_type,
            }
        # Enrich with tool-calling capability from the global LLM catalog
        llm = LLMService.query(llm_name=config.get("llm_name", ""))
        if llm:
            config["is_tools"] = llm[0].is_tools
    else:
        # Fallback: read from legacy tenant.*_id columns
        exist, tenant = TenantService.get_by_id(tenant_id)
        if not exist:
            raise LookupError("Tenant not found")
        model_name: str = ""
        match model_type_val:
            case LLMType.EMBEDDING.value:
                model_name = tenant.embd_id
            case LLMType.SPEECH2TEXT.value:
                model_name = tenant.asr_id
            case LLMType.IMAGE2TEXT.value:
                model_name = tenant.img2txt_id
            case LLMType.CHAT.value:
                model_name = tenant.llm_id
            case LLMType.RERANK.value:
                model_name = tenant.rerank_id
            case LLMType.TTS.value:
                model_name = tenant.tts_id
            case _:
                raise Exception(f"Unknown model type {model_type}")

        if not model_name:
            raise Exception(f"No default {model_type} model is set.")

        config = get_model_config_by_type_and_name(tenant_id, model_type, model_name)

    # For IMAGE2TEXT, annotate with vision=True so model_instance() uses CvModel
    if model_type_val == LLMType.IMAGE2TEXT.value:
        config["vision"] = True
    return config
