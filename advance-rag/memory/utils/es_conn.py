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

"""OpenSearch/Elasticsearch connection adapter for memory message storage.

This module implements the ESConnection singleton class that provides CRUD
operations for memory messages stored in OpenSearch. It handles field mapping
between the application's message model and OpenSearch document fields,
constructs complex boolean and KNN queries, and manages retry logic for
transient connection failures.

The class extends ESConnectionBase and is decorated as a singleton so only
one connection instance exists per process.
"""

import re
import json
import time

import copy
from opensearchpy import NotFoundError
from opensearchpy import UpdateByQuery, Q, Search
from opensearchpy import ConnectionTimeout
from common.decorator import singleton
from common.doc_store.doc_store_base import MatchExpr, OrderByExpr, MatchTextExpr, MatchDenseExpr, FusionExpr
from common.doc_store.es_conn_base import ESConnectionBase
from common.float_utils import get_float
from common.constants import PAGERANK_FLD, TAG_FLD
from rag.nlp.rag_tokenizer import tokenize, fine_grained_tokenize

# Maximum number of retry attempts for OpenSearch operations
ATTEMPT_TIME = 2


@singleton
class ESConnection(ESConnectionBase):
    """Singleton OpenSearch connection for memory message CRUD operations.

    Provides methods to search, get, insert, update, and delete memory messages
    in OpenSearch indices. Handles field name mapping between the application
    layer (e.g. "message_type") and OpenSearch storage fields (e.g. "message_type_kwd"),
    as well as tokenization of content fields for full-text search.
    """

    @staticmethod
    def convert_field_name(field_name: str, use_tokenized_content=False) -> str:
        """Convert an application-level field name to its OpenSearch storage field name.

        Args:
            field_name: The application field name (e.g. "message_type", "status", "content").
            use_tokenized_content: If True and field_name is "content", returns the
                fine-grained tokenized field instead of the standard one.

        Returns:
            The corresponding OpenSearch field name.
        """
        match field_name:
            case "message_type":
                return "message_type_kwd"
            case "status":
                return "status_int"
            case "content":
                if use_tokenized_content:
                    return "tokenized_content_ltks"
                return "content_ltks"
            case _:
                return field_name

    @staticmethod
    def map_message_to_es_fields(message: dict) -> dict:
        """Map a message dictionary to OpenSearch document fields for indexing.

        Converts application-level message keys to their OpenSearch equivalents,
        tokenizes content for full-text search, and formats the embedding vector
        with a dimension-prefixed field name.

        Args:
            message: A dictionary containing message details with keys like
                "message_id", "message_type", "content", "content_embed", etc.

        Returns:
            A dictionary formatted for OpenSearch bulk indexing.
        """
        storage_doc = {
            "id": message.get("id"),
            "message_id": message["message_id"],
            "message_type_kwd": message["message_type"],
            "source_id": message["source_id"],
            "memory_id": message["memory_id"],
            "user_id": message["user_id"],
            "agent_id": message["agent_id"],
            "session_id": message["session_id"],
            "valid_at": message["valid_at"],
            "invalid_at": message["invalid_at"],
            "forget_at": message["forget_at"],
            "status_int": 1 if message["status"] else 0,
            "zone_id": message.get("zone_id", 0),
            "content_ltks": message["content"],
            # Generate fine-grained tokens for improved search recall
            "tokenized_content_ltks": fine_grained_tokenize(tokenize(message["content"])),
            # Embedding vector field named by dimension size (e.g. q_768_vec)
            f"q_{len(message['content_embed'])}_vec": message["content_embed"],
        }
        return storage_doc

    @staticmethod
    def get_message_from_es_doc(doc: dict) -> dict:
        """Convert an OpenSearch document back to an application-level message dictionary.

        Reverses the field mapping performed by map_message_to_es_fields, detecting
        the vector field dynamically by regex pattern.

        Args:
            doc: A dictionary representing the OpenSearch document source.

        Returns:
            A dictionary formatted as an application-level message.
        """
        # Detect the embedding vector field by its naming pattern (q_{dim}_vec)
        embd_field_name = next((key for key in doc.keys() if re.match(r"q_\d+_vec", key)), None)
        message = {
            "message_id": doc["message_id"],
            "message_type": doc["message_type_kwd"],
            "source_id": doc["source_id"] if doc["source_id"] else None,
            "memory_id": doc["memory_id"],
            "user_id": doc.get("user_id", ""),
            "agent_id": doc["agent_id"],
            "session_id": doc["session_id"],
            "zone_id": doc.get("zone_id", 0),
            "valid_at": doc["valid_at"],
            "invalid_at": doc.get("invalid_at", "-"),
            "forget_at": doc.get("forget_at", "-"),
            "status": bool(int(doc["status_int"])),
            "content": doc.get("content_ltks", ""),
            "content_embed": doc.get(embd_field_name, []) if embd_field_name else [],
        }
        if doc.get("id"):
            message["id"] = doc["id"]
        return message

    """
    CRUD operations
    """

    def search(
            self, select_fields: list[str],
            highlight_fields: list[str],
            condition: dict,
            match_expressions: list[MatchExpr],
            order_by: OrderByExpr,
            offset: int,
            limit: int,
            index_names: str | list[str],
            memory_ids: list[str],
            agg_fields: list[str] | None = None,
            rank_feature: dict | None = None,
            hide_forgotten: bool = True
    ):
        """Search memory messages in OpenSearch using boolean, full-text, and/or KNN queries.

        Constructs a composite query from conditions, text match expressions, and
        dense vector (KNN) expressions. Supports hybrid search with weighted fusion,
        aggregations, rank features, sorting, and pagination.

        Args:
            select_fields: Fields to include in the response.
            highlight_fields: Fields to apply search highlighting to.
            condition: Filter conditions as key-value pairs (field -> value).
            match_expressions: List of match expressions (text, dense, fusion).
            order_by: Ordering specification for results.
            offset: Number of results to skip (pagination).
            limit: Maximum number of results to return.
            index_names: Index name(s) to search across.
            memory_ids: List of memory IDs to scope the search to.
            agg_fields: Optional fields to compute term aggregations on.
            rank_feature: Optional rank feature boosting configuration.
            hide_forgotten: If True, excludes messages with a forget_at timestamp.

        Returns:
            A tuple of (response_dict, total_count) or (None, 0) if no indices exist.

        Raises:
            Exception: On non-retryable OpenSearch errors or repeated timeouts.
        """
        # Refers to https://opensearch.org/docs/latest/query-dsl/
        use_knn = False
        if isinstance(index_names, str):
            index_names = index_names.split(",")
        assert isinstance(index_names, list) and len(index_names) > 0
        assert "_id" not in condition

        # Only search indices that actually exist
        exist_index_list = [idx for idx in index_names if self.index_exist(idx)]
        if not exist_index_list:
            return None, 0

        bool_query = Q("bool", must=[], must_not=[])
        if hide_forgotten:
            # Exclude messages that have been marked as forgotten
            bool_query.must_not.append(Q("exists", field="forget_at"))

        # Add memory_id filter to scope the search
        condition["memory_id"] = memory_ids
        for k, v in condition.items():
            field_name = self.convert_field_name(k)
            # Session ID uses wildcard matching for partial matches
            if field_name == "session_id" and v:
                bool_query.filter.append(Q("query_string", **{"query": f"*{v}*", "fields": ["session_id"], "analyze_wildcard": True}))
                continue
            if not v:
                continue
            if isinstance(v, list):
                bool_query.filter.append(Q("terms", **{field_name: v}))
            elif isinstance(v, str) or isinstance(v, int):
                bool_query.filter.append(Q("term", **{field_name: v}))
            else:
                raise Exception(
                    f"Condition `{str(k)}={str(v)}` value type is {str(type(v))}, expected to be int, str or list.")
        s = Search()
        vector_similarity_weight = 0.5
        # Extract fusion weights if a weighted_sum fusion expression is present
        for m in match_expressions:
            if isinstance(m, FusionExpr) and m.method == "weighted_sum" and "weights" in m.fusion_params:
                assert len(match_expressions) == 3 and isinstance(match_expressions[0], MatchTextExpr) and isinstance(match_expressions[1],
                                                                                                                      MatchDenseExpr) and isinstance(
                    match_expressions[2], FusionExpr)
                weights = m.fusion_params["weights"]
                vector_similarity_weight = get_float(weights.split(",")[1])

        # OpenSearch KNN query construction
        knn_query = {}
        for m in match_expressions:
            if isinstance(m, MatchTextExpr):
                # Build full-text query string across content fields
                minimum_should_match = m.extra_options.get("minimum_should_match", 0.0)
                if isinstance(minimum_should_match, float):
                    minimum_should_match = str(int(minimum_should_match * 100)) + "%"
                bool_query.must.append(Q("query_string", fields=[self.convert_field_name(f, use_tokenized_content=True) for f in m.fields],
                                   type="best_fields", query=m.matching_text,
                                   minimum_should_match=minimum_should_match,
                                   boost=1))
                # Adjust text score weight relative to vector similarity
                bool_query.boost = 1.0 - vector_similarity_weight

            elif isinstance(m, MatchDenseExpr):
                # Build KNN vector search query with filter passthrough
                assert (bool_query is not None)
                similarity = 0.0
                if "similarity" in m.extra_options:
                    similarity = m.extra_options["similarity"]
                use_knn = True
                vector_column_name = self.convert_field_name(m.vector_column_name)
                knn_query[vector_column_name] = {
                    "vector": list(m.embedding_data),
                    "k": m.topn,
                    "filter": bool_query.to_dict(),
                    "boost": similarity,
                }

        # Apply rank feature boosting (e.g. PageRank, tag scores)
        if bool_query and rank_feature:
            for fld, sc in rank_feature.items():
                if fld != PAGERANK_FLD:
                    fld = f"{TAG_FLD}.{fld}"
                bool_query.should.append(Q("rank_feature", field=fld, linear={}, boost=sc))

        if bool_query:
            s = s.query(bool_query)
        for field in highlight_fields:
            s = s.highlight(field)

        # Apply sorting with proper unmapped_type for missing fields
        if order_by:
            orders = list()
            for field, order in order_by.fields:
                order = "asc" if order == 0 else "desc"
                if field.endswith("_int") or field.endswith("_flt"):
                    order_info = {"order": order, "unmapped_type": "float"}
                else:
                    order_info = {"order": order, "unmapped_type": "text"}
                orders.append({field: order_info})
            s = s.sort(*orders)

        # Add term aggregation buckets for requested fields
        if agg_fields:
            for fld in agg_fields:
                s.aggs.bucket(f'aggs_{fld}', 'terms', field=fld, size=1000000)

        if limit > 0:
            s = s[offset:offset + limit]
        q = s.to_dict()

        # Replace query with KNN query for vector search
        if use_knn:
            q.pop("query", None)
            q["query"] = {"knn": knn_query}

        self.logger.debug(f"ESConnection.search {str(index_names)} query: " + json.dumps(q))

        # Retry loop for transient connection failures
        for i in range(ATTEMPT_TIME):
            try:
                res = self.es.search(index=exist_index_list,
                                     body=q,
                                     timeout=600,
                                     track_total_hits=True,
                                     _source=True)
                if str(res.get("timed_out", "")).lower() == "true":
                    raise Exception("OpenSearch Timeout.")
                self.logger.debug(f"ESConnection.search {str(index_names)} res: " + str(res))
                return res, self.get_total(res)
            except ConnectionTimeout:
                self.logger.exception("OpenSearch request timeout")
                self._connect()
                continue
            except NotFoundError as e:
                self.logger.debug(f"ESConnection.search {str(index_names)} query: " + str(q) + str(e))
                return None, 0
            except Exception as e:
                self.logger.exception(f"ESConnection.search {str(index_names)} query: " + str(q) + str(e))
                raise e

        self.logger.error(f"ESConnection.search timeout for {ATTEMPT_TIME} times!")
        raise Exception("ESConnection.search timeout.")

    def get_forgotten_messages(self, select_fields: list[str], index_name: str, memory_id: str, limit: int=512):
        """Retrieve messages that have been marked as forgotten (have a forget_at timestamp).

        Returns forgotten messages ordered from oldest to newest, which is useful
        for FIFO eviction strategies when memory capacity is exceeded.

        Args:
            select_fields: Fields to include in the returned documents.
            index_name: The OpenSearch index name to search.
            memory_id: The memory ID to filter by.
            limit: Maximum number of forgotten messages to return.

        Returns:
            The OpenSearch response dict, or None if the index is not found.

        Raises:
            Exception: On non-retryable OpenSearch errors or repeated timeouts.
        """
        bool_query = Q("bool", must=[])
        # Only select documents that have a forget_at field set
        bool_query.must.append(Q("exists", field="forget_at"))
        bool_query.filter.append(Q("term", memory_id=memory_id))
        # Sort from old to new so oldest forgotten messages are evicted first
        order_by = OrderByExpr()
        order_by.asc("forget_at")
        # Build search query
        s = Search()
        s = s.query(bool_query)
        orders = list()
        for field, order in order_by.fields:
            order = "asc" if order == 0 else "desc"
            if field.endswith("_int") or field.endswith("_flt"):
                order_info = {"order": order, "unmapped_type": "float"}
            else:
                order_info = {"order": order, "unmapped_type": "text"}
            orders.append({field: order_info})
        s = s.sort(*orders)
        s = s[:limit]
        q = s.to_dict()
        # Execute search with retry logic
        for i in range(ATTEMPT_TIME):
            try:
                res = self.es.search(index=index_name, body=q, timeout=600, track_total_hits=True, _source=True)
                if str(res.get("timed_out", "")).lower() == "true":
                    raise Exception("OpenSearch Timeout.")
                self.logger.debug(f"ESConnection.search {str(index_name)} res: " + str(res))
                return res
            except ConnectionTimeout:
                self.logger.exception("OpenSearch request timeout")
                self._connect()
                continue
            except NotFoundError as e:
                self.logger.debug(f"ESConnection.search {str(index_name)} query: " + str(q) + str(e))
                return None
            except Exception as e:
                self.logger.exception(f"ESConnection.search {str(index_name)} query: " + str(q) + str(e))
                raise e

        self.logger.error(f"ESConnection.search timeout for {ATTEMPT_TIME} times!")
        raise Exception("ESConnection.search timeout.")

    def get_missing_field_message(self, select_fields: list[str], index_name: str, memory_id: str, field_name: str, limit: int=512):
        """Retrieve messages that are missing a specific field (e.g. missing embeddings).

        Used to find messages that need backfill processing, such as documents
        that were indexed before a new field was added.

        Args:
            select_fields: Fields to include in the returned documents.
            index_name: The OpenSearch index name to search.
            memory_id: The memory ID to filter by.
            field_name: The field name that must be absent from matching documents.
            limit: Maximum number of messages to return.

        Returns:
            The OpenSearch response dict, or None if the index is not found.

        Raises:
            Exception: On non-retryable OpenSearch errors or repeated timeouts.
        """
        if not self.index_exist(index_name):
            return None
        bool_query = Q("bool", must=[])
        bool_query.must.append(Q("term", memory_id=memory_id))
        # Exclude documents that have the specified field
        bool_query.must_not.append(Q("exists", field=field_name))
        # Sort from old to new for consistent processing order
        order_by = OrderByExpr()
        order_by.asc("valid_at")
        # Build search query
        s = Search()
        s = s.query(bool_query)
        orders = list()
        for field, order in order_by.fields:
            order = "asc" if order == 0 else "desc"
            if field.endswith("_int") or field.endswith("_flt"):
                order_info = {"order": order, "unmapped_type": "float"}
            else:
                order_info = {"order": order, "unmapped_type": "text"}
            orders.append({field: order_info})
        s = s.sort(*orders)
        s = s[:limit]
        q = s.to_dict()
        # Execute search with retry logic
        for i in range(ATTEMPT_TIME):
            try:
                res = self.es.search(index=index_name, body=q, timeout=600, track_total_hits=True, _source=True)
                if str(res.get("timed_out", "")).lower() == "true":
                    raise Exception("OpenSearch Timeout.")
                self.logger.debug(f"ESConnection.search {str(index_name)} res: " + str(res))
                return res
            except ConnectionTimeout:
                self.logger.exception("OpenSearch request timeout")
                self._connect()
                continue
            except NotFoundError as e:
                self.logger.debug(f"ESConnection.search {str(index_name)} query: " + str(q) + str(e))
                return None
            except Exception as e:
                self.logger.exception(f"ESConnection.search {str(index_name)} query: " + str(q) + str(e))
                raise e

        self.logger.error(f"ESConnection.search timeout for {ATTEMPT_TIME} times!")
        raise Exception("ESConnection.search timeout.")

    def get(self, doc_id: str, index_name: str, memory_ids: list[str]) -> dict | None:
        """Retrieve a single message document by its ID.

        Args:
            doc_id: The document ID to retrieve.
            index_name: The OpenSearch index name.
            memory_ids: List of memory IDs (unused for direct get, kept for API consistency).

        Returns:
            The message dictionary if found, or None if not found.

        Raises:
            Exception: On non-retryable OpenSearch errors or repeated timeouts.
        """
        for i in range(ATTEMPT_TIME):
            try:
                res = self.es.get(index=index_name,
                                  id=doc_id, _source=True)
                if str(res.get("timed_out", "")).lower() == "true":
                    raise Exception("OpenSearch Timeout.")
                message = res["_source"]
                message["id"] = doc_id
                return self.get_message_from_es_doc(message)
            except NotFoundError:
                return None
            except Exception as e:
                self.logger.exception(f"ESConnection.get({doc_id}) got exception")
                raise e
        self.logger.error(f"ESConnection.get timeout for {ATTEMPT_TIME} times!")
        raise Exception("ESConnection.get timeout.")

    def insert(self, documents: list[dict], index_name: str, memory_id: str = None) -> list[str]:
        """Bulk insert message documents into an OpenSearch index.

        Maps each document to OpenSearch fields, then performs a bulk index
        operation. Returns a list of error strings for any failed documents.

        Args:
            documents: List of message dictionaries to insert.
            index_name: The target OpenSearch index name.
            memory_id: The memory ID to associate with all documents.

        Returns:
            A list of error description strings. Empty list means all succeeded.
        """
        # Refers to https://opensearch.org/docs/latest/api-reference/document-apis/bulk/
        operations = []
        for d in documents:
            assert "_id" not in d
            assert "id" in d
            d_copy_raw = copy.deepcopy(d)
            d_copy = self.map_message_to_es_fields(d_copy_raw)
            d_copy["memory_id"] = memory_id
            # Extract the id to use as the OpenSearch document _id
            meta_id = d_copy.pop("id", "")
            operations.append(
                {"index": {"_index": index_name, "_id": meta_id}})
            operations.append(d_copy)
        res = []
        for _ in range(ATTEMPT_TIME):
            try:
                res = []
                r = self.es.bulk(index=index_name, body=operations,
                                 refresh=False, timeout=60)
                # Check if bulk operation reported no errors
                if re.search(r"False", str(r["errors"]), re.IGNORECASE):
                    return res

                # Collect error details from individual item responses
                for item in r["items"]:
                    for action in ["create", "delete", "index", "update"]:
                        if action in item and "error" in item[action]:
                            res.append(str(item[action]["_id"]) + ":" + str(item[action]["error"]))
                return res
            except ConnectionTimeout:
                self.logger.exception("OpenSearch request timeout")
                time.sleep(3)
                self._connect()
                continue
            except Exception as e:
                res.append(str(e))
                self.logger.warning("ESConnection.insert got exception: " + str(e))

        return res

    def update(self, condition: dict, new_value: dict, index_name: str, memory_id: str) -> bool:
        """Update message documents matching the given condition.

        Supports two modes:
        1. Single document update: when condition contains an "id" string.
        2. Bulk update by query: when condition specifies filter criteria.

        Handles special update operations like "remove" (delete a field) and
        "add" (append to a list field).

        Args:
            condition: Filter criteria to identify documents to update.
            new_value: Dictionary of field-value pairs to update.
            index_name: The OpenSearch index name.
            memory_id: The memory ID scope for the update.

        Returns:
            True if the update succeeded, False otherwise.
        """
        doc = copy.deepcopy(new_value)
        update_dict = {self.convert_field_name(k): v for k, v in doc.items()}
        # Re-tokenize content when it changes for search index consistency
        if "content_ltks" in update_dict:
            update_dict["tokenized_content_ltks"] = fine_grained_tokenize(tokenize(update_dict["content_ltks"]))
        update_dict.pop("id", None)
        condition_dict = {self.convert_field_name(k): v for k, v in condition.items()}
        condition_dict["memory_id"] = memory_id
        if "id" in condition_dict and isinstance(condition_dict["id"], str):
            # Single document update by specific document ID
            message_id = condition_dict["id"]
            for i in range(ATTEMPT_TIME):
                # Remove feature fields before update to avoid conflicts
                for k in update_dict.keys():
                    if "feas" != k.split("_")[-1]:
                        continue
                    try:
                        self.es.update(index=index_name, id=message_id,
                                       body={"script": {"source": f"ctx._source.remove(\"{k}\")"}})
                    except Exception:
                        self.logger.exception(f"ESConnection.update(index={index_name}, id={message_id}, doc={json.dumps(condition, ensure_ascii=False)}) got exception")
                try:
                    self.es.update(index=index_name, id=message_id, body={"doc": update_dict})
                    return True
                except Exception as e:
                    self.logger.exception(
                        f"ESConnection.update(index={index_name}, id={message_id}, doc={json.dumps(condition, ensure_ascii=False)}) got exception: " + str(e))
                    break
            return False

        # Bulk update using UpdateByQuery for multiple matching documents
        bool_query = Q("bool")
        for k, v in condition_dict.items():
            if not isinstance(k, str) or not v:
                continue
            if k == "exists":
                bool_query.filter.append(Q("exists", field=v))
                continue
            if isinstance(v, list):
                bool_query.filter.append(Q("terms", **{k: v}))
            elif isinstance(v, str) or isinstance(v, int):
                bool_query.filter.append(Q("term", **{k: v}))
            else:
                raise Exception(
                    f"Condition `{str(k)}={str(v)}` value type is {str(type(v))}, expected to be int, str or list.")
        # Build Painless scripts for each field update operation
        scripts = []
        params = {}
        for k, v in update_dict.items():
            if k == "remove":
                # Remove a field or a value from a list field
                if isinstance(v, str):
                    scripts.append(f"ctx._source.remove('{v}');")
                if isinstance(v, dict):
                    for kk, vv in v.items():
                        scripts.append(f"int i=ctx._source.{kk}.indexOf(params.p_{kk});ctx._source.{kk}.remove(i);")
                        params[f"p_{kk}"] = vv
                continue
            if k == "add":
                # Append a value to a list field
                if isinstance(v, dict):
                    for kk, vv in v.items():
                        scripts.append(f"ctx._source.{kk}.add(params.pp_{kk});")
                        params[f"pp_{kk}"] = vv.strip()
                continue
            if (not isinstance(k, str) or not v) and k != "status_int":
                continue
            if isinstance(v, str):
                v = re.sub(r"(['\n\r]|\\.)", " ", v)
                params[f"pp_{k}"] = v
                scripts.append(f"ctx._source.{k}=params.pp_{k};")
            elif isinstance(v, int) or isinstance(v, float):
                scripts.append(f"ctx._source.{k}={v};")
            elif isinstance(v, list):
                scripts.append(f"ctx._source.{k}=params.pp_{k};")
                params[f"pp_{k}"] = json.dumps(v, ensure_ascii=False)
            else:
                raise Exception(
                    f"newValue `{str(k)}={str(v)}` value type is {str(type(v))}, expected to be int, str.")
        ubq = UpdateByQuery(
            index=index_name).using(
            self.es).query(bool_query)
        ubq = ubq.script(source="".join(scripts), params=params)
        ubq = ubq.params(refresh=True)
        ubq = ubq.params(slices=5)
        ubq = ubq.params(conflicts="proceed")
        for _ in range(ATTEMPT_TIME):
            try:
                _ = ubq.execute()
                return True
            except ConnectionTimeout:
                self.logger.exception("OpenSearch request timeout")
                time.sleep(3)
                self._connect()
                continue
            except Exception as e:
                self.logger.error("ESConnection.update got exception: " + str(e) + "\n".join(scripts))
                break
        return False

    def delete(self, condition: dict, index_name: str, memory_id: str) -> int:
        """Delete message documents matching the given condition.

        Supports deletion by document IDs, by filter criteria, or all documents
        (when an empty ID list is provided).

        Args:
            condition: Filter criteria for deletion. Supports "id" (single or list),
                "exists" checks, "must_not" exclusions, and standard field filters.
            index_name: The OpenSearch index name.
            memory_id: The memory ID scope for deletion.

        Returns:
            The number of documents deleted.
        """
        assert "_id" not in condition
        condition_dict = {self.convert_field_name(k): v for k, v in condition.items()}
        condition_dict["memory_id"] = memory_id
        if "id" in condition_dict:
            message_ids = condition_dict["id"]
            if not isinstance(message_ids, list):
                message_ids = [message_ids]
            # Empty ID list means delete all documents in the memory scope
            if not message_ids:  # when message_ids is empty, delete all
                qry = Q("match_all")
            else:
                qry = Q("ids", values=message_ids)
        else:
            # Build a boolean query from filter conditions
            qry = Q("bool")
            for k, v in condition_dict.items():
                if k == "exists":
                    qry.filter.append(Q("exists", field=v))

                elif k == "must_not":
                    if isinstance(v, dict):
                        for kk, vv in v.items():
                            if kk == "exists":
                                qry.must_not.append(Q("exists", field=vv))

                elif isinstance(v, list):
                    qry.must.append(Q("terms", **{k: v}))
                elif isinstance(v, str) or isinstance(v, int):
                    qry.must.append(Q("term", **{k: v}))
                else:
                    raise Exception("Condition value must be int, str or list.")
        self.logger.debug("ESConnection.delete query: " + json.dumps(qry.to_dict()))
        for _ in range(ATTEMPT_TIME):
            try:
                res = self.es.delete_by_query(
                    index=index_name,
                    body=Search().query(qry).to_dict(),
                    refresh=True)
                return res["deleted"]
            except ConnectionTimeout:
                self.logger.exception("OpenSearch request timeout")
                time.sleep(3)
                self._connect()
                continue
            except Exception as e:
                self.logger.warning("ESConnection.delete got exception: " + str(e))
                if re.search(r"(not_found)", str(e), re.IGNORECASE):
                    return 0
        return 0

    """
    Helper functions for search result
    """

    def get_fields(self, res, fields: list[str]) -> dict[str, dict]:
        """Extract specified fields from OpenSearch search results.

        Converts each hit from OpenSearch document format to application message
        format, then filters to only the requested fields.

        Args:
            res: The raw OpenSearch search response.
            fields: List of application-level field names to extract.

        Returns:
            A dict mapping document IDs to dicts of their requested field values.
        """
        res_fields = {}
        if not fields:
            return {}
        for doc in self._get_source(res):
            message = self.get_message_from_es_doc(doc)
            m = {}
            for n, v in message.items():
                if n not in fields:
                    continue
                if isinstance(v, list):
                    m[n] = v
                    continue
                # Preserve numeric and boolean types for specific fields
                if n in ["message_id", "source_id", "valid_at", "invalid_at", "forget_at", "status"] and isinstance(v, (int, float, bool)):
                    m[n] = v
                    continue
                if not isinstance(v, str):
                    m[n] = str(v)
                else:
                    m[n] = v

            if m:
                res_fields[doc["id"]] = m
        return res_fields
