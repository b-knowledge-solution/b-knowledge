#!/usr/bin/env python3
"""
CSV Validator for Phase 2 Q&A Dataset

Validates that CSV file has correct format before converting to YAML.
Usage: python scripts/csv_validator.py dataset/fixture/reference/qa_pairs_working.csv
"""

import sys
import csv
import re
from pathlib import Path
from typing import List, Tuple


class CsvValidator:
    """Validates Q&A CSV files for Phase 2 evaluation"""
    
    # Required columns and their validation rules
    REQUIRED_COLUMNS = {
        'test': {'type': str, 'min_length': 3},
        'question': {'type': str, 'min_length': 8},
        'expected_answer': {'type': str, 'min_length': 10},
        'source_doc': {'type': str, 'min_length': 3},
        'category': {'type': str, 'allowed_values': ['factual', 'process', 'technical', 'troubleshoot', 'comparison']},
        'difficulty': {'type': str, 'allowed_values': ['easy', 'medium', 'hard']},
    }
    
    def __init__(self, csv_path: str):
        self.csv_path = Path(csv_path)
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.valid_rows = 0
        self.total_rows = 0
        
    def validate(self) -> bool:
        """Run all validations"""
        print(f"🔍 Validating: {self.csv_path}")
        print("=" * 60)
        
        if not self._validate_file_exists():
            return False
        
        if not self._validate_csv_structure():
            return False
        
        if not self._validate_rows():
            return False
        
        self._print_results()
        return len(self.errors) == 0
    
    def _validate_file_exists(self) -> bool:
        """Check if file exists"""
        if not self.csv_path.exists():
            self.errors.append(f"❌ File not found: {self.csv_path}")
            return False
        
        if not self.csv_path.suffix == '.csv':
            self.errors.append(f"❌ Not a CSV file: {self.csv_path}")
            return False
        
        print(f"✓ File exists: {self.csv_path.name}")
        return True
    
    def _validate_csv_structure(self) -> bool:
        """Check CSV headers and structure"""
        try:
            with open(self.csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                
                if reader.fieldnames is None:
                    self.errors.append("❌ CSV has no header row")
                    return False
                
                headers = set(reader.fieldnames)
                required = set(self.REQUIRED_COLUMNS.keys())
                
                # Check all required columns present
                missing = required - headers
                if missing:
                    self.errors.append(f"❌ Missing columns: {', '.join(missing)}")
                    return False
                
                # Check for extra columns
                extra = headers - required
                if extra:
                    self.warnings.append(f"⚠️  Extra columns (ignored): {', '.join(extra)}")
                
                print(f"✓ CSV headers valid: {', '.join(sorted(required))}")
                return True
                
        except csv.Error as e:
            self.errors.append(f"❌ CSV parsing error: {e}")
            return False
        except Exception as e:
            self.errors.append(f"❌ Error reading file: {e}")
            return False
    
    def _validate_rows(self) -> bool:
        """Validate each data row"""
        try:
            with open(self.csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                
                for row_num, row in enumerate(reader, start=2):  # Start at 2 (1 = header)
                    self.total_rows += 1
                    
                    # Validate each required field
                    row_errors = self._validate_row(row, row_num)
                    
                    if not row_errors:
                        self.valid_rows += 1
        
        except Exception as e:
            self.errors.append(f"❌ Error validating rows: {e}")
            return False
        
        return True
    
    def _validate_row(self, row: dict, row_num: int) -> List[str]:
        """Validate a single row"""
        row_errors = []
        
        for column, rules in self.REQUIRED_COLUMNS.items():
            value = row.get(column, '').strip()
            
            # Check for empty values
            if not value:
                row_errors.append(f"Row {row_num}: Empty '{column}'")
                continue
            
            # Check minimum length
            if 'min_length' in rules and len(value) < rules['min_length']:
                row_errors.append(f"Row {row_num}: '{column}' too short (min {rules['min_length']})")
            
            # Check allowed values
            if 'allowed_values' in rules and value not in rules['allowed_values']:
                row_errors.append(f"Row {row_num}: '{column}' invalid value '{value}'. Must be one of: {', '.join(rules['allowed_values'])}")
        
        # Special validation for source_doc (should exist in sample_docs)
        source_doc = row.get('source_doc', '').strip()
        if source_doc:
            doc_path = self.csv_path.parent.parent / 'sample_docs' / source_doc
            if not doc_path.exists():
                row_errors.append(f"Row {row_num}: source_doc '{source_doc}' not found in sample_docs/")
        
        # Log errors
        if row_errors:
            for error in row_errors:
                self.errors.append(error)
        
        return row_errors
    
    def _print_results(self):
        """Print validation results"""
        print("\n" + "=" * 60)
        print("📊 RESULTS")
        print("=" * 60)
        
        print(f"\n✓ Valid rows: {self.valid_rows}/{self.total_rows}")
        
        if self.total_rows > 0:
            accuracy = (self.valid_rows / self.total_rows) * 100
            print(f"  Accuracy: {accuracy:.1f}%")
        
        if self.errors:
            print(f"\n❌ ERRORS ({len(self.errors)}):")
            for error in self.errors[:10]:  # Show first 10 errors
                print(f"  • {error}")
            if len(self.errors) > 10:
                print(f"  ... and {len(self.errors) - 10} more errors")
        
        if self.warnings:
            print(f"\n⚠️  WARNINGS ({len(self.warnings)}):")
            for warning in self.warnings:
                print(f"  • {warning}")
        
        print("\n" + "=" * 60)
        
        if not self.errors:
            print("✅ CSV VALIDATION PASSED")
            print(f"   Ready to convert {self.valid_rows} pairs to YAML")
        else:
            print("❌ CSV VALIDATION FAILED")
            print("   Fix errors above and retry")
        
        print("=" * 60 + "\n")


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/csv_validator.py <csv_file>")
        print("Example: python scripts/csv_validator.py dataset/fixture/reference/qa_pairs_working.csv")
        sys.exit(1)
    
    csv_path = sys.argv[1]
    validator = CsvValidator(csv_path)
    
    success = validator.validate()
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
