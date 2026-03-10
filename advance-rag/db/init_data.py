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
import asyncio
import logging
import json
import os
import time
import uuid
from copy import deepcopy

from peewee import IntegrityError

from db import UserTenantRole
from db.db_models import init_database_tables as init_web_db, LLMFactories, LLM, TenantLLM, Knowledgebase
from db.services.user_service import UserService, TenantService, UserTenantService
from db.services.document_service import DocumentService
from db.services.knowledgebase_service import KnowledgebaseService
from db.services.tenant_llm_service import LLMFactoriesService, TenantLLMService
from db.services.llm_service import LLMService, LLMBundle, get_init_tenant_llm
from db.joint_services.tenant_model_service import get_tenant_default_model_by_type
from common.constants import LLMType
from common.file_utils import get_project_base_directory
from common import settings
from common.encoding_utils import encode_to_base64

DEFAULT_SUPERUSER_NICKNAME = os.getenv("DEFAULT_SUPERUSER_NICKNAME", "admin")
DEFAULT_SUPERUSER_EMAIL = os.getenv("DEFAULT_SUPERUSER_EMAIL", "admin@ragflow.io")
DEFAULT_SUPERUSER_PASSWORD = os.getenv("DEFAULT_SUPERUSER_PASSWORD", "admin")

def init_superuser(nickname=DEFAULT_SUPERUSER_NICKNAME, email=DEFAULT_SUPERUSER_EMAIL, password=DEFAULT_SUPERUSER_PASSWORD, role=UserTenantRole.OWNER):
    if UserService.query(email=email):
        logging.info("User with email %s already exists, skipping initialization.", email)
        return

    user_info = {
        "id": uuid.uuid1().hex,
        "password": encode_to_base64(password),
        "nickname": nickname,
        "is_superuser": True,
        "email": email,
        "creator": "system",
        "status": "1",
    }
    tenant = {
        "id": user_info["id"],
        "name": user_info["nickname"] + "‘s Kingdom",
        "llm_id": settings.CHAT_MDL,
        "embd_id": settings.EMBEDDING_MDL,
        "asr_id": settings.ASR_MDL,
        "parser_ids": settings.PARSERS,
        "img2txt_id": settings.IMAGE2TEXT_MDL,
        "rerank_id": settings.RERANK_MDL,
    }
    usr_tenant = {
        "tenant_id": user_info["id"],
        "user_id": user_info["id"],
        "invited_by": user_info["id"],
        "role": role
    }

    tenant_llm = get_init_tenant_llm(user_info["id"])

    try:
        if not UserService.save(**user_info):
            logging.error("can't init admin.")
            return
    except IntegrityError:
        logging.info("User with email %s already exists, skipping.", email)
        return
    TenantService.insert(**tenant)
    UserTenantService.insert(**usr_tenant)
    TenantLLMService.insert_many(tenant_llm)
    logging.info(
        f"Super user initialized. email: {email},A default password has been set; changing the password after login is strongly recommended.")

    if tenant["llm_id"]:
        chat_model_config = get_tenant_default_model_by_type(tenant["id"], LLMType.CHAT)
        chat_mdl = LLMBundle(tenant["id"], chat_model_config)
        msg = asyncio.run(chat_mdl.async_chat(system="", history=[{"role": "user", "content": "Hello!"}], gen_conf={}))
        if msg.find("ERROR: ") == 0:
            logging.error("'{}' doesn't work. {}".format( tenant["llm_id"], msg))

    if tenant["embd_id"]:
        embd_model_config = get_tenant_default_model_by_type(tenant["id"], LLMType.EMBEDDING)
        embd_mdl = LLMBundle(tenant["id"], embd_model_config)
        v, c = embd_mdl.encode(["Hello!"])
        if c == 0:
            logging.error("'{}' doesn't work!".format(tenant["embd_id"]))


def init_llm_factory():
    LLMFactoriesService.filter_delete([1 == 1])
    factory_llm_infos = settings.FACTORY_LLM_INFOS
    for factory_llm_info in factory_llm_infos:
        info = deepcopy(factory_llm_info)
        llm_infos = info.pop("llm")
        try:
            LLMFactoriesService.save(**info)
        except Exception:
            pass
        LLMService.filter_delete([LLM.fid == factory_llm_info["name"]])
        for llm_info in llm_infos:
            llm_info["fid"] = factory_llm_info["name"]
            try:
                LLMService.save(**llm_info)
            except Exception:
                pass

    LLMFactoriesService.filter_delete([(LLMFactories.name == "Local") | (LLMFactories.name == "novita.ai")])
    LLMService.filter_delete([LLM.fid == "Local"])
    LLMService.filter_delete([LLM.llm_name == "qwen-vl-max"])
    LLMService.filter_delete([LLM.fid == "Moonshot", LLM.llm_name == "flag-embedding"])
    TenantLLMService.filter_delete([TenantLLM.llm_factory == "Moonshot", TenantLLM.llm_name == "flag-embedding"])
    LLMFactoriesService.filter_delete([LLMFactoriesService.model.name == "QAnything"])
    LLMService.filter_delete([LLMService.model.fid == "QAnything"])
    TenantLLMService.filter_update([TenantLLMService.model.llm_factory == "QAnything"], {"llm_factory": "Youdao"})
    TenantLLMService.filter_update([TenantLLMService.model.llm_factory == "cohere"], {"llm_factory": "Cohere"})
    TenantService.filter_update([1 == 1], {
        "parser_ids": "naive:General,qa:Q&A,resume:Resume,manual:Manual,table:Table,paper:Paper,book:Book,laws:Laws,presentation:Presentation,picture:Picture,one:One,audio:Audio,email:Email,tag:Tag"})
    ## insert openai two embedding models to the current openai user.
    # print("Start to insert 2 OpenAI embedding models...")
    tenant_ids = set([row["tenant_id"] for row in TenantLLMService.get_openai_models()])
    for tid in tenant_ids:
        for row in TenantLLMService.query(llm_factory="OpenAI", tenant_id=tid):
            row = row.to_dict()
            row["model_type"] = LLMType.EMBEDDING.value
            row["llm_name"] = "text-embedding-3-small"
            row["used_tokens"] = 0
            try:
                TenantLLMService.save(**row)
                row = deepcopy(row)
                row["llm_name"] = "text-embedding-3-large"
                TenantLLMService.save(**row)
            except Exception:
                pass
            break
    doc_count = DocumentService.get_all_kb_doc_count()
    for kb_id in KnowledgebaseService.get_all_ids():
        KnowledgebaseService.update_document_number_in_init(kb_id=kb_id, doc_num=doc_count.get(kb_id, 0))



def init_web_data():
    start_time = time.time()

    init_llm_factory()

    fix_empty_tenant_model_id()
    logging.info("init web data success:{}".format(time.time() - start_time))


def fix_empty_tenant_model_id():
    # knowledgebase
    empty_tenant_embd_id_kbs = KnowledgebaseService.get_null_tenant_embd_id_row()
    if empty_tenant_embd_id_kbs:
        logging.info(f"Found {len(empty_tenant_embd_id_kbs)} empty tenant_embd_id knowledgebase.")
        kb_groups: dict = {}
        for obj in empty_tenant_embd_id_kbs:
            if kb_groups.get((obj.tenant_id, obj.embd_id)):
                kb_groups[(obj.tenant_id, obj.embd_id)].append(obj.id)
            else:
                kb_groups[(obj.tenant_id, obj.embd_id)] = [obj.id]
        update_cnt = 0
        for k, v in kb_groups.items():
            tenant_llm = TenantLLMService.get_api_key(k[0], k[1])
            if tenant_llm:
                update_cnt += KnowledgebaseService.filter_update([Knowledgebase.id.in_(v)], {"tenant_embd_id": tenant_llm.id})
        logging.info(f"Update {update_cnt} tenant_embd_id in table knowledgebase.")
    # tenant
    empty_tenant_model_id_tenants = TenantService.get_null_tenant_model_id_rows()
    if empty_tenant_model_id_tenants:
        logging.info(f"Found {len(empty_tenant_model_id_tenants)} empty tenant_model_id tenants.")
        update_cnt = 0
        for obj in empty_tenant_model_id_tenants:
            tenant_dict = obj.to_dict()
            update_dict = {}
            for key in ["llm_id", "embd_id", "asr_id", "img2txt_id", "rerank_id", "tts_id"]:
                if tenant_dict.get(key) and not tenant_dict.get(f"tenant_{key}"):
                    tenant_model = TenantLLMService.get_api_key(tenant_dict["id"], tenant_dict[key])
                    if tenant_model:
                        update_dict.update({f"tenant_{key}": tenant_model.id})
            if update_dict:
                update_cnt += TenantService.update_by_id(tenant_dict["id"], update_dict)
        logging.info(f"Update {update_cnt} tenant_model_id in table tenant.")
    logging.info("Fix empty tenant_model_id done.")

if __name__ == '__main__':
    init_web_db()
    init_web_data()
