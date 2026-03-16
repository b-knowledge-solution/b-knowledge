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
Langfuse Integration Service

Manages per-tenant Langfuse observability configuration. Langfuse is used for
LLM call tracing, token usage tracking, and generation logging. Each tenant
can configure their own Langfuse instance with a host, public key, and secret
key. This service provides CRUD operations for those credentials.
"""

from datetime import datetime

import peewee

from db.db_models import DB, TenantLangfuse
from db.services.common_service import CommonService
from common.time_utils import current_timestamp, datetime_format


class TenantLangfuseService(CommonService):
    """Service for managing tenant-specific Langfuse observability credentials.

    All methods that modify state are enclosed within a DB.atomic() context
    or connection context to ensure atomicity and data integrity.

    Attributes:
        model: The TenantLangfuse Peewee model.
    """

    model = TenantLangfuse

    @classmethod
    @DB.connection_context()
    def filter_by_tenant(cls, tenant_id):
        """Retrieve Langfuse credentials for a tenant as a model instance.

        Args:
            tenant_id (str): The tenant ID to look up.

        Returns:
            TenantLangfuse | None: The Langfuse configuration model if found, None otherwise.
        """
        fields = [cls.model.tenant_id, cls.model.host, cls.model.secret_key, cls.model.public_key]
        try:
            keys = cls.model.select(*fields).where(cls.model.tenant_id == tenant_id).first()
            return keys
        except peewee.DoesNotExist:
            return None

    @classmethod
    @DB.connection_context()
    def filter_by_tenant_with_info(cls, tenant_id):
        """Retrieve Langfuse credentials for a tenant as a dictionary.

        Args:
            tenant_id (str): The tenant ID to look up.

        Returns:
            dict | None: Dictionary with tenant_id, host, secret_key, public_key
                        if found, None otherwise.
        """
        fields = [cls.model.tenant_id, cls.model.host, cls.model.secret_key, cls.model.public_key]
        try:
            keys = cls.model.select(*fields).where(cls.model.tenant_id == tenant_id).dicts().first()
            return keys
        except peewee.DoesNotExist:
            return None

    @classmethod
    @DB.connection_context()
    def delete_ty_tenant_id(cls, tenant_id):
        """Delete Langfuse configuration for a tenant.

        Args:
            tenant_id (str): The tenant ID whose configuration should be removed.

        Returns:
            int: Number of records deleted.
        """
        return cls.model.delete().where(cls.model.tenant_id == tenant_id).execute()

    @classmethod
    def update_by_tenant(cls, tenant_id, langfuse_keys):
        """Update Langfuse credentials for a tenant.

        Automatically sets the update_time and update_date fields.

        Args:
            tenant_id (str): The tenant ID to update.
            langfuse_keys (dict): Dictionary of Langfuse credential fields to update.

        Returns:
            int: Number of records updated.
        """
        langfuse_keys["update_time"] = current_timestamp()
        langfuse_keys["update_date"] = datetime_format(datetime.now())
        return cls.model.update(**langfuse_keys).where(cls.model.tenant_id == tenant_id).execute()

    @classmethod
    def save(cls, **kwargs):
        """Create a new Langfuse configuration record.

        Automatically sets creation and update timestamps.

        Args:
            **kwargs: Field values for the new record (tenant_id, host,
                     secret_key, public_key).

        Returns:
            TenantLangfuse: The created model instance.
        """
        current_ts = current_timestamp()
        current_date = datetime_format(datetime.now())

        kwargs["create_time"] = current_ts
        kwargs["create_date"] = current_date
        kwargs["update_time"] = current_ts
        kwargs["update_date"] = current_date
        obj = cls.model.create(**kwargs)
        return obj

    @classmethod
    def delete_model(cls, langfuse_model):
        """Delete a specific Langfuse model instance.

        Args:
            langfuse_model (TenantLangfuse): The model instance to delete.
        """
        langfuse_model.delete_instance()
