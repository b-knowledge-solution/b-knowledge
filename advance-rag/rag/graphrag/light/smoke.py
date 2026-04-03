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
"""Smoke test script for the light-mode GraphRAG pipeline.

This script provides a CLI-based smoke test for the light-mode (LightRAG-style)
graph extraction pipeline. It loads a document's chunks from the document store,
runs the graph extraction and merging pipeline, and prints the resulting graph
as JSON.

Usage:
    python -m rag.graphrag.light.smoke -t <tenant_id> -d <doc_id>
"""

import argparse
import asyncio
import json
import networkx as nx
import logging

from common.constants import LLMType
from db.services.document_service import DocumentService
from db.services.knowledgebase_service import KnowledgebaseService
from db.services.llm_service import LLMBundle
from db.joint_services.tenant_model_service import get_model_config_by_id, get_model_config_by_type_and_name, get_tenant_default_model_by_type
from rag.graphrag.general.index import update_graph
from rag.graphrag.light.graph_extractor import GraphExtractor
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
    """Run the light-mode GraphRAG smoke test.

    Parses command-line arguments for tenant_id and doc_id, loads the document
    and its chunks, initializes LLM and embedding models, then runs the
    light-mode graph extraction and merging pipeline.
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

    # Run light-mode graph extraction and merging
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


if __name__ == "__main__":
    asyncio.run(main)
