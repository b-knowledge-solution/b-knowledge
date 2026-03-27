#!/usr/bin/env python3
"""
Easy Dataset JSON to YAML Converter for RAG Evaluation System

Convert Q&A dataset exported from Easy Dataset (Alpaca or ShareGPT JSON format)
to the YAML format consumed by the promptfoo evaluation framework.

@description Convert Easy Dataset JSON export to YAML test cases for promptfoo
@usage python json_to_yaml.py <json_file> <yaml_file>
@example python json_to_yaml.py dataset/export_alpaca.json dataset/eval_dataset.yaml
@example python json_to_yaml.py dataset/export_sharegpt.json dataset/eval_dataset.yaml

Supported input formats:
  - Alpaca format:   [ { "instruction": "...", "output": "...", ... } ]
  - ShareGPT format: [ { "conversations": [ {"from": "human", ...}, {"from": "gpt", ...} ] } ]
"""

import json
import yaml
import sys
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime


class JSONtoYAMLConverter:
    """
    Converter for transforming Easy Dataset JSON exports to promptfoo YAML format.

    Handles two export formats from Easy Dataset:
    - Alpaca:   instruction / output fields
    - ShareGPT: conversations array with human/gpt turns

    Output YAML test case structure:
      - test: "display name"
        vars:
          question: "Question text"
          expected_answer: "Expected answer text"
          source_doc: "source document label"
          category: "factual|process|comparison|technical|troubleshoot"
          difficulty: "easy|medium|hard"
    """

    # Valid categories aligned with the evaluation system
    VALID_CATEGORIES = {'factual', 'process', 'comparison', 'technical', 'troubleshoot'}

    # Valid difficulty levels
    VALID_DIFFICULTIES = {'easy', 'medium', 'hard'}

    def __init__(self, input_json: str, output_yaml: str, verbose: bool = True):
        """
        Initialize the converter.

        @param input_json:  Path to the Easy Dataset JSON export file
        @param output_yaml: Path to write the output YAML file
        @param verbose:     Print progress messages when True
        """
        self.input_json  = Path(input_json)
        self.output_yaml = Path(output_yaml)
        self.verbose     = verbose
        self.tests: List[Dict[str, Any]] = []
        self.stats = {'total': 0, 'valid': 0, 'invalid': 0, 'warnings': 0}

    # ------------------------------------------------------------------
    # Logging
    # ------------------------------------------------------------------

    def _log(self, message: str, level: str = 'INFO') -> None:
        """
        Print a timestamped log line.

        @param message: Text to display
        @param level:   INFO | WARN | ERROR
        """
        if self.verbose:
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            prefix = {'INFO': '[INFO ]', 'WARN': '[WARN ]', 'ERROR': '[ERROR]'}.get(level, '[INFO ]')
            print(f"[{timestamp}] {prefix} {message}")

    # ------------------------------------------------------------------
    # Format detection
    # ------------------------------------------------------------------

    def _detect_format(self, records: List[Dict[str, Any]]) -> str:
        """
        Detect whether the JSON file uses Alpaca or ShareGPT format.

        @param records: Parsed JSON list
        @returns 'alpaca' | 'sharegpt' | 'unknown'
        """
        if not records:
            return 'unknown'

        # Alpaca: has 'instruction' key at the top level
        if 'instruction' in records[0]:
            return 'alpaca'

        # ShareGPT: has 'conversations' array
        if 'conversations' in records[0] and isinstance(records[0]['conversations'], list):
            return 'sharegpt'

        return 'unknown'

    # ------------------------------------------------------------------
    # Alpaca extraction
    # ------------------------------------------------------------------

    def _extract_alpaca(self, record: Dict[str, Any], index: int) -> Optional[Dict[str, Any]]:
        """
        Extract a test case from an Alpaca-format record.

        Expected Alpaca fields:
          - instruction  (required) → question
          - output       (required) → expected_answer
          - input        (optional) → appended to question when non-empty
          - system       (optional, ignored)
          - source_doc   (optional, Easy Dataset custom field)
          - category     (optional, Easy Dataset custom field)
          - difficulty   (optional, Easy Dataset custom field)

        @param record: Single JSON record
        @param index:  1-based record number for error reporting
        @returns Test case dict, or None if the record is invalid
        """
        # Require both instruction and output
        instruction = (record.get('instruction') or '').strip()
        output      = (record.get('output')      or '').strip()

        if not instruction:
            self._log(f"Record {index}: missing 'instruction' field — skipped", 'WARN')
            return None
        if not output:
            self._log(f"Record {index}: missing 'output' field — skipped", 'WARN')
            return None

        # Combine instruction + input when input is non-empty
        extra_input = (record.get('input') or '').strip()
        question = f"{instruction}\n{extra_input}" if extra_input else instruction

        # Build a short display name from the first ~60 chars of the question
        short_q    = re.sub(r'\s+', ' ', question)[:60].rstrip()
        test_name  = f"Q{index:03d}: {short_q}{'...' if len(short_q) == 60 else ''}"

        # Source doc: use custom field if present, otherwise fall back to a label
        source_doc = (record.get('source_doc') or record.get('source') or f'easy-dataset-export-{index}').strip()

        # Category and difficulty with validation
        category   = self._validate_category(record.get('category'),   index)
        difficulty = self._validate_difficulty(record.get('difficulty'), index)

        # Assemble test case
        test_case: Dict[str, Any] = {
            'test': test_name,
            'vars': {
                'question':        question,
                'expected_answer': output,
                'source_doc':      source_doc,
            }
        }

        if category:
            test_case['vars']['category'] = category
        if difficulty:
            test_case['vars']['difficulty'] = difficulty

        return test_case

    # ------------------------------------------------------------------
    # ShareGPT extraction
    # ------------------------------------------------------------------

    def _extract_sharegpt(self, record: Dict[str, Any], index: int) -> Optional[Dict[str, Any]]:
        """
        Extract a test case from a ShareGPT-format record.

        Expected ShareGPT structure:
          conversations: [
            { "from": "human", "value": "question" },
            { "from": "gpt",   "value": "answer"   }
          ]

        @param record: Single JSON record
        @param index:  1-based record number for error reporting
        @returns Test case dict, or None if the record is invalid
        """
        conversations = record.get('conversations', [])

        # Find first human and first gpt turns
        question_text = None
        answer_text   = None

        for turn in conversations:
            role  = (turn.get('from') or turn.get('role') or '').lower()
            value = (turn.get('value') or turn.get('content') or '').strip()

            if role == 'human' and question_text is None:
                question_text = value
            elif role in ('gpt', 'assistant') and answer_text is None:
                answer_text = value

        # Validate both turns exist
        if not question_text:
            self._log(f"Record {index}: no 'human' turn found — skipped", 'WARN')
            return None
        if not answer_text:
            self._log(f"Record {index}: no 'gpt'/'assistant' turn found — skipped", 'WARN')
            return None

        # Build display name
        short_q   = re.sub(r'\s+', ' ', question_text)[:60].rstrip()
        test_name = f"Q{index:03d}: {short_q}{'...' if len(short_q) == 60 else ''}"

        source_doc = (record.get('source_doc') or record.get('source') or f'easy-dataset-export-{index}').strip()
        category   = self._validate_category(record.get('category'),   index)
        difficulty = self._validate_difficulty(record.get('difficulty'), index)

        test_case: Dict[str, Any] = {
            'test': test_name,
            'vars': {
                'question':        question_text,
                'expected_answer': answer_text,
                'source_doc':      source_doc,
            }
        }

        if category:
            test_case['vars']['category'] = category
        if difficulty:
            test_case['vars']['difficulty'] = difficulty

        return test_case

    # ------------------------------------------------------------------
    # Validation helpers
    # ------------------------------------------------------------------

    def _validate_category(self, value: Any, index: int) -> Optional[str]:
        """
        Normalize and validate a category value.

        @param value: Raw category string (may be None)
        @param index: Record number for warning messages
        @returns Lowercase category string, or None if absent/invalid
        """
        if not value:
            return None

        normalized = str(value).strip().lower()

        if normalized not in self.VALID_CATEGORIES:
            self._log(
                f"Record {index}: unknown category '{value}' "
                f"(valid: {', '.join(sorted(self.VALID_CATEGORIES))}) — kept as-is",
                'WARN'
            )
            self.stats['warnings'] += 1

        return normalized

    def _validate_difficulty(self, value: Any, index: int) -> Optional[str]:
        """
        Normalize and validate a difficulty value.

        @param value: Raw difficulty string (may be None)
        @param index: Record number for warning messages
        @returns Lowercase difficulty string, or None if absent/invalid
        """
        if not value:
            return None

        normalized = str(value).strip().lower()

        if normalized not in self.VALID_DIFFICULTIES:
            self._log(
                f"Record {index}: unknown difficulty '{value}' "
                f"(valid: {', '.join(sorted(self.VALID_DIFFICULTIES))}) — kept as-is",
                'WARN'
            )
            self.stats['warnings'] += 1

        return normalized

    # ------------------------------------------------------------------
    # Main conversion
    # ------------------------------------------------------------------

    def convert(self) -> bool:
        """
        Load the JSON file, convert every record, and write the YAML output.

        @returns True on success, False on fatal error
        """
        self._log(f"Starting conversion: {self.input_json} -> {self.output_yaml}")

        # Verify input exists
        if not self.input_json.exists():
            self._log(f"Input file not found: {self.input_json}", 'ERROR')
            return False

        # Parse JSON
        try:
            with open(self.input_json, 'r', encoding='utf-8') as fh:
                data = json.load(fh)
        except json.JSONDecodeError as exc:
            self._log(f"JSON parse error: {exc}", 'ERROR')
            return False

        # Top-level must be a list
        if not isinstance(data, list):
            self._log("JSON root must be an array (list of records)", 'ERROR')
            return False

        if not data:
            self._log("JSON file is empty — no records to convert", 'ERROR')
            return False

        # Detect format
        fmt = self._detect_format(data)
        self._log(f"Detected format: {fmt} ({len(data)} records)")

        if fmt == 'unknown':
            self._log(
                "Cannot detect format. Expected 'instruction' key (Alpaca) "
                "or 'conversations' key (ShareGPT) at the record level.",
                'ERROR'
            )
            return False

        # Convert each record
        for i, record in enumerate(data, start=1):
            self.stats['total'] += 1

            # Dispatch by format
            test_case = (
                self._extract_alpaca(record, i)
                if fmt == 'alpaca'
                else self._extract_sharegpt(record, i)
            )

            if test_case:
                self.tests.append(test_case)
                self.stats['valid'] += 1
            else:
                self.stats['invalid'] += 1

        # Require at least one valid case
        if self.stats['valid'] == 0:
            self._log("No valid test cases produced — aborting", 'ERROR')
            return False

        # Write YAML
        self._log(f"Writing {self.stats['valid']} test cases to {self.output_yaml} ...")
        self.output_yaml.parent.mkdir(parents=True, exist_ok=True)

        with open(self.output_yaml, 'w', encoding='utf-8') as fh:
            # Header comment
            fh.write(
                f"# RAG Evaluation Dataset\n"
                f"# Generated by json_to_yaml.py from: {self.input_json.name}\n"
                f"# Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
                f"# Total test cases: {self.stats['valid']}\n"
                f"#\n"
                f"# Format note: edit this file directly or re-export from Easy Dataset\n"
                f"# and re-run: python scripts/json_to_yaml.py <export.json> <this_file.yaml>\n\n"
            )
            yaml.dump(
                self.tests,
                fh,
                allow_unicode=True,
                default_flow_style=False,
                sort_keys=False,
                indent=2,
            )

        # Summary
        self._log(f"Done. valid={self.stats['valid']}  invalid={self.stats['invalid']}  warnings={self.stats['warnings']}")
        return True


# =============================================================================
# CLI entry point
# =============================================================================

def main() -> None:
    """
    Command-line entry point.

    @description Parses CLI args and runs the converter.
    Usage: python json_to_yaml.py <input_json> <output_yaml>
    """
    if len(sys.argv) != 3:
        print("Usage: python json_to_yaml.py <input_json> <output_yaml>")
        print()
        print("Examples:")
        print("  python scripts/json_to_yaml.py dataset/export_alpaca.json   dataset/eval_dataset.yaml")
        print("  python scripts/json_to_yaml.py dataset/export_sharegpt.json dataset/eval_dataset.yaml")
        sys.exit(1)

    converter = JSONtoYAMLConverter(input_json=sys.argv[1], output_yaml=sys.argv[2])
    success   = converter.convert()

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
