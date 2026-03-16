"""
System tenant initialization.

b-knowledge uses a single system tenant instead of per-user tenants.
This module ensures the system tenant row exists on startup.
"""
import logging
import os

from config import SYSTEM_TENANT_ID

logger = logging.getLogger(__name__)


def ensure_system_tenant():
    """Create the system tenant row in the database if it does not already exist.

    Uses the SYSTEM_TENANT_ID from config and populates default model IDs
    from environment variables. The tenant is initialized with all supported
    parser types and a high credit limit (9999999).
    """
    from db.db_models import Tenant, DB

    with DB.connection_context():
        try:
            tenant = Tenant.select().where(Tenant.id == SYSTEM_TENANT_ID).first()
            if tenant:
                logger.info(f"System tenant already exists: {SYSTEM_TENANT_ID}")
                return
        except Exception:
            pass

        logger.info(f"Creating system tenant: {SYSTEM_TENANT_ID}")
        Tenant.insert(
            id=SYSTEM_TENANT_ID,
            name="system",
            llm_id=os.getenv("DEFAULT_CHAT_MODEL", ""),
            embd_id=os.getenv("DEFAULT_EMBEDDING_MODEL", ""),
            asr_id=os.getenv("DEFAULT_ASR_MODEL", ""),
            img2txt_id=os.getenv("DEFAULT_IMAGE2TEXT_MODEL", ""),
            rerank_id=os.getenv("DEFAULT_RERANK_MODEL", ""),
            tts_id=os.getenv("DEFAULT_TTS_MODEL", ""),
            parser_ids="naive:General,qa:Q&A,table:Table,paper:Paper,book:Book,laws:Laws,presentation:Presentation,picture:Picture,one:One,audio:Audio,email:Email",
            credit=9999999,
            status="1",
        ).execute()
        logger.info("System tenant created successfully")
