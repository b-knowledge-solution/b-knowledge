#
# Compatibility shim: provides api.db imports for ragflow code.
# Original enums defined here, submodules redirect to db/ package.
#
import sys
import importlib

from enum import IntEnum
from strenum import StrEnum


class UserTenantRole(StrEnum):
    OWNER = 'owner'
    ADMIN = 'admin'
    NORMAL = 'normal'
    INVITE = 'invite'


class TenantPermission(StrEnum):
    ME = 'me'
    TEAM = 'team'


class SerializedType(IntEnum):
    PICKLE = 1
    JSON = 2


class FileType(StrEnum):
    PDF = 'pdf'
    DOC = 'doc'
    VISUAL = 'visual'
    AURAL = 'aural'
    VIRTUAL = 'virtual'
    FOLDER = 'folder'
    OTHER = "other"

VALID_FILE_TYPES = {FileType.PDF, FileType.DOC, FileType.VISUAL, FileType.AURAL, FileType.VIRTUAL, FileType.FOLDER, FileType.OTHER}


class InputType(StrEnum):
    LOAD_STATE = "load_state"
    POLL = "poll"
    EVENT = "event"
    SLIM_RETRIEVAL = "slim_retrieval"


class CanvasCategory(StrEnum):
    Agent = "agent_canvas"
    DataFlow = "dataflow_canvas"


class PipelineTaskType(StrEnum):
    PARSE = "Parse"
    DOWNLOAD = "Download"
    RAPTOR = "RAPTOR"
    GRAPH_RAG = "GraphRAG"
    MINDMAP = "Mindmap"


VALID_PIPELINE_TASK_TYPES = {PipelineTaskType.PARSE, PipelineTaskType.DOWNLOAD, PipelineTaskType.RAPTOR, PipelineTaskType.GRAPH_RAG, PipelineTaskType.MINDMAP}

PIPELINE_SPECIAL_PROGRESS_FREEZE_TASK_TYPES = {PipelineTaskType.RAPTOR.lower(), PipelineTaskType.GRAPH_RAG.lower(), PipelineTaskType.MINDMAP.lower()}

KNOWLEDGEBASE_FOLDER_NAME = ".knowledgebase"


# Redirect api.db.db_models -> db.db_models, api.db.services -> db.services, etc.
# This allows `from api.db.services.task_service import TaskService` to work.
def __getattr__(name):
    try:
        return importlib.import_module(f"db.{name}")
    except ModuleNotFoundError:
        raise AttributeError(f"module 'api.db' has no attribute '{name}'")

# Register submodule redirects so `from api.db.services.xxx import yyy` works
class _ApiDbFinder:
    """Meta path finder that redirects api.db.* imports to db.*"""
    def find_module(self, fullname, path=None):
        if fullname.startswith("api.db.") and not fullname.startswith("api.db.__"):
            return self
        return None

    def load_module(self, fullname):
        if fullname in sys.modules:
            return sys.modules[fullname]
        # api.db.services.task_service -> db.services.task_service
        real_name = fullname.replace("api.db.", "db.", 1)
        mod = importlib.import_module(real_name)
        sys.modules[fullname] = mod
        return mod

# Install the finder once
if not any(isinstance(f, _ApiDbFinder) for f in sys.meta_path):
    sys.meta_path.insert(0, _ApiDbFinder())
