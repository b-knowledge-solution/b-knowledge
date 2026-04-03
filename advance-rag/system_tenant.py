"""System tenant verification.

b-knowledge uses a single system tenant. The tenant row is created by the
Node.js backend Knex migration. This module only verifies it exists on
worker startup — it never writes to the database.
"""
import logging

from config import SYSTEM_TENANT_ID

logger = logging.getLogger(__name__)


def ensure_system_tenant():
    """Verify the system tenant row exists in the database.

    Logs an error if the tenant is missing, indicating that backend
    migrations need to run first. Does NOT create the row — all schema
    and seed data is owned by the backend Knex migrations.
    """
    from db.db_models import Tenant, DB

    with DB.connection_context():
        try:
            tenant = Tenant.select().where(Tenant.id == SYSTEM_TENANT_ID).first()
            if tenant:
                logger.info(f"System tenant verified: {SYSTEM_TENANT_ID}")
            else:
                logger.error(
                    f"System tenant {SYSTEM_TENANT_ID} not found. "
                    "Run backend migrations first (npm run db:migrate)."
                )
        except Exception as e:
            logger.error(f"Failed to verify system tenant: {e}")
