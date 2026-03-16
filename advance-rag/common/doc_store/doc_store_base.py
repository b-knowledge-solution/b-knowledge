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
Abstract base classes and data structures for document store connections.

Defines the ``DocStoreConnection`` ABC that all concrete backends
(Elasticsearch/OpenSearch, Infinity, OceanBase) must implement, along with
expression classes for constructing search queries: ``MatchTextExpr``,
``MatchDenseExpr``, ``MatchSparseExpr``, ``MatchTensorExpr``, ``FusionExpr``,
and ``OrderByExpr``.

Also provides ``SparseVector`` for representing sparse embedding data.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
import numpy as np

# Default top-N limits for vector and sparse matching
DEFAULT_MATCH_VECTOR_TOPN = 10
DEFAULT_MATCH_SPARSE_TOPN = 10
# Union type for dense vector representations
VEC = list | np.ndarray

@dataclass
class SparseVector:
    """Sparse vector representation with parallel indices and values arrays.

    Attributes:
        indices: List of non-zero dimension indices.
        values: Corresponding values for each index, or None for binary sparse vectors.
    """
    indices: list[int]
    values: list[float] | list[int] | None = None

    def __post_init__(self):
        assert (self.values is None) or (len(self.indices) == len(self.values))

    def to_dict_old(self):
        """Serialize to a dict with ``indices`` and optional ``values`` keys."""
        d = {"indices": self.indices}
        if self.values is not None:
            d["values"] = self.values
        return d

    def to_dict(self):
        """Serialize to an OpenSearch-style sparse dict mapping index strings to values.

        Returns:
            Dict mapping stringified indices to their values.

        Raises:
            ValueError: If values is None (binary sparse vectors not supported).
        """
        if self.values is None:
            raise ValueError("SparseVector.values is None")
        result = {}
        for i, v in zip(self.indices, self.values):
            result[str(i)] = v
        return result

    @staticmethod
    def from_dict(d):
        """Construct a SparseVector from a dict with ``indices`` and optional ``values``.

        Args:
            d: Dict with ``indices`` key and optional ``values`` key.

        Returns:
            A SparseVector instance.
        """
        return SparseVector(d["indices"], d.get("values"))

    def __str__(self):
        return f"SparseVector(indices={self.indices}{'' if self.values is None else f', values={self.values}'})"

    def __repr__(self):
        return str(self)

class MatchTextExpr:
    """Full-text search expression across one or more fields.

    Attributes:
        fields: List of field names (with optional weight suffixes like ``"title^2"``).
        matching_text: The query text to match against.
        topn: Maximum number of results to return.
        extra_options: Backend-specific options dict.
    """
    def __init__(
        self,
        fields: list[str],
        matching_text: str,
        topn: int,
        extra_options: dict | None = None,
    ):
        self.fields = fields
        self.matching_text = matching_text
        self.topn = topn
        self.extra_options = extra_options


class MatchDenseExpr:
    """Dense (KNN) vector similarity search expression.

    Attributes:
        vector_column_name: Name of the vector column to search.
        embedding_data: The query embedding vector.
        embedding_data_type: Data type string (e.g. ``"float"``).
        distance_type: Similarity metric (e.g. ``"cosine"``).
        topn: Maximum number of nearest neighbours to return.
        extra_options: Backend-specific options dict.
    """
    def __init__(
        self,
        vector_column_name: str,
        embedding_data: VEC,
        embedding_data_type: str,
        distance_type: str,
        topn: int = DEFAULT_MATCH_VECTOR_TOPN,
        extra_options: dict | None = None,
    ):
        self.vector_column_name = vector_column_name
        self.embedding_data = embedding_data
        self.embedding_data_type = embedding_data_type
        self.distance_type = distance_type
        self.topn = topn
        self.extra_options = extra_options


class MatchSparseExpr:
    """Sparse vector search expression (e.g. for BM25-style learned sparse retrievers).

    Attributes:
        vector_column_name: Name of the sparse vector column.
        sparse_data: The query sparse vector.
        distance_type: Similarity metric string.
        topn: Maximum number of results.
        opt_params: Optional backend-specific parameters.
    """
    def __init__(
        self,
        vector_column_name: str,
        sparse_data: SparseVector | dict,
        distance_type: str,
        topn: int,
        opt_params: dict | None = None,
    ):
        self.vector_column_name = vector_column_name
        self.sparse_data = sparse_data
        self.distance_type = distance_type
        self.topn = topn
        self.opt_params = opt_params


class MatchTensorExpr:
    """Tensor-based search expression (e.g. for ColBERT late-interaction models).

    Attributes:
        column_name: Name of the tensor column.
        query_data: The query tensor data.
        query_data_type: Data type string.
        topn: Maximum number of results.
        extra_option: Backend-specific options dict.
    """
    def __init__(
        self,
        column_name: str,
        query_data: VEC,
        query_data_type: str,
        topn: int,
        extra_option: dict | None = None,
    ):
        self.column_name = column_name
        self.query_data = query_data
        self.query_data_type = query_data_type
        self.topn = topn
        self.extra_option = extra_option


class FusionExpr:
    """Score fusion expression for combining results from multiple match expressions.

    Attributes:
        method: Fusion algorithm name (e.g. ``"rrf"``, ``"weighted_sum"``).
        topn: Maximum number of fused results.
        fusion_params: Algorithm-specific parameters dict.
    """
    def __init__(self, method: str, topn: int, fusion_params: dict | None = None):
        self.method = method
        self.topn = topn
        self.fusion_params = fusion_params


# Union type for all match expression types
MatchExpr = MatchTextExpr | MatchDenseExpr | MatchSparseExpr | MatchTensorExpr | FusionExpr


class OrderByExpr:
    """Builder for multi-field sort expressions.

    Usage::

        order = OrderByExpr().desc("_score").asc("create_time")
    """
    def __init__(self):
        self.fields = list()
    def asc(self, field: str):
        """Add an ascending sort on *field*.

        Args:
            field: Field name to sort by.

        Returns:
            Self, for method chaining.
        """
        self.fields.append((field, 0))
        return self
    def desc(self, field: str):
        """Add a descending sort on *field*.

        Args:
            field: Field name to sort by.

        Returns:
            Self, for method chaining.
        """
        self.fields.append((field, 1))
        return self
    def fields(self):
        """Return the list of ``(field, direction)`` tuples."""
        return self.fields


class DocStoreConnection(ABC):
    """Abstract base class defining the interface for all document store backends.

    Concrete implementations must provide database lifecycle operations (health,
    create/delete/check index), CRUD operations (search, get, insert, update,
    delete), search-result accessors, and SQL execution.
    """

    """
    Database operations
    """

    @abstractmethod
    def db_type(self) -> str:
        """
        Return the type of the database.
        """
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def health(self) -> dict:
        """
        Return the health status of the database.
        """
        raise NotImplementedError("Not implemented")

    """
    Table operations
    """

    @abstractmethod
    def create_idx(self, index_name: str, dataset_id: str, vector_size: int, parser_id: str = None):
        """
        Create an index with given name
        """
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def delete_idx(self, index_name: str, dataset_id: str):
        """
        Delete an index with given name
        """
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def index_exist(self, index_name: str, dataset_id: str) -> bool:
        """
        Check if an index with given name exists
        """
        raise NotImplementedError("Not implemented")

    """
    CRUD operations
    """

    @abstractmethod
    def search(
        self, select_fields: list[str],
            highlight_fields: list[str],
            condition: dict,
            match_expressions: list[MatchExpr],
            order_by: OrderByExpr,
            offset: int,
            limit: int,
            index_names: str|list[str],
            dataset_ids: list[str],
            agg_fields: list[str] | None = None,
            rank_feature: dict | None = None
    ):
        """
        Search with given conjunctive equivalent filtering condition and return all fields of matched documents
        """
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def get(self, data_id: str, index_name: str, dataset_ids: list[str]) -> dict | None:
        """
        Get single chunk with given id
        """
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def insert(self, rows: list[dict], index_name: str, dataset_id: str = None) -> list[str]:
        """
        Update or insert a bulk of rows
        """
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def update(self, condition: dict, new_value: dict, index_name: str, dataset_id: str) -> bool:
        """
        Update rows with given conjunctive equivalent filtering condition
        """
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def delete(self, condition: dict, index_name: str, dataset_id: str) -> int:
        """
        Delete rows with given conjunctive equivalent filtering condition
        """
        raise NotImplementedError("Not implemented")

    """
    Helper functions for search result
    """

    @abstractmethod
    def get_total(self, res):
        """Return the total number of matching documents from a search result."""
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def get_doc_ids(self, res):
        """Extract document IDs from a search result."""
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def get_fields(self, res, fields: list[str]) -> dict[str, dict]:
        """Extract specified fields from search result documents."""
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def get_highlight(self, res, keywords: list[str], field_name: str):
        """Extract highlighted snippets from search results."""
        raise NotImplementedError("Not implemented")

    @abstractmethod
    def get_aggregation(self, res, field_name: str):
        """Extract aggregation buckets for a field from search results."""
        raise NotImplementedError("Not implemented")

    """
    SQL
    """
    @abstractmethod
    def sql(self, sql: str, fetch_size: int, format: str):
        """
        Run the sql generated by text-to-sql
        """
        raise NotImplementedError("Not implemented")
