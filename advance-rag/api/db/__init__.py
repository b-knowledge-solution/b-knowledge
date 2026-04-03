# Compatibility shim: api.db -> db
# This package re-exports everything from the top-level db package so that
# ragflow-originated imports like `from api.db import ...` resolve correctly.
from db import *  # noqa: F401,F403
