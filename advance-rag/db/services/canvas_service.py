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
Canvas Service Module

Manages agent canvas (workflow) templates and user-created canvases. Canvases
represent visual workflow definitions (agents and dataflow pipelines) that
define document processing logic. This module provides CRUD operations,
access control checks, and tenant-scoped listing with search and pagination.
"""
import logging
from db import CanvasCategory, TenantPermission
from db.db_models import DB, CanvasTemplate, User, UserCanvas, UserCanvasVersion
from db.services.common_service import CommonService
from peewee import fn


class CanvasTemplateService(CommonService):
    """Service for managing pre-built canvas templates.

    Templates are system-defined workflow blueprints that users can clone
    to create their own canvases.

    Attributes:
        model: The CanvasTemplate Peewee model.
    """
    model = CanvasTemplate

class DataFlowTemplateService(CommonService):
    """Alias of CanvasTemplateService for dataflow-specific template operations.

    Attributes:
        model: The CanvasTemplate Peewee model.
    """
    model = CanvasTemplate


class UserCanvasService(CommonService):
    """Service for managing user-created canvases (agents and dataflow pipelines).

    Supports listing with pagination, access control verification, and
    tenant-scoped queries with keyword search.

    Attributes:
        model: The UserCanvas Peewee model.
    """
    model = UserCanvas

    @classmethod
    @DB.connection_context()
    def get_list(cls, tenant_id,
                 page_number, items_per_page, orderby, desc, id, title, canvas_category=CanvasCategory.Agent):
        """List canvases for a tenant with filtering, ordering, and pagination.

        Args:
            tenant_id (str): The tenant/user ID to filter by.
            page_number (int): Page number for pagination.
            items_per_page (int): Number of items per page.
            orderby (str): Field name to sort by.
            desc (bool): If True, sort descending; otherwise ascending.
            id (str, optional): Filter by specific canvas ID.
            title (str, optional): Filter by exact title match.
            canvas_category (CanvasCategory): Category filter (Agent or DataFlow).

        Returns:
            list[dict]: List of canvas records as dictionaries.
        """
        agents = cls.model.select()
        if id:
            agents = agents.where(cls.model.id == id)
        if title:
            agents = agents.where(cls.model.title == title)
        agents = agents.where(cls.model.user_id == tenant_id)
        agents = agents.where(cls.model.canvas_category == canvas_category)
        if desc:
            agents = agents.order_by(cls.model.getter_by(orderby).desc())
        else:
            agents = agents.order_by(cls.model.getter_by(orderby).asc())

        agents = agents.paginate(page_number, items_per_page)

        return list(agents.dicts())

    @classmethod
    @DB.connection_context()
    def get_all_agents_by_tenant_ids(cls, tenant_ids, user_id):
        """Get all permitted canvases across multiple tenants.

        Returns team-visible canvases from specified tenants plus all canvases
        owned by the user. Results are batched to avoid deep pagination issues.

        Args:
            tenant_ids (list[str]): List of tenant IDs for team-visible canvases.
            user_id (str): The current user's ID for owned canvases.

        Returns:
            list[dict]: List of canvas records as dictionaries.
        """
        fields = [
            cls.model.id,
            cls.model.avatar,
            cls.model.title,
            cls.model.permission,
            cls.model.canvas_type,
            cls.model.canvas_category
        ]
        # Find team canvases and owned canvases
        agents = cls.model.select(*fields).where(
            (cls.model.user_id.in_(tenant_ids) & (cls.model.permission == TenantPermission.TEAM.value)) | (
                cls.model.user_id == user_id
            )
        )
        # Sort by creation time ascending
        agents.order_by(cls.model.create_time.asc())
        # Batch retrieval to avoid deep pagination performance issues
        offset, limit = 0, 50
        res = []
        while True:
            ag_batch = agents.offset(offset).limit(limit)
            _temp = list(ag_batch.dicts())
            if not _temp:
                break
            res.extend(_temp)
            offset += limit
        return res

    @classmethod
    @DB.connection_context()
    def get_by_canvas_id(cls, pid):
        """Get detailed canvas information by ID, including owner details.

        Args:
            pid (str): The canvas ID to look up.

        Returns:
            tuple: A tuple of (success: bool, canvas_dict: dict | None).
        """
        try:

            fields = [
                cls.model.id,
                cls.model.avatar,
                cls.model.title,
                cls.model.dsl,
                cls.model.description,
                cls.model.permission,
                cls.model.update_time,
                cls.model.user_id,
                cls.model.create_time,
                cls.model.create_date,
                cls.model.update_date,
                cls.model.canvas_category,
                User.nickname,
                User.avatar.alias('tenant_avatar'),
            ]
            agents = cls.model.select(*fields) \
            .join(User, on=(cls.model.user_id == User.id)) \
            .where(cls.model.id == pid)
            return True, agents.dicts()[0]
        except Exception as e:
            logging.exception(e)
            return False, None

    @classmethod
    @DB.connection_context()
    def get_basic_info_by_canvas_ids(cls, canvas_id):
        """Get basic canvas info for multiple canvas IDs.

        Args:
            canvas_id (list[str]): List of canvas IDs to look up.

        Returns:
            peewee.ModelSelect: Query result with basic canvas fields.
        """
        fields = [
            cls.model.id,
            cls.model.avatar,
            cls.model.user_id,
            cls.model.title,
            cls.model.permission,
            cls.model.canvas_category
        ]
        return cls.model.select(*fields).where(cls.model.id.in_(canvas_id)).dicts()

    @classmethod
    @DB.connection_context()
    def get_by_tenant_ids(cls, joined_tenant_ids, user_id,
                          page_number, items_per_page,
                          orderby, desc, keywords, canvas_category=None
                          ):
        """List canvases across tenants with search, filtering, and pagination.

        Returns canvases visible to the user: team-visible canvases from joined
        tenants plus the user's own canvases.

        Args:
            joined_tenant_ids (list[str]): Tenant IDs the user has joined.
            user_id (str): The current user's ID.
            page_number (int): Page number for pagination.
            items_per_page (int): Number of items per page.
            orderby (str): Field name to sort by.
            desc (bool): If True, sort descending.
            keywords (str): Search string for title filtering.
            canvas_category (str, optional): Filter by canvas category.

        Returns:
            tuple: A tuple of (canvas_list: list[dict], total_count: int).
        """
        fields = [
            cls.model.id,
            cls.model.avatar,
            cls.model.title,
            cls.model.description,
            cls.model.permission,
            cls.model.user_id.alias("tenant_id"),
            User.nickname,
            User.avatar.alias('tenant_avatar'),
            cls.model.update_time,
            cls.model.canvas_category,
        ]
        if keywords:
            agents = cls.model.select(*fields).join(User, on=(cls.model.user_id == User.id)).where(
                (((cls.model.user_id.in_(joined_tenant_ids)) & (cls.model.permission == TenantPermission.TEAM.value)) | (cls.model.user_id == user_id)),
                (fn.LOWER(cls.model.title).contains(keywords.lower()))
            )
        else:
            agents = cls.model.select(*fields).join(User, on=(cls.model.user_id == User.id)).where(
                (((cls.model.user_id.in_(joined_tenant_ids)) & (cls.model.permission == TenantPermission.TEAM.value)) | (cls.model.user_id == user_id))
            )
        if canvas_category:
            agents = agents.where(cls.model.canvas_category == canvas_category)
        if desc:
            agents = agents.order_by(cls.model.getter_by(orderby).desc())
        else:
            agents = agents.order_by(cls.model.getter_by(orderby).asc())

        count = agents.count()
        if page_number and items_per_page:
            agents = agents.paginate(page_number, items_per_page)

        agents_list = list(agents.dicts())

        # Enrich each canvas with its latest release time for UI display
        if agents_list:
            canvas_ids = [a['id'] for a in agents_list]
            release_times = (
                UserCanvasVersion.select(
                    UserCanvasVersion.user_canvas_id,
                    fn.MAX(UserCanvasVersion.create_time).alias("release_time"),
                )
                .where(
                    (UserCanvasVersion.user_canvas_id.in_(canvas_ids))
                    & (UserCanvasVersion.release)
                )
                .group_by(UserCanvasVersion.user_canvas_id)
            )
            release_time_map = {r.user_canvas_id: r.release_time for r in release_times}

            for agent in agents_list:
                agent['release_time'] = release_time_map.get(agent['id'])

        return agents_list, count

    @classmethod
    @DB.connection_context()
    def accessible(cls, canvas_id, tenant_id):
        """Check if a canvas is accessible by a given tenant/user.

        A canvas is accessible if the user owns it or belongs to a tenant
        that owns it.

        Args:
            canvas_id (str): The canvas ID to check.
            tenant_id (str): The user/tenant ID requesting access.

        Returns:
            bool: True if the canvas is accessible, False otherwise.
        """
        from db.services.user_service import UserTenantService
        e, c = UserCanvasService.get_by_canvas_id(canvas_id)
        if not e:
            return False

        tids = [t.tenant_id for t in UserTenantService.query(user_id=tenant_id)]
        if c["user_id"] != canvas_id and c["user_id"]  not in tids:
            return False
        return True

    @classmethod
    def get_agent_dsl_with_release(cls, agent_id: str, release_mode: bool = False, tenant_id: str | None = None):
        """Get agent DSL, optionally using the latest released version.

        When release_mode is True, returns the DSL from the latest released
        version rather than the current draft DSL.

        Args:
            agent_id: The canvas/agent ID.
            release_mode: If True, use latest released version DSL.
            tenant_id: Optional owner check - raises PermissionError if mismatch.

        Returns:
            tuple: (canvas_model, dsl_string) where dsl_string is JSON.

        Raises:
            LookupError: If agent not found.
            PermissionError: If tenant_id mismatch or no released version available.
        """
        import json
        from db.services.user_canvas_version import UserCanvasVersionService

        e, cvs = cls.get_by_id(agent_id)
        if not e:
            raise LookupError("Agent not found.")
        # Verify ownership if tenant_id provided
        if tenant_id and cvs.user_id != tenant_id:
            raise PermissionError("You do not own the agent.")

        if release_mode:
            # Retrieve the latest published version for production use
            released_version = UserCanvasVersionService.get_latest_released(agent_id)
            if not released_version:
                raise PermissionError("No available published version")
            dsl = released_version.dsl
        else:
            dsl = cvs.dsl

        # Ensure DSL is a JSON string for downstream Canvas parsing
        if not isinstance(dsl, str):
            dsl = json.dumps(dsl, ensure_ascii=False)

        return cvs, dsl
