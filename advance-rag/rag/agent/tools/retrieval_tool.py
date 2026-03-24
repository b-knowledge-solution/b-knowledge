"""RAG retrieval tool for agent workflows.

Performs hybrid search (BM25 + vector) against OpenSearch using the
B-Knowledge RAG infrastructure. Retrieves relevant chunks from
configured knowledge base datasets. No external credentials required --
uses internal OpenSearch and embedding model connections.
"""

from typing import Any

from loguru import logger

from .base_tool import BaseTool


class RetrievalTool(BaseTool):
    """RAG retrieval tool for B-Knowledge datasets.

    Performs hybrid search combining keyword (BM25) and vector similarity
    against OpenSearch indices representing knowledge base datasets.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "retrieval"
    description = "RAG retrieval from B-Knowledge datasets via OpenSearch"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Search B-Knowledge datasets for relevant chunks.

        This tool delegates to the existing RAG retrieval infrastructure.
        It requires the internal services (OpenSearch, embedding model) to
        be available. The actual wiring to ``settings.retriever`` will be
        completed in Plan 07.

        Args:
            input_data: Must contain 'query' or 'output' with search text.
            config: Optional 'kb_ids' (list of knowledge base IDs),
                'top_n' (default 8), 'similarity_threshold' (default 0.2),
                'keywords_similarity_weight' (default 0.5).
            credentials: Not required -- uses internal service connections.

        Returns:
            Dict with 'result' containing 'chunks' (list of retrieved chunks)
            and 'formatted_content' (human-readable string).
        """
        query = input_data.get("query", input_data.get("output", ""))
        if not query:
            return {"error": "No search query provided"}

        kb_ids = config.get("kb_ids", [])
        top_n = config.get("top_n", 8)
        similarity_threshold = config.get("similarity_threshold", 0.2)
        keywords_weight = config.get("keywords_similarity_weight", 0.5)

        if not kb_ids:
            logger.warning("Retrieval tool called without kb_ids")
            return {"error": "No knowledge base IDs configured for retrieval"}

        try:
            # Import the RAG retrieval infrastructure
            from common import settings

            if not hasattr(settings, "retriever") or settings.retriever is None:
                logger.warning("RAG retriever not initialized -- returning stub response")
                return {
                    "result": {
                        "chunks": [],
                        "formatted_content": f"[Retrieval pending] Query: {query[:100]}",
                    }
                }

            # Attempt to load embedding model for the knowledge bases
            from db.services.knowledgebase_service import KnowledgebaseService

            kbs = KnowledgebaseService.get_by_ids(kb_ids)
            if not kbs:
                return {"error": "No valid knowledge bases found for the given IDs"}

            # All knowledge bases in a single retrieval must use the same embedding model
            embd_names = list({kb.embd_id for kb in kbs})
            if len(embd_names) != 1:
                return {"error": "Knowledge bases use different embedding models -- retrieval requires a single model"}

            # Perform the hybrid retrieval
            from common.constants import LLMType
            from db.joint_services.tenant_model_service import get_model_config_by_type_and_name
            from db.services.llm_service import LLMBundle

            tenant_id = kbs[0].tenant_id
            embd_config = get_model_config_by_type_and_name(tenant_id, LLMType.EMBEDDING, embd_names[0])
            embd_mdl = LLMBundle(tenant_id, embd_config)

            kbinfos = settings.retriever.retrieval(
                query,
                embd_mdl,
                [kb.tenant_id for kb in kbs],
                kb_ids,
                1,
                top_n,
                similarity_threshold,
                1 - keywords_weight,
                aggs=False,
            )

            # Clean up internal fields from chunks before returning
            chunks = kbinfos.get("chunks", [])
            for chunk in chunks:
                chunk.pop("vector", None)
                chunk.pop("content_ltks", None)

            # Format chunks into readable text
            formatted_parts = []
            for i, chunk in enumerate(chunks, 1):
                content = chunk.get("content_with_weight", chunk.get("content", ""))
                formatted_parts.append(f"[{i}] {content[:500]}")

            formatted_content = "\n\n".join(formatted_parts) if formatted_parts else "No relevant results found."

            logger.info(f"Retrieval returned {len(chunks)} chunks for query: {query[:50]}")

            return {
                "result": {
                    "chunks": chunks,
                    "formatted_content": formatted_content,
                }
            }
        except ImportError as e:
            # RAG infrastructure not available in this runtime environment
            logger.warning(f"RAG retrieval imports unavailable: {e}")
            return {
                "result": {
                    "chunks": [],
                    "formatted_content": f"[Retrieval not available] Query: {query[:100]}",
                }
            }
        except Exception as e:
            logger.error(f"Retrieval failed: {e}")
            return {"error": f"Retrieval failed: {str(e)}"}
