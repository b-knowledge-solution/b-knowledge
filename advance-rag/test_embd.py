import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from db.joint_services.tenant_model_service import get_tenant_default_model_by_type
    from db.services.tenant_llm_service import TenantLLMService
    from rag.llm import EmbeddingModel
    from common.constants import LLMType

    print("Keys in EmbeddingModel:", list(EmbeddingModel.keys()))
    config = get_tenant_default_model_by_type("00000000000000000000000000000001", LLMType.EMBEDDING.value)
    print("CONFIG:", config)
    
    model = TenantLLMService.model_instance(config, lang="English")
    print("MODEL INSTANCE:", model)


    import logging
    logging.getLogger().setLevel(logging.INFO)
    model2 = TenantLLMService.model_instance(config, lang="English")

except Exception as e:
    import traceback
    traceback.print_exc()
