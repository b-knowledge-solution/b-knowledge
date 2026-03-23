"""Unit tests for converter config module.

Tests configuration dataclasses, JSON parsing from Redis job data,
document type detection, and conditional feature flags.
"""
import json
import sys
from unittest.mock import MagicMock

# Mock logger before importing config
sys.modules.setdefault('src.logger', MagicMock())

import pytest
from src.config import (
    TrimWhitespaceConfig,
    PostProcessingConfig,
    SuffixConfig,
    ExcelConfig,
    ConverterConfig,
    load_config_from_job,
    get_doc_type,
    should_trim_whitespace,
    get_pdf_suffix,
)


class TestTrimWhitespaceConfig:
    """Tests for TrimWhitespaceConfig dataclass."""

    def test_defaults(self):
        """Verify default values are set correctly."""
        config = TrimWhitespaceConfig()
        assert config.enabled is True
        assert config.margin == 10.0
        assert config.include == ['excel']

    def test_custom_values(self):
        """Verify custom values override defaults."""
        config = TrimWhitespaceConfig(enabled=False, margin=20.0, include=['word', 'excel'])
        assert config.enabled is False
        assert config.margin == 20.0
        assert 'word' in config.include


class TestPostProcessingConfig:
    """Tests for PostProcessingConfig dataclass."""

    def test_defaults(self):
        """Verify default post-processing settings."""
        config = PostProcessingConfig()
        assert config.remove_empty_pages is True
        assert config.trim_whitespace.enabled is True

    def test_nested_trim_whitespace_defaults(self):
        """Verify nested TrimWhitespaceConfig is created with defaults."""
        config = PostProcessingConfig()
        assert isinstance(config.trim_whitespace, TrimWhitespaceConfig)
        assert config.trim_whitespace.margin == 10.0


class TestSuffixConfig:
    """Tests for SuffixConfig dataclass."""

    def test_defaults(self):
        """Verify default suffix values for each document type."""
        config = SuffixConfig()
        assert config.word == '_d'
        assert config.powerpoint == '_p'
        assert config.excel == '_x'

    def test_custom_suffix(self):
        """Verify custom suffix values can be set."""
        config = SuffixConfig(word='_word', powerpoint='_ppt', excel='_xls')
        assert config.word == '_word'
        assert config.powerpoint == '_ppt'
        assert config.excel == '_xls'


class TestExcelConfig:
    """Tests for ExcelConfig dataclass."""

    def test_defaults(self):
        """Verify default Excel conversion settings."""
        config = ExcelConfig()
        assert config.orientation == 'landscape'
        assert config.row_dimensions == 10
        assert config.metadata_header is True
        assert config.min_shrink_factor == 0.3

    def test_additional_defaults(self):
        """Verify additional Excel config defaults."""
        config = ExcelConfig()
        assert config.ocr_sheet_name_label is True
        assert config.oversized_action == 'skip'
        assert config.is_write_file_path is False
        assert config.page_shrink_threshold == 0.10


class TestConverterConfig:
    """Tests for ConverterConfig composite dataclass."""

    def test_defaults(self):
        """Verify all nested configs are created with defaults."""
        config = ConverterConfig()
        assert isinstance(config.post_processing, PostProcessingConfig)
        assert isinstance(config.suffix, SuffixConfig)
        assert isinstance(config.excel, ExcelConfig)

    def test_independent_instances(self):
        """Verify each instance has independent nested config objects."""
        config1 = ConverterConfig()
        config2 = ConverterConfig()
        config1.suffix.word = '_changed'
        # config2 should not be affected
        assert config2.suffix.word == '_d'


class TestLoadConfigFromJob:
    """Tests for load_config_from_job() function."""

    def test_empty_config(self):
        """Verify empty job data returns default config."""
        config = load_config_from_job({})
        assert config.suffix.word == '_d'
        assert config.post_processing.remove_empty_pages is True

    def test_no_config_key(self):
        """Verify missing config key returns defaults."""
        config = load_config_from_job({'other_key': 'value'})
        assert isinstance(config, ConverterConfig)

    def test_invalid_json(self):
        """Verify invalid JSON falls back to defaults."""
        config = load_config_from_job({'config': 'not-json'})
        assert config.suffix.word == '_d'

    def test_valid_config_overrides(self):
        """Verify valid JSON overrides specific settings."""
        job_data = {
            'config': json.dumps({
                'suffix': {'word': '_w', 'excel': '_e'},
                'post_processing': {
                    'remove_empty_pages': False,
                    'trim_whitespace': {'enabled': False, 'margin': 5.0}
                },
                'excel': {'orientation': 'portrait', 'row_dimensions': 20}
            })
        }
        config = load_config_from_job(job_data)
        assert config.suffix.word == '_w'
        assert config.suffix.excel == '_e'
        # Unchanged default
        assert config.suffix.powerpoint == '_p'
        assert config.post_processing.remove_empty_pages is False
        assert config.post_processing.trim_whitespace.enabled is False
        assert config.post_processing.trim_whitespace.margin == 5.0
        assert config.excel.orientation == 'portrait'
        assert config.excel.row_dimensions == 20

    def test_partial_config(self):
        """Verify partial config only overrides specified fields."""
        job_data = {
            'config': json.dumps({'suffix': {'word': '_word'}})
        }
        config = load_config_from_job(job_data)
        assert config.suffix.word == '_word'
        # Defaults unchanged
        assert config.suffix.powerpoint == '_p'
        assert config.post_processing.remove_empty_pages is True

    def test_empty_string_config(self):
        """Verify empty string config returns defaults."""
        config = load_config_from_job({'config': ''})
        assert isinstance(config, ConverterConfig)

    def test_excel_config_overrides(self):
        """Verify Excel-specific settings are parsed from job config."""
        job_data = {
            'config': json.dumps({
                'excel': {
                    'metadata_header': False,
                    'min_shrink_factor': 0.5,
                    'ocr_sheet_name_label': False,
                    'oversized_action': 'shrink',
                    'is_write_file_path': True,
                    'page_shrink_threshold': 0.20,
                }
            })
        }
        config = load_config_from_job(job_data)
        assert config.excel.metadata_header is False
        assert config.excel.min_shrink_factor == 0.5
        assert config.excel.ocr_sheet_name_label is False
        assert config.excel.oversized_action == 'shrink'
        assert config.excel.is_write_file_path is True
        assert config.excel.page_shrink_threshold == 0.20

    def test_none_config_value(self):
        """Verify None config value is handled gracefully."""
        config = load_config_from_job({'config': None})
        assert isinstance(config, ConverterConfig)


class TestGetDocType:
    """Tests for get_doc_type() function."""

    def test_word_extensions(self):
        """Verify Word document extensions are detected."""
        assert get_doc_type('file.doc') == 'word'
        assert get_doc_type('file.docx') == 'word'
        assert get_doc_type('file.docm') == 'word'

    def test_excel_extensions(self):
        """Verify Excel document extensions are detected."""
        assert get_doc_type('file.xls') == 'excel'
        assert get_doc_type('file.xlsx') == 'excel'
        assert get_doc_type('file.xlsm') == 'excel'

    def test_powerpoint_extensions(self):
        """Verify PowerPoint document extensions are detected."""
        assert get_doc_type('file.ppt') == 'powerpoint'
        assert get_doc_type('file.pptx') == 'powerpoint'
        assert get_doc_type('file.pptm') == 'powerpoint'

    def test_pdf_extension(self):
        """Verify PDF extension is detected."""
        assert get_doc_type('file.pdf') == 'pdf'

    def test_unknown_extension(self):
        """Verify unknown extensions return 'unknown'."""
        assert get_doc_type('file.txt') == 'unknown'
        assert get_doc_type('file.jpg') == 'unknown'

    def test_no_extension(self):
        """Verify files without extension return 'unknown'."""
        assert get_doc_type('noextension') == 'unknown'

    def test_case_insensitive(self):
        """Verify extension matching is case-insensitive."""
        assert get_doc_type('file.DOCX') == 'word'
        assert get_doc_type('file.Xlsx') == 'excel'
        assert get_doc_type('file.PDF') == 'pdf'

    def test_multiple_dots(self):
        """Verify only last extension is used."""
        assert get_doc_type('file.backup.docx') == 'word'


class TestShouldTrimWhitespace:
    """Tests for should_trim_whitespace() function."""

    def test_enabled_and_included_type(self):
        """Verify returns True when enabled and type is in include list."""
        config = ConverterConfig()
        assert should_trim_whitespace(config, 'excel') is True

    def test_enabled_but_excluded_type(self):
        """Verify returns False when type is not in include list."""
        config = ConverterConfig()
        assert should_trim_whitespace(config, 'word') is False

    def test_disabled(self):
        """Verify returns False when trimming is disabled."""
        config = ConverterConfig()
        config.post_processing.trim_whitespace.enabled = False
        assert should_trim_whitespace(config, 'excel') is False

    def test_disabled_but_included(self):
        """Verify returns False when disabled even if type is in include list."""
        config = ConverterConfig()
        config.post_processing.trim_whitespace.enabled = False
        config.post_processing.trim_whitespace.include = ['excel', 'word']
        assert should_trim_whitespace(config, 'excel') is False

    def test_custom_include_list(self):
        """Verify custom include list is respected."""
        config = ConverterConfig()
        config.post_processing.trim_whitespace.include = ['word', 'powerpoint']
        assert should_trim_whitespace(config, 'word') is True
        assert should_trim_whitespace(config, 'powerpoint') is True
        assert should_trim_whitespace(config, 'excel') is False


class TestGetPdfSuffix:
    """Tests for get_pdf_suffix() function."""

    def test_word_suffix(self):
        """Verify Word document suffix."""
        config = ConverterConfig()
        assert get_pdf_suffix(config, 'word') == '_d'

    def test_powerpoint_suffix(self):
        """Verify PowerPoint document suffix."""
        config = ConverterConfig()
        assert get_pdf_suffix(config, 'powerpoint') == '_p'

    def test_excel_suffix(self):
        """Verify Excel document suffix."""
        config = ConverterConfig()
        assert get_pdf_suffix(config, 'excel') == '_x'

    def test_unknown_type_returns_empty(self):
        """Verify unknown type returns empty string."""
        config = ConverterConfig()
        assert get_pdf_suffix(config, 'pdf') == ''

    def test_custom_suffix(self):
        """Verify custom suffix values are used."""
        config = ConverterConfig()
        config.suffix.word = '_word'
        assert get_pdf_suffix(config, 'word') == '_word'

    def test_nonexistent_type_returns_empty(self):
        """Verify completely unknown type returns empty string."""
        config = ConverterConfig()
        assert get_pdf_suffix(config, 'unknown') == ''
        assert get_pdf_suffix(config, '') == ''
