"""
FastAPI entry point for advance-rag service.

Initializes database, system tenant, and registers API routes.
"""
import logging
import os
import sys

# Ensure advance-rag root is on sys.path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from contextlib import asynccontextmanager
from fastapi import FastAPI

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Set DB_TYPE to postgres
    os.environ.setdefault("DB_TYPE", "postgres")

    # Initialize settings
    from common.settings import init_settings
    init_settings()

    # Initialize database tables
    from db.db_models import init_database_tables
    init_database_tables()

    # Ensure system tenant exists
    from system_tenant import ensure_system_tenant
    ensure_system_tenant()

    # Install progress hook
    from executor_wrapper import install_progress_hook
    install_progress_hook()

    logger.info("advance-rag service started")
    yield
    logger.info("advance-rag service shutting down")


app = FastAPI(
    title="advance-rag",
    description="RAG pipeline service for b-knowledge",
    version="0.1.0",
    lifespan=lifespan,
)

# Register routes
from api.health import router as health_router
from api.datasets import router as datasets_router
from api.documents import router as documents_router
from api.models import router as models_router
from api.chunks import router as chunks_router
from api.sync import router as sync_router
from api.advanced_tasks import router as advanced_tasks_router

app.include_router(health_router, tags=["health"])
app.include_router(datasets_router, prefix="/api/rag", tags=["datasets"])
app.include_router(documents_router, prefix="/api/rag", tags=["documents"])
app.include_router(models_router, prefix="/api/rag", tags=["models"])
app.include_router(chunks_router, prefix="/api/rag", tags=["chunks"])
app.include_router(sync_router, prefix="/api/rag", tags=["sync"])
app.include_router(advanced_tasks_router, prefix="/api/rag", tags=["advanced-tasks"])


if __name__ == "__main__":
    import uvicorn
    from config import API_HOST, API_PORT

    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host=API_HOST, port=API_PORT)
