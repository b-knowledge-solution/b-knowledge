"""Unit tests for the PowerPoint converter module.

Tests PowerPoint-to-PDF conversion via LibreOffice headless CLI, including
correct command construction, output directory handling, PDF path construction,
and error handling for conversion failures and timeouts.
"""
import os
import sys
import subprocess
from unittest.mock import MagicMock, patch
from pathlib import Path

# Mock logger before importing source module
sys.modules.setdefault('src.logger', MagicMock())

import pytest

from src.powerpoint_converter import (
    convert_powerpoint_to_pdf,
    is_powerpoint_file,
    POWERPOINT_EXTENSIONS,
    LIBREOFFICE_BIN,
    CONVERSION_TIMEOUT,
)


# ============================================================================
# is_powerpoint_file tests
# ============================================================================


class TestIsPowerpointFile:
    """Tests for is_powerpoint_file() extension detection."""

    def test_pptx_recognized(self):
        """Verify .pptx files are recognized as PowerPoint files."""
        assert is_powerpoint_file('slides.pptx') is True

    def test_ppt_recognized(self):
        """Verify legacy .ppt files are recognized as PowerPoint files."""
        assert is_powerpoint_file('slides.ppt') is True

    def test_pptm_recognized(self):
        """Verify macro-enabled .pptm files are recognized as PowerPoint files."""
        assert is_powerpoint_file('slides.pptm') is True

    def test_case_insensitive(self):
        """Verify extension matching is case-insensitive."""
        assert is_powerpoint_file('DECK.PPTX') is True
        assert is_powerpoint_file('Deck.Ppt') is True
        assert is_powerpoint_file('file.PPTM') is True

    def test_non_powerpoint_extension_rejected(self):
        """Verify non-PowerPoint extensions are rejected."""
        assert is_powerpoint_file('report.docx') is False
        assert is_powerpoint_file('data.xlsx') is False
        assert is_powerpoint_file('image.jpg') is False

    def test_no_extension_rejected(self):
        """Verify files without extensions are rejected."""
        assert is_powerpoint_file('noextension') is False

    def test_pdf_rejected(self):
        """Verify PDF files are not treated as PowerPoint files."""
        assert is_powerpoint_file('slides.pdf') is False

    def test_multiple_dots_uses_last_extension(self):
        """Verify only the last extension segment is checked."""
        assert is_powerpoint_file('archive.backup.pptx') is True
        assert is_powerpoint_file('file.pptx.pdf') is False


class TestPowerpointExtensionsConstant:
    """Tests for the POWERPOINT_EXTENSIONS constant."""

    def test_contains_all_powerpoint_extensions(self):
        """Verify the set contains all three supported PowerPoint extensions."""
        assert POWERPOINT_EXTENSIONS == {'.ppt', '.pptx', '.pptm'}


# ============================================================================
# convert_powerpoint_to_pdf tests
# ============================================================================


def _make_successful_side_effect(output_dir, pdf_name):
    """Create a subprocess.run side effect that simulates successful conversion.

    Creates the expected PDF file in the output directory when subprocess.run
    is called, mimicking LibreOffice behavior.

    Args:
        output_dir: Directory where the PDF should be created.
        pdf_name: Name of the PDF file to create.

    Returns:
        Callable side effect for mock_run.side_effect.
    """
    def side_effect(*args, **kwargs):
        os.makedirs(output_dir, exist_ok=True)
        Path(output_dir, pdf_name).touch()
        result = MagicMock()
        result.returncode = 0
        result.stdout = ''
        result.stderr = ''
        return result
    return side_effect


class TestConvertPowerpointToPdf:
    """Tests for convert_powerpoint_to_pdf() conversion logic."""

    @patch('src.powerpoint_converter.subprocess.run')
    def test_correct_cli_arguments(self, mock_run, tmp_path):
        """Verify LibreOffice is invoked with correct headless CLI arguments.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'slides.pptx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.side_effect = _make_successful_side_effect(output_dir, 'slides.pdf')

        convert_powerpoint_to_pdf(str(input_file), output_dir)

        mock_run.assert_called_once()
        cmd = mock_run.call_args[0][0]

        assert cmd[0] == LIBREOFFICE_BIN
        assert '--headless' in cmd
        assert '--norestore' in cmd
        assert '--convert-to' in cmd
        assert 'pdf' in cmd
        assert '--outdir' in cmd
        assert output_dir in cmd
        assert str(input_file) in cmd

    @patch('src.powerpoint_converter.subprocess.run')
    def test_subprocess_called_with_correct_kwargs(self, mock_run, tmp_path):
        """Verify subprocess.run receives capture_output, text, and timeout kwargs.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'deck.pptx'
        input_file.touch()
        output_dir = str(tmp_path / 'out')

        mock_run.side_effect = _make_successful_side_effect(output_dir, 'deck.pdf')

        convert_powerpoint_to_pdf(str(input_file), output_dir)

        call_kwargs = mock_run.call_args[1]
        assert call_kwargs['capture_output'] is True
        assert call_kwargs['text'] is True
        assert call_kwargs['timeout'] == CONVERSION_TIMEOUT

    @patch('src.powerpoint_converter.subprocess.run')
    def test_output_directory_created(self, mock_run, tmp_path):
        """Verify nested output directories are created before conversion.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'deck.pptx'
        input_file.touch()
        output_dir = str(tmp_path / 'deep' / 'nested' / 'output')

        def side_effect(*args, **kwargs):
            # The output directory should exist before subprocess runs
            assert os.path.isdir(output_dir)
            Path(output_dir, 'deck.pdf').touch()
            result = MagicMock()
            result.returncode = 0
            result.stdout = ''
            result.stderr = ''
            return result

        mock_run.side_effect = side_effect

        convert_powerpoint_to_pdf(str(input_file), output_dir)
        assert os.path.isdir(output_dir)

    @patch('src.powerpoint_converter.subprocess.run')
    def test_returns_correct_pdf_path(self, mock_run, tmp_path):
        """Verify the function returns the absolute path to the generated PDF.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'presentation.pptx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.side_effect = _make_successful_side_effect(
            output_dir, 'presentation.pdf'
        )

        result = convert_powerpoint_to_pdf(str(input_file), output_dir)

        expected = os.path.join(output_dir, 'presentation.pdf')
        assert result == expected

    @patch('src.powerpoint_converter.subprocess.run')
    def test_pdf_name_derived_from_stem(self, mock_run, tmp_path):
        """Verify PDF filename uses the stem of the input file.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'q4.review.final.pptx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.side_effect = _make_successful_side_effect(
            output_dir, 'q4.review.final.pdf'
        )

        result = convert_powerpoint_to_pdf(str(input_file), output_dir)
        assert result.endswith('q4.review.final.pdf')

    @patch('src.powerpoint_converter.subprocess.run')
    def test_ppt_extension(self, mock_run, tmp_path):
        """Verify legacy .ppt files are converted correctly.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'legacy.ppt'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.side_effect = _make_successful_side_effect(output_dir, 'legacy.pdf')

        result = convert_powerpoint_to_pdf(str(input_file), output_dir)
        assert result.endswith('legacy.pdf')

    @patch('src.powerpoint_converter.subprocess.run')
    def test_pptm_extension(self, mock_run, tmp_path):
        """Verify macro-enabled .pptm files are converted correctly.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'macros.pptm'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.side_effect = _make_successful_side_effect(output_dir, 'macros.pdf')

        result = convert_powerpoint_to_pdf(str(input_file), output_dir)
        assert result.endswith('macros.pdf')


class TestConvertPowerpointToPdfErrors:
    """Tests for convert_powerpoint_to_pdf() error handling."""

    @patch('src.powerpoint_converter.subprocess.run')
    def test_nonzero_exit_raises_runtime_error(self, mock_run, tmp_path):
        """Verify RuntimeError is raised when LibreOffice exits with non-zero code.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'corrupt.pptx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.return_value = MagicMock(
            returncode=1,
            stderr='Error processing presentation',
            stdout='',
        )

        with pytest.raises(RuntimeError, match='PowerPoint conversion failed'):
            convert_powerpoint_to_pdf(str(input_file), output_dir)

    @patch('src.powerpoint_converter.subprocess.run')
    def test_error_message_includes_exit_code(self, mock_run, tmp_path):
        """Verify the error message includes the LibreOffice exit code.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'bad.pptx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.return_value = MagicMock(
            returncode=77,
            stderr='crash',
            stdout='',
        )

        with pytest.raises(RuntimeError, match='exit 77'):
            convert_powerpoint_to_pdf(str(input_file), output_dir)

    @patch('src.powerpoint_converter.subprocess.run')
    def test_error_message_includes_stderr(self, mock_run, tmp_path):
        """Verify the error message includes LibreOffice stderr output.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'bad.pptx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.return_value = MagicMock(
            returncode=1,
            stderr='java.lang.NullPointerException',
            stdout='',
        )

        with pytest.raises(RuntimeError, match='java.lang.NullPointerException'):
            convert_powerpoint_to_pdf(str(input_file), output_dir)

    @patch('src.powerpoint_converter.subprocess.run')
    def test_timeout_raises_runtime_error(self, mock_run, tmp_path):
        """Verify RuntimeError is raised when conversion exceeds the timeout.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'huge.pptx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.side_effect = subprocess.TimeoutExpired(
            cmd=['libreoffice'], timeout=CONVERSION_TIMEOUT
        )

        with pytest.raises(RuntimeError, match='timed out'):
            convert_powerpoint_to_pdf(str(input_file), output_dir)

    @patch('src.powerpoint_converter.subprocess.run')
    def test_timeout_message_includes_filename(self, mock_run, tmp_path):
        """Verify the timeout error message includes the input filename.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'bigdeck.pptx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.side_effect = subprocess.TimeoutExpired(
            cmd=['libreoffice'], timeout=CONVERSION_TIMEOUT
        )

        with pytest.raises(RuntimeError, match='bigdeck.pptx'):
            convert_powerpoint_to_pdf(str(input_file), output_dir)

    @patch('src.powerpoint_converter.subprocess.run')
    def test_missing_output_raises_runtime_error(self, mock_run, tmp_path):
        """Verify RuntimeError when LibreOffice exits 0 but produces no PDF.

        This handles corrupt files that LibreOffice silently skips.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'silent_fail.pptx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.return_value = MagicMock(
            returncode=0,
            stderr='',
            stdout='',
        )

        with pytest.raises(RuntimeError, match='no PDF output'):
            convert_powerpoint_to_pdf(str(input_file), output_dir)

    @patch('src.powerpoint_converter.subprocess.run')
    def test_missing_output_message_includes_filename(self, mock_run, tmp_path):
        """Verify the missing-output error includes the source filename.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'empty.ppt'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_run.return_value = MagicMock(
            returncode=0,
            stderr='',
            stdout='',
        )

        with pytest.raises(RuntimeError, match='empty.ppt'):
            convert_powerpoint_to_pdf(str(input_file), output_dir)
