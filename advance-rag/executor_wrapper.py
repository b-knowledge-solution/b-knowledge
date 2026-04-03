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

# Load .env file before any other imports read environment variables
from dotenv import load_dotenv
load_dotenv()

# Ensure advance-rag root and memory subpackage are on sys.path
_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _root)
sys.path.insert(0, os.path.join(_root, "memory"))

import redis
from loguru import logger

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

_redis_client = None


def _get_redis():
    """Get or create a lazy-initialized Redis client for progress publishing.

    Returns:
        Redis client instance connected to the configured Redis server.
    """
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
    """Monkey-patch task_executor.set_progress to add Redis pub/sub notifications.

    Wraps the original set_progress function so that every progress update
    is also published to a Redis channel (task:<task_id>:progress). The Node.js
    backend subscribes to these channels to stream progress via SSE.
    """
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


def wait_for_database(max_retries=30, retry_delay=3):
    """Wait for the database to be reachable and migrations to be applied by the backend.

    @param max_retries: Maximum number of connection attempts.
    @param retry_delay: Seconds between retries.
    """
    import time
    from db.db_models import BaseDataBase

    for attempt in range(1, max_retries + 1):
        try:
            db_instance = BaseDataBase()
            conn = db_instance.database_connection
            conn.connect(reuse_if_open=True)
            conn.close()
            logger.info(f"Database connection verified (attempt {attempt})")
            return
        except Exception as e:
            if attempt < max_retries:
                logger.warning(f"Database not ready (attempt {attempt}/{max_retries}): {e}")
                time.sleep(retry_delay)
            else:
                logger.error(f"Database not reachable after {max_retries} attempts — exiting")
                sys.exit(1)


def preload_local_embedding_model():
    """Eagerly load the local SentenceTransformers embedding model at startup.

    When LOCAL_EMBEDDING_ENABLE=true, instantiates SentenceTransformersEmbed
    to trigger model download (if needed) and load into memory. This ensures
    the model is ready before any embedding tasks arrive, and provides clear
    startup logs confirming the model is operational.

    Skips silently if LOCAL_EMBEDDING_ENABLE is not true.
    """
    import config as app_config

    if not getattr(app_config, 'LOCAL_EMBEDDING_ENABLE', False):
        return

    model_name = getattr(app_config, 'LOCAL_EMBEDDING_MODEL', '')
    if not model_name:
        logger.error('LOCAL_EMBEDDING_ENABLE=true but LOCAL_EMBEDDING_MODEL is not set — skipping preload')
        return

    logger.info('Preloading local embedding model: {} ...', model_name)
    try:
        from rag.llm import EmbeddingModel

        if 'SentenceTransformers' not in EmbeddingModel:
            logger.error('SentenceTransformers factory not registered in EmbeddingModel — check embedding_model.py')
            return

        # Instantiate the singleton — this triggers model download + load
        embed_instance = EmbeddingModel['SentenceTransformers'](
            '__system__', model_name, base_url=''
        )

        # Verify with a test encode
        test_vectors, token_count = embed_instance.encode(['startup test'])
        dim = len(test_vectors[0]) if len(test_vectors) > 0 else 0
        logger.info(
            'Local embedding model ready: {} (dim={}, factory=SentenceTransformers)',
            model_name, dim
        )

        # Publish health status to Valkey so the LLM Config page shows "Ready"
        # Uses the same key as embedding_worker.py (embed:worker:status)
        try:
            import json
            import socket
            import time
            r = _get_redis()
            health_data = json.dumps({
                'status': 'ready',
                'model': model_name,
                'dimension': dim,
                'worker': f'task-executor-{socket.gethostname()}-{os.getpid()}',
                'loaded_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            })
            # TTL of 0 means no expiry — task executor runs for the lifetime of the process
            # The embedding_worker heartbeat (30s TTL) will take over if it's also running
            r.set('embed:worker:status', health_data)
            logger.info('Published embedding health status to Valkey (embed:worker:status)')
        except Exception as he:
            logger.warning('Failed to publish embedding health to Valkey: {}', he)

    except Exception as e:
        logger.error('Failed to preload local embedding model: {}', e)


if __name__ == "__main__":
    os.environ.setdefault("DB_TYPE", "postgres")

    from common.log_utils import init_root_logger
    init_root_logger("task_executor")

    from common.settings import init_settings
    init_settings()

    # Wait for the database to be ready
    wait_for_database()

    # Create RAGFlow peewee-managed tables (idempotent — skips existing tables)
    from db.db_models import init_database_tables
    init_database_tables()

    from system_tenant import ensure_system_tenant
    ensure_system_tenant()

    install_progress_hook()

    # Eagerly preload local embedding model if LOCAL_EMBEDDING_ENABLE=true
    # so the model is downloaded/loaded before any tasks arrive (per user request)
    preload_local_embedding_model()

    from rag.svr.task_executor import main
    asyncio.run(main())
