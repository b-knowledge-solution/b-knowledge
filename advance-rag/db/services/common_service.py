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
Common Service Module

Provides the base service class (CommonService) that all domain-specific service
classes inherit from. It encapsulates standard CRUD operations, batch processing,
and query utilities built on the Peewee ORM with automatic connection management
and retry logic for transient database errors.

All database operations are wrapped with @DB.connection_context() to ensure
connections are properly acquired and released from the pool.
"""
from datetime import datetime
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import peewee
from peewee import InterfaceError, OperationalError

from db.db_models import DB
from common.misc_utils import get_uuid
from common.time_utils import current_timestamp, datetime_format

def retry_db_operation(func):
    """Decorator that retries a function up to 3 times on transient DB errors.

    Uses exponential backoff (1-5 seconds) and only retries on InterfaceError
    or OperationalError, which typically indicate lost connections.

    Args:
        func: The function to wrap with retry logic.

    Returns:
        A wrapped function with automatic retry behavior.
    """
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((InterfaceError, OperationalError)),
        before_sleep=lambda retry_state: print(f"RETRY {retry_state.attempt_number} TIMES"),
        reraise=True,
    )
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper

class CommonService:
    """Base service class that provides common database operations.

    This class serves as a foundation for all service classes in the application,
    implementing standard CRUD operations and common database query patterns.
    It uses the Peewee ORM for database interactions and provides a consistent
    interface for database operations across all derived service classes.

    Attributes:
        model: The Peewee model class that this service operates on. Must be set by subclasses.
    """

    model = None

    @classmethod
    @DB.connection_context()
    def query(cls, cols=None, reverse=None, order_by=None, **kwargs):
        """Execute a database query with optional column selection and ordering.

        This method provides a flexible way to query the database with various filters
        and sorting options. It supports column selection, sort order control, and
        additional filter conditions.

        Args:
            cols (list, optional): List of column names to select. If None, selects all columns.
            reverse (bool, optional): If True, sorts in descending order. If False, sorts in ascending order.
            order_by (str, optional): Column name to sort results by.
            **kwargs: Additional filter conditions passed as keyword arguments.

        Returns:
            peewee.ModelSelect: A query result containing matching records.
        """
        return cls.model.query(cols=cols, reverse=reverse, order_by=order_by, **kwargs)

    @classmethod
    @DB.connection_context()
    def get_all(cls, cols=None, reverse=None, order_by=None):
        """Retrieve all records from the database with optional column selection and ordering.

        This method fetches all records from the model's table with support for
        column selection and result ordering. If no order_by is specified and reverse
        is True, it defaults to ordering by create_time.

        Args:
            cols (list, optional): List of column names to select. If None, selects all columns.
            reverse (bool, optional): If True, sorts in descending order. If False, sorts in ascending order.
            order_by (str, optional): Column name to sort results by. Defaults to 'create_time' if reverse is specified.

        Returns:
            peewee.ModelSelect: A query containing all matching records.
        """
        if cols:
            query_records = cls.model.select(*cols)
        else:
            query_records = cls.model.select()
        if reverse is not None:
            if not order_by or not hasattr(cls.model, order_by):
                order_by = "create_time"
            if reverse is True:
                query_records = query_records.order_by(cls.model.getter_by(order_by).desc())
            elif reverse is False:
                query_records = query_records.order_by(cls.model.getter_by(order_by).asc())
        return query_records

    @classmethod
    @DB.connection_context()
    def get(cls, **kwargs):
        """Get a single record matching the given criteria.

        Args:
            **kwargs: Filter conditions as keyword arguments.

        Returns:
            Model instance: Single matching record.

        Raises:
            peewee.DoesNotExist: If no matching record is found.
        """
        return cls.model.get(**kwargs)

    @classmethod
    @DB.connection_context()
    def get_or_none(cls, **kwargs):
        """Get a single record or None if not found.

        This method attempts to retrieve a single record matching the given criteria,
        returning None if no match is found instead of raising an exception.

        Args:
            **kwargs: Filter conditions as keyword arguments.

        Returns:
            Model instance or None: Matching record if found, None otherwise.
        """
        try:
            return cls.model.get(**kwargs)
        except peewee.DoesNotExist:
            return None

    @classmethod
    @DB.connection_context()
    def save(cls, **kwargs):
        """Save a new record to database.

        This method creates a new record in the database with the provided field values,
        forcing an insert operation rather than an update.

        Args:
            **kwargs: Record field values as keyword arguments.

        Returns:
            Model instance: The created record object.
        """
        sample_obj = cls.model(**kwargs).save(force_insert=True)
        return sample_obj

    @classmethod
    @DB.connection_context()
    def insert(cls, **kwargs):
        """Insert a new record with automatic ID and timestamps.

        This method creates a new record with automatically generated ID and timestamp fields.
        It handles the creation of create_time, create_date, update_time, and update_date fields.

        Args:
            **kwargs: Record field values as keyword arguments.

        Returns:
            Model instance: The newly created record object.
        """
        if "id" not in kwargs:
            kwargs["id"] = get_uuid()
        timestamp = current_timestamp()
        cur_datetime = datetime_format(datetime.now())
        kwargs["create_time"] = timestamp
        kwargs["create_date"] = cur_datetime
        kwargs["update_time"] = timestamp
        kwargs["update_date"] = cur_datetime
        sample_obj = cls.model(**kwargs).save(force_insert=True)
        return sample_obj

    @classmethod
    @DB.connection_context()
    def insert_many(cls, data_list, batch_size=100):
        """Insert multiple records in batches.

        This method efficiently inserts multiple records into the database using batch processing.
        It automatically sets creation timestamps for all records.

        Args:
            data_list (list): List of dictionaries containing record data to insert.
            batch_size (int, optional): Number of records to insert in each batch. Defaults to 100.
        """
        current_ts = current_timestamp()
        current_datetime = datetime_format(datetime.now())
        with DB.atomic():
            for d in data_list:
                d["create_time"] = current_ts
                d["create_date"] = current_datetime
                d["update_time"] = current_ts
                d["update_date"] = current_datetime

            for i in range(0, len(data_list), batch_size):
                cls.model.insert_many(data_list[i : i + batch_size]).execute()

    @classmethod
    @DB.connection_context()
    def update_many_by_id(cls, data_list):
        """Update multiple records by their IDs.

        This method updates multiple records in the database, identified by their IDs.
        It automatically updates the update_time and update_date fields for each record.

        Args:
            data_list (list): List of dictionaries containing record data to update.
                             Each dictionary must include an 'id' field.
        """

        timestamp = current_timestamp()
        cur_datetime = datetime_format(datetime.now())
        for data in data_list:
            data["update_time"] = timestamp
            data["update_date"] = cur_datetime
        with DB.atomic():
            for data in data_list:
                cls.model.update(data).where(cls.model.id == data["id"]).execute()

    @classmethod
    @DB.connection_context()
    @retry_db_operation
    def update_by_id(cls, pid, data):
        """Update a single record by its primary key ID.

        Automatically sets the update_time and update_date fields. Wrapped
        with retry_db_operation for resilience against transient DB errors.

        Args:
            pid: The primary key ID of the record to update.
            data (dict): Dictionary of field values to update.

        Returns:
            int: Number of records updated (0 or 1).
        """
        data["update_time"] = current_timestamp()
        data["update_date"] = datetime_format(datetime.now())
        num = cls.model.update(data).where(cls.model.id == pid).execute()
        return num

    @classmethod
    @DB.connection_context()
    def get_by_id(cls, pid):
        """Get a record by its primary key ID.

        Args:
            pid: The primary key ID to look up.

        Returns:
            tuple: A tuple of (found: bool, record: Model | None).
                   Returns (True, record) if found, (False, None) otherwise.
        """
        try:
            obj = cls.model.get_or_none(cls.model.id == pid)
            if obj:
                return True, obj
        except Exception:
            pass
        return False, None

    @classmethod
    @DB.connection_context()
    def get_by_ids(cls, pids, cols=None):
        """Get multiple records by their primary key IDs.

        Args:
            pids (list): List of primary key IDs to look up.
            cols (list, optional): List of columns to select. If None, selects all columns.

        Returns:
            peewee.ModelSelect: Query result containing matching records.
        """
        if cols:
            objs = cls.model.select(*cols)
        else:
            objs = cls.model.select()
        return objs.where(cls.model.id.in_(pids))

    @classmethod
    @DB.connection_context()
    def delete_by_id(cls, pid):
        """Delete a single record by its primary key ID.

        Args:
            pid: The primary key ID of the record to delete.

        Returns:
            int: Number of records deleted (0 or 1).
        """
        return cls.model.delete().where(cls.model.id == pid).execute()

    @classmethod
    @DB.connection_context()
    def delete_by_ids(cls, pids):
        """Delete multiple records by their primary key IDs.

        Executes within an atomic transaction for consistency.

        Args:
            pids (list): List of primary key IDs to delete.

        Returns:
            int: Number of records deleted.
        """
        with DB.atomic():
            res = cls.model.delete().where(cls.model.id.in_(pids)).execute()
            return res

    @classmethod
    @DB.connection_context()
    def filter_delete(cls, filters):
        """Delete records matching the given filter conditions.

        Executes within an atomic transaction for consistency.

        Args:
            filters (list): List of Peewee filter expressions.

        Returns:
            int: Number of records deleted.
        """
        with DB.atomic():
            num = cls.model.delete().where(*filters).execute()
            return num

    @classmethod
    @DB.connection_context()
    def filter_update(cls, filters, update_data):
        """Update records matching the given filter conditions.

        Executes within an atomic transaction for consistency.

        Args:
            filters (list): List of Peewee filter expressions.
            update_data (dict): Dictionary of field values to update.

        Returns:
            int: Number of records updated.
        """
        with DB.atomic():
            return cls.model.update(update_data).where(*filters).execute()

    @staticmethod
    def cut_list(tar_list, n):
        """Split a list into chunks of a given size.

        Used to break large IN-clause value lists into smaller batches
        to avoid database query size limits.

        Args:
            tar_list (list): The list to split.
            n (int): Maximum size of each chunk.

        Returns:
            list[tuple]: List of tuples, each containing up to n elements.
        """
        length = len(tar_list)
        arr = range(length)
        result = [tuple(tar_list[x : (x + n)]) for x in arr[::n]]
        return result

    @classmethod
    @DB.connection_context()
    def filter_scope_list(cls, in_key, in_filters_list, filters=None, cols=None):
        """Get records matching an IN clause with optional additional filters.

        Splits the IN-clause values into batches of 20 to avoid query size
        limits, then collects and returns all matching records.

        Args:
            in_key (str): The model attribute name to use for the IN clause.
            in_filters_list (list): List of values for the IN clause.
            filters (list, optional): Additional Peewee filter expressions.
            cols (list, optional): List of columns to select. If None, selects all.

        Returns:
            list: List of matching model instances.
        """
        in_filters_tuple_list = cls.cut_list(in_filters_list, 20)
        if not filters:
            filters = []
        res_list = []
        if cols:
            for i in in_filters_tuple_list:
                query_records = cls.model.select(*cols).where(getattr(cls.model, in_key).in_(i), *filters)
                if query_records:
                    res_list.extend([query_record for query_record in query_records])
        else:
            for i in in_filters_tuple_list:
                query_records = cls.model.select().where(getattr(cls.model, in_key).in_(i), *filters)
                if query_records:
                    res_list.extend([query_record for query_record in query_records])
        return res_list
