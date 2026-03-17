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
Database Utility Functions

Provides helper functions for common database operations including bulk inserts,
dynamic model generation, dictionary-to-expression query conversion, and
general-purpose querying with pagination and ordering support. These utilities
abstract away repetitive Peewee ORM patterns used across the service layer.
"""
import operator
from functools import reduce

from playhouse.pool import PooledMySQLDatabase

from common.time_utils import current_timestamp, timestamp_to_date

from db.db_models import DB, DataBaseModel


@DB.connection_context()
def bulk_insert_into_db(model, data_source, replace_on_conflict=False):
    """Bulk insert records into the database with optional upsert behavior.

    Creates the target table if it does not exist, then inserts the provided
    data in batches of 1000 records. Each record is automatically timestamped
    with create/update times.

    Args:
        model: The Peewee model class to insert into.
        data_source (list[dict]): List of dictionaries containing record data.
        replace_on_conflict (bool): If True, existing records are updated on
            primary key conflict instead of raising an error.
    """
    DB.create_tables([model])

    if not data_source:
        return

    # Stamp each record with creation and update timestamps
    for i, data in enumerate(data_source):
        current_time = current_timestamp() + i
        current_date = timestamp_to_date(current_time)
        if 'create_time' not in data:
            data['create_time'] = current_time
        data['create_date'] = timestamp_to_date(data['create_time'])
        data['update_time'] = current_time
        data['update_date'] = current_date

    # Determine which fields to preserve on conflict (all except creation timestamps)
    preserve = tuple(data_source[0].keys() - {'create_time', 'create_date'})

    batch_size = 1000

    # Insert in batches within atomic transactions for efficiency
    for i in range(0, len(data_source), batch_size):
        with DB.atomic():
            query = model.insert_many(data_source[i:i + batch_size])
            if replace_on_conflict:
                if isinstance(DB, PooledMySQLDatabase):
                    query = query.on_conflict(preserve=preserve)
                else:
                    # PostgreSQL requires explicit conflict target
                    query = query.on_conflict(conflict_target="id", preserve=preserve)
            query.execute()


def get_dynamic_db_model(base, job_id):
    """Create a dynamic database model based on a job ID.

    Generates a model type that targets a table indexed by the first 8
    characters of the job ID, used for partitioned/sharded task tracking.

    Args:
        base: The base model class providing the model() factory method.
        job_id (str): The job identifier used to derive the table index.

    Returns:
        type: A new model class targeting the job-specific table.
    """
    return type(base.model(
        table_index=get_dynamic_tracking_table_index(job_id=job_id)))


def get_dynamic_tracking_table_index(job_id):
    """Extract a table index from a job ID.

    Uses the first 8 characters of the job ID as a short hash-like index
    for partitioned table naming.

    Args:
        job_id (str): The job identifier.

    Returns:
        str: The first 8 characters of the job ID.
    """
    return job_id[:8]


def fill_db_model_object(model_object, human_model_dict):
    """Populate a model object's fields from a human-readable dictionary.

    Maps dictionary keys to model attributes by prefixing them with 'f_'
    (the field name convention used in some models).

    Args:
        model_object: The Peewee model instance to populate.
        human_model_dict (dict): Dictionary of field name -> value pairs
            (without the 'f_' prefix).

    Returns:
        The populated model object.
    """
    for k, v in human_model_dict.items():
        attr_name = 'f_%s' % k
        if hasattr(model_object.__class__, attr_name):
            setattr(model_object, attr_name, v)
    return model_object


# https://docs.peewee-orm.com/en/latest/peewee/query_operators.html
supported_operators = {
    '==': operator.eq,
    '<': operator.lt,
    '<=': operator.le,
    '>': operator.gt,
    '>=': operator.ge,
    '!=': operator.ne,
    '<<': operator.lshift,
    '>>': operator.rshift,
    '%': operator.mod,
    '**': operator.pow,
    '^': operator.xor,
    '~': operator.inv,
}


def query_dict2expression(
        model: type[DataBaseModel], query: dict[str, bool | int | str | list | tuple]):
    """Convert a dictionary of query conditions into Peewee filter expressions.

    Each dictionary entry maps a field name to either a plain value (implying
    equality) or a tuple of (operator, value) for other comparisons. Field
    names are automatically prefixed with 'f_' to match model conventions.

    Args:
        model (type[DataBaseModel]): The model class to build expressions for.
        query (dict): Dictionary mapping field names to values or (operator, value) tuples.

    Returns:
        peewee.Expression: A combined AND expression of all filter conditions.
    """
    expression = []

    for field, value in query.items():
        # If value is not a list/tuple, treat it as an equality check
        if not isinstance(value, (list, tuple)):
            value = ('==', value)
        op, *val = value

        # Resolve the field on the model (with f_ prefix)
        field = getattr(model, f'f_{field}')
        # Apply the operator: use Python operator if found, otherwise call method by name
        value = supported_operators[op](
            field, val[0]) if op in supported_operators else getattr(
            field, op)(
            *val)
        expression.append(value)

    # Combine all expressions with AND
    return reduce(operator.iand, expression)


def query_db(model: type[DataBaseModel], limit: int = 0, offset: int = 0,
             query: dict = None, order_by: str | list | tuple | None = None):
    """Execute a general-purpose database query with filtering, ordering, and pagination.

    Args:
        model (type[DataBaseModel]): The model class to query.
        limit (int): Maximum number of records to return. 0 means no limit.
        offset (int): Number of records to skip. 0 means no offset.
        query (dict, optional): Filter conditions as field_name -> value mappings.
        order_by (str | list | tuple | None): Field to order by, optionally
            as a tuple of (field_name, direction) where direction is 'asc' or 'desc'.
            Defaults to ('create_time', 'asc').

    Returns:
        tuple: A tuple of (results_list, total_count) where results_list contains
            the matching model instances and total_count is the unfiltered count
            after WHERE but before LIMIT/OFFSET.
    """
    data = model.select()
    if query:
        data = data.where(query_dict2expression(model, query))
    count = data.count()

    # Normalize order_by into (field_name, direction) format
    if not order_by:
        order_by = 'create_time'
    if not isinstance(order_by, (list, tuple)):
        order_by = (order_by, 'asc')
    order_by, order = order_by
    # Resolve the field on the model and apply sort direction
    order_by = getattr(model, f'f_{order_by}')
    order_by = getattr(order_by, order)()
    data = data.order_by(order_by)

    if limit > 0:
        data = data.limit(limit)
    if offset > 0:
        data = data.offset(offset)

    return list(data), count
