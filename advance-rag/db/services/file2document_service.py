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
File-to-Document Mapping Service

Manages the many-to-many relationship between files (in the virtual file system)
and documents (in knowledge bases). This mapping allows a single uploaded file
to be associated with one or more documents across different knowledge bases,
and provides storage location resolution for document retrieval.
"""
from datetime import datetime

from common.constants import FileSource
from db.db_models import DB
from db.db_models import File, File2Document
from db.services.common_service import CommonService
from db.services.document_service import DocumentService
from common.time_utils import current_timestamp, datetime_format


class File2DocumentService(CommonService):
    """Service for managing file-to-document mappings.

    Provides methods to create, query, update, and delete the relationship
    between files in the virtual file system and their corresponding documents
    in knowledge bases. Also handles storage address resolution.

    Attributes:
        model: The File2Document Peewee model.
    """
    model = File2Document

    @classmethod
    @DB.connection_context()
    def get_by_file_id(cls, file_id):
        """Get all mappings for a given file.

        Args:
            file_id (str): The file ID to look up.

        Returns:
            peewee.ModelSelect: Query result of File2Document records.
        """
        objs = cls.model.select().where(cls.model.file_id == file_id)
        return objs

    @classmethod
    @DB.connection_context()
    def get_by_document_id(cls, document_id):
        """Get all mappings for a given document.

        Args:
            document_id (str): The document ID to look up.

        Returns:
            peewee.ModelSelect: Query result of File2Document records.
        """
        objs = cls.model.select().where(cls.model.document_id == document_id)
        return objs

    @classmethod
    @DB.connection_context()
    def get_by_document_ids(cls, document_ids):
        """Get all mappings for multiple documents.

        Args:
            document_ids (list[str]): List of document IDs to look up.

        Returns:
            list[dict]: List of File2Document records as dictionaries.
        """
        objs = cls.model.select().where(cls.model.document_id.in_(document_ids))
        return list(objs.dicts())

    @classmethod
    @DB.connection_context()
    def insert(cls, obj):
        """Insert a new file-to-document mapping.

        Args:
            obj (dict): Dictionary containing file_id and document_id.

        Returns:
            File2Document: The created mapping instance.

        Raises:
            RuntimeError: If the database insert fails.
        """
        if not cls.save(**obj):
            raise RuntimeError("Database error (File)!")
        return File2Document(**obj)

    @classmethod
    @DB.connection_context()
    def delete_by_file_id(cls, file_id):
        """Delete all mappings for a given file.

        Args:
            file_id (str): The file ID whose mappings should be deleted.

        Returns:
            int: Number of records deleted.
        """
        return cls.model.delete().where(cls.model.file_id == file_id).execute()

    @classmethod
    @DB.connection_context()
    def delete_by_document_ids_or_file_ids(cls, document_ids, file_ids):
        """Delete mappings matching either document IDs or file IDs.

        Handles three cases: only document_ids provided, only file_ids provided,
        or both provided (combined with OR).

        Args:
            document_ids (list[str] | None): Document IDs to match.
            file_ids (list[str] | None): File IDs to match.

        Returns:
            int: Number of records deleted.
        """
        if not document_ids:
            return cls.model.delete().where(cls.model.file_id.in_(file_ids)).execute()
        elif not file_ids:
            return cls.model.delete().where(cls.model.document_id.in_(document_ids)).execute()
        return cls.model.delete().where(cls.model.document_id.in_(document_ids) | cls.model.file_id.in_(file_ids)).execute()

    @classmethod
    @DB.connection_context()
    def delete_by_document_id(cls, doc_id):
        """Delete all mappings for a given document.

        Args:
            doc_id (str): The document ID whose mappings should be deleted.

        Returns:
            int: Number of records deleted.
        """
        return cls.model.delete().where(cls.model.document_id == doc_id).execute()

    @classmethod
    @DB.connection_context()
    def update_by_file_id(cls, file_id, obj):
        """Update a mapping record by file ID.

        Automatically updates the update_time and update_date fields.

        Args:
            file_id (str): The file ID of the record to update.
            obj (dict): Dictionary of field values to update.

        Returns:
            File2Document: A new File2Document instance with the updated values.
        """
        obj["update_time"] = current_timestamp()
        obj["update_date"] = datetime_format(datetime.now())
        cls.model.update(obj).where(cls.model.id == file_id).execute()
        return File2Document(**obj)

    @classmethod
    @DB.connection_context()
    def get_storage_address(cls, doc_id=None, file_id=None):
        """Resolve the storage address (bucket and location) for a document or file.

        Determines where a document's content is physically stored by checking
        the file-to-document mapping and the file's source type. For local files,
        the parent folder ID and location are returned. For knowledge base files,
        the KB ID and document location are used.

        Args:
            doc_id (str, optional): The document ID to look up.
            file_id (str, optional): The file ID to look up.

        Returns:
            tuple: A tuple of (bucket_id, location) where bucket_id is either
                   the parent folder ID or knowledge base ID.

        Raises:
            AssertionError: If neither doc_id nor file_id is provided and
                           no mapping is found.
        """
        if doc_id:
            f2d = cls.get_by_document_id(doc_id)
        else:
            f2d = cls.get_by_file_id(file_id)
        if f2d:
            file = File.get_by_id(f2d[0].file_id)
            # Local files use the parent folder as the storage bucket
            if not file.source_type or file.source_type == FileSource.LOCAL:
                return file.parent_id, file.location
            doc_id = f2d[0].document_id

        assert doc_id, "please specify doc_id"
        e, doc = DocumentService.get_by_id(doc_id)
        return doc.kb_id, doc.location
