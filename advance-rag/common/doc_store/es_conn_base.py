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
"""
Base class for Elasticsearch / OpenSearch document store connections.

Implements the ``DocStoreConnection`` interface for OpenSearch-compatible
backends.  Provides concrete implementations for index lifecycle (create,
delete, check existence), single-document retrieval, cluster stats, SQL
execution, and search-result accessors (total count, doc IDs, highlights,
aggregations).

Subclasses (e.g. ``rag.utils.es_conn.ESConnection``) implement the
remaining abstract methods: ``search``, ``insert``, ``update``, ``delete``,
and ``get_fields``.
"""

import logging
import re
import json
import copy
import time
import os
from abc import abstractmethod

from opensearchpy import NotFoundError, Index, ConnectionTimeout
from opensearchpy.client import IndicesClient
from common.file_utils import get_project_base_directory
from common.misc_utils import convert_bytes
from common.doc_store.doc_store_base import DocStoreConnection, OrderByExpr, MatchExpr
from rag.nlp import is_english, rag_tokenizer
from common import settings

# Number of retry attempts for transient failures
ATTEMPT_TIME = 2


class ESConnectionBase(DocStoreConnection):
    """Base implementation of ``DocStoreConnection`` for OpenSearch.

    Loads the index mapping from a JSON file at initialisation time and
    uses the ``ES_CONN`` singleton connection pool for all operations.

    Args:
        mapping_file_name: Filename of the index mapping JSON in ``conf/``.
        logger_name: Logger name for this connection instance.
    """
    def __init__(self, mapping_file_name: str="mapping.json", logger_name: str='ragflow.es_conn'):
        from common.doc_store.es_conn_pool import ES_CONN

        self.logger = logging.getLogger(logger_name)

        self.info = {}
        self.logger.info(f"Use OpenSearch {settings.VECTORDB['hosts']} as the doc engine.")
        self.es = ES_CONN.get_conn()
        fp_mapping = os.path.join(get_project_base_directory(), "conf", mapping_file_name)
        if not os.path.exists(fp_mapping):
            msg = f"OpenSearch mapping file not found at {fp_mapping}"
            self.logger.error(msg)
            raise Exception(msg)
        with open(fp_mapping, "r") as f:
            self.mapping = json.load(f)
        self.logger.info(f"OpenSearch {settings.VECTORDB['hosts']} is healthy.")

    def _connect(self):
        """Verify or refresh the OpenSearch connection.

        Returns:
            True if the connection is alive.
        """
        from common.doc_store.es_conn_pool import ES_CONN

        if self.es.ping():
            return True
        self.es = ES_CONN.refresh_conn()
        return True

    """
    Database operations
    """

    def db_type(self) -> str:
        return "opensearch"

    def health(self) -> dict:
        """Return the cluster health status dict with an added ``type`` key."""
        health_dict = dict(self.es.cluster.health())
        health_dict["type"] = "opensearch"
        return health_dict

    def get_cluster_stats(self):
        """
        Retrieve and summarise cluster statistics.

        Returns a dict with cluster name, status, index/shard counts,
        document counts, store size, node info, JVM heap usage, etc.
        Returns None on failure.

        curl -XGET "http://{es_host}/_cluster/stats" -H "kbn-xsrf: reporting" to view raw stats.
        """
        raw_stats = self.es.cluster.stats()
        self.logger.debug(f"ESConnection.get_cluster_stats: {raw_stats}")
        try:
            res = {
                'cluster_name': raw_stats['cluster_name'],
                'status': raw_stats['status']
            }
            indices_status = raw_stats['indices']
            res.update({
                'indices': indices_status['count'],
                'indices_shards': indices_status['shards']['total']
            })
            doc_info = indices_status['docs']
            res.update({
                'docs': doc_info['count'],
                'docs_deleted': doc_info['deleted']
            })
            store_info = indices_status['store']
            res.update({
                'store_size': convert_bytes(store_info['size_in_bytes']),
            })
            node_info = raw_stats['nodes']
            res.update({
                'nodes': node_info['count']['total'],
                'nodes_version': node_info['versions'],
                'os_mem': convert_bytes(node_info['os']['mem']['total_in_bytes']),
                'os_mem_used': convert_bytes(node_info['os']['mem']['used_in_bytes']),
                'os_mem_used_percent': node_info['os']['mem']['used_percent'],
                'jvm_versions': node_info['jvm']['versions'][0]['vm_version'],
                'jvm_heap_used': convert_bytes(node_info['jvm']['mem']['heap_used_in_bytes']),
                'jvm_heap_max': convert_bytes(node_info['jvm']['mem']['heap_max_in_bytes'])
            })
            return res

        except Exception as e:
            self.logger.exception(f"ESConnection.get_cluster_stats: {e}")
            return None

    """
    Table operations
    """

    def create_idx(self, index_name: str, dataset_id: str, vector_size: int, parser_id: str = None):
        """Create an OpenSearch index with the configured mapping and KNN vector field.

        Args:
            index_name: Index name to create.
            dataset_id: Dataset identifier (unused for OpenSearch, kept for interface compatibility).
            vector_size: Dimensionality of the embedding vector field.
            parser_id: Parser identifier (unused for OpenSearch, used by Infinity).

        Returns:
            True if already exists, or the create-index API response.
        """
        # parser_id is used by Infinity but not needed for OpenSearch (kept for interface compatibility)
        if self.index_exist(index_name, dataset_id):
            return True
        try:
            mapping = copy.deepcopy(self.mapping)
            # Add vector field mapping with correct dimension for KNN
            if vector_size and vector_size > 0:
                mapping.setdefault("mappings", {}).setdefault("properties", {})
                mapping["mappings"]["properties"][f"q_{vector_size}_vec"] = {
                    "type": "knn_vector",
                    "dimension": vector_size,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "nmslib",
                        "parameters": {
                            "ef_construction": 512,
                            "m": 32
                        }
                    }
                }
            return IndicesClient(self.es).create(index=index_name, body=mapping)
        except Exception:
            self.logger.exception("ESConnection.createIndex error %s" % index_name)

    def create_doc_meta_idx(self, index_name: str):
        """
        Create a document metadata index.

        Index name pattern: ragflow_doc_meta_{tenant_id}
        - Per-tenant metadata index for storing document metadata fields
        """
        if self.index_exist(index_name, ""):
            return True
        try:
            fp_mapping = os.path.join(get_project_base_directory(), "conf", "doc_meta_es_mapping.json")
            if not os.path.exists(fp_mapping):
                self.logger.error(f"Document metadata mapping file not found at {fp_mapping}")
                return False

            with open(fp_mapping, "r") as f:
                doc_meta_mapping = json.load(f)
            return IndicesClient(self.es).create(index=index_name, body=doc_meta_mapping)
        except Exception as e:
            self.logger.exception(f"Error creating document metadata index {index_name}: {e}")

    def delete_idx(self, index_name: str, dataset_id: str):
        """Delete an OpenSearch index.

        For non-empty dataset_id, deletion is skipped because all datasets
        under a tenant share a single index.

        Args:
            index_name: Index name to delete.
            dataset_id: Dataset identifier. If non-empty, deletion is skipped.
        """
        if len(dataset_id) > 0:
            # The index need to be alive after any kb deletion since all kb under this tenant are in one index.
            return
        try:
            self.es.indices.delete(index=index_name, allow_no_indices=True)
        except NotFoundError:
            pass
        except Exception:
            self.logger.exception("ESConnection.deleteIdx error %s" % index_name)

    def index_exist(self, index_name: str, dataset_id: str = None) -> bool:
        """Check whether an OpenSearch index exists, with retry on timeout.

        Args:
            index_name: Index name to check.
            dataset_id: Unused (kept for interface compatibility).

        Returns:
            True if the index exists, False otherwise.
        """
        s = Index(index_name, self.es)
        for i in range(ATTEMPT_TIME):
            try:
                return s.exists()
            except ConnectionTimeout:
                self.logger.exception("OpenSearch request timeout")
                time.sleep(3)
                self._connect()
                continue
            except Exception as e:
                self.logger.exception(e)
                break
        return False

    """
    CRUD operations
    """

    def get(self, doc_id: str, index_name: str, dataset_ids: list[str]) -> dict | None:
        """Retrieve a single document by ID from an OpenSearch index.

        Args:
            doc_id: Document ID to retrieve.
            index_name: Index to search in.
            dataset_ids: Unused (kept for interface compatibility).

        Returns:
            Document dict with an added ``id`` field, or None if not found.

        Raises:
            Exception: On timeout or other retrieval errors.
        """
        for i in range(ATTEMPT_TIME):
            try:
                res = self.es.get(index=index_name,
                                  id=doc_id, _source=True)
                if str(res.get("timed_out", "")).lower() == "true":
                    raise Exception("OpenSearch Timeout.")
                doc = res["_source"]
                doc["id"] = doc_id
                return doc
            except NotFoundError:
                return None
            except Exception as e:
                self.logger.exception(f"ESConnection.get({doc_id}) got exception")
                raise e
        self.logger.error(f"ESConnection.get timeout for {ATTEMPT_TIME} times!")
        raise Exception("ESConnection.get timeout.")

    @abstractmethod
    def search(
            self, select_fields: list[str],
            highlight_fields: list[str],
            condition: dict,
            match_expressions: list[MatchExpr],
            order_by: OrderByExpr,
            offset: int,
            limit: int,
            index_names: str | list[str],
            dataset_ids: list[str],
            agg_fields: list[str] | None = None,
            rank_feature: dict | None = None
    ):
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def insert(self, documents: list[dict], index_name: str, dataset_id: str = None) -> list[str]:
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def update(self, condition: dict, new_value: dict, index_name: str, dataset_id: str) -> bool:
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def delete(self, condition: dict, index_name: str, dataset_id: str) -> int:
        raise NotImplementedError("Not implemented")

    """
    Helper functions for search result
    """

    def get_total(self, res):
        """Extract the total hit count from an OpenSearch search response.

        Args:
            res: OpenSearch search response dict.

        Returns:
            Total hit count as int.
        """
        if isinstance(res["hits"]["total"], type({})):
            return res["hits"]["total"]["value"]
        return res["hits"]["total"]

    def get_doc_ids(self, res):
        """Extract document IDs from search result hits.

        Args:
            res: OpenSearch search response dict.

        Returns:
            List of document ID strings.
        """
        return [d["_id"] for d in res["hits"]["hits"]]

    def _get_source(self, res):
        """Extract source documents from hits, injecting ``id`` and ``_score`` fields.

        Args:
            res: OpenSearch search response dict.

        Returns:
            List of source document dicts.
        """
        rr = []
        for d in res["hits"]["hits"]:
            d["_source"]["id"] = d["_id"]
            d["_source"]["_score"] = d["_score"]
            rr.append(d["_source"])
        return rr

    @abstractmethod
    def get_fields(self, res, fields: list[str]) -> dict[str, dict]:
        raise NotImplementedError("Not implemented")

    def get_highlight(self, res, keywords: list[str], field_name: str):
        """Extract highlighted text snippets from search results.

        For English text, wraps keyword occurrences in ``<em>`` tags within
        sentence boundaries.  For non-English text, uses OpenSearch's native
        highlights directly.

        Args:
            res: OpenSearch search response dict.
            keywords: List of query keywords to highlight.
            field_name: Source field containing the text to highlight.

        Returns:
            Dict mapping document IDs to highlighted text strings.
        """
        ans = {}
        for d in res["hits"]["hits"]:
            highlights = d.get("highlight")
            if not highlights:
                continue
            txt = "...".join([a for a in list(highlights.items())[0][1]])
            if not is_english(txt.split()):
                ans[d["_id"]] = txt
                continue

            txt = d["_source"][field_name]
            txt = re.sub(r"[\r\n]", " ", txt, flags=re.IGNORECASE | re.MULTILINE)
            txt_list = []
            for t in re.split(r"[.?!;\n]", txt):
                for w in keywords:
                    t = re.sub(r"(^|[ .?/'\"\(\)!,:;-])(%s)([ .?/'\"\(\)!,:;-])" % re.escape(w), r"\1<em>\2</em>\3", t,
                               flags=re.IGNORECASE | re.MULTILINE)
                if not re.search(r"<em>[^<>]+</em>", t, flags=re.IGNORECASE | re.MULTILINE):
                    continue
                txt_list.append(t)
            ans[d["_id"]] = "...".join(txt_list) if txt_list else "...".join([a for a in list(highlights.items())[0][1]])

        return ans

    def get_aggregation(self, res, field_name: str):
        """Extract aggregation buckets from a search response.

        Args:
            res: OpenSearch search response dict.
            field_name: Aggregation field name (prefixed with ``aggs_`` in the response).

        Returns:
            List of ``(key, doc_count)`` tuples.
        """
        agg_field = "aggs_" + field_name
        if "aggregations" not in res or agg_field not in res["aggregations"]:
            return list()
        buckets = res["aggregations"][agg_field]["buckets"]
        return [(b["key"], b["doc_count"]) for b in buckets]

    """
    SQL
    """

    def sql(self, sql: str, fetch_size: int, format: str):
        """Execute a SQL query via the OpenSearch SQL plugin.

        Transforms tokenized field references (``*_tks``) into MATCH
        expressions before execution.

        Args:
            sql: SQL query string.
            fetch_size: Maximum number of rows to return.
            format: Response format (e.g. ``"json"``, ``"csv"``).

        Returns:
            Query result from OpenSearch SQL plugin, or None on timeout.

        Raises:
            Exception: On SQL execution errors.
        """
        self.logger.debug(f"ESConnection.sql get sql: {sql}")
        sql = re.sub(r"[ `]+", " ", sql)
        sql = sql.replace("%", "")
        # Transform token-field equality/LIKE conditions into MATCH expressions
        replaces = []
        for r in re.finditer(r" ([a-z_]+_l?tks)( like | ?= ?)'([^']+)'", sql):
            fld, v = r.group(1), r.group(3)
            match = " MATCH({}, '{}', 'operator=OR;minimum_should_match=30%') ".format(
                fld, rag_tokenizer.fine_grained_tokenize(rag_tokenizer.tokenize(v)))
            replaces.append(
                ("{}{}'{}'".format(
                    r.group(1),
                    r.group(2),
                    r.group(3)),
                 match))

        for p, r in replaces:
            sql = sql.replace(p, r, 1)
        self.logger.debug(f"ESConnection.sql to OpenSearch: {sql}")

        for i in range(ATTEMPT_TIME):
            try:
                res = self.es.sql.query(body={"query": sql, "fetch_size": fetch_size}, format=format,
                                        request_timeout="2s")
                return res
            except ConnectionTimeout:
                self.logger.exception("OpenSearch request timeout")
                time.sleep(3)
                self._connect()
                continue
            except Exception as e:
                self.logger.exception(f"ESConnection.sql got exception. SQL:\n{sql}")
                raise Exception(f"SQL error: {e}\n\nSQL: {sql}")
        self.logger.error(f"ESConnection.sql timeout for {ATTEMPT_TIME} times!")
        return None
