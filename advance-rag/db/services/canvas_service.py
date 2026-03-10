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
import logging
from db import CanvasCategory, TenantPermission
from db.db_models import DB, CanvasTemplate, User, UserCanvas
from db.services.common_service import CommonService
from peewee import fn


class CanvasTemplateService(CommonService):
    model = CanvasTemplate

class DataFlowTemplateService(CommonService):
    """
    Alias of CanvasTemplateService
    """
    model = CanvasTemplate


class UserCanvasService(CommonService):
    model = UserCanvas

    @classmethod
    @DB.connection_context()
    def get_list(cls, tenant_id,
                 page_number, items_per_page, orderby, desc, id, title, canvas_category=CanvasCategory.Agent):
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
        # will get all permitted agents, be cautious
        fields = [
            cls.model.id,
            cls.model.avatar,
            cls.model.title,
            cls.model.permission,
            cls.model.canvas_type,
            cls.model.canvas_category
        ]
        # find team agents and owned agents
        agents = cls.model.select(*fields).where(
            (cls.model.user_id.in_(tenant_ids) & (cls.model.permission == TenantPermission.TEAM.value)) | (
                cls.model.user_id == user_id
            )
        )
        # sort by create_time, asc
        agents.order_by(cls.model.create_time.asc())
        # maybe cause slow query by deep paginate, optimize later
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
            # obj = cls.model.query(id=pid)[0]
            return True, agents.dicts()[0]
        except Exception as e:
            logging.exception(e)
            return False, None

    @classmethod
    @DB.connection_context()
    def get_basic_info_by_canvas_ids(cls, canvas_id):
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
        return list(agents.dicts()), count

    @classmethod
    @DB.connection_context()
    def accessible(cls, canvas_id, tenant_id):
        from db.services.user_service import UserTenantService
        e, c = UserCanvasService.get_by_canvas_id(canvas_id)
        if not e:
            return False

        tids = [t.tenant_id for t in UserTenantService.query(user_id=tenant_id)]
        if c["user_id"] != canvas_id and c["user_id"]  not in tids:
            return False
        return True


