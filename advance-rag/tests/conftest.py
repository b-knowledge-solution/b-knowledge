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
    sys.modules[name] = mod
    # Ensure parent packages exist
    parts = name.split(".")
    for i in range(1, len(parts)):
        parent = ".".join(parts[:i])
        if parent not in sys.modules:
            sys.modules[parent] = types.ModuleType(parent)


# Third-party libraries that may not be installed in the test environment
_THIRD_PARTY_MOCKS = [
    # python-docx
    "docx", "docx.document", "docx.image", "docx.image.exceptions",
    "docx.opc", "docx.opc.pkgreader", "docx.opc.oxml",
    "docx.table", "docx.text", "docx.text.paragraph",
    # openpyxl
    "openpyxl", "openpyxl.workbook",
    # numpy / scipy / sklearn / umap
    "numpy", "numpy.random", "scipy", "sklearn", "sklearn.mixture", "umap",
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
    # common modules
    "common", "common.settings", "common.token_utils", "common.constants",
    "common.float_utils", "common.parser_config_utils", "common.text_utils",
    "common.misc_utils", "common.time_utils", "common.connection_utils",
    "common.exceptions", "common.api_helpers",
    "common.doc_store", "common.doc_store.doc_store_base",
    # db modules
    "db", "db.db_models", "db.db_utils",
    "db.services", "db.services.common_service",
    "db.services.llm_service", "db.services.task_service",
    "db.services.tenant_llm_service", "db.services.user_service",
    "db.services.file2document_service", "db.services.doc_metadata_service",
    "db.services.knowledgebase_service",
    "db.joint_services", "db.joint_services.tenant_model_service",
    # rag utility modules (NOT rag.nlp — let that import for real)
    "rag.utils", "rag.utils.file_utils",
    "rag.utils.lazy_image", "rag.utils.redis_conn", "rag.utils.storage_factory",
    "rag.graphrag", "rag.graphrag.utils",
    # rag.nlp heavy transitive deps mocked individually below
    "roman_numbers", "word2number", "word2number.w2n", "cn2an", "chardet",
    "nltk", "nltk.corpus", "nltk.corpus.wordnet",
    "infinity", "infinity.rag_tokenizer",
]

for _mod_name in _THIRD_PARTY_MOCKS:
    _ensure_mock_module(_mod_name)

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

# common.float_utils
sys.modules["common.float_utils"].normalize_overlapped_percent = lambda x: x
sys.modules["common.float_utils"].get_float = lambda x: float(x) if x else 0.0

# common.parser_config_utils
sys.modules["common.parser_config_utils"].normalize_layout_recognizer = MagicMock(return_value=("DeepDOC", None))

# common.connection_utils — timeout decorator as no-op
sys.modules["common.connection_utils"].timeout = lambda seconds: (lambda f: f)

# common.exceptions
class _MockTaskCanceledException(Exception):
    """Mock for TaskCanceledException used in tests."""
    pass
sys.modules["common.exceptions"].TaskCanceledException = _MockTaskCanceledException

# common.misc_utils
sys.modules["common.misc_utils"].get_uuid = lambda: "mock-uuid"
sys.modules["common.misc_utils"].thread_pool_exec = lambda fn, *args, **kwargs: fn(*args, **kwargs)

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

# db module-level constants
sys.modules["db"].PIPELINE_SPECIAL_PROGRESS_FREEZE_TASK_TYPES = set()
sys.modules["db"].FileType = MagicMock()
sys.modules["db"].UserTenantRole = MagicMock()
sys.modules["db"].CanvasCategory = MagicMock()
sys.modules["db"].TenantPermission = MagicMock()

# db.db_utils
sys.modules["db.db_utils"].bulk_insert_into_db = MagicMock()

# db.services
sys.modules["db.services"].duplicate_name = lambda fn, **kw: kw.get("name", "")

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

# db.services.knowledgebase_service (stub KnowledgebaseService for table parser)
sys.modules["db.services.knowledgebase_service"].KnowledgebaseService = MagicMock()

# rag.utils.redis_conn
sys.modules["rag.utils.redis_conn"].REDIS_CONN = MagicMock()

# rag.utils.lazy_image
sys.modules["rag.utils.lazy_image"].ensure_pil_image = lambda x: x
sys.modules["rag.utils.lazy_image"].is_image_like = lambda x: x is not None
sys.modules["rag.utils.lazy_image"].LazyDocxImage = MagicMock()

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
sys.modules["deepdoc.parser.utils"].get_text = MagicMock(return_value="")

# numpy — provide real-enough stubs for RAPTOR tests
_np = sys.modules["numpy"]
_np.ndarray = type("ndarray", (), {})
_np.random = MagicMock()
_np.arange = lambda *a, **kw: list(range(*a))
_np.argmin = lambda x: min(range(len(x)), key=lambda i: x[i]) if len(x) > 0 else 0
_np.vstack = lambda x: x
_np.where = lambda cond: (cond,)

# sklearn.mixture
sys.modules["sklearn.mixture"].GaussianMixture = MagicMock

# umap
sys.modules["umap"].UMAP = MagicMock

# peewee
_peewee = sys.modules["peewee"]
_peewee.fn = MagicMock()
_peewee.Case = MagicMock()
_peewee.JOIN = MagicMock()
_peewee.InterfaceError = type("InterfaceError", (Exception,), {})
_peewee.OperationalError = type("OperationalError", (Exception,), {})
_peewee.DoesNotExist = type("DoesNotExist", (Exception,), {})

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
