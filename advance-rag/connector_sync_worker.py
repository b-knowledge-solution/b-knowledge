"""Standalone connector sync worker that listens on a Redis queue for external source sync tasks.

Instantiates the appropriate Python connector, fetches documents from the external source,
uploads them to S3 (RustFS/MinIO), creates document records in PostgreSQL, and optionally
triggers the parsing pipeline.

Usage:
    python -m connector_sync_worker
"""
import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone
from typing import Any

# Load .env file before any other imports read environment variables
from dotenv import load_dotenv
load_dotenv()

# Ensure advance-rag root is on sys.path so local packages resolve
_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _root)

import redis
from loguru import logger

from config import REDIS_HOST, REDIS_PORT, REDIS_PASSWORD

# Redis queue name this worker listens on
QUEUE_NAME = "rag_connector_sync"


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


def _get_redis_binary() -> redis.Redis:
    """Create a Redis client without response decoding for pub/sub binary payloads.

    Returns:
        A redis.Redis instance without decoded responses.
    """
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD or None,
        decode_responses=False,
    )


def _publish_progress(r: redis.Redis, connector_id: str, sync_log_id: str,
                       progress: float, message: str, status: str = "running",
                       docs_synced: int = 0, docs_failed: int = 0):
    """Publish a connector sync progress event to Redis pub/sub.

    The Node.js backend subscribes to these channels to stream progress
    updates to the frontend via SSE and to update sync_logs table.

    Args:
        r: Active Redis client.
        connector_id: Connector ID whose progress is being reported.
        sync_log_id: Sync log ID for this specific sync run.
        progress: Completion percentage (0-100, or -1 for failure).
        message: Human-readable progress description.
        status: Sync status (running, completed, failed).
        docs_synced: Number of documents successfully synced so far.
        docs_failed: Number of documents that failed to sync.
    """
    try:
        r.publish(
            f"connector:{connector_id}:progress",
            json.dumps({
                "connector_id": connector_id,
                "sync_log_id": sync_log_id,
                "progress": progress,
                "message": message,
                "status": status,
                "docs_synced": docs_synced,
                "docs_failed": docs_failed,
            }),
        )
    except Exception as e:
        logger.warning(f"Failed to publish progress to Redis: {e}")


def _get_connector_class(source_type: str) -> type | None:
    """Resolve a connector class from the source type string.

    Lazy imports to avoid loading all connector dependencies at startup.
    Only loads the connector module when needed.

    Args:
        source_type: External source type identifier (e.g., 'confluence', 'github').

    Returns:
        The connector class, or None if the source type is not supported.
    """
    # Map source_type to (module_path, class_name, constructor_kwargs_extractor)
    connector_map: dict[str, tuple[str, str]] = {
        "confluence": ("common.data_source.confluence_connector", "ConfluenceConnector"),
        "gitlab": ("common.data_source.gitlab_connector", "GitlabConnector"),
        "github": ("common.data_source.github.connector", "GithubConnector"),
        "jira": ("common.data_source.jira.connector", "JiraConnector"),
        "blob_storage": ("common.data_source.blob_connector", "BlobStorageConnector"),
        "notion": ("common.data_source.notion_connector", "NotionConnector"),
        "slack": ("common.data_source.slack_connector", "SlackConnector"),
        "sharepoint": ("common.data_source.sharepoint_connector", "SharepointConnector"),
        "google_drive": ("common.data_source.google_drive.connector", "GoogleDriveConnector"),
        "dropbox": ("common.data_source.dropbox_connector", "DropboxConnector"),
        "discord": ("common.data_source.discord_connector", "DiscordConnector"),
        "gmail": ("common.data_source.gmail_connector", "GmailConnector"),
        "imap": ("common.data_source.imap_connector", "ImapConnector"),
        "box": ("common.data_source.box_connector", "BoxConnector"),
        "airtable": ("common.data_source.airtable_connector", "AirtableConnector"),
        "asana": ("common.data_source.asana_connector", "AsanaConnector"),
        "zendesk": ("common.data_source.zendesk_connector", "ZendeskConnector"),
        "seafile": ("common.data_source.seafile_connector", "SeafileConnector"),
        "moodle": ("common.data_source.moodle_connector", "MoodleConnector"),
        "webdav": ("common.data_source.webdav_connector", "WebdavConnector"),
        "teams": ("common.data_source.teams_connector", "TeamsConnector"),
    }

    entry = connector_map.get(source_type)
    if not entry:
        return None

    module_path, class_name = entry
    try:
        import importlib
        module = importlib.import_module(module_path)
        return getattr(module, class_name)
    except (ImportError, AttributeError) as e:
        logger.error(f"Failed to import connector for source_type={source_type}: {e}")
        return None


def _extract_constructor_kwargs(source_type: str, config: dict[str, Any]) -> dict[str, Any]:
    """Extract constructor keyword arguments from the connector config.

    Each connector class has different constructor parameters. This function
    maps the flat config dict to the appropriate kwargs for each source type.

    Args:
        source_type: External source type identifier.
        config: Full connector configuration dict from the Node.js backend.

    Returns:
        Dictionary of kwargs to pass to the connector constructor.
    """
    if source_type == "gitlab":
        return {
            "project_owner": config.get("project_owner", ""),
            "project_name": config.get("project_name", ""),
            "include_mrs": config.get("include_mrs", True),
            "include_issues": config.get("include_issues", True),
            "include_code_files": config.get("include_code_files", False),
        }
    elif source_type == "github":
        return {
            "repo_owner": config.get("repo_owner", ""),
            "repositories": config.get("repo_name", None),
            "include_prs": config.get("include_prs", True),
            "include_issues": config.get("include_issues", False),
        }
    elif source_type == "jira":
        return {
            "jira_base_url": config.get("jira_url", ""),
            "project_key": config.get("project_key", None),
            "jql_query": config.get("jql_query", None),
            "include_comments": config.get("include_comments", True),
            "include_attachments": config.get("include_attachments", False),
        }
    elif source_type == "confluence":
        return {
            "wiki_base": config.get("confluence_url", ""),
            "space": config.get("space_key", ""),
            "is_cloud": config.get("is_cloud", True),
        }
    elif source_type == "blob_storage":
        return {
            "bucket_type": config.get("bucket_type", "s3"),
            "bucket_name": config.get("bucket_name", ""),
            "prefix": config.get("prefix", ""),
        }
    elif source_type == "notion":
        return {
            "root_page_id": config.get("root_page_id", None),
        }
    # Default: return empty kwargs for connectors with no required constructor args
    return {}


def _extract_credentials(source_type: str, config: dict[str, Any]) -> dict[str, Any]:
    """Extract credential fields from config for load_credentials().

    Separates credential fields (tokens, passwords, API keys) from constructor
    kwargs since connectors expect credentials via load_credentials().

    Args:
        source_type: External source type identifier.
        config: Full connector configuration dict.

    Returns:
        Dictionary of credential fields.
    """
    if source_type == "gitlab":
        return {
            "gitlab_url": config.get("gitlab_url", ""),
            "gitlab_access_token": config.get("gitlab_access_token", ""),
        }
    elif source_type == "github":
        return {
            "github_access_token": config.get("github_access_token", config.get("access_token", "")),
        }
    elif source_type == "jira":
        return {
            "jira_user_email": config.get("jira_username", config.get("email", "")),
            "jira_api_token": config.get("jira_token", config.get("api_token", "")),
        }
    elif source_type == "confluence":
        return {
            "confluence_access_token": config.get("confluence_token", config.get("api_token", "")),
            "confluence_username": config.get("confluence_user_email", config.get("email", "")),
        }
    elif source_type == "blob_storage":
        return {
            "aws_access_key_id": config.get("access_key", ""),
            "aws_secret_access_key": config.get("secret_key", ""),
            "endpoint_url": config.get("endpoint", ""),
        }
    elif source_type == "notion":
        return {
            "notion_integration_token": config.get("api_key", config.get("notion_integration_token", "")),
        }
    elif source_type == "slack":
        return {
            "slack_bot_token": config.get("slack_bot_token", ""),
        }
    elif source_type == "sharepoint":
        return {
            "sp_client_id": config.get("client_id", ""),
            "sp_client_secret": config.get("client_secret", ""),
            "sp_directory_id": config.get("tenant_id", ""),
        }
    elif source_type == "google_drive":
        return {
            "google_drive_tokens": config.get("tokens", ""),
        }
    # Default: pass entire config as credentials
    return dict(config)


def _ingest_documents(docs: list, kb_id: str, tenant_id: str, source_type: str,
                       connector_id: str, auto_parse: bool = True) -> tuple[int, int]:
    """Upload connector-fetched documents into a knowledge base.

    Uses the existing FileService and DocumentService to store files in S3
    and create document records, then optionally triggers parsing.

    Args:
        docs: List of Document objects from the connector.
        kb_id: Knowledge base / dataset ID to ingest into.
        tenant_id: Tenant ID for the operation.
        source_type: Source type identifier for document provenance.
        connector_id: Connector ID for linking documents.
        auto_parse: Whether to automatically trigger parsing after upload.

    Returns:
        Tuple of (docs_synced, docs_failed) counts.
    """
    from db.services.document_service import DocumentService
    from db.services.file_service import FileService
    from db.db_models import Knowledgebase
    from anthropic import BaseModel as PydanticBaseModel

    docs_synced = 0
    docs_failed = 0

    # Get the knowledge base record for FileService.upload_document
    exists, kb = Knowledgebase.get_by_id(kb_id) if hasattr(Knowledgebase, 'get_by_id') else (False, None)
    if not exists or not kb:
        # Try alternative lookup
        try:
            kb = Knowledgebase.get_or_none(Knowledgebase.id == kb_id)
        except Exception:
            kb = None

    if not kb:
        logger.error(f"Knowledge base {kb_id} not found — cannot ingest documents")
        return 0, len(docs)

    # Build lightweight file objects from connector documents
    class FileObj(PydanticBaseModel):
        id: str
        filename: str
        blob: bytes

        model_config = {"arbitrary_types_allowed": True}

        def read(self) -> bytes:
            return self.blob

    src_label = f"{source_type}/{connector_id}"

    for doc in docs:
        try:
            # Extract document content
            doc_blob = doc.blob if isinstance(doc.blob, bytes) else (
                doc.blob.encode("utf-8") if isinstance(doc.blob, str) else b""
            )
            if not doc_blob:
                docs_failed += 1
                continue

            # Determine filename and extension
            filename = doc.semantic_identifier or doc.id
            ext = doc.extension or ".txt"
            if not filename.endswith(ext):
                filename = filename + ext

            file_obj = FileObj(id=doc.id, filename=filename, blob=doc_blob)

            # Upload via FileService
            err, doc_blob_pairs = FileService.upload_document(kb, [file_obj], tenant_id, src_label)
            if err:
                logger.warning(f"Upload errors for doc {doc.id}: {err}")

            for doc_record, _ in doc_blob_pairs:
                # Apply metadata if present
                if hasattr(doc, 'metadata') and doc.metadata:
                    from db.services.document_service import DocMetadataService
                    DocMetadataService.update_document_metadata(doc_record["id"], doc.metadata)

                # Trigger parsing if auto_parse is enabled
                if auto_parse:
                    try:
                        kb_table_num_map: dict = {}
                        DocumentService.run(tenant_id, doc_record, kb_table_num_map)
                    except Exception as parse_err:
                        logger.warning(f"Failed to queue parse for doc {doc_record['id']}: {parse_err}")

                docs_synced += 1

        except Exception as e:
            docs_failed += 1
            logger.warning(f"Failed to ingest document {getattr(doc, 'id', 'unknown')}: {e}")

    return docs_synced, docs_failed


def handle_sync_task(task: dict, r: redis.Redis):
    """Process a single connector sync task end-to-end.

    Steps:
      1. Instantiate the appropriate connector class
      2. Load credentials and validate settings
      3. Fetch documents from the external source
      4. Upload documents to S3 and create DB records
      5. Optionally trigger the parsing pipeline
      6. Publish progress updates via Redis pub/sub

    Args:
        task: Parsed task dictionary with keys: sync_log_id, connector_id,
              kb_id, source_type, config, tenant_id, since.
        r: Active Redis client for progress publishing.
    """
    sync_log_id = task["sync_log_id"]
    connector_id = task["connector_id"]
    kb_id = task["kb_id"]
    source_type = task["source_type"]
    config = task.get("config", {})
    tenant_id = task.get("tenant_id", os.environ.get("SYSTEM_TENANT_ID", "00000000-0000-0000-0000-000000000001"))
    since_str = task.get("since")
    auto_parse = task.get("auto_parse", True)

    logger.info(f"Processing sync task: connector_id={connector_id}, source_type={source_type}, kb_id={kb_id}")

    # Step 1: Resolve the connector class
    connector_cls = _get_connector_class(source_type)
    if not connector_cls:
        error_msg = f"Unsupported source type: {source_type}"
        logger.error(error_msg)
        _publish_progress(r, connector_id, sync_log_id, -1, error_msg, status="failed")
        return

    try:
        # Step 2: Instantiate the connector with constructor kwargs
        constructor_kwargs = _extract_constructor_kwargs(source_type, config)
        connector = connector_cls(**constructor_kwargs)

        # Step 3: Load credentials
        credentials = _extract_credentials(source_type, config)
        connector.load_credentials(credentials)

        # Validate connector settings if the method exists
        if hasattr(connector, 'validate_connector_settings'):
            connector.validate_connector_settings()

        _publish_progress(r, connector_id, sync_log_id, 10,
                         "Connected to source, fetching documents...", docs_synced=0)

        # Step 4: Fetch documents from the external source
        total_synced = 0
        total_failed = 0

        # Determine the fetch method based on connector type
        from common.data_source.interfaces import LoadConnector, PollConnector, CheckpointedConnector

        if isinstance(connector, PollConnector) and since_str:
            # Use poll_source for incremental sync
            since_ts = datetime.fromisoformat(since_str).timestamp()
            now_ts = datetime.now(timezone.utc).timestamp()
            doc_batches = connector.poll_source(since_ts, now_ts)
        elif isinstance(connector, LoadConnector) and hasattr(connector, 'load_from_state'):
            # Use load_from_state for full sync
            doc_batches = connector.load_from_state()
        elif isinstance(connector, CheckpointedConnector):
            # Use checkpointed loading
            checkpoint = connector.build_dummy_checkpoint()
            now_ts = datetime.now(timezone.utc).timestamp()
            since_ts = datetime.fromisoformat(since_str).timestamp() if since_str else 0.0
            from common.data_source.interfaces import CheckpointOutputWrapper
            wrapper = CheckpointOutputWrapper()

            # Collect documents from checkpointed connector
            all_docs = []
            for doc_or_failure, failure, new_checkpoint in wrapper(
                connector.load_from_checkpoint(since_ts, now_ts, checkpoint)
            ):
                if doc_or_failure is not None:
                    all_docs.append(doc_or_failure)
                elif failure is not None:
                    total_failed += 1
                    logger.warning(f"Connector failure: {failure}")

                # Ingest in batches of 50
                if len(all_docs) >= 50:
                    synced, failed = _ingest_documents(
                        all_docs, kb_id, tenant_id, source_type, connector_id, auto_parse
                    )
                    total_synced += synced
                    total_failed += failed
                    all_docs = []
                    _publish_progress(r, connector_id, sync_log_id, 50,
                                     f"Synced {total_synced} documents...",
                                     docs_synced=total_synced, docs_failed=total_failed)

            # Ingest remaining documents
            if all_docs:
                synced, failed = _ingest_documents(
                    all_docs, kb_id, tenant_id, source_type, connector_id, auto_parse
                )
                total_synced += synced
                total_failed += failed

            # Publish completion
            _publish_progress(r, connector_id, sync_log_id, 100,
                             f"Sync completed: {total_synced} synced, {total_failed} failed",
                             status="completed", docs_synced=total_synced, docs_failed=total_failed)
            logger.info(f"Sync completed: connector_id={connector_id}, synced={total_synced}, failed={total_failed}")
            return

        else:
            error_msg = f"Connector for {source_type} does not support any known fetch method"
            logger.error(error_msg)
            _publish_progress(r, connector_id, sync_log_id, -1, error_msg, status="failed")
            return

        # Step 5: Process document batches from Load/Poll connectors
        batch_num = 0
        for doc_batch in doc_batches:
            batch_num += 1
            if not doc_batch:
                continue

            synced, failed = _ingest_documents(
                doc_batch, kb_id, tenant_id, source_type, connector_id, auto_parse
            )
            total_synced += synced
            total_failed += failed

            # Report progress periodically
            progress = min(90, 10 + batch_num * 10)
            _publish_progress(r, connector_id, sync_log_id, progress,
                             f"Synced {total_synced} documents ({batch_num} batches)...",
                             docs_synced=total_synced, docs_failed=total_failed)

        # Step 6: Publish completion
        _publish_progress(r, connector_id, sync_log_id, 100,
                         f"Sync completed: {total_synced} synced, {total_failed} failed",
                         status="completed", docs_synced=total_synced, docs_failed=total_failed)
        logger.info(f"Sync completed: connector_id={connector_id}, synced={total_synced}, failed={total_failed}")

    except Exception as e:
        error_msg = f"Sync error: {str(e)}"
        logger.error(f"Sync task failed for connector_id={connector_id}: {error_msg}")
        logger.debug(traceback.format_exc())
        _publish_progress(r, connector_id, sync_log_id, -1, error_msg, status="failed")


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
    """Run the connector sync worker loop.

    Connects to Redis and blocks on the ``rag_connector_sync`` list using BRPOP.
    Each popped message is parsed as JSON and dispatched to handle_sync_task.
    The loop runs indefinitely until the process is terminated.
    """
    logger.info(f"Connector sync worker starting — listening on Redis queue '{QUEUE_NAME}'")

    r = _get_redis()

    while True:
        try:
            # BRPOP blocks until a message is available (timeout=0 means block forever)
            result = r.brpop(QUEUE_NAME, timeout=0)
            if result is None:
                continue

            # result is a tuple of (queue_name, message_json)
            _, raw_message = result
            logger.debug(f"Received sync task: {raw_message[:200]}...")

            # Parse the task payload
            try:
                task = json.loads(raw_message)
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON in queue message: {e}")
                continue

            # Validate required fields
            required_fields = ["sync_log_id", "connector_id", "kb_id", "source_type", "config"]
            missing = [f for f in required_fields if f not in task]
            if missing:
                logger.error(f"Task missing required fields: {missing}. Skipping.")
                continue

            handle_sync_task(task, r)

        except redis.ConnectionError as e:
            logger.error(f"Redis connection error: {e}. Reconnecting in 5s...")
            time.sleep(5)
            try:
                r = _get_redis()
            except Exception:
                pass

        except KeyboardInterrupt:
            logger.info("Connector sync worker shutting down (KeyboardInterrupt)")
            break

        except Exception as e:
            logger.exception(f"Unexpected error in worker loop: {e}")
            time.sleep(1)


if __name__ == "__main__":
    os.environ.setdefault("DB_TYPE", "postgres")

    from common.log_utils import init_root_logger
    init_root_logger("connector_sync_worker")

    from common.settings import init_settings
    init_settings()

    # Wait for the database to be ready before processing tasks
    wait_for_database()

    # Create Peewee-managed tables (idempotent — skips existing tables)
    from db.db_models import init_database_tables
    init_database_tables()

    main()
