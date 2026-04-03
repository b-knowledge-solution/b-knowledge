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

"""Infinity database connection adapter for memory message storage.

This module implements the InfinityConnection singleton class that provides
CRUD operations for memory messages stored in the Infinity database engine.
Infinity is an alternative vector database backend (alongside OpenSearch and
OceanBase) that supports hybrid full-text and dense vector search.

The class handles field name mapping between the application message model
and Infinity's column naming conventions, manages connection pooling, and
constructs queries using the Infinity Python SDK.
"""

import re
import json
import copy
from infinity.common import InfinityException, SortType
from infinity.errors import ErrorCode

from common.decorator import singleton
import pandas as pd
from common.doc_store.doc_store_base import MatchExpr, MatchTextExpr, MatchDenseExpr, FusionExpr, OrderByExpr
from common.doc_store.infinity_conn_base import InfinityConnectionBase
from common.time_utils import date_string_to_timestamp


@singleton
class InfinityConnection(InfinityConnectionBase):
    """Singleton Infinity database connection for memory message CRUD operations.

    Extends InfinityConnectionBase with memory-specific field mappings and query
    construction. Tables are named with a "memory_" prefix and partitioned by
    memory ID (one table per index+memory combination).

    Attributes:
        Inherits connection pool and database name from InfinityConnectionBase.
    """

    def __init__(self):
        """Initialize the Infinity connection with memory-specific mapping configuration."""
        super().__init__(mapping_file_name="message_infinity_mapping.json", table_name_prefix="memory_")

    """
    Dataframe and fields convert
    """

    @staticmethod
    def field_keyword(field_name: str):
        """Check if a field should be treated as a keyword (multi-value) field.

        Args:
            field_name: The field name to check.

        Returns:
            False, as memory messages currently have no keyword fields.
        """
        # no keywords right now
        return False

    @staticmethod
    def convert_message_field_to_infinity(field_name: str, table_fields: list[str]=None):
        """Convert an application-level message field name to its Infinity column name.

        Args:
            field_name: The application field name to convert.
            table_fields: List of actual table column names, required when
                converting "content_embed" to detect the vector column name.

        Returns:
            The corresponding Infinity column name.

        Raises:
            Exception: If converting "content_embed" without table_fields or
                when no matching vector column exists.
        """
        match field_name:
            case "message_type":
                return "message_type_kwd"
            case "status":
                return "status_int"
            case "content_embed":
                # Vector column is named dynamically by dimension (e.g. q_768_vec)
                if not table_fields:
                    raise Exception("Can't convert 'content_embed' to vector field name with empty table fields.")
                vector_field = [tf for tf in table_fields if re.match(r"q_\d+_vec", tf)]
                if not vector_field:
                    raise Exception("Can't convert 'content_embed' to vector field name. No match field name found.")
                return vector_field[0]
            case _:
                return field_name

    @staticmethod
    def convert_infinity_field_to_message(field_name: str):
        """Convert an Infinity column name back to an application-level message field name.

        Args:
            field_name: The Infinity column name to convert.

        Returns:
            The corresponding application-level field name.
        """
        if field_name.startswith("message_type"):
            return "message_type"
        if field_name.startswith("status"):
            return "status"
        # Detect vector columns by their naming pattern
        if re.match(r"q_\d+_vec", field_name):
            return "content_embed"
        return field_name

    def convert_select_fields(self, output_fields: list[str], table_fields: list[str]=None) -> list[str]:
        """Convert a list of application field names to Infinity column names, deduplicating.

        Args:
            output_fields: List of application-level field names.
            table_fields: Optional list of actual table columns for vector field resolution.

        Returns:
            A deduplicated list of Infinity column names.
        """
        return list({self.convert_message_field_to_infinity(f, table_fields) for f in output_fields})

    @staticmethod
    def convert_matching_field(field_weight_str: str) -> str:
        """Convert a matching field specification to Infinity's full-text analyzer format.

        Transforms field names with optional weight suffixes (e.g. "content^2")
        to use Infinity's full-text search analyzer syntax.

        Args:
            field_weight_str: Field name optionally followed by "^weight" (e.g. "content^2").

        Returns:
            The converted field string with Infinity analyzer suffix.
        """
        tokens = field_weight_str.split("^")
        field = tokens[0]
        # Attach the RAG fine-grained full-text analyzer for content fields
        if field == "content":
            field = "content@ft_content_rag_fine"
        tokens[0] = field
        return "^".join(tokens)

    @staticmethod
    def convert_condition_and_order_field(field_name: str):
        """Convert a field name used in conditions or ORDER BY to its Infinity column name.

        Handles date fields that need float-based sorting (e.g. valid_at -> valid_at_flt).

        Args:
            field_name: The application field name.

        Returns:
            The corresponding Infinity column name for conditions/ordering.
        """
        match field_name:
            case "message_type":
                return "message_type_kwd"
            case "status":
                return "status_int"
            case "valid_at":
                return "valid_at_flt"
            case "invalid_at":
                return "invalid_at_flt"
            case "forget_at":
                return "forget_at_flt"
            case _:
                return field_name

    """
    CRUD operations
    """

    def search(
        self,
        select_fields: list[str],
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
        hide_forgotten: bool = True,
    ) -> tuple[pd.DataFrame, int]:
        """Search memory messages using Infinity's hybrid text and vector search.

        Scatters the query across all table partitions (index_name x memory_id),
        gathers results into DataFrames, and merges them sorted by relevance score.

        Known limitation: Infinity returns empty highlights when the query string
        doesn't reference the highlighted field.

        Args:
            select_fields: Fields to include in results.
            highlight_fields: Fields to highlight (limited by Infinity behavior).
            condition: Filter conditions as key-value pairs.
            match_expressions: List of text, dense vector, and fusion expressions.
            order_by: Sort specification for results.
            offset: Pagination offset.
            limit: Maximum number of results.
            index_names: Index name(s) to search.
            memory_ids: Memory IDs to scope the search.
            agg_fields: Optional aggregation fields.
            rank_feature: Optional rank feature config (unused in Infinity).
            hide_forgotten: If True, excludes forgotten messages.

        Returns:
            A tuple of (DataFrame of results, total_hits_count).
        """
        if isinstance(index_names, str):
            index_names = index_names.split(",")
        assert isinstance(index_names, list) and len(index_names) > 0
        inf_conn = self.connPool.get_conn()
        db_instance = inf_conn.get_database(self.dbName)
        df_list = list()
        table_list = list()
        # Add filter to exclude forgotten messages
        if hide_forgotten:
            condition.update({"must_not": {"exists": "forget_at_flt"}})
        output = select_fields.copy()
        if agg_fields is None:
            agg_fields = []
        # Ensure essential fields are always in the output
        for essential_field in ["id"] + agg_fields:
            if essential_field not in output:
                output.append(essential_field)
        # Determine which score function to use based on match expression types
        score_func = ""
        score_column = ""
        for matchExpr in match_expressions:
            if isinstance(matchExpr, MatchTextExpr):
                score_func = "score()"
                score_column = "SCORE"
                break
        if not score_func:
            for matchExpr in match_expressions:
                if isinstance(matchExpr, MatchDenseExpr):
                    score_func = "similarity()"
                    score_column = "SIMILARITY"
                    break
        if match_expressions:
            if score_func not in output:
                output.append(score_func)
        output = [f for f in output if f != "_score"]
        if limit <= 0:
            # ElasticSearch default limit is 10000
            limit = 10000

        # Build filter condition string from the condition dictionary
        filter_cond = None
        filter_fulltext = ""
        if condition:
            condition_dict = {self.convert_condition_and_order_field(k): v for k, v in condition.items()}
            # Find first valid table to build the filter condition against
            table_found = False
            for indexName in index_names:
                for mem_id in memory_ids:
                    table_name = f"{indexName}_{mem_id}"
                    try:
                        filter_cond = self.equivalent_condition_to_str(condition_dict, db_instance.get_table(table_name))
                        table_found = True
                        break
                    except Exception:
                        pass
                if table_found:
                    break
            if not table_found:
                self.logger.error(f"No valid tables found for indexNames {index_names} and memoryIds {memory_ids}")
                return pd.DataFrame(), 0

        # Configure match expressions with filters and scoring options
        for matchExpr in match_expressions:
            if isinstance(matchExpr, MatchTextExpr):
                # Attach filter condition to full-text match for pre-filtering
                if filter_cond and "filter" not in matchExpr.extra_options:
                    matchExpr.extra_options.update({"filter": filter_cond})
                matchExpr.fields = [self.convert_matching_field(field) for field in matchExpr.fields]
                fields = ",".join(matchExpr.fields)
                filter_fulltext = f"filter_fulltext('{fields}', '{matchExpr.matching_text}')"
                if filter_cond:
                    filter_fulltext = f"({filter_cond}) AND {filter_fulltext}"
                # Convert float minimum_should_match to percentage string
                minimum_should_match = matchExpr.extra_options.get("minimum_should_match", 0.0)
                if isinstance(minimum_should_match, float):
                    str_minimum_should_match = str(int(minimum_should_match * 100)) + "%"
                    matchExpr.extra_options["minimum_should_match"] = str_minimum_should_match

                # Ensure all extra_options values are strings for the Infinity SDK
                for k, v in matchExpr.extra_options.items():
                    if not isinstance(v, str):
                        matchExpr.extra_options[k] = str(v)
                self.logger.debug(f"INFINITY search MatchTextExpr: {json.dumps(matchExpr.__dict__)}")
            elif isinstance(matchExpr, MatchDenseExpr):
                # Attach fulltext filter to dense vector search for hybrid filtering
                if filter_fulltext and "filter" not in matchExpr.extra_options:
                    matchExpr.extra_options.update({"filter": filter_fulltext})
                for k, v in matchExpr.extra_options.items():
                    if not isinstance(v, str):
                        matchExpr.extra_options[k] = str(v)
                # Rename "similarity" to "threshold" for Infinity's API
                similarity = matchExpr.extra_options.get("similarity")
                if similarity:
                    matchExpr.extra_options["threshold"] = similarity
                    del matchExpr.extra_options["similarity"]
                self.logger.debug(f"INFINITY search MatchDenseExpr: {json.dumps(matchExpr.__dict__)}")
            elif isinstance(matchExpr, FusionExpr):
                if matchExpr.method == "weighted_sum":
                    # Use "atan" normalization to avoid zero scores for the last document
                    matchExpr.fusion_params["normalize"] = "atan"
                self.logger.debug(f"INFINITY search FusionExpr: {json.dumps(matchExpr.__dict__)}")

        # Convert order_by to Infinity's SortType format
        order_by_expr_list = list()
        if order_by.fields:
            for order_field in order_by.fields:
                order_field_name = self.convert_condition_and_order_field(order_field[0])
                if order_field[1] == 0:
                    order_by_expr_list.append((order_field_name, SortType.Asc))
                else:
                    order_by_expr_list.append((order_field_name, SortType.Desc))

        total_hits_count = 0
        # Scatter search across all table partitions and gather results
        column_name_list = []
        for indexName in index_names:
            for memory_id in memory_ids:
                table_name = f"{indexName}_{memory_id}"
                try:
                    table_instance = db_instance.get_table(table_name)
                except Exception:
                    continue
                table_list.append(table_name)
                # Get column names from first available table for field conversion
                if not column_name_list:
                    column_name_list = [r[0] for r in table_instance.show_columns().rows()]
                output = self.convert_select_fields(output, column_name_list)
                builder = table_instance.output(output)
                if len(match_expressions) > 0:
                    # Chain match expressions to the query builder
                    for matchExpr in match_expressions:
                        if isinstance(matchExpr, MatchTextExpr):
                            fields = ",".join(matchExpr.fields)
                            builder = builder.match_text(
                                fields,
                                matchExpr.matching_text,
                                matchExpr.topn,
                                matchExpr.extra_options.copy(),
                            )
                        elif isinstance(matchExpr, MatchDenseExpr):
                            builder = builder.match_dense(
                                matchExpr.vector_column_name,
                                matchExpr.embedding_data,
                                matchExpr.embedding_data_type,
                                matchExpr.distance_type,
                                matchExpr.topn,
                                matchExpr.extra_options.copy(),
                            )
                        elif isinstance(matchExpr, FusionExpr):
                            builder = builder.fusion(matchExpr.method, matchExpr.topn, matchExpr.fusion_params)
                else:
                    # No match expressions: apply filter-only mode
                    if filter_cond and len(filter_cond) > 0:
                        builder.filter(filter_cond)
                if order_by.fields:
                    builder.sort(order_by_expr_list)
                builder.offset(offset).limit(limit)
                mem_res, extra_result = builder.option({"total_hits_count": True}).to_df()
                if extra_result:
                    total_hits_count += int(extra_result["total_hits_count"])
                self.logger.debug(f"INFINITY search table: {str(table_name)}, result: {str(mem_res)}")
                df_list.append(mem_res)
        self.connPool.release_conn(inf_conn)
        # Merge results from all partitions
        res = self.concat_dataframes(df_list, output)
        # Sort merged results by relevance score in descending order
        if match_expressions:
            res["_score"] = res[score_column]
            res = res.sort_values(by="_score", ascending=False).reset_index(drop=True)
            res = res.head(limit)
        self.logger.debug(f"INFINITY search final result: {str(res)}")
        return res, total_hits_count

    def get_forgotten_messages(self, select_fields: list[str], index_name: str, memory_id: str, limit: int=512):
        """Retrieve messages marked as forgotten, ordered oldest first.

        Args:
            select_fields: Fields to include in results.
            index_name: The base index name.
            memory_id: The memory ID to filter by.
            limit: Maximum number of results.

        Returns:
            A DataFrame of forgotten messages.
        """
        condition = {"memory_id": memory_id, "exists": "forget_at_flt"}
        order_by = OrderByExpr()
        order_by.asc("forget_at_flt")
        # Acquire connection and build query
        inf_conn = self.connPool.get_conn()
        db_instance = inf_conn.get_database(self.dbName)
        table_name = f"{index_name}_{memory_id}"
        table_instance = db_instance.get_table(table_name)
        column_name_list = [r[0] for r in table_instance.show_columns().rows()]
        output_fields = [self.convert_message_field_to_infinity(f, column_name_list) for f in select_fields]
        builder = table_instance.output(output_fields)
        filter_cond = self.equivalent_condition_to_str(condition, db_instance.get_table(table_name))
        builder.filter(filter_cond)
        # Convert order_by to Infinity SortType tuples
        order_by_expr_list = list()
        if order_by.fields:
            for order_field in order_by.fields:
                order_field_name = self.convert_condition_and_order_field(order_field[0])
                if order_field[1] == 0:
                    order_by_expr_list.append((order_field_name, SortType.Asc))
                else:
                    order_by_expr_list.append((order_field_name, SortType.Desc))
        builder.sort(order_by_expr_list)
        builder.offset(0).limit(limit)
        mem_res, _ = builder.option({"total_hits_count": True}).to_df()
        res = self.concat_dataframes(mem_res, output_fields)
        res.head(limit)
        self.connPool.release_conn(inf_conn)
        return res

    def get_missing_field_message(self, select_fields: list[str], index_name: str, memory_id: str, field_name: str, limit: int=512):
        """Retrieve messages that are missing a specific field.

        Args:
            select_fields: Fields to include in results.
            index_name: The base index name.
            memory_id: The memory ID to filter by.
            field_name: The field that must be absent from matching documents.
            limit: Maximum number of results.

        Returns:
            A DataFrame of messages missing the specified field.
        """
        condition = {"memory_id": memory_id, "must_not": {"exists": field_name}}
        order_by = OrderByExpr()
        order_by.asc("valid_at_flt")
        # Acquire connection and build query
        inf_conn = self.connPool.get_conn()
        db_instance = inf_conn.get_database(self.dbName)
        table_name = f"{index_name}_{memory_id}"
        table_instance = db_instance.get_table(table_name)
        column_name_list = [r[0] for r in table_instance.show_columns().rows()]
        output_fields = [self.convert_message_field_to_infinity(f, column_name_list) for f in select_fields]
        builder = table_instance.output(output_fields)
        filter_cond = self.equivalent_condition_to_str(condition, db_instance.get_table(table_name))
        builder.filter(filter_cond)
        # Convert order_by to Infinity SortType tuples
        order_by_expr_list = list()
        if order_by.fields:
            for order_field in order_by.fields:
                order_field_name = self.convert_condition_and_order_field(order_field[0])
                if order_field[1] == 0:
                    order_by_expr_list.append((order_field_name, SortType.Asc))
                else:
                    order_by_expr_list.append((order_field_name, SortType.Desc))
        builder.sort(order_by_expr_list)
        builder.offset(0).limit(limit)
        mem_res, _ = builder.option({"total_hits_count": True}).to_df()
        res = self.concat_dataframes(mem_res, output_fields)
        res.head(limit)
        self.connPool.release_conn(inf_conn)
        return res

    def get(self, message_id: str, index_name: str, memory_ids: list[str]) -> dict | None:
        """Retrieve a single message by its ID, searching across all memory partitions.

        Args:
            message_id: The message document ID to look up.
            index_name: The base index name.
            memory_ids: List of memory IDs whose tables to search.

        Returns:
            A dict of message fields if found, or an empty dict if not found.
        """
        inf_conn = self.connPool.get_conn()
        db_instance = inf_conn.get_database(self.dbName)
        df_list = list()
        assert isinstance(memory_ids, list)
        table_list = list()
        for memoryId in memory_ids:
            table_name = f"{index_name}_{memoryId}"
            table_list.append(table_name)
            try:
                table_instance = db_instance.get_table(table_name)
            except Exception:
                self.logger.warning(f"Table not found: {table_name}, this memory isn't created in Infinity. Maybe it is created in other document engine.")
                continue
            mem_res, _ = table_instance.output(["*"]).filter(f"id = '{message_id}'").to_df()
            self.logger.debug(f"INFINITY get table: {str(table_list)}, result: {str(mem_res)}")
            df_list.append(mem_res)
        self.connPool.release_conn(inf_conn)
        res = self.concat_dataframes(df_list, ["id"])
        fields = set(res.columns.tolist())
        res_fields = self.get_fields(res, list(fields))
        # Convert Infinity field names back to application-level names
        return {self.convert_infinity_field_to_message(k): v for k, v in res_fields[message_id].items()} if res_fields.get(message_id) else {}

    def insert(self, documents: list[dict], index_name: str, memory_id: str = None) -> list[str]:
        """Insert message documents into Infinity, creating the table if needed.

        Converts application-level fields to Infinity columns, handles date-to-timestamp
        conversion, and fills missing embedding columns with zero vectors.

        Args:
            documents: List of message dictionaries to insert.
            index_name: The base index name.
            memory_id: The memory ID for table partitioning.

        Returns:
            A list of error strings. Empty list means all inserts succeeded.

        Raises:
            ValueError: If the table doesn't exist and vector size can't be inferred.
        """
        if not documents:
            return []
        inf_conn = self.connPool.get_conn()
        db_instance = inf_conn.get_database(self.dbName)
        table_name = f"{index_name}_{memory_id}"
        vector_size = int(len(documents[0]["content_embed"]))
        try:
            table_instance = db_instance.get_table(table_name)
        except InfinityException as e:
            # Table doesn't exist yet - create it with the inferred vector size
            # src/common/status.cppm, kTableNotExist = 3022
            if e.error_code != ErrorCode.TABLE_NOT_EXIST:
                raise
            if vector_size == 0:
                raise ValueError("Cannot infer vector size from documents")
            self.create_idx(index_name, memory_id, vector_size)
            table_instance = db_instance.get_table(table_name)

        # Detect embedding columns and their sizes for zero-fill of missing vectors
        embedding_columns = []
        table_columns = table_instance.show_columns().rows()
        for n, ty, _, _ in table_columns:
            r = re.search(r"Embedding\([a-z]+,([0-9]+)\)", ty)
            if not r:
                continue
            embedding_columns.append((n, int(r.group(1))))

        docs = copy.deepcopy(documents)
        for d in docs:
            assert "_id" not in d
            assert "id" in d
            for k, v in list(d.items()):
                if k == "content_embed":
                    # Rename to dimension-prefixed vector column
                    d[f"q_{vector_size}_vec"] = d["content_embed"]
                    d.pop("content_embed")
                    continue
                field_name = self.convert_message_field_to_infinity(k)
                # Convert date strings to float timestamps for sortable date fields
                if field_name in ["valid_at", "invalid_at", "forget_at"]:
                    d[f"{field_name}_flt"] = date_string_to_timestamp(v) if v else 0
                    if v is None:
                        d[field_name] = ""
                elif self.field_keyword(k):
                    if isinstance(v, list):
                        d[k] = "###".join(v)
                    else:
                        d[k] = v
                elif k == "memory_id":
                    # Infinity requires string, not list
                    if isinstance(d[k], list):
                        d[k] = d[k][0]  # since d[k] is a list, but we need a str
                else:
                    d[field_name] = v
                # Remove the original key if it was renamed
                if k != field_name:
                    d.pop(k)

            # Fill missing embedding columns with zero vectors to satisfy schema
            for n, vs in embedding_columns:
                if n in d:
                    continue
                d[n] = [0] * vs
        # Delete existing documents with same IDs before re-inserting (upsert behavior)
        ids = ["'{}'".format(d["id"]) for d in docs]
        str_ids = ", ".join(ids)
        str_filter = f"id IN ({str_ids})"
        table_instance.delete(str_filter)
        table_instance.insert(docs)
        self.connPool.release_conn(inf_conn)
        self.logger.debug(f"INFINITY inserted into {table_name} {str_ids}.")
        return []

    def update(self, condition: dict, new_value: dict, index_name: str, memory_id: str) -> bool:
        """Update message documents matching the given condition.

        Args:
            condition: Filter criteria to identify documents to update.
            new_value: Dictionary of field-value pairs to set.
            index_name: The base index name.
            memory_id: The memory ID for table partitioning.

        Returns:
            True if the update completed (Infinity updates are synchronous).
        """
        inf_conn = self.connPool.get_conn()
        db_instance = inf_conn.get_database(self.dbName)
        table_name = f"{index_name}_{memory_id}"
        table_instance = db_instance.get_table(table_name)

        # Get table column metadata for type-aware updates
        columns = {}
        if table_instance:
            for n, ty, de, _ in table_instance.show_columns().rows():
                columns[n] = (ty, de)
        condition_dict = {self.convert_condition_and_order_field(k): v for k, v in condition.items()}
        filter = self.equivalent_condition_to_str(condition_dict, table_instance)
        update_dict = {self.convert_message_field_to_infinity(k): v for k, v in new_value.items()}
        # Convert date strings to float timestamps for date fields
        date_floats = {}
        for k, v in update_dict.items():
            if k in ["valid_at", "invalid_at", "forget_at"]:
                date_floats[f"{k}_flt"] = date_string_to_timestamp(v) if v else 0
            elif self.field_keyword(k):
                if isinstance(v, list):
                    update_dict[k] = "###".join(v)
                else:
                    update_dict[k] = v
            elif k == "memory_id":
                if isinstance(update_dict[k], list):
                    update_dict[k] = update_dict[k][0]  # since d[k] is a list, but we need a str
            else:
                update_dict[k] = v
        if date_floats:
            update_dict.update(date_floats)

        self.logger.debug(f"INFINITY update table {table_name}, filter {filter}, newValue {new_value}.")
        table_instance.update(filter, update_dict)
        self.connPool.release_conn(inf_conn)
        return True

    """
    Helper functions for search result
    """

    def get_fields(self, res: tuple[pd.DataFrame, int] | pd.DataFrame, fields: list[str]) -> dict[str, dict]:
        """Extract specified fields from Infinity search results (DataFrame).

        Handles case-insensitive column matching and converts Infinity field names
        back to application-level names. Keyword fields are split by "###" separator.

        Args:
            res: Either a DataFrame or a (DataFrame, count) tuple from search.
            fields: List of field names to extract.

        Returns:
            A dict mapping document IDs to dicts of their requested field values.
        """
        if isinstance(res, tuple):
            res_df = res[0]
        else:
            res_df = res
        if not fields:
            return {}
        fields_all = fields.copy()
        fields_all.append("id")
        fields_all = self.convert_select_fields(fields_all, res_df.columns.tolist())

        # Case-insensitive column matching to handle Infinity's column name casing
        column_map = {col.lower(): col for col in res_df.columns}
        matched_columns = {column_map[col.lower()]: col for col in fields_all if col.lower() in column_map}
        none_columns = [col for col in fields_all if col.lower() not in column_map]

        selected_res = res_df[matched_columns.keys()]
        selected_res = selected_res.rename(columns=matched_columns)
        selected_res.drop_duplicates(subset=["id"], inplace=True)

        # Split keyword fields that use "###" as a multi-value separator
        for column in list(selected_res.columns):
            k = column.lower()
            if self.field_keyword(k):
                selected_res[column] = selected_res[column].apply(lambda v: [kwd for kwd in v.split("###") if kwd])
            else:
                pass

        # Add None for columns not found in the DataFrame
        for column in none_columns:
            selected_res[column] = None

        res_dict = selected_res.set_index("id").to_dict(orient="index")
        # Convert all field names back to application-level names
        return {_id: {self.convert_infinity_field_to_message(k): v for k, v in doc.items()} for _id, doc in res_dict.items()}
