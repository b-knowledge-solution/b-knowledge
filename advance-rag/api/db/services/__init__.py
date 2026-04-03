# Compatibility shim: api.db.services -> db.services
# Dynamically re-exports all submodules from db.services
import importlib
import sys

# Make api.db.services.X resolve to db.services.X
class _ServiceProxy:
    """Module proxy that redirects attribute access to db.services.*"""
    def __getattr__(self, name):
        try:
            return importlib.import_module(f"db.services.{name}")
        except ImportError:
            raise AttributeError(f"module 'api.db.services' has no attribute '{name}'")

# Re-export everything from db.services
from db.services import *  # noqa: F401,F403

# Register this module so `from api.db.services.X import Y` works
_self = sys.modules[__name__]
_real = importlib.import_module("db.services")
# Copy __path__ so Python's import machinery can find submodules
if hasattr(_real, '__path__'):
    _self.__path__ = _real.__path__
