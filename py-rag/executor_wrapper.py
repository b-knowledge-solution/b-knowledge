"""
Wrapped task executor with Redis pub/sub progress notifications.

Monkey-patches the original RAGFlow task_executor.set_progress to
additionally publish progress events via Redis pub/sub, enabling
Node.js to stream progress via SSE to the frontend.

Usage:
  - As a module import: from executor_wrapper import install_progress_hook
  - As entrypoint:      python -m executor_wrapper
"""
import asyncio
import json
import logging
import os
import sys

# Ensure py-rag root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import redis

logger = logging.getLogger(__name__)

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD or None,
            decode_responses=True,
        )
    return _redis_client


def install_progress_hook():
    """Monkey-patch task_executor.set_progress to add Redis pub/sub."""
    try:
        from rag.svr import task_executor
    except ImportError:
        logger.warning("Could not import task_executor — progress hook not installed")
        return

    original_set_progress = task_executor.set_progress

    def patched_set_progress(task_id, from_page=0, to_page=-1, prog=None, msg="Processing..."):
        # Call original
        original_set_progress(task_id, from_page, to_page, prog, msg)

        # Publish to Redis for Node.js SSE streaming
        try:
            r = _get_redis()
            r.publish(
                f"task:{task_id}:progress",
                json.dumps({
                    "task_id": task_id,
                    "progress": prog,
                    "message": msg,
                    "from_page": from_page,
                    "to_page": to_page,
                }),
            )
        except Exception as e:
            logger.warning(f"Failed to publish progress to Redis: {e}")

    task_executor.set_progress = patched_set_progress
    logger.info("Progress hook installed on task_executor.set_progress")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    os.environ.setdefault("DB_TYPE", "postgres")

    from common.settings import init_settings
    init_settings()

    from db.db_models import init_database_tables
    init_database_tables()

    from system_tenant import ensure_system_tenant
    ensure_system_tenant()

    install_progress_hook()

    from rag.svr.task_executor import main
    asyncio.run(main())
