"""Standalone web crawl worker that listens on a Redis queue for URL crawl tasks.

Fetches web pages, uploads the HTML content to S3 (RustFS/MinIO), updates the
document record in PostgreSQL, and optionally triggers the parsing pipeline.

Usage:
    python -m web_crawl_worker
"""
import json
import os
import sys
import time
from datetime import datetime

# Load .env file before any other imports read environment variables
from dotenv import load_dotenv
load_dotenv()

# Ensure advance-rag root is on sys.path so local packages resolve
_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _root)

import redis
import requests
from loguru import logger

from config import REDIS_HOST, REDIS_PORT, REDIS_PASSWORD

# Redis queue name this worker listens on
QUEUE_NAME = "rag_web_crawl"

# Maximum time (seconds) to wait for a response when fetching a URL
HTTP_TIMEOUT = 60

# User-Agent string sent with HTTP requests to avoid bot-blocking
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _get_redis() -> redis.Redis:
    """Create a Redis client connected to the configured Redis server.

    Returns:
        A redis.Redis instance with decoded string responses.
    """
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD or None,
        decode_responses=True,
    )


def _publish_progress(r: redis.Redis, doc_id: str, progress: float, message: str):
    """Publish a document progress event to the Redis pub/sub channel.

    The Node.js backend subscribes to these channels to stream progress
    updates to the frontend via SSE.

    Args:
        r: Active Redis client.
        doc_id: Document ID whose progress is being reported.
        progress: Completion fraction (0.0 to 1.0, or -1 for failure).
        message: Human-readable progress description.
    """
    try:
        r.publish(
            f"doc:{doc_id}:progress",
            json.dumps({
                "doc_id": doc_id,
                "progress": progress,
                "message": message,
            }),
        )
    except Exception as e:
        logger.warning(f"Failed to publish progress to Redis: {e}")


def update_document_progress(doc_id: str, progress: float, message: str):
    """Update the document's progress fields in the database.

    Args:
        doc_id: The document ID to update.
        progress: Completion fraction (0.0 to 1.0, or -1 for failure).
        message: Human-readable progress description.
    """
    from db.services.document_service import DocumentService
    from common.constants import TaskStatus

    update_data = {
        "progress": progress,
        "progress_msg": message,
    }

    # Mark document as failed when progress is negative
    if progress < 0:
        update_data["run"] = TaskStatus.FAIL.value
    # Mark as done when crawl + upload completes successfully
    elif progress >= 1.0:
        update_data["run"] = TaskStatus.DONE.value

    DocumentService.update_by_id(doc_id, update_data)


def fetch_url(url: str) -> tuple[bytes, str]:
    """Fetch the content of a URL via HTTP GET.

    Uses a desktop-browser User-Agent to reduce the chance of being blocked.
    Follows redirects and raises on HTTP error status codes.

    Args:
        url: The fully-qualified URL to fetch.

    Returns:
        A tuple of (raw_bytes, content_type) from the HTTP response.

    Raises:
        requests.RequestException: On network or HTTP errors.
    """
    headers = {"User-Agent": DEFAULT_USER_AGENT}
    response = requests.get(url, headers=headers, timeout=HTTP_TIMEOUT, allow_redirects=True)

    # Raise an exception for 4xx/5xx status codes
    response.raise_for_status()

    content_type = response.headers.get("Content-Type", "text/html")
    return response.content, content_type


def upload_to_s3(kb_id: str, location: str, content: bytes):
    """Upload binary content to S3-compatible storage (RustFS/MinIO).

    Uses the globally initialised STORAGE_IMPL from settings, which is
    configured during init_settings().

    Args:
        kb_id: Knowledge base ID used as the S3 bucket name.
        location: Object key / path within the bucket.
        content: Raw bytes to upload.
    """
    from common import settings

    settings.STORAGE_IMPL.put(kb_id, location, content)


def create_parse_task(doc_id: str, kb_id: str):
    """Create a parsing task for the document and enqueue it for the task executor.

    Delegates to the existing queue_tasks mechanism so the standard parsing
    pipeline picks up the freshly-crawled document.

    Args:
        doc_id: The document ID to parse.
        kb_id: The knowledge base ID the document belongs to.
    """
    from db.services.document_service import DocumentService
    from db.services.file2document_service import File2DocumentService
    from db.services.task_service import queue_tasks

    # Fetch full document dict for queue_tasks
    exists, doc = DocumentService.get_by_id(doc_id)
    if not exists:
        logger.error(f"Document {doc_id} not found — cannot create parse task")
        return

    doc_dict = doc.to_dict()
    doc_dict["tenant_id"] = DocumentService.get_tenant_id(doc_id)

    # Resolve storage address for the document
    bucket, name = File2DocumentService.get_storage_address(doc_id=doc_id)

    # Queue parsing tasks with default priority 0
    queue_tasks(doc_dict, bucket, name, 0)
    logger.info(f"Parse task queued for document {doc_id}")


def handle_crawl_task(task: dict, r: redis.Redis):
    """Process a single web crawl task end-to-end.

    Steps:
      1. Update document progress to "Crawling URL..."
      2. Fetch the URL content via HTTP
      3. Upload the fetched content to S3
      4. Update the document record with file metadata
      5. Optionally trigger the parsing pipeline

    Args:
        task: Parsed task dictionary with keys: doc_id, kb_id, url,
              auto_parse, created_at.
        r: Active Redis client for progress publishing.
    """
    doc_id = task["doc_id"]
    kb_id = task["kb_id"]
    url = task["url"]
    auto_parse = task.get("auto_parse", False)

    logger.info(f"Processing crawl task: doc_id={doc_id}, url={url}")

    try:
        # Step 1: Signal that crawling has started
        update_document_progress(doc_id, 0.1, "Crawling URL...")
        _publish_progress(r, doc_id, 0.1, "Crawling URL...")

        # Step 2: Fetch the web page content
        content, content_type = fetch_url(url)
        file_size = len(content)
        logger.info(f"Fetched {file_size} bytes from {url} (content-type: {content_type})")

        update_document_progress(doc_id, 0.4, "URL fetched, uploading to storage...")
        _publish_progress(r, doc_id, 0.4, "URL fetched, uploading to storage...")

        # Determine file suffix based on content type
        if "pdf" in content_type.lower():
            suffix = "pdf"
            file_type = "pdf"
        else:
            # Default to HTML for web pages
            suffix = "html"
            file_type = "doc"

        # Build S3 object path: <doc_id>.<suffix>
        location = f"{doc_id}.{suffix}"

        # Step 3: Upload to S3
        upload_to_s3(kb_id, location, content)
        logger.info(f"Uploaded to S3: bucket={kb_id}, key={location}")

        update_document_progress(doc_id, 0.7, "Uploaded to storage, updating record...")
        _publish_progress(r, doc_id, 0.7, "Uploaded to storage, updating record...")

        # Step 4: Update the document record with crawl results
        from db.services.document_service import DocumentService

        DocumentService.update_by_id(doc_id, {
            "location": location,
            "size": file_size,
            "type": file_type,
            "suffix": suffix,
            "source_type": "web_crawl",
        })

        # Step 5: If auto_parse is enabled, trigger the parsing pipeline
        if auto_parse:
            update_document_progress(doc_id, 0.9, "Queuing parse task...")
            _publish_progress(r, doc_id, 0.9, "Queuing parse task...")
            create_parse_task(doc_id, kb_id)
            logger.info(f"Auto-parse triggered for document {doc_id}")
        else:
            # Mark as complete since no parsing was requested
            update_document_progress(doc_id, 1.0, "Web crawl completed.")
            _publish_progress(r, doc_id, 1.0, "Web crawl completed.")

        logger.info(f"Crawl task completed successfully: doc_id={doc_id}")

    except requests.RequestException as e:
        # HTTP fetch failed — mark document as failed
        error_msg = f"Failed to fetch URL: {e}"
        logger.error(f"Crawl task failed for doc_id={doc_id}: {error_msg}")
        update_document_progress(doc_id, -1, error_msg)
        _publish_progress(r, doc_id, -1, error_msg)

    except Exception as e:
        # Unexpected error — mark document as failed
        error_msg = f"Web crawl error: {e}"
        logger.error(f"Crawl task failed for doc_id={doc_id}: {error_msg}")
        update_document_progress(doc_id, -1, error_msg)
        _publish_progress(r, doc_id, -1, error_msg)


def wait_for_database(max_retries: int = 30, retry_delay: int = 3):
    """Wait for the database to be reachable before processing tasks.

    Args:
        max_retries: Maximum number of connection attempts.
        retry_delay: Seconds to wait between retries.
    """
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


def main():
    """Run the web crawl worker loop.

    Connects to Redis and blocks on the ``rag_web_crawl`` list using BRPOP.
    Each popped message is parsed as JSON and dispatched to handle_crawl_task.
    The loop runs indefinitely until the process is terminated.
    """
    logger.info(f"Web crawl worker starting — listening on Redis queue '{QUEUE_NAME}'")

    r = _get_redis()

    while True:
        try:
            # BRPOP blocks until a message is available (timeout=0 means block forever)
            result = r.brpop(QUEUE_NAME, timeout=0)
            if result is None:
                # Timeout expired with no message (shouldn't happen with timeout=0)
                continue

            # result is a tuple of (queue_name, message_json)
            _, raw_message = result
            logger.debug(f"Received raw message: {raw_message}")

            # Parse the task payload
            try:
                task = json.loads(raw_message)
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON in queue message: {e}")
                continue

            # Validate required fields
            required_fields = ["doc_id", "kb_id", "url"]
            missing = [f for f in required_fields if f not in task]
            if missing:
                logger.error(f"Task missing required fields: {missing}. Skipping.")
                continue

            handle_crawl_task(task, r)

        except redis.ConnectionError as e:
            # Redis connection lost — wait and retry
            logger.error(f"Redis connection error: {e}. Reconnecting in 5s...")
            time.sleep(5)
            try:
                r = _get_redis()
            except Exception:
                pass

        except KeyboardInterrupt:
            logger.info("Web crawl worker shutting down (KeyboardInterrupt)")
            break

        except Exception as e:
            # Catch-all to prevent the worker from crashing on unexpected errors
            logger.exception(f"Unexpected error in worker loop: {e}")
            time.sleep(1)


if __name__ == "__main__":
    os.environ.setdefault("DB_TYPE", "postgres")

    from common.log_utils import init_root_logger
    init_root_logger("web_crawl_worker")

    from common.settings import init_settings
    init_settings()

    # Wait for the database to be ready before processing tasks
    wait_for_database()

    # Create RAGFlow peewee-managed tables (idempotent — skips existing tables)
    from db.db_models import init_database_tables
    init_database_tables()

    main()
