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
User, Tenant, and User-Tenant Relationship Service Module

Manages user authentication, tenant organizations, and user-tenant membership.
This module provides three service classes:

- UserService: User account CRUD, authentication (password hashing/verification),
  access token validation with guards against empty/short/invalidated tokens
- TenantService: Tenant information retrieval, credit management, and storage
  gateway selection
- UserTenantService: Many-to-many user-tenant relationships including role
  management, membership listing, and access control
"""
import hashlib
from datetime import datetime
import logging

import peewee
from werkzeug.security import generate_password_hash, check_password_hash

from db import UserTenantRole
from db.db_models import DB, UserTenant
from db.db_models import User, Tenant
from db.services.common_service import CommonService
from common.misc_utils import get_uuid
from common.time_utils import current_timestamp, datetime_format
from common.constants import StatusEnum
from common import settings


class UserService(CommonService):
    """Service class for managing user-related database operations.

    This class extends CommonService to provide specialized functionality for user management,
    including authentication, user creation, updates, and deletions.

    Attributes:
        model: The User model class for database operations.
    """
    model = User

    @classmethod
    @DB.connection_context()
    def query(cls, cols=None, reverse=None, order_by=None, **kwargs):
        """Execute a user query with access token validation guards.

        Overrides the parent query() to add security checks for access_token
        queries. Rejects empty, short (< 32 chars), and invalidated tokens
        to prevent unauthorized access.

        Args:
            cols (list, optional): Columns to select.
            reverse (bool, optional): Sort direction.
            order_by (str, optional): Sort field.
            **kwargs: Filter conditions. Special handling for 'access_token'.

        Returns:
            peewee.ModelSelect: Query result, or an empty result set for
                               invalid access tokens.
        """
        if 'access_token' in kwargs:
            access_token = kwargs['access_token']

            # Reject empty, None, or whitespace-only access tokens
            if not access_token or not str(access_token).strip():
                logging.warning("UserService.query: Rejecting empty access_token query")
                return cls.model.select().where(cls.model.id == "INVALID_EMPTY_TOKEN")  # Returns empty result

            # Reject tokens that are too short (should be UUID, 32+ chars)
            if len(str(access_token).strip()) < 32:
                logging.warning(f"UserService.query: Rejecting short access_token query: {len(str(access_token))} chars")
                return cls.model.select().where(cls.model.id == "INVALID_SHORT_TOKEN")  # Returns empty result

            # Reject tokens that start with "INVALID_" (from logout)
            if str(access_token).startswith("INVALID_"):
                logging.warning("UserService.query: Rejecting invalidated access_token")
                return cls.model.select().where(cls.model.id == "INVALID_LOGOUT_TOKEN")  # Returns empty result

        # Call parent query method for valid requests
        return super().query(cols=cols, reverse=reverse, order_by=order_by, **kwargs)

    @classmethod
    @DB.connection_context()
    def filter_by_id(cls, user_id):
        """Retrieve a user by their ID.

        Args:
            user_id (str): The unique identifier of the user.

        Returns:
            User | None: User object if found, None otherwise.
        """
        try:
            user = cls.model.select().where(cls.model.id == user_id).get()
            return user
        except peewee.DoesNotExist:
            return None

    @classmethod
    @DB.connection_context()
    def query_user(cls, email, password):
        """Authenticate a user with email and password.

        Looks up the user by email (must be valid/active), then verifies
        the password against the stored hash.

        Args:
            email (str): User's email address.
            password (str): User's password in plain text.

        Returns:
            User | None: User object if authentication successful, None otherwise.
        """
        user = cls.model.select().where((cls.model.email == email),
                                        (cls.model.status == StatusEnum.VALID.value)).first()
        if user and check_password_hash(str(user.password), password):
            return user
        else:
            return None

    @classmethod
    @DB.connection_context()
    def query_user_by_email(cls, email):
        """Find all users with a given email address.

        Args:
            email (str): The email address to search for.

        Returns:
            list[User]: List of matching user objects.
        """
        users = cls.model.select().where((cls.model.email == email))
        return list(users)

    @classmethod
    @DB.connection_context()
    def save(cls, **kwargs):
        """Create a new user with auto-generated ID and hashed password.

        Generates a UUID if no ID is provided, hashes the password using
        Werkzeug's generate_password_hash, and sets creation timestamps.

        Args:
            **kwargs: User field values. 'password' will be hashed.

        Returns:
            int: The save result (1 on success).
        """
        if "id" not in kwargs:
            kwargs["id"] = get_uuid()
        if "password" in kwargs:
            kwargs["password"] = generate_password_hash(
                str(kwargs["password"]))

        current_ts = current_timestamp()
        current_date = datetime_format(datetime.now())

        kwargs["create_time"] = current_ts
        kwargs["create_date"] = current_date
        kwargs["update_time"] = current_ts
        kwargs["update_date"] = current_date
        obj = cls.model(**kwargs).save(force_insert=True)
        return obj

    @classmethod
    @DB.connection_context()
    def delete_user(cls, user_ids, update_user_dict):
        """Soft-delete users by setting their status to 0 (invalid).

        Args:
            user_ids (list[str]): List of user IDs to deactivate.
            update_user_dict: Unused parameter (kept for API compatibility).
        """
        with DB.atomic():
            cls.model.update({"status": 0}).where(
                cls.model.id.in_(user_ids)).execute()

    @classmethod
    @DB.connection_context()
    def update_user(cls, user_id, user_dict):
        """Update a user's profile fields.

        Automatically sets update_time and update_date.

        Args:
            user_id (str): The user ID to update.
            user_dict (dict): Dictionary of field values to update.
        """
        with DB.atomic():
            if user_dict:
                user_dict["update_time"] = current_timestamp()
                user_dict["update_date"] = datetime_format(datetime.now())
                cls.model.update(user_dict).where(
                    cls.model.id == user_id).execute()

    @classmethod
    @DB.connection_context()
    def update_user_password(cls, user_id, new_password):
        """Update a user's password with proper hashing.

        Args:
            user_id (str): The user ID whose password to update.
            new_password (str): The new plain-text password to hash and store.
        """
        with DB.atomic():
            update_dict = {
                "password": generate_password_hash(str(new_password)),
                "update_time": current_timestamp(),
                "update_date": datetime_format(datetime.now())
            }
            cls.model.update(update_dict).where(cls.model.id == user_id).execute()

    @classmethod
    @DB.connection_context()
    def is_admin(cls, user_id):
        """Check if a user is a superuser/admin.

        Args:
            user_id (str): The user ID to check.

        Returns:
            bool: True if the user has superuser privileges.
        """
        return cls.model.select().where(
            cls.model.id == user_id,
            cls.model.is_superuser == 1).count() > 0

    @classmethod
    @DB.connection_context()
    def get_all_users(cls):
        """Retrieve all users ordered by email.

        Returns:
            list[User]: List of all user objects.
        """
        users = cls.model.select().order_by(cls.model.email)
        return list(users)


class TenantService(CommonService):
    """Service class for managing tenant-related database operations.

    Handles tenant information retrieval, credit management, storage gateway
    selection, and finding tenants with missing model ID references.

    Attributes:
        model: The Tenant model class for database operations.
    """
    model = Tenant

    @classmethod
    @DB.connection_context()
    def get_info_by(cls, user_id):
        """Get tenant info for a user who is an OWNER of the tenant.

        Joins Tenant with UserTenant to find tenants where the user is
        the owner, returning model configuration and role information.

        Args:
            user_id (str): The user ID to look up.

        Returns:
            list[dict]: List of tenant info dictionaries.
        """
        fields = [
            cls.model.id.alias("tenant_id"),
            cls.model.name,
            cls.model.llm_id,
            cls.model.embd_id,
            cls.model.rerank_id,
            cls.model.asr_id,
            cls.model.img2txt_id,
            cls.model.tts_id,
            cls.model.parser_ids,
            UserTenant.role]
        return list(cls.model.select(*fields)
                    .join(UserTenant, on=((cls.model.id == UserTenant.tenant_id) & (UserTenant.user_id == user_id) & (UserTenant.status == StatusEnum.VALID.value) & (UserTenant.role == UserTenantRole.OWNER)))
                    .where(cls.model.status == StatusEnum.VALID.value).dicts())

    @classmethod
    @DB.connection_context()
    def get_joined_tenants_by_user_id(cls, user_id):
        """Get tenants that a user has joined as a NORMAL member (not owner).

        Args:
            user_id (str): The user ID to look up.

        Returns:
            list[dict]: List of tenant info dictionaries.
        """
        fields = [
            cls.model.id.alias("tenant_id"),
            cls.model.name,
            cls.model.llm_id,
            cls.model.embd_id,
            cls.model.asr_id,
            cls.model.img2txt_id,
            UserTenant.role]
        return list(cls.model.select(*fields)
                    .join(UserTenant, on=((cls.model.id == UserTenant.tenant_id) & (UserTenant.user_id == user_id) & (UserTenant.status == StatusEnum.VALID.value) & (UserTenant.role == UserTenantRole.NORMAL)))
                    .where(cls.model.status == StatusEnum.VALID.value).dicts())

    @classmethod
    @DB.connection_context()
    def decrease(cls, user_id, num):
        """Decrease a tenant's credit balance.

        Args:
            user_id (str): The tenant ID whose credits to decrease.
            num (int): The amount to subtract from the credit balance.

        Raises:
            LookupError: If the tenant is not found.
        """
        num = cls.model.update(credit=cls.model.credit - num).where(
            cls.model.id == user_id).execute()
        if num == 0:
            raise LookupError("Tenant not found which is supposed to be there")

    @classmethod
    @DB.connection_context()
    def user_gateway(cls, tenant_id):
        """Determine the S3 storage gateway index for a tenant.

        Uses SHA-256 hashing of the tenant ID to deterministically select
        one of the available S3 endpoints for load distribution.

        Args:
            tenant_id (str): The tenant ID.

        Returns:
            int: The index into the S3 endpoints array.
        """
        hash_obj = hashlib.sha256(tenant_id.encode("utf-8"))
        return int(hash_obj.hexdigest(), 16)%len(settings.S3)

    @classmethod
    @DB.connection_context()
    def get_null_tenant_model_id_rows(cls):
        """Find tenants with any NULL tenant_model_id reference.

        Used during initialization to backfill missing foreign key references
        to the tenant_llm table.

        Returns:
            list[Tenant]: List of tenant objects with at least one NULL model ID.
        """
        objs = cls.model.select().orwhere(cls.model.tenant_llm_id.is_null(), cls.model.tenant_embd_id.is_null(), cls.model.tenant_asr_id.is_null(), cls.model.tenant_tts_id.is_null(), cls.model.tenant_rerank_id.is_null(), cls.model.tenant_img2txt_id.is_null())
        return list(objs)


class UserTenantService(CommonService):
    """Service class for managing user-tenant relationship operations.

    This class extends CommonService to handle the many-to-many relationship
    between users and tenants, managing user roles and tenant memberships.

    Attributes:
        model: The UserTenant model class for database operations.
    """
    model = UserTenant

    @classmethod
    @DB.connection_context()
    def filter_by_id(cls, user_tenant_id):
        """Get a valid user-tenant relationship by its ID.

        Args:
            user_tenant_id (str): The user-tenant relationship ID.

        Returns:
            UserTenant | None: The relationship record if found and valid.
        """
        try:
            user_tenant = cls.model.select().where((cls.model.id == user_tenant_id) & (cls.model.status == StatusEnum.VALID.value)).get()
            return user_tenant
        except peewee.DoesNotExist:
            return None

    @classmethod
    @DB.connection_context()
    def save(cls, **kwargs):
        """Create a new user-tenant relationship with auto-generated ID.

        Args:
            **kwargs: Relationship field values (tenant_id, user_id, role, etc.).

        Returns:
            int: The save result (1 on success).
        """
        if "id" not in kwargs:
            kwargs["id"] = get_uuid()
        obj = cls.model(**kwargs).save(force_insert=True)
        return obj

    @classmethod
    @DB.connection_context()
    def get_by_tenant_id(cls, tenant_id):
        """Get all non-owner members of a tenant with user details.

        Joins UserTenant with User to provide full member information.
        Excludes OWNER role entries.

        Args:
            tenant_id (str): The tenant ID.

        Returns:
            list[dict]: List of member info dictionaries.
        """
        fields = [
            cls.model.id,
            cls.model.user_id,
            cls.model.status,
            cls.model.role,
            User.nickname,
            User.email,
            User.avatar,
            User.is_authenticated,
            User.is_active,
            User.is_anonymous,
            User.status,
            User.update_date,
            User.is_superuser]
        return list(cls.model.select(*fields)
                    .join(User, on=((cls.model.user_id == User.id) & (cls.model.status == StatusEnum.VALID.value) & (cls.model.role != UserTenantRole.OWNER)))
                    .where(cls.model.tenant_id == tenant_id)
                    .dicts())

    @classmethod
    @DB.connection_context()
    def get_tenants_by_user_id(cls, user_id):
        """Get all tenants a user belongs to, with tenant owner info.

        Args:
            user_id (str): The user ID.

        Returns:
            list[dict]: List of tenant membership dictionaries.
        """
        fields = [
            cls.model.tenant_id,
            cls.model.role,
            User.nickname,
            User.email,
            User.avatar,
            User.update_date
        ]
        return list(cls.model.select(*fields)
                    .join(User, on=((cls.model.tenant_id == User.id) & (UserTenant.user_id == user_id) & (UserTenant.status == StatusEnum.VALID.value)))
                    .where(cls.model.status == StatusEnum.VALID.value).dicts())

    @classmethod
    @DB.connection_context()
    def get_user_tenant_relation_by_user_id(cls, user_id):
        """Get all tenant relationships for a user.

        Args:
            user_id (str): The user ID.

        Returns:
            list[dict]: List of relationship dictionaries with id, user_id,
                       tenant_id, and role.
        """
        fields = [
            cls.model.id,
            cls.model.user_id,
            cls.model.tenant_id,
            cls.model.role
        ]
        return list(cls.model.select(*fields).where(cls.model.user_id == user_id).dicts().dicts())

    @classmethod
    @DB.connection_context()
    def get_num_members(cls, user_id: str):
        """Count the total number of members in a user's tenant.

        Args:
            user_id (str): The tenant owner's user ID (used as tenant_id).

        Returns:
            int: The number of members in the tenant.
        """
        cnt_members = cls.model.select(peewee.fn.COUNT(cls.model.id)).where(cls.model.tenant_id == user_id).scalar()
        return cnt_members

    @classmethod
    @DB.connection_context()
    def filter_by_tenant_and_user_id(cls, tenant_id, user_id):
        """Find a specific user-tenant relationship.

        Args:
            tenant_id (str): The tenant ID.
            user_id (str): The user ID.

        Returns:
            UserTenant | None: The relationship record if found and valid.
        """
        try:
            user_tenant = cls.model.select().where(
                (cls.model.tenant_id == tenant_id) & (cls.model.status == StatusEnum.VALID.value) &
                (cls.model.user_id == user_id)
            ).first()
            return user_tenant
        except peewee.DoesNotExist:
            return None
