#
#  Copyright 2025 The InfiniFlow Authors. All Rights Reserved.
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

"""Service layer for memory message CRUD operations.

This module provides the MessageService class which acts as a high-level
interface for managing memory messages in the document store. It abstracts
away the underlying storage engine (OpenSearch, Infinity, or OceanBase)
by delegating all operations through the global msgStoreConn connector.

Key responsibilities:
- Index lifecycle management (create, check, delete)
- Message insertion, update, deletion, and retrieval
- Paginated listing of raw messages with their extracted sub-messages
- Semantic/vector search across memory indices
- Memory size calculation and FIFO eviction support
"""

import sys
from typing import List

from common import settings
from common.constants import MemoryType
from common.doc_store.doc_store_base import OrderByExpr, MatchExpr


def index_name(uid: str): return f"memory_{uid}"
"""Generate the storage index name for a given user ID.

Args:
    uid: The user identifier.

Returns:
    The index name string prefixed with "memory_".
"""


class MessageService:
    """High-level service for memory message operations.

    All methods are classmethods that delegate to the global message store
    connection (settings.msgStoreConn). The index naming convention is
    "memory_{uid}" where uid identifies the user/tenant.
    """

    @classmethod
    def has_index(cls, uid: str, memory_id: str):
        """Check whether a memory index exists in the document store.

        Args:
            uid: The user ID used to derive the index name.
            memory_id: The memory ID to check within the index.

        Returns:
            True if the index exists, False otherwise.
        """
        index = index_name(uid)
        return settings.msgStoreConn.index_exist(index, memory_id)

    @classmethod
    def create_index(cls, uid: str, memory_id: str, vector_size: int):
        """Create a new memory index in the document store.

        Args:
            uid: The user ID used to derive the index name.
            memory_id: The memory ID for the new index partition.
            vector_size: The dimension of embedding vectors to store.

        Returns:
            The result from the underlying store's create_idx operation.
        """
        index = index_name(uid)
        return settings.msgStoreConn.create_idx(index, memory_id, vector_size)

    @classmethod
    def delete_index(cls, uid: str, memory_id: str):
        """Delete a memory index from the document store.

        Args:
            uid: The user ID used to derive the index name.
            memory_id: The memory ID of the index partition to delete.

        Returns:
            The result from the underlying store's delete_idx operation.
        """
        index = index_name(uid)
        return settings.msgStoreConn.delete_idx(index, memory_id)

    @classmethod
    def insert_message(cls, messages: List[dict], uid: str, memory_id: str):
        """Insert one or more messages into memory storage.

        Generates composite document IDs in the format "{memory_id}_{message_id}"
        and normalizes the status field to integer (0 or 1).

        Args:
            messages: List of message dictionaries to insert.
            uid: The user ID used to derive the index name.
            memory_id: The memory ID to associate with the messages.

        Returns:
            A list of error strings from the insert operation.
        """
        index = index_name(uid)
        # Generate composite document IDs and normalize status to integer
        [m.update({
            "id": f'{memory_id}_{m["message_id"]}',
            "status": 1 if m["status"] else 0
        }) for m in messages]
        return settings.msgStoreConn.insert(messages, index, memory_id)

    @classmethod
    def update_message(cls, condition: dict, update_dict: dict, uid: str, memory_id: str):
        """Update messages matching the given condition.

        Args:
            condition: Filter criteria to identify messages to update.
            update_dict: Dictionary of field-value pairs to update.
            uid: The user ID used to derive the index name.
            memory_id: The memory ID scope for the update.

        Returns:
            True if the update succeeded, False otherwise.
        """
        index = index_name(uid)
        # Normalize status to integer for storage consistency
        if "status" in update_dict:
            update_dict["status"] = 1 if update_dict["status"] else 0
        return settings.msgStoreConn.update(condition, update_dict, index, memory_id)

    @classmethod
    def delete_message(cls, condition: dict, uid: str, memory_id: str):
        """Delete messages matching the given condition.

        Args:
            condition: Filter criteria for deletion.
            uid: The user ID used to derive the index name.
            memory_id: The memory ID scope for deletion.

        Returns:
            The number of messages deleted.
        """
        index = index_name(uid)
        return settings.msgStoreConn.delete(condition, index, memory_id)

    @classmethod
    def list_message(cls, uid: str, memory_id: str, agent_ids: List[str]=None, keywords: str=None, page: int=1, page_size: int=50):
        """List raw messages with their associated extracted sub-messages.

        Retrieves paginated raw messages (type=RAW), then fetches all extracted
        sub-messages (semantic, episodic, procedural) linked via source_id.
        Groups extracted messages under their parent raw message.

        Args:
            uid: The user ID used to derive the index name.
            memory_id: The memory ID to list messages from.
            agent_ids: Optional list of agent IDs to filter by.
            keywords: Optional session ID substring to filter by.
            page: Page number (1-based).
            page_size: Number of raw messages per page.

        Returns:
            A dict with "message_list" (list of raw messages with nested "extract")
            and "total_count" (total number of matching raw messages).
        """
        index = index_name(uid)
        filter_dict = {}
        if agent_ids:
            filter_dict["agent_id"] = agent_ids
        if keywords:
            filter_dict["session_id"] = keywords
        select_fields = [
            "message_id", "message_type", "source_id", "memory_id", "user_id", "agent_id", "session_id", "valid_at",
            "invalid_at", "forget_at", "status"
        ]
        order_by = OrderByExpr()
        order_by.desc("valid_at")
        # First query: fetch paginated raw messages
        res, total_count = settings.msgStoreConn.search(
            select_fields=select_fields,
            highlight_fields=[],
            condition={**filter_dict, "message_type": MemoryType.RAW.name.lower()},
            match_expressions=[], order_by=order_by,
            offset=(page-1)*page_size, limit=page_size,
            index_names=index, memory_ids=[memory_id], agg_fields=[], hide_forgotten=False
        )
        if not total_count:
            return {
            "message_list": [],
            "total_count": 0
        }

        raw_msg_mapping = settings.msgStoreConn.get_fields(res, select_fields)
        raw_messages = list(raw_msg_mapping.values())
        # Second query: fetch all extracted sub-messages linked to these raw messages
        extract_filter = {"source_id": [r["message_id"] for r in raw_messages]}
        extract_res, _ = settings.msgStoreConn.search(
            select_fields=select_fields,
            highlight_fields=[],
            condition=extract_filter,
            match_expressions=[], order_by=order_by,
            offset=0, limit=512,
            index_names=index, memory_ids=[memory_id], agg_fields=[], hide_forgotten=False
        )
        extract_msg = settings.msgStoreConn.get_fields(extract_res, select_fields)
        # Group extracted messages by their source (parent) message ID
        grouped_extract_msg = {}
        for msg in extract_msg.values():
            if grouped_extract_msg.get(msg["source_id"]):
                grouped_extract_msg[msg["source_id"]].append(msg)
            else:
                grouped_extract_msg[msg["source_id"]] = [msg]

        # Attach extracted messages to their parent raw messages
        for raw_msg in raw_messages:
            raw_msg["extract"] = grouped_extract_msg.get(raw_msg["message_id"], [])

        return {
            "message_list": raw_messages,
            "total_count": total_count
        }

    @classmethod
    def get_recent_messages(cls, uid_list: List[str], memory_ids: List[str], agent_id: str, session_id: str, limit: int):
        """Get the most recent messages for a specific agent and session.

        Searches across multiple user indices and memory IDs, returning
        messages sorted by valid_at descending.

        Args:
            uid_list: List of user IDs whose indices to search.
            memory_ids: List of memory IDs to scope the search.
            agent_id: The agent ID to filter by.
            session_id: The session ID to filter by.
            limit: Maximum number of messages to return.

        Returns:
            A list of message dictionaries, or empty list if none found.
        """
        index_names = [index_name(uid) for uid in uid_list]
        condition_dict = {
            "agent_id": agent_id,
            "session_id": session_id
        }
        order_by = OrderByExpr()
        order_by.desc("valid_at")
        res, total_count = settings.msgStoreConn.search(
            select_fields=[
                "message_id", "message_type", "source_id", "memory_id", "user_id", "agent_id", "session_id", "valid_at",
                "invalid_at", "forget_at", "status", "content"
            ],
            highlight_fields=[],
            condition=condition_dict,
            match_expressions=[], order_by=order_by,
            offset=0, limit=limit,
            index_names=index_names, memory_ids=memory_ids, agg_fields=[]
        )
        if not total_count:
            return []

        doc_mapping = settings.msgStoreConn.get_fields(res, [
            "message_id", "message_type", "source_id", "memory_id","user_id", "agent_id", "session_id",
            "valid_at", "invalid_at", "forget_at", "status", "content"
        ])
        return list(doc_mapping.values())

    @classmethod
    def search_message(cls, memory_ids: List[str], condition_dict: dict, uid_list: List[str], match_expressions:list[MatchExpr], top_n: int):
        """Search messages using text and/or vector match expressions.

        Applies status=1 filter by default to return only active messages.

        Args:
            memory_ids: List of memory IDs to scope the search.
            condition_dict: Additional filter conditions.
            uid_list: List of user IDs whose indices to search.
            match_expressions: List of text/vector/fusion match expressions.
            top_n: Maximum number of results to return.

        Returns:
            A list of message dictionaries, or empty list if none found.
        """
        index_names = [index_name(uid) for uid in uid_list]
        # Filter only valid (active) messages by default
        if "status" not in condition_dict:
            condition_dict["status"] = 1

        order_by = OrderByExpr()
        order_by.desc("valid_at")
        res, total_count = settings.msgStoreConn.search(
            select_fields=[
                "message_id", "message_type", "source_id", "memory_id", "user_id", "agent_id", "session_id",
                "valid_at",
                "invalid_at", "forget_at", "status", "content"
            ],
            highlight_fields=[],
            condition=condition_dict,
            match_expressions=match_expressions,
            order_by=order_by,
            offset=0, limit=top_n,
            index_names=index_names, memory_ids=memory_ids, agg_fields=[]
        )
        if not total_count:
            return []

        docs = settings.msgStoreConn.get_fields(res, [
            "message_id", "message_type", "source_id", "memory_id", "user_id", "agent_id", "session_id", "valid_at",
            "invalid_at", "forget_at", "status", "content"
        ])
        return list(docs.values())

    @staticmethod
    def calculate_message_size(message: dict):
        """Calculate the approximate memory footprint of a single message.

        Estimates size based on the content string and the embedding vector.

        Args:
            message: A message dict with "content" and "content_embed" keys.

        Returns:
            The estimated size in bytes.
        """
        return sys.getsizeof(message["content"]) + sys.getsizeof(message["content_embed"][0]) * len(message["content_embed"])

    @classmethod
    def calculate_memory_size(cls, memory_ids: List[str], uid_list: List[str]):
        """Calculate the total memory footprint for each memory ID.

        Retrieves all messages across the given memory IDs and sums their
        sizes grouped by memory_id.

        Args:
            memory_ids: List of memory IDs to calculate sizes for.
            uid_list: List of user IDs whose indices to search.

        Returns:
            A dict mapping memory_id to total size in bytes.
        """
        index_names = [index_name(uid) for uid in uid_list]
        order_by = OrderByExpr()
        order_by.desc("valid_at")

        res, count = settings.msgStoreConn.search(
            select_fields=["memory_id", "content", "content_embed"],
            highlight_fields=[],
            condition={},
            match_expressions=[],
            order_by=order_by,
            offset=0, limit=2048*len(memory_ids),
            index_names=index_names, memory_ids=memory_ids, agg_fields=[], hide_forgotten=False
        )

        if count == 0:
            return {}

        docs = settings.msgStoreConn.get_fields(res, ["memory_id", "content", "content_embed"])
        # Sum message sizes grouped by memory_id
        size_dict = {}
        for doc in docs.values():
            if size_dict.get(doc["memory_id"]):
                size_dict[doc["memory_id"]] += cls.calculate_message_size(doc)
            else:
                size_dict[doc["memory_id"]] = cls.calculate_message_size(doc)
        return size_dict

    @classmethod
    def pick_messages_to_delete_by_fifo(cls, memory_id: str, uid: str, size_to_delete: int):
        """Select messages for FIFO eviction to free up the specified amount of space.

        First tries to evict already-forgotten messages (cheapest to remove),
        then falls back to evicting the oldest active messages.

        Args:
            memory_id: The memory ID to evict messages from.
            uid: The user ID used to derive the index name.
            size_to_delete: The target number of bytes to free.

        Returns:
            A tuple of (list_of_message_ids_to_delete, total_size_freed).
        """
        select_fields = ["message_id", "content", "content_embed"]
        _index_name = index_name(uid)
        # First pass: try to evict already-forgotten messages (least valuable)
        res = settings.msgStoreConn.get_forgotten_messages(select_fields, _index_name, memory_id)
        current_size = 0
        ids_to_remove = []
        if res:
            message_list = settings.msgStoreConn.get_fields(res, select_fields)
            for message in message_list.values():
                if current_size < size_to_delete:
                    current_size += cls.calculate_message_size(message)
                    ids_to_remove.append(message["message_id"])
                else:
                    return ids_to_remove, current_size
            if current_size >= size_to_delete:
                return ids_to_remove, current_size

        # Second pass: evict oldest active messages if forgotten ones weren't enough
        order_by = OrderByExpr()
        order_by.asc("valid_at")
        res, total_count = settings.msgStoreConn.search(
            select_fields=select_fields,
            highlight_fields=[],
            condition={},
            match_expressions=[],
            order_by=order_by,
            offset=0, limit=512,
            index_names=[_index_name], memory_ids=[memory_id], agg_fields=[]
        )
        docs = settings.msgStoreConn.get_fields(res, select_fields)
        for doc in docs.values():
            if current_size < size_to_delete:
                current_size += cls.calculate_message_size(doc)
                ids_to_remove.append(doc["message_id"])
            else:
                return ids_to_remove, current_size
        return ids_to_remove, current_size

    @classmethod
    def get_missing_field_messages(cls, memory_id: str, uid: str, field_name: str):
        """Retrieve messages that are missing a specific field for backfill processing.

        Args:
            memory_id: The memory ID to search within.
            uid: The user ID used to derive the index name.
            field_name: The field name that must be absent.

        Returns:
            A list of message dicts with "message_id" and "content" fields.
        """
        select_fields = ["message_id", "content"]
        _index_name = index_name(uid)
        res = settings.msgStoreConn.get_missing_field_message(
            select_fields=select_fields,
            index_name=_index_name,
            memory_id=memory_id,
            field_name=field_name
        )
        if not res:
            return []
        docs = settings.msgStoreConn.get_fields(res, select_fields)
        return list(docs.values())

    @classmethod
    def get_by_message_id(cls, memory_id: str, message_id: int, uid: str):
        """Retrieve a single message by its composite document ID.

        The document ID is constructed as "{memory_id}_{message_id}".

        Args:
            memory_id: The memory ID component of the document ID.
            message_id: The message ID component of the document ID.
            uid: The user ID used to derive the index name.

        Returns:
            The message dictionary if found, or None.
        """
        index = index_name(uid)
        doc_id = f'{memory_id}_{message_id}'
        return settings.msgStoreConn.get(doc_id, index, [memory_id])

    @classmethod
    def get_max_message_id(cls, uid_list: List[str], memory_ids: List[str]):
        """Find the highest message_id across the given memories.

        Used to determine the next available message ID for new insertions.

        Args:
            uid_list: List of user IDs whose indices to search.
            memory_ids: List of memory IDs to search across.

        Returns:
            The highest message_id as an integer, or 1 if no messages exist.
        """
        order_by = OrderByExpr()
        order_by.desc("message_id")
        index_names = [index_name(uid) for uid in uid_list]
        res, total_count = settings.msgStoreConn.search(
            select_fields=["message_id"],
            highlight_fields=[],
            condition={},
            match_expressions=[],
            order_by=order_by,
            offset=0, limit=1,
            index_names=index_names, memory_ids=memory_ids,
            agg_fields=[], hide_forgotten=False
        )
        if not total_count:
            return 1

        docs = settings.msgStoreConn.get_fields(res, ["message_id"])
        if not docs:
            return 1
        else:
            latest_msg = list(docs.values())[0]
            return int(latest_msg["message_id"])
