"""Shared pytest fixtures, path configuration, and dependency mocking.

Ensures the advance-rag root directory is on ``sys.path`` so that
``common.*`` and ``db.*`` imports resolve without installing the package.
Also pre-mocks heavy third-party dependencies (docx, openpyxl, numpy,
etc.) so that test modules can import source code without the full
advance-rag dependency tree.
"""
import os
import sys
import types
from unittest.mock import MagicMock

# Ensure advance-rag root is on the Python path before any test collection
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


# ---------------------------------------------------------------------------
# Pre-mock heavy third-party modules not installed in the test environment
# ---------------------------------------------------------------------------
def _ensure_mock_module(name: str):
    """Register a mock module in sys.modules if not already importable.

    Creates the module and all parent packages needed for dotted paths.
    Skips modules that are already importable.

    Args:
        name: Dotted module path to mock (e.g., 'docx.image.exceptions').
    """
    if name in sys.modules:
        return
    try:
        __import__(name)
        return  # Already importable, no mock needed
    except Exception:
        pass
    mod = types.ModuleType(name)
    # Set __path__ so the mock can act as a package (allowing submodule imports)
    mod.__path__ = []
    sys.modules[name] = mod
    # Ensure parent packages exist
    parts = name.split(".")
    for i in range(1, len(parts)):
        parent = ".".join(parts[:i])
        if parent not in sys.modules:
            parent_mod = types.ModuleType(parent)
            parent_mod.__path__ = []
            sys.modules[parent] = parent_mod


# Third-party libraries that may not be installed in the test environment
_THIRD_PARTY_MOCKS = [
    # python-docx
    "docx", "docx.document", "docx.image", "docx.image.exceptions",
    "docx.opc", "docx.opc.pkgreader", "docx.opc.oxml",
    "docx.table", "docx.text", "docx.text.paragraph",
    # openpyxl
    "openpyxl", "openpyxl.workbook",
    # numpy / scipy / sklearn / umap
    "numpy", "numpy.random", "scipy", "sklearn", "sklearn.mixture",
    "sklearn.metrics", "sklearn.metrics.pairwise", "umap",
    # pandas
    "pandas",
    # xpinyin
    "xpinyin",
    # PIL / Pillow
    "PIL", "PIL.Image",
    # markdown / markdownify / mammoth
    "markdown", "markdownify", "mammoth",
    # pypdf
    "pypdf",
    # dateutil
    "dateutil", "dateutil.parser",
    # bs4
    "bs4",
    # tika
    "tika", "tika.parser",
    # pptx
    "pptx",
    # peewee
    "peewee",
    # xxhash
    "xxhash",
    # tenacity
    "tenacity",
    # requests
    "requests",
    # deepdoc parsers
    "deepdoc", "deepdoc.parser", "deepdoc.parser.utils",
    "deepdoc.parser.figure_parser", "deepdoc.parser.pdf_parser",
    "deepdoc.parser.docling_parser", "deepdoc.parser.tcadp_parser",
    "deepdoc.parser.ppt_parser",
    "deepdoc.parser.mineru_parser",
    # common modules
    "common", "common.settings", "common.token_utils", "common.constants",
    "common.float_utils", "common.parser_config_utils", "common.text_utils",
    "common.misc_utils", "common.time_utils", "common.connection_utils",
    "common.exceptions", "common.api_helpers",
    "common.doc_store", "common.doc_store.doc_store_base",
    "common.query_base", "common.string_utils",
    # db modules (db and db.services are real packages with safe __init__.py)
    "db.db_models", "db.db_utils",
    "db.services.common_service",
    "db.services.llm_service", "db.services.task_service",
    "db.services.tenant_llm_service", "db.services.user_service",
    "db.services.file2document_service", "db.services.doc_metadata_service",
    "db.joint_services", "db.joint_services.tenant_model_service",
    # tree-sitter (code parser)
    "tree_sitter_language_pack",
    # prance (openapi parser) — mock set up after loop
    "prance",
    # agent framework (flow pipeline)
    "agent", "agent.canvas", "agent.component", "agent.component.base",
    "agent.component.llm",
    # pydantic (flow schemas)
    "pydantic",
    # litellm
    "litellm",
    # openai / strenum / json_repair / ollama / cohere
    "openai", "openai.lib", "openai.lib.azure",
    "strenum", "json_repair",
    "ollama",
    "cohere",
    # opensearchpy
    "opensearchpy", "opensearchpy.client",
    # minio
    "minio", "minio.commonconfig", "minio.error",
    # valkey / redis
    "valkey", "valkey.lock",
    # networkx
    "networkx", "networkx.readwrite", "networkx.readwrite.json_graph",
    # editdistance
    "editdistance",
    # werkzeug (transitive dep of db.services.user_service)
    "werkzeug", "werkzeug.security",
    # cv2 / onnxruntime / huggingface_hub
    "cv2", "onnxruntime",
    "huggingface_hub", "huggingface_hub.utils",
    # common extra modules for new tests
    "common.decorator", "common.file_utils", "common.log_utils",
    "common.misc_utils",
    # rag utility modules (NOT rag.nlp — let that import for real)
    "rag.utils", "rag.utils.file_utils", "rag.utils.base64_image",
    "rag.utils.lazy_image", "rag.utils.redis_conn", "rag.utils.storage_factory",
    "rag.graphrag", "rag.graphrag.utils",
    # rag.nlp heavy transitive deps mocked individually below
    "roman_numbers", "word2number", "word2number.w2n", "cn2an", "chardet",
    "nltk", "nltk.corpus", "nltk.corpus.wordnet",
    "infinity", "infinity.rag_tokenizer",
]

for _mod_name in _THIRD_PARTY_MOCKS:
    _ensure_mock_module(_mod_name)

# Restore __path__ for real packages so Python can find sub-modules on disk
sys.modules["rag.utils"].__path__ = [os.path.join(_ADVANCE_RAG_ROOT, "rag", "utils")]
sys.modules["rag.graphrag"].__path__ = [os.path.join(_ADVANCE_RAG_ROOT, "rag", "graphrag")]
sys.modules["deepdoc"].__path__ = [os.path.join(_ADVANCE_RAG_ROOT, "deepdoc")]
sys.modules["deepdoc.parser"].__path__ = [os.path.join(_ADVANCE_RAG_ROOT, "deepdoc", "parser")]

# strenum — provide a real StrEnum class before any imports that need it (e.g. db/__init__.py)
class _StrEnum(str):
    """Minimal StrEnum stub for mocked environments."""
    pass
sys.modules["strenum"].StrEnum = _StrEnum

# werkzeug.security — provide password hash stubs
sys.modules["werkzeug.security"].generate_password_hash = lambda pw, **kw: "hashed"
sys.modules["werkzeug.security"].check_password_hash = lambda h, pw: True

# common.doc_store.doc_store_base — mock dataclass/class stubs
_doc_store_base = sys.modules["common.doc_store.doc_store_base"]
_doc_store_base.MatchTextExpr = MagicMock
_doc_store_base.MatchDenseExpr = MagicMock
_doc_store_base.FusionExpr = MagicMock
_doc_store_base.OrderByExpr = MagicMock
_doc_store_base.DocStoreConnection = MagicMock
_doc_store_base.MatchExpr = MagicMock

# common.query_base — load real module (only uses stdlib re + abc)
del sys.modules["common.query_base"]
import common.query_base

# common.string_utils — load real module (only uses stdlib re)
del sys.modules["common.string_utils"]
import common.string_utils

# pydantic — stub BaseModel and Field
class _MockBaseModel:
    """Minimal pydantic BaseModel stub."""
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)
    @classmethod
    def model_validate(cls, data, **kw):
        if isinstance(data, dict):
            return cls(**data)
        return data

sys.modules["pydantic"].BaseModel = _MockBaseModel
sys.modules["pydantic"].Field = lambda *a, **kw: kw.get("default", None)
sys.modules["pydantic"].model_validator = lambda *a, **kw: (lambda f: f)
sys.modules["pydantic"].ConfigDict = lambda **kw: {}
sys.modules["pydantic"].field_validator = lambda *a, **kw: (lambda f: f)
sys.modules["pydantic"].conint = lambda **kw: int
sys.modules["pydantic"].constr = lambda **kw: str
sys.modules["pydantic"].confloat = lambda **kw: float

# agent.component.base — stub ComponentBase and ComponentParamBase
class _MockComponentParamBase:
    """Minimal ComponentParamBase stub."""
    def check(self):
        pass
    def get_input_form(self):
        return {}
    def check_empty(self, value, label):
        if not value:
            raise ValueError(f"{label} is required.")
    def check_positive_integer(self, value, label):
        if not isinstance(value, int) or value <= 0:
            raise ValueError(f"{label} must be a positive integer.")
    def check_nonnegative_number(self, value, label):
        if not isinstance(value, (int, float)) or value < 0:
            raise ValueError(f"{label} must be a non-negative number.")
    def check_decimal_float(self, value, label):
        if not isinstance(value, (int, float)) or value < 0 or value >= 1:
            raise ValueError(f"{label} must be in [0, 1).")
    def check_nonnegative_integer(self, value, label):
        if not isinstance(value, int) or value < 0:
            raise ValueError(f"{label} must be a non-negative integer.")

class _MockComponentBase:
    """Minimal ComponentBase stub."""
    _param = None
    _canvas = None
    _id = ""
    _output = {}
    def set_output(self, key, value):
        self._output[key] = value
    def callback(self, *args, **kwargs):
        pass

sys.modules["agent.component.base"].ComponentBase = _MockComponentBase
sys.modules["agent.component.base"].ComponentParamBase = _MockComponentParamBase
sys.modules["agent.component"].base = sys.modules["agent.component.base"]

# agent.canvas — stub Graph
class _MockGraph:
    """Minimal Graph stub for pipeline."""
    def __init__(self, *args, **kwargs):
        self.path = []
        self.components = {}
        self.task_id = kwargs.get("task_id", args[2] if len(args) > 2 else None)
    def get_component_name(self, component_id):
        return component_id
    def get_component_obj(self, component_name):
        return self.components.get(component_name)
    def __str__(self):
        return "{}"
sys.modules["agent.canvas"].Graph = _MockGraph

# litellm — stub logging
sys.modules["litellm"].logging = MagicMock()

# deepdoc.parser.pdf_parser — needs RAGFlowPdfParser as a real class
class _MockRAGFlowPdfParser:
    """Minimal RAGFlowPdfParser stub."""
    @staticmethod
    def remove_tag(text):
        return text
    @staticmethod
    def extract_positions(text):
        return []
sys.modules["deepdoc.parser.pdf_parser"].RAGFlowPdfParser = _MockRAGFlowPdfParser
sys.modules["deepdoc.parser.pdf_parser"].VisionParser = MagicMock
sys.modules["deepdoc.parser.pdf_parser"].PlainParser = MagicMock

# db.joint_services.tenant_model_service — additional attributes
sys.modules["db.joint_services.tenant_model_service"].get_model_config_by_id = MagicMock()

# cn2an module needs a cn2an callable attribute (from cn2an import cn2an)
sys.modules["cn2an"].cn2an = MagicMock(return_value=0)

# chardet needs a working detect() for rag.nlp.find_codec
sys.modules["chardet"].detect = lambda x: {"encoding": "utf-8", "confidence": 0.99}

# word2number.w2n needs word_to_num
sys.modules["word2number.w2n"].word_to_num = MagicMock(side_effect=ValueError)

# roman_numbers needs number()
sys.modules["roman_numbers"].number = MagicMock(side_effect=ValueError)

# infinity.rag_tokenizer needs a RagTokenizer class and must be an attr of infinity
class _MockRagTokenizer:
    """Stub RagTokenizer for tests."""
    def tokenize(self, text):
        return text.lower() if isinstance(text, str) else str(text).lower()
    def fine_grained_tokenize(self, text):
        return text.lower() if isinstance(text, str) else str(text).lower()
    def tag(self, text):
        return "n"
    def freq(self, text):
        return 100
    def _tradi2simp(self, text):
        return text
    def _strQ2B(self, text):
        return text
sys.modules["infinity.rag_tokenizer"].RagTokenizer = _MockRagTokenizer
# Link child module as attribute of parent
sys.modules["infinity"].rag_tokenizer = sys.modules["infinity.rag_tokenizer"]


# ---------------------------------------------------------------------------
# Wire up specific mock behaviors needed by source modules at import time
# ---------------------------------------------------------------------------

# rag.nlp is imported for real — its dependencies (roman_numbers, word2number,
# cn2an, chardet, PIL) are mocked above.

# common.token_utils
sys.modules["common.token_utils"].num_tokens_from_string = lambda s: len(s.split())
sys.modules["common.token_utils"].truncate = lambda text, max_len: text[:max_len]
sys.modules["common.token_utils"].total_token_count_from_response = lambda resp: 0
sys.modules["common.token_utils"].encoder = MagicMock()

# common.constants — enum-like values
_constants = sys.modules["common.constants"]
_constants.LLMType = MagicMock()
_constants.ParserType = MagicMock()
_constants.StatusEnum = MagicMock()
_constants.TaskStatus = MagicMock()
_constants.TaskStatus.RUNNING = MagicMock(value="1")
_constants.TaskStatus.CANCEL = MagicMock(value="2")
_constants.TaskStatus.DONE = MagicMock(value="3")
_constants.TaskStatus.FAIL = MagicMock(value="4")
_constants.TaskStatus.UNSTART = MagicMock(value="0")
_constants.SVR_CONSUMER_GROUP_NAME = "svr_consumer"
_constants.PAGERANK_FLD = "pagerank_fea"
_constants.TAG_FLD = "tag_feas"

# common.float_utils
sys.modules["common.float_utils"].normalize_overlapped_percent = lambda x: x
sys.modules["common.float_utils"].get_float = lambda x: float(x) if x else 0.0

# common.parser_config_utils
sys.modules["common.parser_config_utils"].normalize_layout_recognizer = MagicMock(return_value=("DeepDOC", None))

# common.connection_utils — timeout decorator as no-op
sys.modules["common.connection_utils"].timeout = lambda *args, **kwargs: (lambda f: f)

# common.exceptions
class _MockTaskCanceledException(Exception):
    """Mock for TaskCanceledException used in tests."""
    pass
sys.modules["common.exceptions"].TaskCanceledException = _MockTaskCanceledException

# common.misc_utils
import asyncio as _asyncio
sys.modules["common.misc_utils"].get_uuid = lambda: "mock-uuid"

async def _mock_thread_pool_exec(fn, *args, **kwargs):
    """Mock thread_pool_exec that returns an awaitable result."""
    return fn(*args, **kwargs)
sys.modules["common.misc_utils"].thread_pool_exec = _mock_thread_pool_exec

# common.time_utils
sys.modules["common.time_utils"].current_timestamp = lambda: 1000000
sys.modules["common.time_utils"].get_format_time = lambda: "2024-01-01 00:00:00"
sys.modules["common.time_utils"].datetime_format = lambda dt: "2024-01-01 00:00:00"

# common.api_helpers
sys.modules["common.api_helpers"].get_parser_config = MagicMock(return_value={"chunk_token_num": 512})
sys.modules["common.api_helpers"].get_data_error_result = lambda message="": MagicMock(message=message)

# common.settings
_settings = sys.modules["common.settings"]
_settings.DOC_ENGINE_INFINITY = False
_settings.DOC_ENGINE_OCEANBASE = False
_settings.STORAGE_IMPL = MagicMock()
_settings.docStoreConn = MagicMock()
_settings.get_svr_queue_name = lambda priority: f"queue_{priority}"
# S3 config used by minio_conn
_settings.S3 = {"host": "localhost:9000", "user": "minioadmin", "password": "minioadmin",
                 "bucket": None, "prefix_path": None, "verify": True}
# OpenSearch config used by opensearch_conn
_settings.OS = {"hosts": "localhost:9201", "username": "admin", "password": "admin"}
# decrypt_database_config / get_base_config used by redis_conn at module level
_settings.decrypt_database_config = lambda name="redis": {"host": "localhost", "port": 6379, "db": 1}
_settings.get_base_config = lambda name, default=None: default or {}
# Wire settings as attribute on parent common module so @patch("common.settings") works
import common as _common_module
_common_module.settings = _settings

# common.text_utils
sys.modules["common.text_utils"].normalize_arabic_presentation_forms = lambda text: text

# db.db_models — mock DB connection context as no-op
_mock_DB = MagicMock()
_mock_DB.connection_context.return_value = lambda f: f
_ctx_mgr = MagicMock()
_ctx_mgr.__enter__ = MagicMock(return_value=None)
_ctx_mgr.__exit__ = MagicMock(return_value=False)
_mock_DB.atomic.return_value = _ctx_mgr
sys.modules["db.db_models"].DB = _mock_DB
sys.modules["db.db_models"].Document = MagicMock()
sys.modules["db.db_models"].Knowledgebase = MagicMock()
sys.modules["db.db_models"].Task = MagicMock()
sys.modules["db.db_models"].Tenant = MagicMock()
sys.modules["db.db_models"].UserTenant = MagicMock()
sys.modules["db.db_models"].File2Document = MagicMock()
sys.modules["db.db_models"].File = MagicMock()
sys.modules["db.db_models"].UserCanvas = MagicMock()
sys.modules["db.db_models"].User = MagicMock()

# db module-level constants (real db module provides them; ensure they exist)
import db as _db_module
if not hasattr(_db_module, 'PIPELINE_SPECIAL_PROGRESS_FREEZE_TASK_TYPES'):
    _db_module.PIPELINE_SPECIAL_PROGRESS_FREEZE_TASK_TYPES = set()
if not hasattr(_db_module, 'FileType'):
    _db_module.FileType = MagicMock()
if not hasattr(_db_module, 'UserTenantRole'):
    _db_module.UserTenantRole = MagicMock()
if not hasattr(_db_module, 'CanvasCategory'):
    _db_module.CanvasCategory = MagicMock()
if not hasattr(_db_module, 'TenantPermission'):
    _db_module.TenantPermission = MagicMock()

# db.db_utils
sys.modules["db.db_utils"].bulk_insert_into_db = MagicMock()

# db.services — restore real __path__ so sub-modules can be found on disk
import db.services as _db_services_module
_db_services_module.__path__ = [os.path.join(_ADVANCE_RAG_ROOT, "db", "services")]
_db_services_module.duplicate_name = lambda fn, **kw: kw.get("name", "")

# db.services.common_service — base class stub
class _MockCommonService:
    """Minimal CommonService base for service tests."""
    model = None

    @classmethod
    def query(cls, **kw):
        return []

    @classmethod
    def get_by_id(cls, pid):
        return (False, None)

    @classmethod
    def update_by_id(cls, pid, data):
        return 1

    @classmethod
    def get_by_ids(cls, pids, cols=None):
        return []

    @classmethod
    def save(cls, **kw):
        return True

    @classmethod
    def delete_by_id(cls, pid):
        return 1

    @classmethod
    def filter_delete(cls, filters):
        return 1

sys.modules["db.services.common_service"].CommonService = _MockCommonService

# db.services.llm_service
sys.modules["db.services.llm_service"].LLMBundle = MagicMock

# db.joint_services.tenant_model_service
sys.modules["db.joint_services.tenant_model_service"].get_model_config_by_type_and_name = MagicMock()
sys.modules["db.joint_services.tenant_model_service"].get_tenant_default_model_by_type = MagicMock()

# db.services.task_service
# db.services.llm_service
sys.modules["db.services.llm_service"].LLMBundle = MagicMock

sys.modules["db.services.task_service"].has_canceled = MagicMock(return_value=False)
sys.modules["db.services.task_service"].TaskService = MagicMock()
sys.modules["db.services.task_service"].CANVAS_DEBUG_DOC_ID = "canvas_debug_doc_id"

# db.services.user_service needs TenantService attribute
sys.modules["db.services.user_service"].TenantService = MagicMock()

# db.services.doc_metadata_service
sys.modules["db.services.doc_metadata_service"].DocMetadataService = MagicMock()

# db.services.file2document_service
sys.modules["db.services.file2document_service"].File2DocumentService = MagicMock()

# db.services.user_service
sys.modules["db.services.user_service"].UserService = MagicMock()

# db.services.tenant_llm_service
sys.modules["db.services.tenant_llm_service"].TenantLLMService = MagicMock()

# rag.utils.redis_conn
sys.modules["rag.utils.redis_conn"].REDIS_CONN = MagicMock()

# rag.utils.lazy_image
sys.modules["rag.utils.lazy_image"].ensure_pil_image = lambda x: x
sys.modules["rag.utils.lazy_image"].is_image_like = lambda x: x is not None
sys.modules["rag.utils.lazy_image"].LazyDocxImage = MagicMock()
sys.modules["rag.utils.lazy_image"].open_image_for_processing = MagicMock()

# rag.utils.base64_image
sys.modules["rag.utils.base64_image"].id2image = MagicMock(return_value=None)
async def _mock_image2id(*args, **kwargs):
    return None
sys.modules["rag.utils.base64_image"].image2id = _mock_image2id

# rag.utils.file_utils
sys.modules["rag.utils.file_utils"].extract_embed_file = MagicMock(return_value=[])
sys.modules["rag.utils.file_utils"].extract_links_from_pdf = MagicMock(return_value=set())
sys.modules["rag.utils.file_utils"].extract_links_from_docx = MagicMock(return_value=set())
sys.modules["rag.utils.file_utils"].extract_html = MagicMock(return_value=(None, None))

# rag.graphrag.utils
_graphrag_utils = sys.modules["rag.graphrag.utils"]
_graphrag_utils.get_embed_cache = MagicMock(return_value=None)
_graphrap_utils_get_llm = MagicMock(return_value=None)
_graphrag_utils.get_llm_cache = _graphrap_utils_get_llm
_graphrag_utils.set_embed_cache = MagicMock()
_graphrag_utils.set_llm_cache = MagicMock()
_graphrag_utils.chat_limiter = MagicMock()

# deepdoc.parser — provide stub classes
_dp = sys.modules["deepdoc.parser"]
for _cls_name in ["DocxParser", "ExcelParser", "HtmlParser", "JsonParser",
                   "MarkdownElementExtractor", "MarkdownParser", "PdfParser",
                   "TxtParser", "PlainParser"]:
    if not hasattr(_dp, _cls_name):
        setattr(_dp, _cls_name, MagicMock)

sys.modules["deepdoc.parser.figure_parser"].VisionFigureParser = MagicMock()
sys.modules["deepdoc.parser.figure_parser"].vision_figure_parser_docx_wrapper_naive = MagicMock()
sys.modules["deepdoc.parser.figure_parser"].vision_figure_parser_pdf_wrapper = MagicMock(return_value=[])
sys.modules["deepdoc.parser.figure_parser"].vision_figure_parser_figure_xlsx_wrapper = MagicMock(return_value=[])

sys.modules["deepdoc.parser.pdf_parser"].PlainParser = MagicMock
sys.modules["deepdoc.parser.pdf_parser"].VisionParser = MagicMock
sys.modules["deepdoc.parser.docling_parser"].DoclingParser = MagicMock
sys.modules["deepdoc.parser.tcadp_parser"].TCADPParser = MagicMock
sys.modules["deepdoc.parser.ppt_parser"].RAGFlowPptParser = MagicMock
sys.modules["deepdoc.parser.mineru_parser"].MinerUParser = MagicMock
_ensure_mock_module("deepdoc.parser.paddleocr_parser")
sys.modules["deepdoc.parser.paddleocr_parser"].PaddleOCRParser = MagicMock
sys.modules["deepdoc.parser.utils"].get_text = MagicMock(return_value="")

# numpy — provide real-enough stubs for RAPTOR tests
_np = sys.modules["numpy"]
class _NpArray(list):
    """Minimal numpy array stub supporting element-wise arithmetic."""
    def __add__(self, other):
        if isinstance(other, (list, _NpArray)):
            return _NpArray([a + b for a, b in zip(self, other)])
        return _NpArray([a + other for a in self])
    def __radd__(self, other):
        return self.__add__(other)
    def __mul__(self, other):
        if isinstance(other, (list, _NpArray)):
            return _NpArray([a * b for a, b in zip(self, other)])
        return _NpArray([a * other for a in self])
    def __rmul__(self, other):
        return self.__mul__(other)
    def __sub__(self, other):
        if isinstance(other, (list, _NpArray)):
            return _NpArray([a - b for a, b in zip(self, other)])
        return _NpArray([a - other for a in self])
    def __truediv__(self, other):
        if isinstance(other, (list, _NpArray)):
            return _NpArray([a / b for a, b in zip(self, other)])
        return _NpArray([a / other for a in self])
    def __rtruediv__(self, other):
        return _NpArray([other / a for a in self])
    def min(self):
        return min(self) if self else 0.0
    def max(self):
        return max(self) if self else 0.0
    @property
    def shape(self):
        return (len(self),)

_np.ndarray = type("ndarray", (), {})
_np.random = MagicMock()
_np.arange = lambda *a, **kw: list(range(*a))
_np.argmin = lambda x: min(range(len(x)), key=lambda i: x[i]) if len(x) > 0 else 0
_np.vstack = lambda x: x
_np.where = lambda cond: (cond,)
_np.array = lambda x, **kw: _NpArray(x) if isinstance(x, (list, tuple)) else _NpArray([x])
_np.zeros = lambda n, **kw: _NpArray([0.0] * (n if isinstance(n, int) else n[0]))
_np.dot = lambda a, b: sum(x * y for x, y in zip(a, b)) if isinstance(a, (list, _NpArray)) else 0.0
_np.linalg = MagicMock()
_np.linalg.norm = lambda x, **kw: sum(v**2 for v in x)**0.5 if isinstance(x, (list, _NpArray)) else 1.0
_np.float64 = float
_np.sqrt = lambda x: x**0.5 if isinstance(x, (int, float)) else _NpArray([v**0.5 for v in x])
_np.sum = lambda x, **kw: sum(x) if isinstance(x, (list, _NpArray)) else x

# sklearn.mixture
sys.modules["sklearn.mixture"].GaussianMixture = MagicMock

# sklearn.metrics.pairwise — cosine_similarity stub
def _cosine_similarity(a, b):
    """Stub cosine similarity for test environment."""
    import math
    results = []
    for row_a in a:
        row_results = []
        for row_b in b:
            dot = sum(x * y for x, y in zip(row_a, row_b))
            norm_a = math.sqrt(sum(x**2 for x in row_a)) or 1e-9
            norm_b = math.sqrt(sum(x**2 for x in row_b)) or 1e-9
            row_results.append(dot / (norm_a * norm_b))
        results.append(row_results)
    return results
sys.modules["sklearn.metrics.pairwise"].cosine_similarity = _cosine_similarity

# umap
sys.modules["umap"].UMAP = MagicMock

# networkx — minimal Graph stub for graphrag tests
class _NxNodeView(dict):
    """Callable dict that supports nodes(data=True) iteration."""
    def __call__(self, data=False):
        if data:
            return list(self.items())
        return list(self.keys())

class _NxEdgeView:
    """Edge view supporting iteration and edges(data=True) calls."""
    def __init__(self, edges_dict):
        self._edges = edges_dict
    def __iter__(self):
        return iter(self._edges.keys())
    def __call__(self, data=False):
        if data:
            return [(s, t, d) for (s, t), d in self._edges.items()]
        return list(self._edges.keys())
    def __len__(self):
        return len(self._edges)

class _NxGraph:
    """Minimal networkx Graph stub supporting graphrag operations."""
    def __init__(self, **kwargs):
        self._nodes = _NxNodeView()
        self._edges = {}
        self.graph = {}
    def add_node(self, name, **attrs):
        self._nodes[name] = attrs
    def has_node(self, name):
        return name in self._nodes
    def remove_node(self, name):
        self._nodes.pop(name, None)
        to_remove = [e for e in self._edges if name in e]
        for e in to_remove:
            del self._edges[e]
    def remove_edge(self, src, tgt):
        self._edges.pop((src, tgt), None)
        self._edges.pop((tgt, src), None)
    @property
    def nodes(self):
        return self._nodes
    def add_edge(self, src, tgt, **attrs):
        if src not in self._nodes:
            self._nodes[src] = {}
        if tgt not in self._nodes:
            self._nodes[tgt] = {}
        self._edges[(src, tgt)] = attrs
    def has_edge(self, src, tgt):
        return (src, tgt) in self._edges or (tgt, src) in self._edges
    def get_edge_data(self, src, tgt, default=None):
        return self._edges.get((src, tgt), self._edges.get((tgt, src), default))
    @property
    def edges(self):
        return _NxEdgeView(self._edges)
    @property
    def degree(self):
        # Return list of (node, degree) pairs
        deg = {n: 0 for n in self._nodes}
        for (s, t) in self._edges:
            deg[s] = deg.get(s, 0) + 1
            deg[t] = deg.get(t, 0) + 1
        return list(deg.items())
    def number_of_nodes(self):
        return len(self._nodes)
    def number_of_edges(self):
        return len(self._edges)

_nx_mod = sys.modules["networkx"]
_nx_mod.Graph = _NxGraph
_nx_mod.DiGraph = _NxGraph
# json_graph stubs
sys.modules["networkx.readwrite.json_graph"].node_link_data = lambda g: {"nodes": [], "links": []}
sys.modules["networkx.readwrite.json_graph"].node_link_graph = lambda data: _NxGraph()

# peewee
_peewee = sys.modules["peewee"]
_peewee.fn = MagicMock()
_peewee.Case = MagicMock()
_peewee.JOIN = MagicMock()
_peewee.InterfaceError = type("InterfaceError", (Exception,), {})
_peewee.OperationalError = type("OperationalError", (Exception,), {})
_peewee.DoesNotExist = type("DoesNotExist", (Exception,), {})

# db.services.knowledgebase_service — import real module now that peewee is mocked
import db.services.knowledgebase_service as _kb_svc

# xxhash
sys.modules["xxhash"].xxh64 = MagicMock

# tenacity
sys.modules["tenacity"].retry = lambda **kw: (lambda f: f)
sys.modules["tenacity"].stop_after_attempt = lambda n: None
sys.modules["tenacity"].wait_exponential = lambda **kw: None
sys.modules["tenacity"].retry_if_exception_type = lambda types: None

# dateutil.parser
sys.modules["dateutil.parser"].parse = MagicMock()

# docx stubs
sys.modules["docx"].Document = MagicMock
sys.modules["docx.image.exceptions"].InvalidImageStreamError = type("InvalidImageStreamError", (Exception,), {})
sys.modules["docx.image.exceptions"].UnexpectedEndOfFileError = type("UnexpectedEndOfFileError", (Exception,), {})
sys.modules["docx.image.exceptions"].UnrecognizedImageError = type("UnrecognizedImageError", (Exception,), {})
sys.modules["docx.opc.pkgreader"]._SerializedRelationships = MagicMock
sys.modules["docx.opc.pkgreader"]._SerializedRelationship = MagicMock
sys.modules["docx.opc.oxml"].parse_xml = MagicMock()
sys.modules["docx.table"].Table = MagicMock
sys.modules["docx.text.paragraph"].Paragraph = MagicMock

# openpyxl
sys.modules["openpyxl"].load_workbook = MagicMock()

# PIL
sys.modules["PIL.Image"].open = MagicMock()
sys.modules["PIL"].Image = sys.modules["PIL.Image"]

# markdown
sys.modules["markdown"].markdown = lambda text, **kw: text

# pypdf
sys.modules["pypdf"].PdfReader = MagicMock

# pandas — minimal stubs
_pd = sys.modules["pandas"]
_pd.DataFrame = MagicMock
_pd.isna = lambda x: False
_pd.Series = MagicMock

# xpinyin
sys.modules["xpinyin"].Pinyin = MagicMock

# csv is a stdlib module — no mock needed
# email is a stdlib module — no mock needed

# ---------------------------------------------------------------------------
# Additional mocks for LLM, GraphRAG, Vision, and connector tests
# ---------------------------------------------------------------------------

# json_repair — provide loads function
sys.modules["json_repair"].loads = MagicMock(return_value={})
sys.modules["json_repair"].JSONDecodeError = type("JSONDecodeError", (ValueError,), {})

# openai — AsyncOpenAI and OpenAI stubs
sys.modules["openai"].OpenAI = MagicMock
sys.modules["openai"].AsyncOpenAI = MagicMock
sys.modules["openai.lib.azure"].AzureOpenAI = MagicMock
sys.modules["openai.lib.azure"].AsyncAzureOpenAI = MagicMock

# ollama — Client stub
sys.modules["ollama"].Client = MagicMock

# cohere — Client stub
sys.modules["cohere"].Client = MagicMock

# requests — mock post/get
sys.modules["requests"].post = MagicMock()
sys.modules["requests"].get = MagicMock()

# common.decorator — no-op singleton so @singleton-decorated classes remain real classes
sys.modules["common.decorator"].singleton = lambda cls, *a, **kw: cls

# common.log_utils
_ensure_mock_module("common.log_utils")
sys.modules["common.log_utils"].log_exception = MagicMock()

# common.file_utils — get_project_base_directory
sys.modules["common.file_utils"].get_project_base_directory = lambda: "/mock/project"

# rag.graphrag.general — mock extractor base
_ensure_mock_module("rag.graphrag.general")
_ensure_mock_module("rag.graphrag.general.extractor")

class _MockExtractor:
    """Minimal Extractor base class stub."""
    def __init__(self, llm_invoker):
        self._llm = llm_invoker
    def _chat(self, text, history, gen_conf, task_id=""):
        return ""

sys.modules["rag.graphrag.general.extractor"].Extractor = _MockExtractor

# rag.graphrag.entity_resolution_prompt
_ensure_mock_module("rag.graphrag.entity_resolution_prompt")
sys.modules["rag.graphrag.entity_resolution_prompt"].ENTITY_RESOLUTION_PROMPT = "Resolve entities: {input_text}"

# rag.graphrag.query_analyze_prompt
_ensure_mock_module("rag.graphrag.query_analyze_prompt")
sys.modules["rag.graphrag.query_analyze_prompt"].PROMPTS = {
    "minirag_query2kwd": "Analyze: {query} with {TYPE_POOL}",
}

# deepdoc.vision — mock package and submodules
_ensure_mock_module("deepdoc.vision")
_ensure_mock_module("deepdoc.vision.recognizer")
_ensure_mock_module("deepdoc.vision.operators")
_ensure_mock_module("deepdoc.vision.postprocess")
# Restore __path__ so real submodules (ocr, layout_recognizer, etc.) can be found
sys.modules["deepdoc.vision"].__path__ = [os.path.join(_ADVANCE_RAG_ROOT, "deepdoc", "vision")]

class _MockRecognizer:
    """Minimal Recognizer base stub."""
    def __init__(self, label_list=None, task_name=None, model_dir=None):
        self.labels = label_list or []
    def __call__(self, images, thr=0.2, batch_size=16):
        return [[] for _ in images]

sys.modules["deepdoc.vision"].Recognizer = _MockRecognizer
sys.modules["deepdoc.vision.recognizer"].Recognizer = _MockRecognizer
sys.modules["deepdoc.vision.operators"].nms = MagicMock(return_value=[])
sys.modules["deepdoc.vision.operators"].preprocess = MagicMock()
sys.modules["deepdoc.vision.postprocess"].build_post_process = MagicMock()

# common.misc_utils — pip_install_torch stub
sys.modules["common.misc_utils"].pip_install_torch = MagicMock()

# opensearchpy — additional stubs for connector tests
_os_mod = sys.modules["opensearchpy"]
_os_mod.OpenSearch = MagicMock
_os_mod.NotFoundError = type("NotFoundError", (Exception,), {})
_os_mod.ConnectionTimeout = type("ConnectionTimeout", (Exception,), {})
_os_mod.UpdateByQuery = MagicMock
_os_mod.Q = MagicMock
_os_mod.Search = MagicMock
_os_mod.Index = MagicMock
_os_mod_client = sys.modules.get("opensearchpy.client", sys.modules["opensearchpy"])
_os_mod_client.IndicesClient = MagicMock

# minio — additional stubs for connector tests
_minio_mod = sys.modules["minio"]
_minio_mod.Minio = MagicMock
sys.modules["minio.commonconfig"].CopySource = MagicMock
_minio_err = sys.modules["minio.error"]
_minio_err.S3Error = type("S3Error", (Exception,), {"code": ""})
_minio_err.ServerError = type("ServerError", (Exception,), {})
_minio_err.InvalidResponseError = type("InvalidResponseError", (Exception,), {})

# valkey — additional stubs for connector tests
_valkey_mod = sys.modules["valkey"]
_valkey_mod.StrictRedis = MagicMock
sys.modules["valkey.lock"].Lock = MagicMock

# numpy additional — isclose, min, max, zeros_like
_np.isclose = lambda a, b, **kw: abs(a - b) < kw.get("atol", 1e-8)
_np.min = lambda x, **kw: min(x) if isinstance(x, (list, _NpArray)) else x
_np.max = lambda x, **kw: max(x) if isinstance(x, (list, _NpArray)) else x
_np.zeros_like = lambda x, **kw: _NpArray([0.0] * len(x)) if isinstance(x, (list, _NpArray)) else 0.0

# huggingface_hub — snapshot_download stub
sys.modules["huggingface_hub"].snapshot_download = MagicMock(return_value="/mock/model/path")

# onnxruntime — additional stubs for OCR model loading
_ort = sys.modules["onnxruntime"]
_ort.SessionOptions = MagicMock
_ort.ExecutionMode = MagicMock()
_ort.RunOptions = MagicMock
_ort.InferenceSession = MagicMock
_ort.get_available_providers = MagicMock(return_value=["CPUExecutionProvider"])

# cv2 — additional stubs for vision modules
_cv2 = sys.modules["cv2"]
_cv2.imread = MagicMock()
_cv2.resize = MagicMock()
_cv2.copyMakeBorder = MagicMock()
_cv2.BORDER_CONSTANT = 0

# valkey — provide exceptions submodule
_ensure_mock_module("valkey.exceptions")
_valkey_mod.exceptions = sys.modules["valkey.exceptions"]
_valkey_exc = sys.modules["valkey.exceptions"]
_valkey_exc.ResponseError = type("ResponseError", (Exception,), {})
