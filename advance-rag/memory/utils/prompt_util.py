#
#  Copyright 2025 The InfiniFlow Authors. All Rights Reserved.
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

"""Prompt assembly utilities for LLM-based memory extraction.

This module contains the PromptAssembler class which constructs system and user
prompts for instructing an LLM to extract structured memory (semantic, episodic,
and procedural knowledge) from conversations. The prompts include type-specific
instructions, output format templates, and examples to guide extraction.
"""

from typing import Optional, List

from common.constants import MemoryType
from common.time_utils import current_timestamp

class PromptAssembler:
    """Assembles system and user prompts for memory extraction from conversations.

    This class provides class methods to build complete LLM prompts that instruct
    the model to analyze conversations and extract structured memory items. It
    supports three memory types (semantic, episodic, procedural) and generates
    type-specific instructions, output format specifications, and examples.

    Attributes:
        SYSTEM_BASE_TEMPLATE: Base system prompt template with placeholders for
            type instructions, timestamp format, and max items.
        TYPE_INSTRUCTIONS: Per-memory-type extraction guidelines.
        OUTPUT_TEMPLATES: Per-memory-type JSON output format examples.
        BASE_USER_PROMPT: User prompt template with conversation and time placeholders.
    """

    SYSTEM_BASE_TEMPLATE = """**Memory Extraction Specialist**
You are an expert at analyzing conversations to extract structured memory.

{type_specific_instructions}


**OUTPUT REQUIREMENTS:**
1. Output MUST be valid JSON
2. Follow the specified output format exactly
3. Each extracted item MUST have: content, valid_at, invalid_at
4. Timestamps in {timestamp_format} format
5. Only extract memory types specified above
6. Maximum {max_items} items per type
"""

    TYPE_INSTRUCTIONS = {
        MemoryType.SEMANTIC.name.lower(): """
        **EXTRACT SEMANTIC KNOWLEDGE:**
        - Universal facts, definitions, concepts, relationships
        - Time-invariant, generally true information
        - Examples: "The capital of France is Paris", "Water boils at 100°C"

        **Timestamp Rules for Semantic Knowledge:**
        - valid_at: When the fact became true (e.g., law enactment, discovery)
        - invalid_at: When it becomes false (e.g., repeal, disproven) or empty if still true
        - Default: valid_at = conversation time, invalid_at = "" for timeless facts
        """,

        MemoryType.EPISODIC.name.lower(): """
        **EXTRACT EPISODIC KNOWLEDGE:**
        - Specific experiences, events, personal stories
        - Time-bound, person-specific, contextual
        - Examples: "Yesterday I fixed the bug", "User reported issue last week"

        **Timestamp Rules for Episodic Knowledge:**
        - valid_at: Event start/occurrence time
        - invalid_at: Event end time or empty if instantaneous
        - Extract explicit times: "at 3 PM", "last Monday", "from X to Y"
        """,

        MemoryType.PROCEDURAL.name.lower(): """
        **EXTRACT PROCEDURAL KNOWLEDGE:**
        - Processes, methods, step-by-step instructions
        - Goal-oriented, actionable, often includes conditions
        - Examples: "To reset password, click...", "Debugging steps: 1)..."

        **Timestamp Rules for Procedural Knowledge:**
        - valid_at: When procedure becomes valid/effective
        - invalid_at: When it expires/becomes obsolete or empty if current
        - For version-specific: use release dates
        - For best practices: invalid_at = ""
        """
    }

    OUTPUT_TEMPLATES = {
        MemoryType.SEMANTIC.name.lower(): """
        "semantic": [
            {
                "content": "Clear factual statement",
                "valid_at": "timestamp or empty",
                "invalid_at": "timestamp or empty"
            }
        ]
        """,

        MemoryType.EPISODIC.name.lower(): """
        "episodic": [
            {
                "content": "Narrative event description",
                "valid_at": "event start timestamp",
                "invalid_at": "event end timestamp or empty"
            }
        ]
        """,

        MemoryType.PROCEDURAL.name.lower(): """
        "procedural": [
            {
                "content": "Actionable instructions",
                "valid_at": "procedure effective timestamp",
                "invalid_at": "procedure expiration timestamp or empty"
            }
        ]
        """
    }

    BASE_USER_PROMPT = """
**CONVERSATION:**
{conversation}

**CONVERSATION TIME:** {conversation_time}
**CURRENT TIME:** {current_time}
"""

    @classmethod
    def assemble_system_prompt(cls, config: dict) -> str:
        """Build the complete system prompt for memory extraction.

        Combines the base template with type-specific instructions, output format,
        and examples based on the requested memory types in the config.

        Args:
            config: Configuration dict with keys:
                - "memory_type": list of memory type strings to extract.
                - "timestamp_format" (optional): timestamp format string, defaults to "ISO 8601".
                - "max_items_per_type" (optional): max items per type, defaults to 5.

        Returns:
            A fully assembled system prompt string ready for LLM consumption.
        """
        # Determine which memory types the caller wants to extract
        types_to_extract = cls._get_types_to_extract(config["memory_type"])

        type_instructions = cls._generate_type_instructions(types_to_extract)

        output_format = cls._generate_output_format(types_to_extract)

        # Fill the base template with type instructions and config values
        full_prompt = cls.SYSTEM_BASE_TEMPLATE.format(
            type_specific_instructions=type_instructions,
            timestamp_format=config.get("timestamp_format", "ISO 8601"),
            max_items=config.get("max_items_per_type", 5)
        )

        full_prompt += f"\n**REQUIRED OUTPUT FORMAT (JSON):**\n```json\n{{\n{output_format}\n}}\n```\n"

        # Append concrete examples to help the LLM understand expected outputs
        examples = cls._generate_examples(types_to_extract)
        if examples:
            full_prompt += f"\n**EXAMPLES:**\n{examples}\n"

        return full_prompt

    @staticmethod
    def _get_types_to_extract(requested_types: List[str]) -> List[str]:
        """Filter requested types to only valid, non-RAW memory types.

        Args:
            requested_types: List of memory type name strings from the caller.

        Returns:
            A deduplicated list of valid memory type names (excluding RAW).
        """
        types = set()
        for rt in requested_types:
            # Only accept known memory types, excluding RAW (which is stored verbatim)
            if rt in [e.name.lower()  for e in MemoryType] and rt != MemoryType.RAW.name.lower():
                types.add(rt)
        return list(types)

    @classmethod
    def _generate_type_instructions(cls, types_to_extract: List[str]) -> str:
        """Generate combined extraction instructions for the requested memory types.

        Args:
            types_to_extract: List of valid memory type names.

        Returns:
            A concatenated string of type-specific extraction instructions.
        """
        target_types = set(types_to_extract)
        instructions = [cls.TYPE_INSTRUCTIONS[mt] for mt in target_types]
        return "\n".join(instructions)

    @classmethod
    def _generate_output_format(cls, types_to_extract: List[str]) -> str:
        """Generate the JSON output format specification for the requested types.

        Args:
            types_to_extract: List of valid memory type names.

        Returns:
            A comma-separated string of JSON output templates for each type.
        """
        target_types = set(types_to_extract)
        output_parts = [cls.OUTPUT_TEMPLATES[mt] for mt in target_types]
        return ",\n".join(output_parts)

    @staticmethod
    def _generate_examples(types_to_extract: list[str]) -> str:
        """Generate concrete input/output examples for each requested memory type.

        Args:
            types_to_extract: List of valid memory type names.

        Returns:
            A concatenated string of example blocks, one per requested type.
        """
        examples = []

        if MemoryType.SEMANTIC.name.lower() in types_to_extract:
            examples.append("""
            **Semantic Example:**
            Input: "Python lists are mutable and support various operations."
            Output: {"semantic": [{"content": "Python lists are mutable data structures", "valid_at": "2024-01-15T10:00:00", "invalid_at": ""}]}
            """)

        if MemoryType.EPISODIC.name.lower() in types_to_extract:
            examples.append("""
            **Episodic Example:**
            Input: "I deployed the new feature yesterday afternoon."
            Output: {"episodic": [{"content": "User deployed new feature", "valid_at": "2024-01-14T14:00:00", "invalid_at": "2024-01-14T18:00:00"}]}
            """)

        if MemoryType.PROCEDURAL.name.lower() in types_to_extract:
            examples.append("""
            **Procedural Example:**
            Input: "To debug API errors: 1) Check logs 2) Verify endpoints 3) Test connectivity."
            Output: {"procedural": [{"content": "API error debugging: 1. Check logs 2. Verify endpoints 3. Test connectivity", "valid_at": "2024-01-15T10:00:00", "invalid_at": ""}]}
            """)

        return "\n".join(examples)

    @classmethod
    def assemble_user_prompt(
            cls,
            conversation: str,
            conversation_time: Optional[str] = None,
            current_time: Optional[str] = None
    ) -> str:
        """Build the user prompt containing the conversation to analyze.

        Args:
            conversation: The conversation text to extract memories from.
            conversation_time: Optional timestamp of when the conversation occurred.
                Defaults to "Not specified" if not provided.
            current_time: Optional current timestamp. Defaults to the current
                system time via current_timestamp().

        Returns:
            A formatted user prompt string with the conversation and timestamps.
        """
        return cls.BASE_USER_PROMPT.format(
            conversation=conversation,
            conversation_time=conversation_time or "Not specified",
            current_time=current_time or current_timestamp(),
        )

    @classmethod
    def get_raw_user_prompt(cls):
        """Return the raw user prompt template string with unfilled placeholders.

        Returns:
            The BASE_USER_PROMPT template string containing {conversation},
            {conversation_time}, and {current_time} placeholders.
        """
        return cls.BASE_USER_PROMPT
