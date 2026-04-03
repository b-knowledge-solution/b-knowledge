# Copyright (c) 2024 Microsoft Corporation.
# Licensed under the MIT License

from common.misc_utils import thread_pool_exec

"""Community reports extractor for GraphRAG.

This module generates structured community reports from knowledge graph
communities detected via the Leiden algorithm. For each community, it
constructs a prompt containing the community's entities and relationships,
sends it to an LLM for analysis, and parses the JSON response into a
structured report with title, summary, impact rating, and findings.

Reference:
 - [graphrag](https://github.com/microsoft/graphrag)
"""

import asyncio
import logging
import json
import os
import re
from typing import Callable
from dataclasses import dataclass
import networkx as nx
import pandas as pd

from db.services.task_service import has_canceled
from common.exceptions import TaskCanceledException
from common.connection_utils import timeout
from rag.graphrag.general import leiden
from rag.graphrag.general.community_report_prompt import COMMUNITY_REPORT_PROMPT
from rag.graphrag.general.extractor import Extractor
from rag.graphrag.general.leiden import add_community_info2graph
from rag.llm.chat_model import Base as CompletionLLM
from rag.graphrag.utils import perform_variable_replacements, dict_has_keys_with_types, chat_limiter
from common.token_utils import num_tokens_from_string

@dataclass
class CommunityReportsResult:
    """Container for community report extraction results.

    Attributes:
        output: List of markdown-formatted report strings.
        structured_output: List of parsed report dictionaries with title,
            summary, rating, findings, weight, and entities.
    """

    output: list[str]
    structured_output: list[dict]


class CommunityReportsExtractor(Extractor):
    """Extracts structured community reports from knowledge graph communities.

    Uses Leiden community detection to identify communities, then generates
    an LLM-powered report for each community containing entity and
    relationship analysis.

    Attributes:
        _extraction_prompt: The prompt template for report generation.
        _output_formatter_prompt: Optional output formatting prompt.
        _max_report_length: Maximum length for generated reports.
    """

    _extraction_prompt: str
    _output_formatter_prompt: str
    _max_report_length: int

    def __init__(
            self,
            llm_invoker: CompletionLLM,
            max_report_length: int | None = None,
    ):
        """Initialize the community reports extractor.

        Args:
            llm_invoker: LLM client for chat completions.
            max_report_length: Maximum report length in tokens (default 1500).
        """
        super().__init__(llm_invoker)
        self._llm = llm_invoker
        self._extraction_prompt = COMMUNITY_REPORT_PROMPT
        self._max_report_length = max_report_length or 1500

    async def __call__(self, graph: nx.Graph, callback: Callable | None = None, task_id: str = ""):
        """Generate community reports for all detected communities in the graph.

        Runs Leiden community detection, then concurrently generates a report
        for each community containing >= 2 entities.

        Args:
            graph: The knowledge graph to analyze.
            callback: Progress callback accepting keyword arg ``msg``.
            task_id: Task identifier for cancellation checking.

        Returns:
            CommunityReportsResult with structured and text-formatted reports.
        """
        enable_timeout_assertion = os.environ.get("ENABLE_TIMEOUT_ASSERTION")
        # Compute node degrees as rank for community weighting
        for node_degree in graph.degree:
            graph.nodes[str(node_degree[0])]["rank"] = int(node_degree[1])

        # Run Leiden community detection
        communities: dict[str, dict[str, list]] = leiden.run(graph, {})
        total = sum([len(comm.items()) for _, comm in communities.items()])
        res_str = []
        res_dict = []
        over, token_count = 0, 0
        @timeout(120)
        async def extract_community_report(community):
            """Generate a report for a single community."""
            nonlocal res_str, res_dict, over, token_count
            # Check for task cancellation
            if task_id:
                if has_canceled(task_id):
                    logging.info(f"Task {task_id} cancelled during community report extraction.")
                    raise TaskCanceledException(f"Task {task_id} was cancelled")

            cm_id, cm = community
            weight = cm["weight"]
            ents = cm["nodes"]
            # Skip single-entity communities (no relationships to report)
            if len(ents) < 2:
                return
            # Build entity DataFrame for the prompt
            ent_list = [{"entity": ent, "description": graph.nodes[ent]["description"]} for ent in ents]
            ent_df = pd.DataFrame(ent_list)

            # Collect relationships between community members (cap at 10000)
            rela_list = []
            k = 0
            for i in range(0, len(ents)):
                if k >= 10000:
                    break
                for j in range(i + 1, len(ents)):
                    if k >= 10000:
                        break
                    edge = graph.get_edge_data(ents[i], ents[j])
                    if edge is None:
                        continue
                    rela_list.append({"source": ents[i], "target": ents[j], "description": edge["description"]})
                    k += 1
            rela_df = pd.DataFrame(rela_list)

            # Format the prompt with entity and relationship data
            prompt_variables = {
                "entity_df": ent_df.to_csv(index_label="id"),
                "relation_df": rela_df.to_csv(index_label="id")
            }
            text = perform_variable_replacements(self._extraction_prompt, variables=prompt_variables)
            async with chat_limiter:
                try:
                    timeout = 180 if enable_timeout_assertion else 1000000000
                    response = await asyncio.wait_for(thread_pool_exec(self._chat,text,[{"role": "user", "content": "Output:"}],{},task_id),timeout=timeout)
                except asyncio.TimeoutError:
                    logging.warning("extract_community_report._chat timeout, skipping...")
                    return
                except Exception as e:
                    logging.error(f"extract_community_report._chat failed: {e}")
                    return
            token_count += num_tokens_from_string(text + response)
            # Clean up JSON response: remove non-JSON prefix/suffix and double braces
            response = re.sub(r"^[^\{]*", "", response)
            response = re.sub(r"[^\}]*$", "", response)
            response = re.sub(r"\{\{", "{", response)
            response = re.sub(r"\}\}", "}", response)
            logging.debug(response)
            try:
                response = json.loads(response)
            except json.JSONDecodeError as e:
                logging.error(f"Failed to parse JSON response: {e}")
                logging.error(f"Response content: {response}")
                return
            # Validate that the response has all required fields
            if not dict_has_keys_with_types(response, [
                        ("title", str),
                        ("summary", str),
                        ("findings", list),
                        ("rating", float),
                        ("rating_explanation", str),
                    ]):
                return
            # Annotate response with community metadata
            response["weight"] = weight
            response["entities"] = ents
            add_community_info2graph(graph, ents, response["title"])
            res_str.append(self._get_text_output(response))
            res_dict.append(response)
            over += 1
            if callback:
                callback(msg=f"Communities: {over}/{total}, used tokens: {token_count}")

        st = asyncio.get_running_loop().time()
        # Create async tasks for all communities across all levels
        tasks = []
        for level, comm in communities.items():
            logging.info(f"Level {level}: Community: {len(comm.keys())}")
            for community in comm.items():
                if task_id and has_canceled(task_id):
                    logging.info(f"Task {task_id} cancelled before community processing.")
                    raise TaskCanceledException(f"Task {task_id} was cancelled")
                tasks.append(asyncio.create_task(extract_community_report(community)))
        try:
            await asyncio.gather(*tasks, return_exceptions=False)
        except Exception as e:
            logging.error(f"Error in community processing: {e}")
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
        if callback:
            callback(msg=f"Community reports done in {asyncio.get_running_loop().time() - st:.2f}s, used tokens: {token_count}")

        return CommunityReportsResult(
            structured_output=res_dict,
            output=res_str,
        )

    def _get_text_output(self, parsed_output: dict) -> str:
        """Convert a structured community report dict to markdown text.

        Args:
            parsed_output: Parsed report dictionary with title, summary, and findings.

        Returns:
            Markdown-formatted report string.
        """
        title = parsed_output.get("title", "Report")
        summary = parsed_output.get("summary", "")
        findings = parsed_output.get("findings", [])

        def finding_summary(finding: dict):
            if isinstance(finding, str):
                return finding
            return finding.get("summary")

        def finding_explanation(finding: dict):
            if isinstance(finding, str):
                return ""
            return finding.get("explanation")

        report_sections = "\n\n".join(
            f"## {finding_summary(f)}\n\n{finding_explanation(f)}" for f in findings
        )
        return f"# {title}\n\n{summary}\n\n{report_sections}"
