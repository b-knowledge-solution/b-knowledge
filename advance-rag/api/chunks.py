"""
Search and chunk retrieval endpoints.

Provides hybrid search (semantic + full-text) over dataset chunks
stored in Elasticsearch.
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from config import SYSTEM_TENANT_ID

logger = logging.getLogger(__name__)
router = APIRouter()


class SearchRequest(BaseModel):
    query: str
    method: str = "hybrid"  # hybrid | semantic | full_text
    top_k: int = 10
    similarity_threshold: float = 0.0
    highlight: bool = True


@router.post("/datasets/{dataset_id}/search")
async def search_chunks(dataset_id: str, req: SearchRequest):
    """Hybrid search over chunks in a dataset."""
    from db.services.knowledgebase_service import KnowledgebaseService

    found, kb = KnowledgebaseService.get_by_id(dataset_id)
    if not found:
        raise HTTPException(status_code=404, detail="Dataset not found")

    try:
        from rag.nlp import search as rag_search
        from rag.utils.es_conn import ELASTICSEARCH

        embd_id = kb.embd_id
        # Build search query for ES
        # Use ragflow's retrieval utilities
        results = _do_search(
            dataset_id=dataset_id,
            query=req.query,
            method=req.method,
            embd_id=embd_id,
            top_k=req.top_k,
            similarity_threshold=req.similarity_threshold,
        )
        return {"chunks": results, "total": len(results)}
    except ImportError as e:
        logger.warning(f"Search dependencies not available: {e}")
        raise HTTPException(
            status_code=503,
            detail="Search service not available — RAG dependencies not loaded",
        )
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/datasets/{dataset_id}/chunks")
async def list_chunks(
    dataset_id: str,
    doc_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """List chunks for a dataset, optionally filtered by document."""
    try:
        from rag.utils.es_conn import ELASTICSEARCH

        index_name = f"ragflow_{SYSTEM_TENANT_ID}"
        query_body = {
            "bool": {
                "must": [{"term": {"kb_id": dataset_id}}],
            }
        }
        if doc_id:
            query_body["bool"]["must"].append({"term": {"doc_id": doc_id}})

        offset = (page - 1) * limit
        res = ELASTICSEARCH.search(
            index=index_name,
            query=query_body,
            from_=offset,
            size=limit,
            sort=[{"create_time": {"order": "desc"}}],
        )

        hits = res.get("hits", {})
        total = hits.get("total", {}).get("value", 0)
        chunks = []
        for hit in hits.get("hits", []):
            src = hit["_source"]
            chunks.append({
                "chunk_id": hit["_id"],
                "text": src.get("content_with_weight", src.get("content_ltks", "")),
                "doc_id": src.get("doc_id"),
                "doc_name": src.get("docnm_kwd"),
                "page_num": src.get("page_num_int", []),
                "score": hit.get("_score"),
            })

        return {
            "chunks": chunks,
            "total": total,
            "page": page,
            "limit": limit,
        }
    except ImportError:
        raise HTTPException(status_code=503, detail="Elasticsearch not available")
    except Exception as e:
        logger.error(f"Failed to list chunks: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _do_search(
    dataset_id: str,
    query: str,
    method: str,
    embd_id: str,
    top_k: int,
    similarity_threshold: float,
) -> list:
    """Execute search using RAGFlow's retrieval utilities."""
    from rag.utils.es_conn import ELASTICSEARCH

    index_name = f"ragflow_{SYSTEM_TENANT_ID}"

    if method == "full_text":
        return _full_text_search(index_name, dataset_id, query, top_k)

    if method == "semantic":
        return _semantic_search(index_name, dataset_id, query, embd_id, top_k, similarity_threshold)

    # hybrid: combine both
    text_results = _full_text_search(index_name, dataset_id, query, top_k)
    semantic_results = _semantic_search(index_name, dataset_id, query, embd_id, top_k, similarity_threshold)

    # Merge by chunk_id, keep highest score
    seen = {}
    for r in text_results + semantic_results:
        cid = r["chunk_id"]
        if cid not in seen or r.get("score", 0) > seen[cid].get("score", 0):
            seen[cid] = r

    merged = sorted(seen.values(), key=lambda x: x.get("score", 0), reverse=True)
    return merged[:top_k]


def _full_text_search(index_name: str, dataset_id: str, query: str, top_k: int) -> list:
    from rag.utils.es_conn import ELASTICSEARCH

    res = ELASTICSEARCH.search(
        index=index_name,
        query={
            "bool": {
                "must": [
                    {"term": {"kb_id": dataset_id}},
                    {"match": {"content_with_weight": {"query": query, "minimum_should_match": "30%"}}},
                ],
            }
        },
        size=top_k,
        _source=["content_with_weight", "doc_id", "docnm_kwd", "page_num_int"],
    )

    chunks = []
    for hit in res.get("hits", {}).get("hits", []):
        src = hit["_source"]
        chunks.append({
            "chunk_id": hit["_id"],
            "text": src.get("content_with_weight", ""),
            "doc_id": src.get("doc_id"),
            "doc_name": src.get("docnm_kwd"),
            "page_num": src.get("page_num_int", []),
            "score": hit.get("_score", 0),
            "method": "full_text",
        })
    return chunks


def _semantic_search(
    index_name: str, dataset_id: str, query: str, embd_id: str, top_k: int, threshold: float
) -> list:
    """Semantic search using embedding vectors."""
    try:
        from rag.llm import EmbeddingModel
        from db.services.llm_service import TenantLLMService

        # Get embedding model config
        model_config = TenantLLMService.query(
            tenant_id=SYSTEM_TENANT_ID,
            model_type="embedding",
            llm_name=embd_id,
        )
        if not model_config:
            return []  # No embedding model configured, skip semantic

        cfg = model_config[0]
        model = EmbeddingModel[cfg.llm_factory](
            cfg.api_key, cfg.llm_name, base_url=cfg.api_base
        )
        embeddings, _ = model.encode([query])
        if not embeddings or len(embeddings) == 0:
            return []

        query_vector = embeddings[0]
    except Exception as e:
        logger.warning(f"Semantic search embedding failed: {e}")
        return []

    try:
        from rag.utils.es_conn import ELASTICSEARCH

        res = ELASTICSEARCH.search(
            index=index_name,
            knn={
                "field": "q_vec",
                "query_vector": query_vector,
                "k": top_k,
                "num_candidates": top_k * 2,
                "filter": {"term": {"kb_id": dataset_id}},
            },
            size=top_k,
            _source=["content_with_weight", "doc_id", "docnm_kwd", "page_num_int"],
        )

        chunks = []
        for hit in res.get("hits", {}).get("hits", []):
            score = hit.get("_score", 0)
            if score < threshold:
                continue
            src = hit["_source"]
            chunks.append({
                "chunk_id": hit["_id"],
                "text": src.get("content_with_weight", ""),
                "doc_id": src.get("doc_id"),
                "doc_name": src.get("docnm_kwd"),
                "page_num": src.get("page_num_int", []),
                "score": score,
                "method": "semantic",
            })
        return chunks
    except Exception as e:
        logger.warning(f"Semantic search failed: {e}")
        return []
