# Compatibility shim: api.db.joint_services -> db.joint_services
import importlib
import sys

from db.joint_services import *  # noqa: F401,F403

_self = sys.modules[__name__]
_real = importlib.import_module("db.joint_services")
if hasattr(_real, '__path__'):
    _self.__path__ = _real.__path__
