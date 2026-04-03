#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
"""
Connector Service Module

Manages external data source connectors and their synchronization lifecycle.
Connectors poll external systems (e.g., cloud storage, APIs) for new documents
and ingest them into knowledge bases. This module provides three service classes:

- ConnectorService: CRUD and status management for connector definitions
- SyncLogsService: Tracks synchronization task history, scheduling, and progress
- Connector2KbService: Manages the mapping between connectors and knowledge bases
"""
import logging
from datetime import datetime
import os
from typing import Tuple, List

from anthropic import BaseModel
from peewee import SQL, fn

from db import InputType
from db.db_models import Connector, SyncLogs, Connector2Kb, Knowledgebase
from db.services.common_service import CommonService
from db.services.document_service import DocumentService
from db.services.document_service import DocMetadataService
from common.misc_utils import get_uuid
from common.constants import TaskStatus
from common.time_utils import current_timestamp, timestamp_to_date

class ConnectorService(CommonService):
    """Service for managing external data source connector definitions.

    Handles connector lifecycle operations including resuming, listing,
    and rebuilding connectors within a tenant context.

    Attributes:
        model: The Connector Peewee model.
    """
    model = Connector

    @classmethod
    def resume(cls, connector_id, status):
        """Resume or update the status of a connector and its sync tasks.

        For each knowledge base linked to this connector, updates the latest
        sync task status. If no task exists or the latest is done and the
        target status is SCHEDULE, creates a new scheduled sync task.

        Args:
            connector_id (str): The connector ID to resume.
            status (TaskStatus): The target status to set.
        """
        for c2k in Connector2KbService.query(connector_id=connector_id):
            task = SyncLogsService.get_latest_task(connector_id, c2k.kb_id)
            if not task:
                if status == TaskStatus.SCHEDULE:
                    SyncLogsService.schedule(connector_id, c2k.kb_id)
                    ConnectorService.update_by_id(connector_id, {"status": status})
                    return

            if task.status == TaskStatus.DONE:
                if status == TaskStatus.SCHEDULE:
                    SyncLogsService.schedule(connector_id, c2k.kb_id, task.poll_range_end, total_docs_indexed=task.total_docs_indexed)
                    ConnectorService.update_by_id(connector_id, {"status": status})
                    return

            task = task.to_dict()
            task["status"] = status
            SyncLogsService.update_by_id(task["id"], task)
        ConnectorService.update_by_id(connector_id, {"status": status})

    @classmethod
    def list(cls, tenant_id):
        """List all connectors for a tenant with basic fields.

        Args:
            tenant_id (str): The tenant ID to filter by.

        Returns:
            list[dict]: List of connector records with id, name, source, status.
        """
        fields = [
            cls.model.id,
            cls.model.name,
            cls.model.source,
            cls.model.status
        ]
        return list(cls.model.select(*fields).where(
            cls.model.tenant_id == tenant_id
        ).dicts())

    @classmethod
    def rebuild(cls, kb_id:str, connector_id: str, tenant_id:str):
        """Rebuild a connector's documents for a specific knowledge base.

        Deletes all existing sync logs and documents from this connector,
        then schedules a fresh full re-index.

        Args:
            kb_id (str): The knowledge base ID to rebuild into.
            connector_id (str): The connector ID to rebuild.
            tenant_id (str): The tenant ID owning the connector.

        Returns:
            str | None: Error messages from document deletion, or None if
                       the connector was not found.
        """
        from db.services.file_service import FileService
        e, conn = cls.get_by_id(connector_id)
        if not e:
            return None
        SyncLogsService.filter_delete([SyncLogs.connector_id==connector_id, SyncLogs.kb_id==kb_id])
        docs = DocumentService.query(source_type=f"{conn.source}/{conn.id}", kb_id=kb_id)
        err = FileService.delete_docs([d.id for d in docs], tenant_id)
        SyncLogsService.schedule(connector_id, kb_id, reindex=True)
        return err


class SyncLogsService(CommonService):
    """Service for managing connector synchronization task logs.

    Tracks the lifecycle of sync operations: scheduling, starting, progress
    tracking, completion, and cleanup of old log entries.

    Attributes:
        model: The SyncLogs Peewee model.
    """
    model = SyncLogs

    @classmethod
    def list_sync_tasks(cls, connector_id=None, page_number=None, items_per_page=15) -> Tuple[List[dict], int]:
        """List sync tasks with join data from connectors and knowledge bases.

        When connector_id is None, returns only tasks that are due for execution
        (scheduled and past their refresh interval). When connector_id is provided,
        returns all tasks for that specific connector.

        Args:
            connector_id (str, optional): Filter by specific connector. If None,
                returns tasks ready for execution.
            page_number (int, optional): Page number for pagination.
            items_per_page (int): Number of items per page. Defaults to 15.

        Returns:
            tuple: A tuple of (task_list: list[dict], total_count: int).
        """
        fields = [
            cls.model.id,
            cls.model.connector_id,
            cls.model.kb_id,
            cls.model.update_date,
            cls.model.poll_range_start,
            cls.model.poll_range_end,
            cls.model.new_docs_indexed,
            cls.model.total_docs_indexed,
            cls.model.error_msg,
            cls.model.full_exception_trace,
            cls.model.error_count,
            Connector.name,
            Connector.source,
            Connector.tenant_id,
            Connector.timeout_secs,
            Knowledgebase.name.alias("kb_name"),
            Knowledgebase.avatar.alias("kb_avatar"),
            Connector2Kb.auto_parse,
            cls.model.from_beginning.alias("reindex"),
            cls.model.status,
            cls.model.update_time
        ]
        if not connector_id:
            fields.append(Connector.config)

        query = cls.model.select(*fields)\
            .join(Connector, on=(cls.model.connector_id==Connector.id))\
            .join(Connector2Kb, on=(cls.model.kb_id==Connector2Kb.kb_id))\
            .join(Knowledgebase, on=(cls.model.kb_id==Knowledgebase.id))

        if connector_id:
            query = query.where(cls.model.connector_id == connector_id)
        else:
            # Build database-specific interval expression for refresh frequency
            database_type = os.getenv("DB_TYPE", "mysql")
            if "postgres" in database_type.lower():
                interval_expr = SQL("make_interval(mins => t2.refresh_freq)")
            else:
                interval_expr = SQL("INTERVAL `t2`.`refresh_freq` MINUTE")
            # Only return tasks that are scheduled and past their refresh interval
            query = query.where(
                Connector.input_type == InputType.POLL,
                Connector.status == TaskStatus.SCHEDULE,
                cls.model.status == TaskStatus.SCHEDULE,
                cls.model.update_date < (fn.NOW() - interval_expr)
            )

        query = query.distinct().order_by(cls.model.update_time.desc())
        total = query.count()
        if page_number:
            query = query.paginate(page_number, items_per_page)

        return list(query.dicts()), total

    @classmethod
    def start(cls, id, connector_id):
        """Mark a sync task and its connector as running.

        Args:
            id (str): The sync log ID.
            connector_id (str): The connector ID.
        """
        cls.update_by_id(id, {"status": TaskStatus.RUNNING, "time_started": datetime.now().strftime('%Y-%m-%d %H:%M:%S') })
        ConnectorService.update_by_id(connector_id, {"status": TaskStatus.RUNNING})

    @classmethod
    def done(cls, id, connector_id):
        """Mark a sync task and its connector as completed.

        Args:
            id (str): The sync log ID.
            connector_id (str): The connector ID.
        """
        cls.update_by_id(id, {"status": TaskStatus.DONE})
        ConnectorService.update_by_id(connector_id, {"status": TaskStatus.DONE})

    @classmethod
    def schedule(cls, connector_id, kb_id, poll_range_start=None, reindex=False, total_docs_indexed=0):
        """Schedule a new sync task for a connector-KB pair.

        Cleans up old log entries if there are more than 100, then creates
        a new SCHEDULE task. Guards against duplicate scheduling.

        Args:
            connector_id (str): The connector ID.
            kb_id (str): The knowledge base ID.
            poll_range_start (str, optional): Starting point for incremental polling.
            reindex (bool): If True, triggers a full re-index from the beginning.
            total_docs_indexed (int): Running total of documents indexed.
        """
        # Clean up old logs if count exceeds 100 for this connector-KB pair
        try:
            if cls.model.select().where(cls.model.kb_id == kb_id, cls.model.connector_id == connector_id).count() > 100:
                rm_ids = [m.id for m in cls.model.select(cls.model.id).where(cls.model.kb_id == kb_id, cls.model.connector_id == connector_id).order_by(cls.model.update_time.asc()).limit(70)]
                deleted = cls.model.delete().where(cls.model.id.in_(rm_ids)).execute()
                logging.info(f"[SyncLogService] Cleaned {deleted} old logs.")
        except Exception as e:
            logging.exception(e)

        try:
            # Guard against duplicate scheduling
            e = cls.query(kb_id=kb_id, connector_id=connector_id, status=TaskStatus.SCHEDULE)
            if e:
                logging.warning(f"{kb_id}--{connector_id} has already had a scheduling sync task which is abnormal.")
                return None
            reindex = "1" if reindex else "0"
            ConnectorService.update_by_id(connector_id, {"status": TaskStatus.SCHEDULE})
            return cls.save(**{
                "id": get_uuid(),
                "kb_id": kb_id, "status": TaskStatus.SCHEDULE, "connector_id": connector_id,
                "poll_range_start": poll_range_start, "from_beginning": reindex,
                "total_docs_indexed": total_docs_indexed
            })
        except Exception as e:
            logging.exception(e)
            # On failure, try to update the latest existing task instead
            task = cls.get_latest_task(connector_id, kb_id)
            if task:
                cls.model.update(status=TaskStatus.SCHEDULE,
                                 poll_range_start=poll_range_start,
                                 error_msg=cls.model.error_msg + str(e),
                                 full_exception_trace=cls.model.full_exception_trace + str(e)
                                 ) \
                .where(cls.model.id == task.id).execute()
                ConnectorService.update_by_id(connector_id, {"status": TaskStatus.SCHEDULE})

    @classmethod
    def increase_docs(cls, id, min_update, max_update, doc_num, err_msg="", error_count=0):
        """Increment document counters and update poll range for a sync task.

        Uses SQL expressions for atomic counter increments and COALESCE/LEAST/GREATEST
        to correctly track the overall polling window.

        Args:
            id (str): The sync log ID.
            min_update: The minimum update timestamp from this batch.
            max_update: The maximum update timestamp from this batch.
            doc_num (int): Number of new documents indexed in this batch.
            err_msg (str): Error message to append (if any).
            error_count (int): Number of errors to add to the counter.
        """
        cls.model.update(new_docs_indexed=cls.model.new_docs_indexed + doc_num,
                         total_docs_indexed=cls.model.total_docs_indexed + doc_num,
                         poll_range_start=fn.COALESCE(fn.LEAST(cls.model.poll_range_start,min_update), min_update),
                         poll_range_end=fn.COALESCE(fn.GREATEST(cls.model.poll_range_end, max_update), max_update),
                         error_msg=cls.model.error_msg + err_msg,
                         error_count=cls.model.error_count + error_count,
                         update_time=current_timestamp(),
                         update_date=timestamp_to_date(current_timestamp())
                         )\
            .where(cls.model.id == id).execute()

    @classmethod
    def duplicate_and_parse(cls, kb, docs, tenant_id, src, auto_parse=True):
        """Upload connector-fetched documents into a knowledge base and optionally parse them.

        Creates file objects from connector document blobs, uploads them to storage,
        applies any associated metadata, and triggers document parsing if auto_parse
        is enabled.

        Args:
            kb: The Knowledgebase model instance to upload into.
            docs (list[dict]): List of document dictionaries from the connector,
                each containing id, semantic_identifier, extension, blob, and
                optional metadata.
            tenant_id (str): The tenant ID.
            src (str): Source type identifier for document provenance.
            auto_parse (bool | str): If True or "1", automatically start parsing.

        Returns:
            tuple | None: A tuple of (errors: list[str], doc_ids: list[str]),
                         or None if docs is empty.
        """
        from db.services.file_service import FileService
        if not docs:
            return None

        # Lightweight file-like wrapper for connector blobs
        class FileObj(BaseModel):
            id: str
            filename: str
            blob: bytes

            def read(self) -> bytes:
                return self.blob

        errs = []
        # Build file objects, appending extension if not already in the filename
        files = [FileObj(id=d["id"], filename=d["semantic_identifier"]+(f"{d['extension']}" if d["semantic_identifier"][::-1].find(d['extension'][::-1])<0 else ""), blob=d["blob"]) for d in docs]
        doc_ids = []
        err, doc_blob_pairs = FileService.upload_document(kb, files, tenant_id, src)
        errs.extend(err)

        # Create a mapping from filename to metadata for later use
        metadata_map = {}
        for d in docs:
            if d.get("metadata"):
                filename = d["semantic_identifier"]+(f"{d['extension']}" if d["semantic_identifier"][::-1].find(d['extension'][::-1])<0 else "")
                metadata_map[filename] = d["metadata"]

        kb_table_num_map = {}
        for doc, _ in doc_blob_pairs:
            doc_ids.append(doc["id"])

            # Set metadata if available for this document
            if doc["name"] in metadata_map:
                DocMetadataService.update_document_metadata(doc["id"], metadata_map[doc["name"]])

            if not auto_parse or auto_parse == "0":
                continue
            DocumentService.run(tenant_id, doc, kb_table_num_map)

        return errs, doc_ids

    @classmethod
    def get_latest_task(cls, connector_id, kb_id):
        """Get the most recent sync task for a connector-KB pair.

        Args:
            connector_id (str): The connector ID.
            kb_id (str): The knowledge base ID.

        Returns:
            SyncLogs | None: The latest sync log entry, or None if none exist.
        """
        return cls.model.select().where(
            cls.model.connector_id==connector_id,
            cls.model.kb_id == kb_id
        ).order_by(cls.model.update_time.desc()).first()


class Connector2KbService(CommonService):
    """Service for managing connector-to-knowledge-base mappings.

    Handles linking and unlinking connectors to/from knowledge bases,
    including scheduling initial sync tasks when new links are created.

    Attributes:
        model: The Connector2Kb Peewee model.
    """
    model = Connector2Kb

    @classmethod
    def link_connectors(cls, kb_id:str, connectors: list[dict], tenant_id:str):
        """Synchronize the set of connectors linked to a knowledge base.

        Adds new connector links with scheduled sync tasks, updates existing
        link settings (auto_parse), and cancels pending tasks for removed links.

        Args:
            kb_id (str): The knowledge base ID.
            connectors (list[dict]): List of connector dicts with 'id' and
                optional 'auto_parse' keys.
            tenant_id (str): The tenant ID.

        Returns:
            str: Concatenated error messages (empty string if no errors).
        """
        arr = cls.query(kb_id=kb_id)
        old_conn_ids = [a.connector_id for a in arr]
        connector_ids = []
        for conn in connectors:
            conn_id = conn["id"]
            connector_ids.append(conn_id)
            if conn_id in old_conn_ids:
                # Update existing link settings
                cls.filter_update([cls.model.connector_id==conn_id, cls.model.kb_id==kb_id], {"auto_parse": conn.get("auto_parse", "1")})
                continue
            # Create new link and schedule initial sync
            cls.save(**{
                "id": get_uuid(),
                "connector_id": conn_id,
                "kb_id": kb_id,
                "auto_parse": conn.get("auto_parse", "1")
            })
            SyncLogsService.schedule(conn_id, kb_id, reindex=True)

        errs = []
        # Cancel tasks for removed connector links
        for conn_id in old_conn_ids:
            if conn_id in connector_ids:
                continue
            cls.filter_delete([cls.model.kb_id==kb_id, cls.model.connector_id==conn_id])
            e, conn = ConnectorService.get_by_id(conn_id)
            if not e:
                continue
            # Do not delete docs while unlinking; just cancel pending tasks
            SyncLogsService.filter_update([SyncLogs.connector_id==conn_id, SyncLogs.kb_id==kb_id, SyncLogs.status.in_([TaskStatus.SCHEDULE, TaskStatus.RUNNING])], {"status": TaskStatus.CANCEL})
        return "\n".join(errs)

    @classmethod
    def list_connectors(cls, kb_id):
        """List all connectors linked to a knowledge base.

        Args:
            kb_id (str): The knowledge base ID.

        Returns:
            list[dict]: List of connector info dicts with id, source, name,
                       auto_parse, and status.
        """
        fields = [
            Connector.id,
            Connector.source,
            Connector.name,
            cls.model.auto_parse,
            Connector.status
        ]
        return list(cls.model.select(*fields)\
                    .join(Connector, on=(cls.model.connector_id==Connector.id))\
                    .where(
                        cls.model.kb_id==kb_id
                    ).dicts()
        )



