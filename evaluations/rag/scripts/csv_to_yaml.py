#!/usr/bin/env python3
"""
CSV to YAML Converter for RAG Evaluation System

Convert Q&A dataset from CSV format (easy for QA testers) to YAML format
(used by promptfoo evaluation framework).

@description Convert CSV dataset to YAML test cases for promptfoo
@usage python csv_to_yaml.py <csv_file> <yaml_file>
@example python csv_to_yaml.py dataset/qa_pairs.csv dataset/eval_dataset.yaml
"""

import csv
import yaml
import sys
import json
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime


class CSVtoYAMLConverter:
    """
    Converter for transforming CSV dataset to YAML format.
    
    CSV columns expected:
    - test: Question display name
    - question: Full question text
    - expected_answer: Correct answer
    - source_doc: Document source reference
    - category: Question category (factual, process, comparison, technical, troubleshoot)
    - difficulty: Question difficulty (easy, medium, hard)
    """
    
    # Valid categories for Q&A pairs
    VALID_CATEGORIES = {
        'factual', 'process', 'comparison', 'technical', 'troubleshoot'
    }
    
    # Valid difficulty levels
    VALID_DIFFICULTIES = {'easy', 'medium', 'hard'}
    
    def __init__(self, input_csv: str, output_yaml: str, verbose: bool = True):
        """
        Initialize the converter.
        
        @param input_csv: Path to input CSV file
        @param output_yaml: Path to output YAML file
        @param verbose: Enable verbose output
        """
        self.input_csv = Path(input_csv)
        self.output_yaml = Path(output_yaml)
        self.verbose = verbose
        self.tests: List[Dict[str, Any]] = []
        self.stats = {
            'total': 0,
            'valid': 0,
            'invalid': 0,
            'warnings': 0
        }
    
    def _log(self, message: str, level: str = 'INFO'):
        """
        Log message with timestamp.
        
        @param message: Message to log
        @param level: Log level (INFO, WARN, ERROR)
        """
        if self.verbose:
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            prefix = {
                'INFO': 'ℹ️ ',
                'WARN': '⚠️ ',
                'ERROR': '❌'
            }.get(level, '→ ')
            print(f"[{timestamp}] {prefix} {message}")
    
    def _validate_row(self, row: Dict[str, str], row_num: int) -> bool:
        """
        Validate CSV row for required and optional fields.
        
        @param row: CSV row as dictionary
        @param row_num: Row number for error reporting
        @returns True if valid, False otherwise
        """
        required_fields = ['test', 'question', 'expected_answer', 'source_doc']
        optional_fields = ['category', 'difficulty']
        
        # Check required fields
        for field in required_fields:
            if field not in row or not row[field].strip():
                self._log(f"Row {row_num}: Missing required field '{field}'", 'WARN')
                return False
        
        # Validate optional fields if present
        if 'category' in row and row['category'].strip():
            if row['category'].strip().lower() not in self.VALID_CATEGORIES:
                self._log(
                    f"Row {row_num}: Invalid category '{row['category']}'. "
                    f"Must be one of: {', '.join(self.VALID_CATEGORIES)}",
                    'WARN'
                )
                # Allow but warn
                self.stats['warnings'] += 1
        
        if 'difficulty' in row and row['difficulty'].strip():
            if row['difficulty'].strip().lower() not in self.VALID_DIFFICULTIES:
                self._log(
                    f"Row {row_num}: Invalid difficulty '{row['difficulty']}'. "
                    f"Must be one of: {', '.join(self.VALID_DIFFICULTIES)}",
                    'WARN'
                )
                # Allow but warn
                self.stats['warnings'] += 1
        
        return True
    
    def _create_test_case(self, row: Dict[str, str]) -> Dict[str, Any]:
        """
        Create a promptfoo test case from a CSV row.
        
        @param row: CSV row as dictionary
        @returns Test case dictionary in promptfoo format
        """
        test_case = {
            'test': row['test'].strip(),
            'vars': {
                'question': row['question'].strip(),
                'expected_answer': row['expected_answer'].strip(),
                'source_doc': row['source_doc'].strip(),
            }
        }
        
        # Add optional fields if present
        if 'category' in row and row['category'].strip():
            test_case['vars']['category'] = row['category'].strip().lower()
        
        if 'difficulty' in row and row['difficulty'].strip():
            test_case['vars']['difficulty'] = row['difficulty'].strip().lower()
        
        return test_case
    
    def convert(self) -> bool:
        """
        Convert CSV to YAML.
        
        @returns True if successful, False otherwise
        """
        self._log(f"Starting conversion: {self.input_csv} → {self.output_yaml}")
        
        # Verify input file exists
        if not self.input_csv.exists():
            self._log(f"Input file not found: {self.input_csv}", 'ERROR')
            return False
        
        try:
            # Read CSV file
            with open(self.input_csv, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                
                if not reader.fieldnames:
                    self._log("CSV file is empty", 'ERROR')
                    return False
                
                # Expected headers
                expected_headers = {'test', 'question', 'expected_answer', 'source_doc'}
                csv_headers = set(reader.fieldnames)
                
                if not expected_headers.issubset(csv_headers):
                    missing = expected_headers - csv_headers
                    self._log(f"Missing required CSV columns: {', '.join(missing)}", 'ERROR')
                    return False
                
                self._log(f"CSV headers found: {', '.join(reader.fieldnames)}")
                
                # Process rows
                for row_num, row in enumerate(reader, start=2):  # Start from 2 (skip header)
                    self.stats['total'] += 1
                    
                    # Validate and convert
                    if self._validate_row(row, row_num):
                        test_case = self._create_test_case(row)
                        self.tests.append(test_case)
                        self.stats['valid'] += 1
                    else:
                        self.stats['invalid'] += 1
            
            if self.stats['valid'] == 0:
                self._log("No valid test cases found", 'ERROR')
                return False
            
            # Write YAML file
            self._log(f"Writing {self.stats['valid']} test cases to YAML...")
            
            # Ensure output directory exists
            self.output_yaml.parent.mkdir(parents=True, exist_ok=True)
            
            with open(self.output_yaml, 'w', encoding='utf-8') as f:
                yaml.dump(
                    self.tests,
                    f,
                    allow_unicode=True,
                    default_flow_style=False,
                    sort_keys=False,
                    default_style=None,
                    width=1000
                )
            
            # Print summary
            self._log(f"✅ Conversion successful!")
            print(f"\n📊 Summary:")
            print(f"  Total rows: {self.stats['total']}")
            print(f"  Valid: {self.stats['valid']}")
            print(f"  Invalid: {self.stats['invalid']}")
            print(f"  Warnings: {self.stats['warnings']}")
            print(f"\n📁 Output: {self.output_yaml.absolute()}")
            
            return True
        
        except Exception as e:
            self._log(f"Conversion failed: {str(e)}", 'ERROR')
            return False


def main():
    """Main entry point."""
    if len(sys.argv) < 3:
        print("Usage: python csv_to_yaml.py <csv_file> <yaml_file>")
        print("\nExample:")
        print("  python csv_to_yaml.py dataset/qa_pairs.csv dataset/eval_dataset.yaml")
        sys.exit(1)
    
    csv_file = sys.argv[1]
    yaml_file = sys.argv[2]
    verbose = '--verbose' in sys.argv or '-v' in sys.argv
    
    converter = CSVtoYAMLConverter(csv_file, yaml_file, verbose=verbose)
    
    if converter.convert():
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
