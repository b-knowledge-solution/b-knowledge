"""Unit tests for the Word converter module.

Tests Word-to-PDF conversion via LibreOffice headless CLI, including
correct command construction, temp directory handling, output file
verification, and error handling for various failure modes.
"""
import os
import sys
import subprocess
from unittest.mock import MagicMock, patch, PropertyMock
from pathlib import Path

# Mock logger before importing source module
sys.modules.setdefault('src.logger', MagicMock())

import pytest

from src.word_converter import (
    convert_word_to_pdf,
    is_word_file,
    WORD_EXTENSIONS,
    LIBREOFFICE_BIN,
    CONVERSION_TIMEOUT,
)


# ============================================================================
# is_word_file tests
# ============================================================================


class TestIsWordFile:
    """Tests for is_word_file() extension detection."""

    def test_docx_recognized(self):
        """Verify .docx files are recognized as Word files."""
        assert is_word_file('report.docx') is True

    def test_doc_recognized(self):
        """Verify legacy .doc files are recognized as Word files."""
        assert is_word_file('report.doc') is True

    def test_docm_recognized(self):
        """Verify macro-enabled .docm files are recognized as Word files."""
        assert is_word_file('report.docm') is True

    def test_case_insensitive(self):
        """Verify extension matching is case-insensitive."""
        assert is_word_file('REPORT.DOCX') is True
        assert is_word_file('Report.Doc') is True
        assert is_word_file('file.DOCM') is True

    def test_non_word_extension_rejected(self):
        """Verify non-Word extensions are rejected."""
        assert is_word_file('data.xlsx') is False
        assert is_word_file('slides.pptx') is False
        assert is_word_file('image.png') is False

    def test_no_extension_rejected(self):
        """Verify files without extensions are rejected."""
        assert is_word_file('noextension') is False

    def test_pdf_rejected(self):
        """Verify PDF files are not treated as Word files."""
        assert is_word_file('document.pdf') is False

    def test_multiple_dots_uses_last_extension(self):
        """Verify only the last extension segment is checked."""
        assert is_word_file('archive.backup.docx') is True
        assert is_word_file('file.docx.pdf') is False


class TestWordExtensionsConstant:
    """Tests for the WORD_EXTENSIONS constant."""

    def test_contains_all_word_extensions(self):
        """Verify the set contains all three supported Word extensions."""
        assert WORD_EXTENSIONS == {'.doc', '.docx', '.docm'}


# ============================================================================
# convert_word_to_pdf tests
# ============================================================================


class TestConvertWordToPdf:
    """Tests for convert_word_to_pdf() conversion logic."""

    @patch('src.word_converter.subprocess.run')
    def test_correct_cli_arguments(self, mock_run, tmp_path):
        """Verify LibreOffice is invoked with correct headless CLI arguments.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'input' / 'report.docx'
        input_file.parent.mkdir(parents=True)
        input_file.touch()

        output_dir = str(tmp_path / 'output')

        # Simulate successful conversion by creating the expected PDF
        def side_effect(*args, **kwargs):
            os.makedirs(output_dir, exist_ok=True)
            Path(output_dir, 'report.pdf').touch()
            result = MagicMock()
            result.returncode = 0
            result.stdout = ''
            result.stderr = ''
            return result

        mock_run.side_effect = side_effect

        convert_word_to_pdf(str(input_file), output_dir)

        # Verify the exact CLI arguments passed to LibreOffice
        mock_run.assert_called_once()
        call_args = mock_run.call_args
        cmd = call_args[0][0]

        assert cmd[0] == LIBREOFFICE_BIN
        assert '--headless' in cmd
        assert '--norestore' in cmd
        assert '--convert-to' in cmd
        assert 'pdf' in cmd
        assert '--outdir' in cmd
        assert output_dir in cmd
        assert str(input_file) in cmd

    @patch('src.word_converter.subprocess.run')
    def test_capture_output_and_text_flags(self, mock_run, tmp_path):
        """Verify subprocess.run is called with capture_output=True and text=True.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'doc.docx'
        input_file.touch()
        output_dir = str(tmp_path / 'out')

        def side_effect(*args, **kwargs):
            os.makedirs(output_dir, exist_ok=True)
            Path(output_dir, 'doc.pdf').touch()
            result = MagicMock()
            result.returncode = 0
            result.stdout = ''
            result.stderr = ''
            return result

        mock_run.side_effect = side_effect

        convert_word_to_pdf(str(input_file), output_dir)

        call_kwargs = mock_run.call_args[1]
        assert call_kwargs['capture_output'] is True
        assert call_kwargs['text'] is True
        assert call_kwargs['timeout'] == CONVERSION_TIMEOUT

    @patch('src.word_converter.subprocess.run')
    def test_output_directory_created(self, mock_run, tmp_path):
        """Verify the output directory is created if it does not exist.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'doc.docx'
        input_file.touch()
        output_dir = str(tmp_path / 'nested' / 'output')

        def side_effect(*args, **kwargs):
            # Output dir should already exist by the time subprocess.run is called
            assert os.path.isdir(output_dir)
            Path(output_dir, 'doc.pdf').touch()
            result = MagicMock()
            result.returncode = 0
            result.stdout = ''
            result.stderr = ''
            return result

        mock_run.side_effect = side_effect

        convert_word_to_pdf(str(input_file), output_dir)

        # Confirm the nested directory was created
        assert os.path.isdir(output_dir)

    @patch('src.word_converter.subprocess.run')
    def test_returns_pdf_path(self, mock_run, tmp_path):
        """Verify the function returns the absolute path to the generated PDF.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'report.docx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        def side_effect(*args, **kwargs):
            os.makedirs(output_dir, exist_ok=True)
            Path(output_dir, 'report.pdf').touch()
            result = MagicMock()
            result.returncode = 0
            result.stdout = ''
            result.stderr = ''
            return result

        mock_run.side_effect = side_effect

        result = convert_word_to_pdf(str(input_file), output_dir)

        expected = os.path.join(output_dir, 'report.pdf')
        assert result == expected

    @patch('src.word_converter.subprocess.run')
    def test_pdf_name_from_stem(self, mock_run, tmp_path):
        """Verify PDF name is derived from input file stem (not full name).

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'my.report.final.docx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        def side_effect(*args, **kwargs):
            os.makedirs(output_dir, exist_ok=True)
            # LibreOffice uses stem of the input file
            Path(output_dir, 'my.report.final.pdf').touch()
            result = MagicMock()
            result.returncode = 0
            result.stdout = ''
            result.stderr = ''
            return result

        mock_run.side_effect = side_effect

        result = convert_word_to_pdf(str(input_file), output_dir)

        assert result.endswith('my.report.final.pdf')

    @patch('src.word_converter.subprocess.run')
    def test_doc_extension(self, mock_run, tmp_path):
        """Verify .doc files are converted correctly.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'legacy.doc'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        def side_effect(*args, **kwargs):
            os.makedirs(output_dir, exist_ok=True)
            Path(output_dir, 'legacy.pdf').touch()
            result = MagicMock()
            result.returncode = 0
            result.stdout = ''
            result.stderr = ''
            return result

        mock_run.side_effect = side_effect

        result = convert_word_to_pdf(str(input_file), output_dir)
        assert result.endswith('legacy.pdf')

    @patch('src.word_converter.subprocess.run')
    def test_docm_extension(self, mock_run, tmp_path):
        """Verify .docm macro-enabled files are converted correctly.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'macros.docm'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        def side_effect(*args, **kwargs):
            os.makedirs(output_dir, exist_ok=True)
            Path(output_dir, 'macros.pdf').touch()
            result = MagicMock()
            result.returncode = 0
            result.stdout = ''
            result.stderr = ''
            return result

        mock_run.side_effect = side_effect

        result = convert_word_to_pdf(str(input_file), output_dir)
        assert result.endswith('macros.pdf')


class TestConvertWordToPdfErrors:
    """Tests for convert_word_to_pdf() error handling."""

    @patch('src.word_converter.subprocess.run')
    def test_nonzero_exit_raises_runtime_error(self, mock_run, tmp_path):
        """Verify RuntimeError is raised when LibreOffice exits with non-zero code.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'corrupt.docx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.return_value = MagicMock(
            returncode=1,
            stderr='Error processing document',
            stdout='',
        )

        with pytest.raises(RuntimeError, match='Word conversion failed'):
            convert_word_to_pdf(str(input_file), output_dir)

    @patch('src.word_converter.subprocess.run')
    def test_error_message_includes_exit_code(self, mock_run, tmp_path):
        """Verify the error message includes the exit code from LibreOffice.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'bad.docx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.return_value = MagicMock(
            returncode=42,
            stderr='segfault',
            stdout='',
        )

        with pytest.raises(RuntimeError, match='exit 42'):
            convert_word_to_pdf(str(input_file), output_dir)

    @patch('src.word_converter.subprocess.run')
    def test_timeout_raises_runtime_error(self, mock_run, tmp_path):
        """Verify RuntimeError is raised when LibreOffice exceeds the timeout.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'huge.docx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        # Simulate subprocess timeout
        mock_run.side_effect = subprocess.TimeoutExpired(
            cmd=['libreoffice'], timeout=CONVERSION_TIMEOUT
        )

        with pytest.raises(RuntimeError, match='timed out'):
            convert_word_to_pdf(str(input_file), output_dir)

    @patch('src.word_converter.subprocess.run')
    def test_timeout_message_includes_filename(self, mock_run, tmp_path):
        """Verify the timeout error message includes the input filename.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'largefile.docx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.side_effect = subprocess.TimeoutExpired(
            cmd=['libreoffice'], timeout=CONVERSION_TIMEOUT
        )

        with pytest.raises(RuntimeError, match='largefile.docx'):
            convert_word_to_pdf(str(input_file), output_dir)

    @patch('src.word_converter.subprocess.run')
    def test_missing_output_raises_runtime_error(self, mock_run, tmp_path):
        """Verify RuntimeError is raised when LibreOffice exits 0 but produces no PDF.

        This handles the case of corrupt files that LibreOffice silently skips.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'silent_fail.docx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        # Simulate success exit code but no output file created
        mock_run.return_value = MagicMock(
            returncode=0,
            stderr='',
            stdout='',
        )

        with pytest.raises(RuntimeError, match='no PDF output'):
            convert_word_to_pdf(str(input_file), output_dir)

    @patch('src.word_converter.subprocess.run')
    def test_missing_output_message_includes_filename(self, mock_run, tmp_path):
        """Verify the missing-output error includes the source filename.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'empty.doc'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.return_value = MagicMock(
            returncode=0,
            stderr='',
            stdout='',
        )

        with pytest.raises(RuntimeError, match='empty.doc'):
            convert_word_to_pdf(str(input_file), output_dir)
