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
"""Smoke test script for the general-mode GraphRAG pipeline.

This script provides a CLI-based smoke test for the general-mode graph extraction
pipeline. It loads a document's chunks from the document store, runs the full
GraphRAG pipeline (extraction, merging, entity resolution, and community report
generation), and prints the resulting graph and community reports.

Usage:
    python -m rag.graphrag.general.smoke -t <tenant_id> -d <doc_id>
"""

import argparse
import asyncio
import json
import logging
import networkx as nx

from common.constants import LLMType
from db.services.document_service import DocumentService
from db.services.knowledgebase_service import KnowledgebaseService
from db.services.llm_service import LLMBundle
from db.joint_services.tenant_model_service import get_tenant_default_model_by_type, get_model_config_by_id, get_model_config_by_type_and_name
from rag.graphrag.general.graph_extractor import GraphExtractor
from rag.graphrag.general.index import update_graph, with_resolution, with_community
from common import settings

settings.init_settings()


def callback(prog=None, msg="Processing..."):
    """Simple progress callback that logs messages.

    Args:
        prog: Optional progress value (unused).
        msg: Status message to log.
    """
    logging.info(msg)


async def main():
    """Run the general-mode GraphRAG smoke test.

    Parses command-line arguments for tenant_id and doc_id, loads the document
    and its chunks, initializes LLM and embedding models, then runs the full
    GraphRAG pipeline: graph extraction, entity resolution, and community
    report generation.
    """
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "-t",
        "--tenant_id",
        default=False,
        help="Tenant ID",
        action="store",
        required=True,
    )
    parser.add_argument(
        "-d",
        "--doc_id",
        default=False,
        help="Document ID",
        action="store",
        required=True,
    )
    args = parser.parse_args()
    e, doc = DocumentService.get_by_id(args.doc_id)
    if not e:
        raise LookupError("Document not found.")
    kb_id = doc.kb_id

    # Load document chunks from the document store
    chunks = [
        d["content_with_weight"]
        for d in settings.retriever.chunk_list(
            args.doc_id,
            args.tenant_id,
            [kb_id],
            max_count=6,
            fields=["content_with_weight"],
        )
    ]

    # Initialize LLM and embedding model bundles
    llm_config = get_tenant_default_model_by_type(args.tenant_id, LLMType.CHAT)
    llm_bdl = LLMBundle(args.tenant_id, llm_config)
    _, kb = KnowledgebaseService.get_by_id(kb_id)
    if kb.tenant_embd_id:
        embd_model_config = get_model_config_by_id(kb.tenant_embd_id)
    else:
        embd_model_config = get_model_config_by_type_and_name(args.tenant_id, LLMType.EMBEDDING, kb.embd_id)
    embed_bdl = LLMBundle(args.tenant_id, embd_model_config)

    # Run graph extraction and merging
    graph, doc_ids = await update_graph(
        GraphExtractor,
        args.tenant_id,
        kb_id,
        args.doc_id,
        chunks,
        "English",
        llm_bdl,
        embed_bdl,
        callback,
    )
    print(json.dumps(nx.node_link_data(graph), ensure_ascii=False, indent=2))

    # Run entity resolution
    await with_resolution(
        args.tenant_id, kb_id, args.doc_id, llm_bdl, embed_bdl, callback
    )
    # Run community detection and report generation
    community_structure, community_reports = await with_community(
        args.tenant_id, kb_id, args.doc_id, llm_bdl, embed_bdl, callback
    )

    print(
        "------------------ COMMUNITY STRUCTURE--------------------\n",
        json.dumps(community_structure, ensure_ascii=False, indent=2),
    )
    print(
        "------------------ COMMUNITY REPORTS----------------------\n",
        community_reports,
    )


if __name__ == "__main__":
    asyncio.run(main)
