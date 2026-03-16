#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
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
Tenant LLM Service Module

Manages per-tenant LLM model configurations, API key storage, model instantiation,
and token usage tracking. This module provides three key classes:

- LLMFactoriesService: CRUD for LLM factory/provider definitions (OpenAI, etc.)
- TenantLLMService: Per-tenant model configuration, API key lookup, model
  instantiation (creates the correct model class for chat/embedding/rerank/etc.),
  token usage accounting, and auto-provisioning of OCR models from environment
- LLM4Tenant: Base class for tenant-scoped model wrappers that handles Langfuse
  observability integration and model lifecycle

The model name convention supports 'name@factory' format for disambiguating
models across different providers.
"""
import os
import json
import logging
from peewee import IntegrityError
from langfuse import Langfuse
from common import settings
from common.constants import MINERU_DEFAULT_CONFIG, MINERU_ENV_KEYS, PADDLEOCR_DEFAULT_CONFIG, PADDLEOCR_ENV_KEYS, LLMType
from common.crypto_utils import decrypt as decrypt_api_key
from db.db_models import DB, LLMFactories, TenantLLM
from db.services.common_service import CommonService
from db.services.langfuse_service import TenantLangfuseService
from db.services.user_service import TenantService
from rag.llm import ChatModel, CvModel, EmbeddingModel, OcrModel, RerankModel, Seq2txtModel, TTSModel


class LLMFactoriesService(CommonService):
    """Service for managing LLM factory/provider catalog entries.

    Attributes:
        model: The LLMFactories Peewee model.
    """
    model = LLMFactories


class TenantLLMService(CommonService):
    """Service for managing per-tenant LLM model configurations.

    Handles API key storage and retrieval, model instantiation based on type,
    token usage tracking, and auto-provisioning of OCR models from environment
    variables (MinerU, PaddleOCR).

    Attributes:
        model: The TenantLLM Peewee model.
    """
    model = TenantLLM

    @classmethod
    @DB.connection_context()
    def get_api_key(cls, tenant_id, model_name):
        """Look up the TenantLLM record for a model by tenant and name.

        Handles the 'name@factory' format by splitting the model name. Falls
        back to legacy naming conventions (___LocalAI, ___HuggingFace, etc.)
        if the initial lookup fails.

        Args:
            tenant_id (str): The tenant ID.
            model_name (str): The model name, optionally in 'name@factory' format.

        Returns:
            TenantLLM | None: The matching TenantLLM record, or None.
        """
        mdlnm, fid = TenantLLMService.split_model_name_and_factory(model_name)
        if not fid:
            objs = cls.query(tenant_id=tenant_id, llm_name=mdlnm)
        else:
            objs = cls.query(tenant_id=tenant_id, llm_name=mdlnm, llm_factory=fid)

        # Fall back to legacy naming conventions if not found
        if (not objs) and fid:
            if fid == "LocalAI":
                mdlnm += "___LocalAI"
            elif fid == "HuggingFace":
                mdlnm += "___HuggingFace"
            elif fid == "OpenAI-API-Compatible":
                mdlnm += "___OpenAI-API"
            elif fid == "VLLM":
                mdlnm += "___VLLM"
            objs = cls.query(tenant_id=tenant_id, llm_name=mdlnm, llm_factory=fid)
        if not objs:
            return None
        return objs[0]

    @classmethod
    @DB.connection_context()
    def get_my_llms(cls, tenant_id):
        """Get all LLM models configured for a tenant with factory metadata.

        Args:
            tenant_id (str): The tenant ID.

        Returns:
            list[dict]: List of model configurations with factory logos and tags.
        """
        fields = [cls.model.id, cls.model.llm_factory, LLMFactories.logo, LLMFactories.tags, cls.model.model_type, cls.model.llm_name, cls.model.used_tokens, cls.model.status]
        objs = cls.model.select(*fields).join(LLMFactories, on=(cls.model.llm_factory == LLMFactories.name)).where(cls.model.tenant_id == tenant_id, ~cls.model.api_key.is_null()).dicts()

        return list(objs)

    @staticmethod
    def split_model_name_and_factory(model_name):
        """Parse a model name that may contain a factory suffix.

        Handles names in the format 'model_name@factory_name'. Validates
        the factory name against known providers from settings.

        Args:
            model_name (str): The model name, optionally with '@factory' suffix.

        Returns:
            tuple: A tuple of (model_name: str, factory_name: str | None).
        """
        arr = model_name.split("@")
        if len(arr) < 2:
            return model_name, None
        if len(arr) > 2:
            return "@".join(arr[0:-1]), arr[-1]

        # model name must be xxx@yyy - validate factory against known providers
        try:
            model_factories = settings.FACTORY_LLM_INFOS
            model_providers = set([f["name"] for f in model_factories])
            if arr[-1] not in model_providers:
                return model_name, None
            return arr[0], arr[-1]
        except Exception as e:
            logging.exception(f"TenantLLMService.split_model_name_and_factory got exception: {e}")
        return model_name, None

    @classmethod
    @DB.connection_context()
    def get_model_config(cls, tenant_id, llm_type, llm_name=None):
        """Get the full model configuration for a tenant by LLM type.

        Resolves the model name from the tenant's defaults (if not explicitly
        provided), looks up the API key, decrypts it, and enriches with
        tool-calling capability information.

        Args:
            tenant_id (str): The tenant ID.
            llm_type (str): The LLM type value (e.g., LLMType.CHAT.value).
            llm_name (str, optional): Explicit model name. If None, uses
                the tenant's default for the given type.

        Returns:
            dict: The model configuration dictionary.

        Raises:
            LookupError: If the tenant or model is not found.
        """
        from db.services.llm_service import LLMService

        e, tenant = TenantService.get_by_id(tenant_id)
        if not e:
            raise LookupError("Tenant not found")

        # Resolve model name from tenant defaults based on type
        if llm_type == LLMType.EMBEDDING.value:
            mdlnm = tenant.embd_id if not llm_name else llm_name
        elif llm_type == LLMType.SPEECH2TEXT.value:
            mdlnm = tenant.asr_id if not llm_name else llm_name
        elif llm_type == LLMType.IMAGE2TEXT.value:
            mdlnm = tenant.img2txt_id if not llm_name else llm_name
        elif llm_type == LLMType.CHAT.value:
            mdlnm = tenant.llm_id if not llm_name else llm_name
        elif llm_type == LLMType.RERANK:
            mdlnm = tenant.rerank_id if not llm_name else llm_name
        elif llm_type == LLMType.TTS:
            mdlnm = tenant.tts_id if not llm_name else llm_name
        elif llm_type == LLMType.OCR:
            if not llm_name:
                raise LookupError("OCR model name is required")
            mdlnm = llm_name
        else:
            assert False, "LLM type error"

        model_config = cls.get_api_key(tenant_id, mdlnm)
        mdlnm, fid = TenantLLMService.split_model_name_and_factory(mdlnm)
        if not model_config:  # for some cases seems fid mismatch
            model_config = cls.get_api_key(tenant_id, mdlnm)
        if model_config:
            model_config = model_config.to_dict()
        elif llm_type == LLMType.EMBEDDING and fid == "Builtin" and "tei-" in os.getenv("COMPOSE_PROFILES", "") and mdlnm == os.getenv("TEI_MODEL", ""):
            embedding_cfg = settings.EMBEDDING_CFG
            model_config = {"llm_factory": "Builtin", "api_key": embedding_cfg["api_key"], "llm_name": mdlnm, "api_base": embedding_cfg["base_url"]}
        else:
            raise LookupError(f"Model({mdlnm}@{fid}) not authorized")

        # Decrypt the encrypted API key (no-op for plain-text values)
        if model_config.get("api_key"):
            model_config["api_key"] = decrypt_api_key(model_config["api_key"])

        # Enrich config with tool-calling capability from LLM catalog
        llm = LLMService.query(llm_name=mdlnm) if not fid else LLMService.query(llm_name=mdlnm, fid=fid)
        if not llm and fid:  # for some cases seems fid mismatch
            llm = LLMService.query(llm_name=mdlnm)
        if llm:
            model_config["is_tools"] = llm[0].is_tools
        return model_config

    @classmethod
    @DB.connection_context()
    def model_instance(cls, model_config: dict, lang="Chinese", **kwargs):
        """Instantiate the appropriate model class based on configuration.

        Creates the correct model implementation (ChatModel, EmbeddingModel,
        RerankModel, CvModel, etc.) based on the model_type in the config.
        Vision-enabled chat models are instantiated as CvModel.

        Args:
            model_config (dict): Model configuration with llm_factory,
                model_type, api_key, llm_name, and api_base.
            lang (str): Language setting for the model. Defaults to "Chinese".
            **kwargs: Additional keyword arguments passed to the model constructor.

        Returns:
            Model instance or None: The instantiated model, or None if the
                factory is not registered for the given type.

        Raises:
            LookupError: If model_config is empty/None.
        """
        if not model_config:
            raise LookupError("Model config is required")
        kwargs.update({"provider": model_config["llm_factory"]})
        if model_config["model_type"] == LLMType.EMBEDDING.value:
            if model_config["llm_factory"] not in EmbeddingModel:
                return None
            return EmbeddingModel[model_config["llm_factory"]](model_config["api_key"], model_config["llm_name"], base_url=model_config["api_base"])

        elif model_config["model_type"] == LLMType.RERANK:
            if model_config["llm_factory"] not in RerankModel:
                return None
            return RerankModel[model_config["llm_factory"]](model_config["api_key"], model_config["llm_name"], base_url=model_config["api_base"])

        elif model_config["model_type"] == LLMType.IMAGE2TEXT.value:
            if model_config["llm_factory"] not in CvModel:
                return None
            return CvModel[model_config["llm_factory"]](model_config["api_key"], model_config["llm_name"], lang, base_url=model_config["api_base"], **kwargs)

        elif model_config["model_type"] == LLMType.CHAT.value:
            # Vision-enabled chat models are instantiated as CvModel
            if model_config.get("vision"):
                if model_config["llm_factory"] not in CvModel:
                    return None
                return CvModel[model_config["llm_factory"]](model_config["api_key"], model_config["llm_name"], lang, base_url=model_config["api_base"], **kwargs)
            if model_config["llm_factory"] not in ChatModel:
                return None
            return ChatModel[model_config["llm_factory"]](model_config["api_key"], model_config["llm_name"], base_url=model_config["api_base"], **kwargs)

        elif model_config["model_type"] == LLMType.SPEECH2TEXT:
            if model_config["llm_factory"] not in Seq2txtModel:
                return None
            return Seq2txtModel[model_config["llm_factory"]](key=model_config["api_key"], model_name=model_config["llm_name"], lang=lang, base_url=model_config["api_base"])
        elif model_config["model_type"] == LLMType.TTS:
            if model_config["llm_factory"] not in TTSModel:
                return None
            return TTSModel[model_config["llm_factory"]](
                model_config["api_key"],
                model_config["llm_name"],
                base_url=model_config["api_base"],
            )

        elif model_config["model_type"] == LLMType.OCR:
            if model_config["llm_factory"] not in OcrModel:
                return None
            return OcrModel[model_config["llm_factory"]](
                key=model_config["api_key"],
                model_name=model_config["llm_name"],
                base_url=model_config.get("api_base", ""),
                **kwargs,
            )

        return None

    @classmethod
    @DB.connection_context()
    def increase_usage(cls, tenant_id, llm_type, used_tokens, llm_name=None):
        """Increment the used_tokens counter for a tenant's model by type.

        Resolves the model name from the tenant's defaults, then atomically
        increments the token usage counter.

        Args:
            tenant_id (str): The tenant ID.
            llm_type (str): The LLM type value.
            used_tokens (int): Number of tokens to add.
            llm_name (str, optional): Explicit model name override.

        Returns:
            int: Number of records updated (0 on failure).
        """
        e, tenant = TenantService.get_by_id(tenant_id)
        if not e:
            logging.error(f"Tenant not found: {tenant_id}")
            return 0

        llm_map = {
            LLMType.EMBEDDING.value: tenant.embd_id if not llm_name else llm_name,
            LLMType.SPEECH2TEXT.value: tenant.asr_id,
            LLMType.IMAGE2TEXT.value: tenant.img2txt_id,
            LLMType.CHAT.value: tenant.llm_id if not llm_name else llm_name,
            LLMType.RERANK.value: tenant.rerank_id if not llm_name else llm_name,
            LLMType.TTS.value: tenant.tts_id if not llm_name else llm_name,
            LLMType.OCR.value: llm_name,
        }

        mdlnm = llm_map.get(llm_type)
        if mdlnm is None:
            logging.error(f"LLM type error: {llm_type}")
            return 0

        llm_name, llm_factory = TenantLLMService.split_model_name_and_factory(mdlnm)

        try:
            num = (
                cls.model.update(used_tokens=cls.model.used_tokens + used_tokens)
                .where(cls.model.tenant_id == tenant_id, cls.model.llm_name == llm_name, cls.model.llm_factory == llm_factory if llm_factory else True)
                .execute()
            )
        except Exception:
            logging.exception("TenantLLMService.increase_usage got exception,Failed to update used_tokens for tenant_id=%s, llm_name=%s", tenant_id, llm_name)
            return 0

        return num

    @classmethod
    @DB.connection_context()
    def increase_usage_by_id(cls, tenant_model_id: int, used_tokens: int):
        """Increment the used_tokens counter by TenantLLM record ID.

        Args:
            tenant_model_id (int): The TenantLLM auto-increment ID.
            used_tokens (int): Number of tokens to add.

        Returns:
            int: Number of records updated (0 on failure).
        """
        try:
            update_cnt = cls.model.update(used_tokens=cls.model.used_tokens + used_tokens).where(cls.model.id == tenant_model_id).execute()
        except Exception as e:
            logging.exception(f"TenantLLMService.increase_usage got exception {e}, Failed to update used_tokens for tenant_model_id {tenant_model_id}")
            return 0
        return update_cnt

    @classmethod
    @DB.connection_context()
    def get_openai_models(cls):
        """Get all OpenAI tenant models excluding the two embedding models.

        Returns:
            list[dict]: List of OpenAI model configurations.
        """
        objs = cls.model.select().where((cls.model.llm_factory == "OpenAI"), ~(cls.model.llm_name == "text-embedding-3-small"), ~(cls.model.llm_name == "text-embedding-3-large")).dicts()
        return list(objs)

    @classmethod
    def _collect_mineru_env_config(cls) -> dict | None:
        """Collect MinerU OCR configuration from environment variables.

        Returns:
            dict | None: The configuration dict if any env vars are set, None otherwise.
        """
        cfg = MINERU_DEFAULT_CONFIG
        found = False
        for key in MINERU_ENV_KEYS:
            val = os.environ.get(key)
            if val:
                found = True
                cfg[key] = val
        return cfg if found else None

    @classmethod
    @DB.connection_context()
    def ensure_mineru_from_env(cls, tenant_id: str) -> str | None:
        """Ensure a MinerU OCR model exists for the tenant if env variables are present.

        Checks for existing MinerU models with matching configuration. If none
        exists, creates a new one with a unique name.

        Args:
            tenant_id (str): The tenant ID.

        Returns:
            str | None: The existing or newly created llm_name, or None if env not set.
        """
        cfg = cls._collect_mineru_env_config()
        if not cfg:
            return None

        saved_mineru_models = cls.query(tenant_id=tenant_id, llm_factory="MinerU", model_type=LLMType.OCR.value)

        def _parse_api_key(raw: str) -> dict:
            try:
                return json.loads(raw or "{}")
            except Exception:
                return {}

        # Check if an existing model matches the current env config
        for item in saved_mineru_models:
            api_cfg = _parse_api_key(item.api_key)
            normalized = {k: api_cfg.get(k, MINERU_DEFAULT_CONFIG.get(k)) for k in MINERU_ENV_KEYS}
            if normalized == cfg:
                return item.llm_name

        # Create a new model with a unique name
        used_names = {item.llm_name for item in saved_mineru_models}
        idx = 1
        base_name = "mineru-from-env"
        while True:
            candidate = f"{base_name}-{idx}"
            if candidate in used_names:
                idx += 1
                continue

            try:
                cls.save(
                    tenant_id=tenant_id,
                    llm_factory="MinerU",
                    llm_name=candidate,
                    model_type=LLMType.OCR.value,
                    api_key=json.dumps(cfg),
                    api_base="",
                    max_tokens=0,
                )
                return candidate
            except IntegrityError:
                logging.warning("MinerU env model %s already exists for tenant %s, retry with next name", candidate, tenant_id)
                used_names.add(candidate)
                idx += 1
                continue

    @classmethod
    def _collect_paddleocr_env_config(cls) -> dict | None:
        """Collect PaddleOCR configuration from environment variables.

        Returns:
            dict | None: The configuration dict if any env vars are set, None otherwise.
        """
        cfg = PADDLEOCR_DEFAULT_CONFIG
        found = False
        for key in PADDLEOCR_ENV_KEYS:
            val = os.environ.get(key)
            if val:
                found = True
                cfg[key] = val
        return cfg if found else None

    @classmethod
    @DB.connection_context()
    def ensure_paddleocr_from_env(cls, tenant_id: str) -> str | None:
        """Ensure a PaddleOCR model exists for the tenant if env variables are present.

        Checks for existing PaddleOCR models with matching configuration. If none
        exists, creates a new one with a unique name.

        Args:
            tenant_id (str): The tenant ID.

        Returns:
            str | None: The existing or newly created llm_name, or None if env not set.
        """
        cfg = cls._collect_paddleocr_env_config()
        if not cfg:
            return None

        saved_paddleocr_models = cls.query(tenant_id=tenant_id, llm_factory="PaddleOCR", model_type=LLMType.OCR.value)

        def _parse_api_key(raw: str) -> dict:
            try:
                return json.loads(raw or "{}")
            except Exception:
                return {}

        # Check if an existing model matches the current env config
        for item in saved_paddleocr_models:
            api_cfg = _parse_api_key(item.api_key)
            normalized = {k: api_cfg.get(k, PADDLEOCR_DEFAULT_CONFIG.get(k)) for k in PADDLEOCR_ENV_KEYS}
            if normalized == cfg:
                return item.llm_name

        # Create a new model with a unique name
        used_names = {item.llm_name for item in saved_paddleocr_models}
        idx = 1
        base_name = "paddleocr-from-env"
        while True:
            candidate = f"{base_name}-{idx}"
            if candidate in used_names:
                idx += 1
                continue

            try:
                cls.save(
                    tenant_id=tenant_id,
                    llm_factory="PaddleOCR",
                    llm_name=candidate,
                    model_type=LLMType.OCR.value,
                    api_key=json.dumps(cfg),
                    api_base="",
                    max_tokens=0,
                )
                return candidate
            except IntegrityError:
                logging.warning("PaddleOCR env model %s already exists for tenant %s, retry with next name", candidate, tenant_id)
                used_names.add(candidate)
                idx += 1
                continue

    @classmethod
    @DB.connection_context()
    def delete_by_tenant_id(cls, tenant_id):
        """Delete all LLM configurations for a tenant.

        Args:
            tenant_id (str): The tenant ID.

        Returns:
            int: Number of records deleted.
        """
        return cls.model.delete().where(cls.model.tenant_id == tenant_id).execute()

    @staticmethod
    def llm_id2llm_type(llm_id: str) -> str | None:
        """Resolve the model type for a given LLM ID.

        Searches factory configurations, the LLM catalog, and tenant LLM
        records to determine the model type (chat, embedding, rerank, etc.).

        Args:
            llm_id (str): The LLM identifier, optionally with '@factory' suffix.

        Returns:
            str | None: The model type string, or None if not found.
        """
        from db.services.llm_service import LLMService

        llm_id, *_ = TenantLLMService.split_model_name_and_factory(llm_id)
        # Search factory configurations first
        llm_factories = settings.FACTORY_LLM_INFOS
        for llm_factory in llm_factories:
            for llm in llm_factory["llm"]:
                if llm_id == llm["llm_name"]:
                    return llm["model_type"].split(",")[-1]

        # Search the global LLM catalog
        for llm in LLMService.query(llm_name=llm_id):
            return llm.model_type

        # Search tenant-specific LLM entries
        llm = TenantLLMService.get_or_none(llm_name=llm_id)
        if llm:
            return llm.model_type
        for llm in TenantLLMService.query(llm_name=llm_id):
            return llm.model_type
        return None


class LLM4Tenant:
    """Base class for tenant-scoped LLM model wrappers.

    Wraps a model instance with tenant context, token usage tracking,
    and optional Langfuse observability integration. Subclassed by
    LLMBundle which adds specific model operation methods.

    Attributes:
        tenant_id (str): The tenant ID this model belongs to.
        llm_name (str): The model name.
        model_config (dict): Full model configuration dictionary.
        mdl: The instantiated model implementation.
        max_length (int): Maximum token context length.
        is_tools (bool): Whether this model supports tool calling.
        verbose_tool_use (bool): Whether to keep tool call XML in output.
        langfuse: Langfuse client instance, or None if not configured.
        trace_context (dict): Langfuse trace context with trace_id.
    """
    def __init__(self, tenant_id: str, model_config: dict, lang="Chinese", **kwargs):
        """Initialize the tenant model wrapper.

        Args:
            tenant_id (str): The tenant ID.
            model_config (dict): Model configuration including llm_factory,
                llm_name, llm_type, api_key, api_base, max_tokens.
            lang (str): Language setting. Defaults to "Chinese".
            **kwargs: Additional arguments including verbose_tool_use.

        Raises:
            AssertionError: If the model cannot be instantiated.
        """
        self.tenant_id = tenant_id
        self.llm_name = model_config["llm_name"]
        self.model_config = model_config
        self.mdl = TenantLLMService.model_instance(model_config, lang=lang, **kwargs)
        assert self.mdl, "Can't find model for {}/{}/{}".format(tenant_id, model_config["llm_type"], model_config["llm_name"])
        self.max_length = model_config.get("max_tokens", 8192)

        self.is_tools = model_config.get("is_tools", False)
        self.verbose_tool_use = kwargs.get("verbose_tool_use")

        # Initialize Langfuse observability if configured for this tenant
        langfuse_keys = TenantLangfuseService.filter_by_tenant(tenant_id=tenant_id)
        self.langfuse = None
        if langfuse_keys:
            langfuse = Langfuse(public_key=langfuse_keys.public_key, secret_key=langfuse_keys.secret_key, host=langfuse_keys.host)
            try:
                if langfuse.auth_check():
                    self.langfuse = langfuse
                    trace_id = self.langfuse.create_trace_id()
                    self.trace_context = {"trace_id": trace_id}
            except Exception:
                # Skip langfuse tracing if connection fails
                pass
