#
#  Copyright 2025 The InfiniFlow Authors. All Rights Reserved.
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
Global application settings for the RAG worker.

This module acts as the central registry for all runtime configuration:
database connections, LLM model defaults, storage backends, doc-engine
connectors, authentication, SMTP, and resource limits.  Most values are
populated lazily by ``init_settings()`` which must be called once at
startup (see ``executor_wrapper.py``).

Module-level globals are used intentionally so that any module can do
``from common import settings`` and read the current values.
"""
import os
import json
import secrets
import logging
from common.constants import RAG_FLOW_SERVICE_NAME
from common.file_utils import get_project_base_directory
from common.config_utils import get_base_config, decrypt_database_config
from common.misc_utils import pip_install_torch
from common.constants import SVR_QUEUE_NAME, Storage

import rag.utils
import rag.utils.es_conn
import rag.utils.infinity_conn
import rag.utils.ob_conn
from rag.utils.azure_sas_conn import RAGFlowAzureSasBlob
from rag.utils.azure_spn_conn import RAGFlowAzureSpnBlob
from rag.utils.gcs_conn import RAGFlowGCS
from rag.utils.minio_conn import RAGFlowMinio
from rag.utils.opendal_conn import OpenDALStorage
from rag.utils.redis_conn import REDIS_CONN
from rag.utils.s3_conn import RAGFlowS3
from rag.utils.oss_conn import RAGFlowOSS

from rag.nlp import search

import memory.utils.es_conn as memory_es_conn
import memory.utils.infinity_conn as memory_infinity_conn
import memory.utils.ob_conn as memory_ob_conn

# ---------------------------------------------------------------------------
# LLM model configuration globals (populated by init_settings)
# ---------------------------------------------------------------------------
LLM = None
LLM_FACTORY = None
LLM_BASE_URL = None
CHAT_MDL = ""
EMBEDDING_MDL = ""
RERANK_MDL = ""
ASR_MDL = ""
IMAGE2TEXT_MDL = ""


CHAT_CFG = ""
EMBEDDING_CFG = ""
RERANK_CFG = ""
ASR_CFG = ""
IMAGE2TEXT_CFG = ""
API_KEY = None
PARSERS = None
HOST_IP = None
HOST_PORT = None

FACTORY_LLM_INFOS = None
ALLOWED_LLM_FACTORIES = None

# ---------------------------------------------------------------------------
# Database configuration
# ---------------------------------------------------------------------------
DATABASE_TYPE = os.getenv("DB_TYPE", "postgres")
DATABASE = decrypt_database_config(name=DATABASE_TYPE)

# ---------------------------------------------------------------------------
# Authentication globals
# ---------------------------------------------------------------------------
AUTHENTICATION_CONF = None

# client
CLIENT_AUTHENTICATION = None
HTTP_APP_KEY = None
GITHUB_OAUTH = None
FEISHU_OAUTH = None
OAUTH_CONFIG = None

# ---------------------------------------------------------------------------
# Document engine configuration
# ---------------------------------------------------------------------------
DOC_ENGINE = os.getenv('DOC_ENGINE', 'opensearch')
DOC_ENGINE_INFINITY = (DOC_ENGINE.lower() == "infinity")
DOC_ENGINE_OCEANBASE = (DOC_ENGINE.lower() == "oceanbase")

# Document store connections (set by init_settings based on DOC_ENGINE)
docStoreConn = None
msgStoreConn = None

# Search retriever instances
retriever = None
kg_retriever = None

# user registration switch
REGISTER_ENABLED = 1

# SSO-only mode: hide password login form
DISABLE_PASSWORD_LOGIN = False

# sandbox-executor-manager
SANDBOX_HOST = None
STRONG_TEST_COUNT = int(os.environ.get("STRONG_TEST_COUNT", "8"))

# ---------------------------------------------------------------------------
# SMTP / email configuration
# ---------------------------------------------------------------------------
SMTP_CONF = None
MAIL_SERVER = ""
MAIL_PORT = 000
MAIL_USE_SSL = True
MAIL_USE_TLS = False
MAIL_USERNAME = ""
MAIL_PASSWORD = ""
MAIL_DEFAULT_SENDER = ()
MAIL_FRONTEND_URL = ""

# ---------------------------------------------------------------------------
# Storage and vector DB configuration dicts (populated by init_settings)
# ---------------------------------------------------------------------------
VECTORDB = {}
INFINITY = {}
AZURE = {}
S3 = {}
OB = {}
OSS = {}
OS = {}
GCS = {}

# ---------------------------------------------------------------------------
# Resource limits
# ---------------------------------------------------------------------------
DOC_MAXIMUM_SIZE: int = 128 * 1024 * 1024
DOC_BULK_SIZE: int = 4
EMBEDDING_BATCH_SIZE: int = 16

PARALLEL_DEVICES: int = 0

# ---------------------------------------------------------------------------
# Object-storage backend selection
# ---------------------------------------------------------------------------
STORAGE_IMPL_TYPE = os.getenv('STORAGE_IMPL', 'MINIO')
STORAGE_IMPL = None

def get_svr_queue_name(priority: int) -> str:
    """Return the Redis stream name for a given task priority level.

    Args:
        priority: Task priority (0 = default queue, >0 = priority-suffixed queue).

    Returns:
        Redis stream name string.
    """
    if priority == 0:
        return SVR_QUEUE_NAME
    return f"{SVR_QUEUE_NAME}_{priority}"

def get_svr_queue_names():
    """Return all server queue names ordered by descending priority.

    Returns:
        List of Redis stream name strings (priority 1 first, then 0).
    """
    return [get_svr_queue_name(priority) for priority in [1, 0]]



class StorageFactory:
    """Factory for creating object-storage backend instances.

    Maps ``Storage`` enum members to their concrete implementation classes
    and instantiates them on demand.
    """
    storage_mapping = {
        Storage.MINIO: RAGFlowMinio,
        Storage.AZURE_SPN: RAGFlowAzureSpnBlob,
        Storage.AZURE_SAS: RAGFlowAzureSasBlob,
        Storage.AWS_S3: RAGFlowS3,
        Storage.OSS: RAGFlowOSS,
        Storage.OPENDAL: OpenDALStorage,
        Storage.GCS: RAGFlowGCS,
    }

    @classmethod
    def create(cls, storage: Storage):
        """Instantiate the storage backend for the given ``Storage`` enum value.

        Args:
            storage: A ``Storage`` enum member.

        Returns:
            An initialised storage backend instance.
        """
        return cls.storage_mapping[storage]()


def init_settings():
    """Initialise all global settings from config files and environment variables.

    Must be called once at application startup. Populates LLM model defaults,
    database config, authentication, doc-engine connections, object storage,
    search retrievers, SMTP, and resource limits.
    """
    global DATABASE_TYPE, DATABASE
    DATABASE_TYPE = os.getenv("DB_TYPE", "postgres")
    DATABASE = decrypt_database_config(name=DATABASE_TYPE)

    # ---- LLM defaults ----
    global ALLOWED_LLM_FACTORIES, LLM_FACTORY, LLM_BASE_URL
    llm_settings = get_base_config("user_default_llm", {}) or {}
    llm_default_models = llm_settings.get("default_models", {}) or {}
    LLM_FACTORY = llm_settings.get("factory", "") or ""
    LLM_BASE_URL = llm_settings.get("base_url", "") or ""
    ALLOWED_LLM_FACTORIES = llm_settings.get("allowed_factories", None)

    global REGISTER_ENABLED
    try:
        REGISTER_ENABLED = int(os.environ.get("REGISTER_ENABLED", "1"))
    except Exception:
        pass

    global DISABLE_PASSWORD_LOGIN
    try:
        env_val = os.environ.get("DISABLE_PASSWORD_LOGIN", "").lower()
        if env_val in ("1", "true", "yes"):
            DISABLE_PASSWORD_LOGIN = True
        else:
            authentication_conf = get_base_config("authentication", {})
            DISABLE_PASSWORD_LOGIN = bool(authentication_conf.get("disable_password_login", False))
    except Exception:
        pass

    global FACTORY_LLM_INFOS
    try:
        with open(os.path.join(get_project_base_directory(), "conf", "llm_factories.json"), "r") as f:
            FACTORY_LLM_INFOS = json.load(f)["factory_llm_infos"]
    except Exception:
        FACTORY_LLM_INFOS = []

    global API_KEY
    API_KEY = llm_settings.get("api_key")

    global PARSERS
    PARSERS = llm_settings.get(
        "parsers", "naive:General,qa:Q&A,resume:Resume,manual:Manual,table:Table,paper:Paper,book:Book,laws:Laws,presentation:Presentation,picture:Picture,one:One,audio:Audio,email:Email,tag:Tag"
    )

    # ---- Resolve per-model configs for each LLM type ----
    global CHAT_MDL, EMBEDDING_MDL, RERANK_MDL, ASR_MDL, IMAGE2TEXT_MDL
    chat_entry = _parse_model_entry(llm_default_models.get("chat_model", CHAT_MDL))
    embedding_entry = _parse_model_entry(llm_default_models.get("embedding_model", EMBEDDING_MDL))
    rerank_entry = _parse_model_entry(llm_default_models.get("rerank_model", RERANK_MDL))
    asr_entry = _parse_model_entry(llm_default_models.get("asr_model", ASR_MDL))
    image2text_entry = _parse_model_entry(llm_default_models.get("image2text_model", IMAGE2TEXT_MDL))

    global CHAT_CFG, EMBEDDING_CFG, RERANK_CFG, ASR_CFG, IMAGE2TEXT_CFG
    CHAT_CFG = _resolve_per_model_config(chat_entry, LLM_FACTORY, API_KEY, LLM_BASE_URL)
    EMBEDDING_CFG = _resolve_per_model_config(embedding_entry, LLM_FACTORY, API_KEY, LLM_BASE_URL)
    RERANK_CFG = _resolve_per_model_config(rerank_entry, LLM_FACTORY, API_KEY, LLM_BASE_URL)
    ASR_CFG = _resolve_per_model_config(asr_entry, LLM_FACTORY, API_KEY, LLM_BASE_URL)
    IMAGE2TEXT_CFG = _resolve_per_model_config(image2text_entry, LLM_FACTORY, API_KEY, LLM_BASE_URL)

    CHAT_MDL = CHAT_CFG.get("model", "") or ""
    EMBEDDING_MDL = EMBEDDING_CFG.get("model", "") or ""
    # Override embedding model when TEI is configured via Docker Compose profiles
    compose_profiles = os.getenv("COMPOSE_PROFILES", "")
    if "tei-" in compose_profiles:
        EMBEDDING_MDL = os.getenv("TEI_MODEL", EMBEDDING_MDL or "BAAI/bge-small-en-v1.5")
    RERANK_MDL = RERANK_CFG.get("model", "") or ""
    ASR_MDL = ASR_CFG.get("model", "") or ""
    IMAGE2TEXT_MDL = IMAGE2TEXT_CFG.get("model", "") or ""

    global HOST_IP, HOST_PORT
    HOST_IP = get_base_config(RAG_FLOW_SERVICE_NAME, {}).get("host", "127.0.0.1")
    HOST_PORT = get_base_config(RAG_FLOW_SERVICE_NAME, {}).get("http_port")




    # ---- Authentication ----
    authentication_conf = get_base_config("authentication", {})

    global CLIENT_AUTHENTICATION, HTTP_APP_KEY, GITHUB_OAUTH, FEISHU_OAUTH, OAUTH_CONFIG
    # client
    CLIENT_AUTHENTICATION = authentication_conf.get("client", {}).get("switch", False)
    HTTP_APP_KEY = authentication_conf.get("client", {}).get("http_app_key")
    GITHUB_OAUTH = get_base_config("oauth", {}).get("github")
    FEISHU_OAUTH = get_base_config("oauth", {}).get("feishu")
    OAUTH_CONFIG = get_base_config("oauth", {})

    # ---- Document engine ----
    global DOC_ENGINE, DOC_ENGINE_INFINITY, DOC_ENGINE_OCEANBASE, docStoreConn, VECTORDB, OB, OS, INFINITY
    DOC_ENGINE = os.environ.get("DOC_ENGINE", "opensearch").strip()
    DOC_ENGINE_INFINITY = (DOC_ENGINE.lower() == "infinity")
    DOC_ENGINE_OCEANBASE = (DOC_ENGINE.lower() == "oceanbase")
    lower_case_doc_engine = DOC_ENGINE.lower()
    if lower_case_doc_engine in ("elasticsearch", "opensearch"):
        VECTORDB = get_base_config("vectordb", {})
        docStoreConn = rag.utils.es_conn.ESConnection()
    elif lower_case_doc_engine == "infinity":
        INFINITY = get_base_config("infinity", {
            "uri": "infinity:23817",
            "postgres_port": 5432,
            "db_name": "default_db"
        })
        docStoreConn = rag.utils.infinity_conn.InfinityConnection()
    elif lower_case_doc_engine == "oceanbase":
        OB = get_base_config("oceanbase", {})
        docStoreConn = rag.utils.ob_conn.OBConnection()
    elif lower_case_doc_engine == "seekdb":
        OB = get_base_config("seekdb", {})
        docStoreConn = rag.utils.ob_conn.OBConnection()
    else:
        raise Exception(f"Not supported doc engine: {DOC_ENGINE}")

    # Message store uses the same engine type as the document store
    global msgStoreConn
    if lower_case_doc_engine in ("elasticsearch", "opensearch"):
        VECTORDB = get_base_config("vectordb", {})
        msgStoreConn = memory_es_conn.ESConnection()
    elif lower_case_doc_engine == "infinity":
        INFINITY = get_base_config("infinity", {
            "uri": "infinity:23817",
            "postgres_port": 5432,
            "db_name": "default_db"
        })
        msgStoreConn = memory_infinity_conn.InfinityConnection()
    elif lower_case_doc_engine in ["oceanbase", "seekdb"]:
        msgStoreConn = memory_ob_conn.OBConnection()

    # ---- Object storage ----
    global AZURE, S3, OSS, GCS
    if STORAGE_IMPL_TYPE in ['AZURE_SPN', 'AZURE_SAS']:
        AZURE = get_base_config("azure", {})
    elif STORAGE_IMPL_TYPE == 'AWS_S3':
        S3 = get_base_config("s3", {})
    elif STORAGE_IMPL_TYPE == 'MINIO':
        S3 = decrypt_database_config(name="s3")
    elif STORAGE_IMPL_TYPE == 'OSS':
        OSS = get_base_config("oss", {})
    elif STORAGE_IMPL_TYPE == 'GCS':
        GCS = get_base_config("gcs", {})

    global STORAGE_IMPL
    storage_impl = StorageFactory.create(Storage[STORAGE_IMPL_TYPE])

    # Optionally wrap storage with encryption layer
    crypto_enabled = os.environ.get("RAGFLOW_CRYPTO_ENABLED", "false").lower() == "true"

    if crypto_enabled:
        try:
            from rag.utils.encrypted_storage import create_encrypted_storage
            algorithm = os.environ.get("RAGFLOW_CRYPTO_ALGORITHM", "aes-256-cbc")
            crypto_key = os.environ.get("RAGFLOW_CRYPTO_KEY")

            STORAGE_IMPL = create_encrypted_storage(storage_impl,
                algorithm=algorithm,
                key=crypto_key,
                encryption_enabled=crypto_enabled)
        except Exception as e:
            logging.error(f"Failed to initialize encrypted storage: {e}")
            STORAGE_IMPL = storage_impl
    else:
        STORAGE_IMPL = storage_impl

    # ---- Search retrievers ----
    global retriever, kg_retriever
    retriever = search.Dealer(docStoreConn)
    from rag.graphrag import search as kg_search

    kg_retriever = kg_search.KGSearch(docStoreConn)

    # ---- Sandbox ----
    global SANDBOX_HOST
    if int(os.environ.get("SANDBOX_ENABLED", "0")):
        SANDBOX_HOST = os.environ.get("SANDBOX_HOST", "sandbox-executor-manager")

    # ---- SMTP / email ----
    global SMTP_CONF
    SMTP_CONF = get_base_config("smtp", {})

    global MAIL_SERVER, MAIL_PORT, MAIL_USE_SSL, MAIL_USE_TLS, MAIL_USERNAME, MAIL_PASSWORD, MAIL_DEFAULT_SENDER, MAIL_FRONTEND_URL
    MAIL_SERVER = SMTP_CONF.get("mail_server", "")
    MAIL_PORT = SMTP_CONF.get("mail_port", 000)
    MAIL_USE_SSL = SMTP_CONF.get("mail_use_ssl", True)
    MAIL_USE_TLS = SMTP_CONF.get("mail_use_tls", False)
    MAIL_USERNAME = SMTP_CONF.get("mail_username", "")
    MAIL_PASSWORD = SMTP_CONF.get("mail_password", "")
    mail_default_sender = SMTP_CONF.get("mail_default_sender", [])
    if mail_default_sender and len(mail_default_sender) >= 2:
        MAIL_DEFAULT_SENDER = (mail_default_sender[0], mail_default_sender[1])
    MAIL_FRONTEND_URL = SMTP_CONF.get("mail_frontend_url", "")

    # ---- Resource limits ----
    global DOC_MAXIMUM_SIZE, DOC_BULK_SIZE, EMBEDDING_BATCH_SIZE
    DOC_MAXIMUM_SIZE = int(os.environ.get("MAX_CONTENT_LENGTH", 128 * 1024 * 1024))
    DOC_BULK_SIZE = int(os.environ.get("DOC_BULK_SIZE", 4))
    EMBEDDING_BATCH_SIZE = int(os.environ.get("EMBEDDING_BATCH_SIZE", 16))

    os.environ["DOTNET_SYSTEM_GLOBALIZATION_INVARIANT"] = "1"


def check_and_install_torch():
    """Attempt to install PyTorch and detect available GPU devices.

    Sets ``PARALLEL_DEVICES`` to the number of CUDA-capable GPUs found.
    Logs a warning if torch cannot be imported.
    """
    global PARALLEL_DEVICES
    try:
        pip_install_torch()
        import torch.cuda
        PARALLEL_DEVICES = torch.cuda.device_count()
        logging.info(f"found {PARALLEL_DEVICES} gpus")
    except Exception:
        logging.info("can't import package 'torch'")

def _parse_model_entry(entry):
    """Normalise a model config entry (string or dict) into a standard dict.

    Args:
        entry: Model name string or config dict with optional ``factory``,
            ``api_key``, and ``base_url`` keys.

    Returns:
        Dict with ``name``, ``factory``, ``api_key``, and ``base_url`` keys.
    """
    if isinstance(entry, str):
        return {"name": entry, "factory": None, "api_key": None, "base_url": None}
    if isinstance(entry, dict):
        name = entry.get("name") or entry.get("model") or ""
        return {
            "name": name,
            "factory": entry.get("factory"),
            "api_key": entry.get("api_key"),
            "base_url": entry.get("base_url"),
        }
    return {"name": "", "factory": None, "api_key": None, "base_url": None}


def _resolve_per_model_config(entry_dict, backup_factory, backup_api_key, backup_base_url):
    """Resolve a complete model configuration, falling back to global defaults.

    If the model name does not already contain an ``@factory`` suffix and a
    factory is available, the suffix is appended automatically.

    Args:
        entry_dict: Parsed model entry from ``_parse_model_entry``.
        backup_factory: Fallback LLM factory name.
        backup_api_key: Fallback API key.
        backup_base_url: Fallback base URL.

    Returns:
        Dict with ``model``, ``factory``, ``api_key``, and ``base_url`` keys.
    """
    name = (entry_dict.get("name") or "").strip()
    m_factory = entry_dict.get("factory") or backup_factory or ""
    m_api_key = entry_dict.get("api_key") or backup_api_key or ""
    m_base_url = entry_dict.get("base_url") or backup_base_url or ""

    # Append factory suffix if not already present
    if name and "@" not in name and m_factory:
        name = f"{name}@{m_factory}"

    return {
        "model": name,
        "factory": m_factory,
        "api_key": m_api_key,
        "base_url": m_base_url,
    }

def print_rag_settings():
    """Log key RAG resource-limit settings for debugging."""
    logging.info(f"MAX_CONTENT_LENGTH: {DOC_MAXIMUM_SIZE}")
    logging.info(f"MAX_FILE_COUNT_PER_USER: {int(os.environ.get('MAX_FILE_NUM_PER_USER', 0))}")
