"""Unit tests for the Excel converter module.

Tests Excel-to-PDF conversion including the UNO-based smart page setup path,
the CLI fallback path, paper size selection, content dimension calculation,
orientation configuration, shrink thresholds, and error handling.
"""
import os
import sys
import subprocess
from unittest.mock import MagicMock, patch, call
from pathlib import Path

# Mock logger and UNO dependencies before importing source module
sys.modules.setdefault('src.logger', MagicMock())

# Mock the UNO bridge modules that are only available with system LibreOffice Python
_mock_uno = MagicMock()
_mock_uno.systemPathToFileUrl = lambda p: f'file://{p}'
_mock_uno.getComponentContext.return_value = MagicMock()
_mock_uno.Any = lambda type_name, value: value
sys.modules.setdefault('uno', _mock_uno)

_mock_property_value = MagicMock()
sys.modules.setdefault('com', MagicMock())
sys.modules.setdefault('com.sun', MagicMock())
sys.modules.setdefault('com.sun.star', MagicMock())
sys.modules.setdefault('com.sun.star.beans', _mock_property_value)
sys.modules.setdefault('com.sun.star.awt', MagicMock())

import pytest

from src.excel_converter import (
    convert_excel_to_pdf,
    _convert_with_cli,
    _select_paper_size,
    _get_content_dimensions,
    is_excel_file,
    EXCEL_EXTENSIONS,
    LIBREOFFICE_BIN,
    CONVERSION_TIMEOUT,
    PAPER_CATALOG,
    DEFAULT_SHRINK_THRESHOLD,
    MM_PER_INCH,
)


# ============================================================================
# is_excel_file tests
# ============================================================================


class TestIsExcelFile:
    """Tests for is_excel_file() extension detection."""

    def test_xlsx_recognized(self):
        """Verify .xlsx files are recognized as Excel files."""
        assert is_excel_file('data.xlsx') is True

    def test_xls_recognized(self):
        """Verify legacy .xls files are recognized as Excel files."""
        assert is_excel_file('data.xls') is True

    def test_xlsm_recognized(self):
        """Verify macro-enabled .xlsm files are recognized as Excel files."""
        assert is_excel_file('data.xlsm') is True

    def test_case_insensitive(self):
        """Verify extension matching is case-insensitive."""
        assert is_excel_file('DATA.XLSX') is True
        assert is_excel_file('Data.Xls') is True
        assert is_excel_file('file.XLSM') is True

    def test_non_excel_extension_rejected(self):
        """Verify non-Excel extensions are rejected."""
        assert is_excel_file('report.docx') is False
        assert is_excel_file('slides.pptx') is False
        assert is_excel_file('image.png') is False

    def test_no_extension_rejected(self):
        """Verify files without extensions are rejected."""
        assert is_excel_file('noextension') is False

    def test_pdf_rejected(self):
        """Verify PDF files are not treated as Excel files."""
        assert is_excel_file('spreadsheet.pdf') is False

    def test_multiple_dots_uses_last_extension(self):
        """Verify only the last extension segment is checked."""
        assert is_excel_file('backup.2024.xlsx') is True
        assert is_excel_file('file.xlsx.pdf') is False


class TestExcelExtensionsConstant:
    """Tests for the EXCEL_EXTENSIONS constant."""

    def test_contains_all_excel_extensions(self):
        """Verify the set contains all three supported Excel extensions."""
        assert EXCEL_EXTENSIONS == {'.xls', '.xlsx', '.xlsm'}


# ============================================================================
# _select_paper_size tests
# ============================================================================


class TestSelectPaperSize:
    """Tests for _select_paper_size() paper catalog selection logic."""

    def test_narrow_content_selects_a4_portrait(self):
        """Verify narrow content (< 8.27") selects A4 portrait as smallest fit.

        A4 portrait width is 8.27", the smallest entry in the catalog.
        """
        name, width, height, orient = _select_paper_size(7.0)

        assert name == 'A4'
        assert orient == 'portrait'
        # A4 portrait width must be >= the needed width
        assert width >= 7.0

    def test_letter_width_content(self):
        """Verify content slightly wider than A4 may use shrink-to-fit on A4.

        Needed width 8.3" exceeds A4 (8.27") by ~0.36%, well within the 10%
        shrink threshold. The algorithm may prefer A4 with shrink over Letter
        if it wastes less paper.
        """
        name, width, height, orient = _select_paper_size(8.3)

        # Result must be either an exact fit (>= 8.3) or within shrink tolerance
        min_acceptable = 8.3 / (1 + DEFAULT_SHRINK_THRESHOLD)
        assert width >= min_acceptable

    def test_wide_content_selects_landscape(self):
        """Verify wide content with landscape preference selects landscape paper.

        Content of 12.0" with prefer_landscape=True filters to landscape entries
        only. The algorithm may use shrink-to-fit if within the 10% threshold,
        so A4 landscape (11.69") could be selected for 12.0" content.
        """
        name, width, height, orient = _select_paper_size(12.0, prefer_landscape=True)

        # Must select a landscape paper within shrink tolerance or larger
        min_acceptable = 12.0 / (1 + DEFAULT_SHRINK_THRESHOLD)
        assert width >= min_acceptable
        assert orient == 'landscape'

    def test_prefer_landscape_filters_catalog(self):
        """Verify prefer_landscape=True only considers landscape entries."""
        name, width, height, orient = _select_paper_size(
            9.0, prefer_landscape=True
        )

        # With landscape preference, should pick a landscape paper
        assert orient == 'landscape'

    def test_very_wide_content_uses_largest_paper(self):
        """Verify extremely wide content falls back to the largest available paper.

        Content wider than all papers in the catalog should select the last entry.
        """
        name, width, height, orient = _select_paper_size(50.0)

        # Should return the largest paper in the catalog (last entry)
        largest = PAPER_CATALOG[-1]
        assert name == largest[0]
        assert width == largest[1]

    def test_exact_fit_preferred_over_shrink(self):
        """Verify exact-fit paper is chosen when shrink waste exceeds exact waste.

        When a paper exactly fits the content, it should be preferred over
        a smaller paper that requires shrinking.
        """
        # A4 portrait width is 8.27" — requesting exactly 8.27" should pick A4
        name, width, height, orient = _select_paper_size(8.27)

        assert width >= 8.27

    def test_shrink_threshold_allows_slightly_small_paper(self):
        """Verify the shrink threshold allows selecting a slightly smaller paper.

        With 10% threshold, content of 9.0" could fit on paper >= 9.0/1.10 = 8.18".
        A4 (8.27") is within the shrink range and may be selected if waste is less.
        """
        name, width, height, orient = _select_paper_size(
            9.0, shrink_threshold=0.10
        )

        # Result should either be an exact fit or within shrink tolerance
        assert width >= 9.0 or width >= 9.0 / 1.10

    def test_zero_shrink_threshold_no_shrink_candidates(self):
        """Verify zero shrink threshold only allows exact-fit papers."""
        name, width, height, orient = _select_paper_size(
            8.3, shrink_threshold=0.0
        )

        # With no shrink allowed, paper must be >= needed width
        assert width >= 8.3

    def test_default_shrink_threshold_value(self):
        """Verify the default shrink threshold is 10%."""
        assert DEFAULT_SHRINK_THRESHOLD == 0.10

    def test_small_content_selects_smallest_paper(self):
        """Verify very small content selects the smallest available paper."""
        name, width, height, orient = _select_paper_size(3.0)

        # Smallest paper in catalog is A4 portrait (8.27")
        assert name == 'A4'
        assert orient == 'portrait'

    def test_returns_four_element_tuple(self):
        """Verify the return value is a tuple of (name, width, height, orientation)."""
        result = _select_paper_size(8.0)

        assert len(result) == 4
        name, width, height, orient = result
        assert isinstance(name, str)
        assert isinstance(width, float)
        assert isinstance(height, float)
        assert orient in ('portrait', 'landscape')


# ============================================================================
# _get_content_dimensions tests
# ============================================================================


class TestGetContentDimensions:
    """Tests for _get_content_dimensions() UNO sheet measurement."""

    def _make_mock_sheet(self, last_row=10, last_col=5, col_widths=None):
        """Create a mock UNO sheet with configurable dimensions.

        Args:
            last_row: Last used row index (0-based, returned by getRangeAddress).
            last_col: Last used column index (0-based, returned by getRangeAddress).
            col_widths: List of column widths in 1/100mm. Defaults to 2268 per column.

        Returns:
            MagicMock: A mock UNO sheet object.
        """
        sheet = MagicMock()

        # Mock cursor and range address
        cursor = MagicMock()
        range_addr = MagicMock()
        range_addr.EndRow = last_row
        range_addr.EndColumn = last_col
        cursor.getRangeAddress.return_value = range_addr
        sheet.createCursor.return_value = cursor

        # Mock columns with widths
        if col_widths is None:
            # Default: ~0.9" per column (2268 = 22.68mm in 1/100mm units)
            col_widths = [2268] * (last_col + 1)

        columns = MagicMock()

        def get_by_index(idx):
            """Return a mock column with the configured width."""
            col = MagicMock()
            if idx < len(col_widths):
                col.getPropertyValue.return_value = col_widths[idx]
            else:
                col.getPropertyValue.return_value = 2268
            return col

        columns.getByIndex.side_effect = get_by_index
        sheet.getColumns.return_value = columns

        return sheet

    def test_returns_width_and_col_count(self):
        """Verify the function returns a tuple of (width_inches, last_col)."""
        sheet = self._make_mock_sheet(last_row=10, last_col=4)

        width, cols = _get_content_dimensions(sheet)

        assert isinstance(width, float)
        assert isinstance(cols, int)
        # 5 columns (0-based index 4 → 1-based count 5)
        assert cols == 5

    def test_empty_sheet_returns_zero(self):
        """Verify an empty sheet returns (0.0, 0) dimensions."""
        sheet = MagicMock()
        cursor = MagicMock()

        # Simulate an empty sheet with EndRow=-1 (0 rows)
        range_addr = MagicMock()
        range_addr.EndRow = -1
        range_addr.EndColumn = -1
        cursor.getRangeAddress.return_value = range_addr
        sheet.createCursor.return_value = cursor

        width, cols = _get_content_dimensions(sheet)

        assert width == 0.0
        assert cols == 0

    def test_column_width_calculation(self):
        """Verify content width is calculated from column widths in 1/100mm.

        Three columns each 2540 (1/100mm) = 25.4mm = 1.0" each = 3.0" total.
        """
        # 2540 in 1/100mm = 25.4mm = exactly 1 inch
        sheet = self._make_mock_sheet(
            last_row=5, last_col=2, col_widths=[2540, 2540, 2540]
        )

        width, cols = _get_content_dimensions(sheet)

        # 3 columns * 1.0" each = 3.0"
        assert abs(width - 3.0) < 0.01
        assert cols == 3

    def test_wide_spreadsheet_dimensions(self):
        """Verify wide spreadsheets report correct total width."""
        # 10 columns, each 5080 (1/100mm) = 50.8mm = 2.0" each
        sheet = self._make_mock_sheet(
            last_row=100, last_col=9, col_widths=[5080] * 10
        )

        width, cols = _get_content_dimensions(sheet)

        # 10 columns * 2.0" = 20.0"
        assert abs(width - 20.0) < 0.01
        assert cols == 10

    def test_fallback_on_cursor_exception(self):
        """Verify fallback to letter width (8.5") when cursor operation fails."""
        sheet = MagicMock()
        # Simulate UNO exception during cursor creation
        sheet.createCursor.side_effect = Exception('UNO error')

        width, cols = _get_content_dimensions(sheet)

        # Fallback values: 8.5" width, 1 column
        assert width == 8.5
        assert cols == 1

    def test_default_width_for_inaccessible_column(self):
        """Verify default column width is used when getPropertyValue fails.

        When a column's width cannot be read, the fallback is 2268 (1/100mm).
        """
        sheet = MagicMock()
        cursor = MagicMock()
        range_addr = MagicMock()
        range_addr.EndRow = 5
        range_addr.EndColumn = 1
        cursor.getRangeAddress.return_value = range_addr
        sheet.createCursor.return_value = cursor

        # Make column access raise an exception to trigger fallback
        columns = MagicMock()
        columns.getByIndex.side_effect = Exception('Column error')
        sheet.getColumns.return_value = columns

        width, cols = _get_content_dimensions(sheet)

        # 2 columns with default width 2268 each
        # 2 * 2268 / 100 / 25.4 ≈ 1.786"
        expected = (2 * 2268 / 100.0) / MM_PER_INCH
        assert abs(width - expected) < 0.01
        assert cols == 2


# ============================================================================
# _convert_with_cli tests
# ============================================================================


class TestConvertWithCli:
    """Tests for _convert_with_cli() LibreOffice CLI fallback."""

    @patch('src.excel_converter.subprocess.run')
    def test_correct_cli_arguments(self, mock_run, tmp_path):
        """Verify LibreOffice CLI fallback uses correct headless arguments.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        mock_run.return_value = MagicMock(returncode=0, stdout='', stderr='')
        output_dir = str(tmp_path / 'output')

        _convert_with_cli('/input/data.xlsx', output_dir)

        mock_run.assert_called_once()
        cmd = mock_run.call_args[0][0]

        assert cmd[0] == LIBREOFFICE_BIN
        assert '--headless' in cmd
        assert '--norestore' in cmd
        assert '--convert-to' in cmd
        assert 'pdf' in cmd
        assert '--outdir' in cmd
        assert output_dir in cmd
        assert '/input/data.xlsx' in cmd

    @patch('src.excel_converter.subprocess.run')
    def test_subprocess_kwargs(self, mock_run, tmp_path):
        """Verify subprocess.run receives capture_output, text, and timeout kwargs.

        Args:
            mock_run: Mocked subprocess.run.
            tmp_path: pytest temporary directory fixture.
        """
        mock_run.return_value = MagicMock(returncode=0, stdout='', stderr='')

        _convert_with_cli('/input/data.xlsx', str(tmp_path))

        kwargs = mock_run.call_args[1]
        assert kwargs['capture_output'] is True
        assert kwargs['text'] is True
        assert kwargs['timeout'] == CONVERSION_TIMEOUT

    @patch('src.excel_converter.subprocess.run')
    def test_nonzero_exit_raises_runtime_error(self, mock_run):
        """Verify RuntimeError on non-zero LibreOffice exit code.

        Args:
            mock_run: Mocked subprocess.run returning failure.
        """
        mock_run.return_value = MagicMock(
            returncode=1, stderr='conversion error', stdout=''
        )

        with pytest.raises(RuntimeError, match='Excel CLI conversion failed'):
            _convert_with_cli('/input/bad.xlsx', '/output')

    @patch('src.excel_converter.subprocess.run')
    def test_timeout_raises_runtime_error(self, mock_run):
        """Verify RuntimeError when CLI conversion exceeds the timeout.

        Args:
            mock_run: Mocked subprocess.run raising TimeoutExpired.
        """
        mock_run.side_effect = subprocess.TimeoutExpired(
            cmd=['libreoffice'], timeout=CONVERSION_TIMEOUT
        )

        with pytest.raises(RuntimeError, match='timed out'):
            _convert_with_cli('/input/huge.xlsx', '/output')


# ============================================================================
# convert_excel_to_pdf tests (top-level dispatcher)
# ============================================================================


class TestConvertExcelToPdf:
    """Tests for convert_excel_to_pdf() UNO-then-CLI dispatch logic."""

    @patch('src.excel_converter._convert_with_cli')
    @patch('src.excel_converter._convert_with_uno')
    def test_uno_success_returns_pdf_path(self, mock_uno, mock_cli, tmp_path):
        """Verify UNO path is used first and returns the correct PDF path.

        Args:
            mock_uno: Mocked _convert_with_uno (succeeds).
            mock_cli: Mocked _convert_with_cli (should not be called).
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'data.xlsx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        result = convert_excel_to_pdf(str(input_file), output_dir)

        expected = os.path.join(output_dir, 'data.pdf')
        assert result == expected
        # UNO should be called, CLI should not
        mock_uno.assert_called_once()
        mock_cli.assert_not_called()

    @patch('src.excel_converter._convert_with_cli')
    @patch('src.excel_converter._convert_with_uno')
    def test_falls_back_to_cli_on_uno_failure(self, mock_uno, mock_cli, tmp_path):
        """Verify CLI fallback is used when UNO conversion fails.

        Args:
            mock_uno: Mocked _convert_with_uno (raises exception).
            mock_cli: Mocked _convert_with_cli (fallback).
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'data.xlsx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        # UNO fails, triggering CLI fallback
        mock_uno.side_effect = RuntimeError('UNO bridge not available')

        # CLI fallback creates the PDF
        def cli_side_effect(input_path, out_dir):
            """Simulate CLI creating the output PDF."""
            os.makedirs(out_dir, exist_ok=True)
            Path(out_dir, 'data.pdf').touch()

        mock_cli.side_effect = cli_side_effect

        result = convert_excel_to_pdf(str(input_file), output_dir)

        expected = os.path.join(output_dir, 'data.pdf')
        assert result == expected
        mock_uno.assert_called_once()
        mock_cli.assert_called_once()

    @patch('src.excel_converter._convert_with_cli')
    @patch('src.excel_converter._convert_with_uno')
    def test_cli_fallback_no_output_raises(self, mock_uno, mock_cli, tmp_path):
        """Verify RuntimeError when both UNO and CLI produce no output.

        Args:
            mock_uno: Mocked _convert_with_uno (raises exception).
            mock_cli: Mocked _convert_with_cli (produces no PDF).
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'data.xlsx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        mock_uno.side_effect = RuntimeError('UNO unavailable')
        # CLI runs but creates no output file
        mock_cli.return_value = None

        with pytest.raises(RuntimeError, match='no PDF output'):
            convert_excel_to_pdf(str(input_file), output_dir)

    @patch('src.excel_converter._convert_with_cli')
    @patch('src.excel_converter._convert_with_uno')
    def test_output_directory_created(self, mock_uno, mock_cli, tmp_path):
        """Verify the output directory is created before conversion starts.

        Args:
            mock_uno: Mocked _convert_with_uno (succeeds).
            mock_cli: Mocked _convert_with_cli.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'data.xlsx'
        input_file.touch()
        output_dir = str(tmp_path / 'nested' / 'output')

        convert_excel_to_pdf(str(input_file), output_dir)

        # Directory should be created by makedirs before UNO is called
        assert os.path.isdir(output_dir)

    @patch('src.excel_converter._convert_with_cli')
    @patch('src.excel_converter._convert_with_uno')
    def test_xls_extension(self, mock_uno, mock_cli, tmp_path):
        """Verify legacy .xls files produce correct PDF output path.

        Args:
            mock_uno: Mocked _convert_with_uno (succeeds).
            mock_cli: Mocked _convert_with_cli.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'legacy.xls'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        result = convert_excel_to_pdf(str(input_file), output_dir)

        assert result.endswith('legacy.pdf')

    @patch('src.excel_converter._convert_with_cli')
    @patch('src.excel_converter._convert_with_uno')
    def test_xlsm_extension(self, mock_uno, mock_cli, tmp_path):
        """Verify macro-enabled .xlsm files produce correct PDF output path.

        Args:
            mock_uno: Mocked _convert_with_uno (succeeds).
            mock_cli: Mocked _convert_with_cli.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'macros.xlsm'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        result = convert_excel_to_pdf(str(input_file), output_dir)

        assert result.endswith('macros.pdf')

    @patch('src.excel_converter._convert_with_cli')
    @patch('src.excel_converter._convert_with_uno')
    def test_pdf_name_from_stem(self, mock_uno, mock_cli, tmp_path):
        """Verify PDF name is derived from input file stem, not full name.

        Args:
            mock_uno: Mocked _convert_with_uno (succeeds).
            mock_cli: Mocked _convert_with_cli.
            tmp_path: pytest temporary directory fixture.
        """
        input_file = tmp_path / 'q4.budget.final.xlsx'
        input_file.touch()
        output_dir = str(tmp_path / 'output')

        result = convert_excel_to_pdf(str(input_file), output_dir)

        assert result.endswith('q4.budget.final.pdf')


# ============================================================================
# Paper catalog tests
# ============================================================================


class TestPaperCatalog:
    """Tests for the PAPER_CATALOG constant structure and ordering."""

    def test_catalog_sorted_by_width(self):
        """Verify the paper catalog is sorted by width in ascending order.

        The selection algorithm depends on ascending width ordering.
        """
        widths = [entry[1] for entry in PAPER_CATALOG]

        for i in range(len(widths) - 1):
            assert widths[i] <= widths[i + 1], (
                f'Paper catalog not sorted: index {i} ({widths[i]}) > '
                f'index {i + 1} ({widths[i + 1]})'
            )

    def test_catalog_contains_common_sizes(self):
        """Verify the catalog includes A4, Letter, A3, and Tabloid entries."""
        names = {entry[0] for entry in PAPER_CATALOG}

        assert 'A4' in names
        assert 'Letter' in names
        assert 'A3' in names
        assert 'Tabloid' in names

    def test_catalog_entries_have_four_fields(self):
        """Verify every catalog entry has (name, width, height, orientation)."""
        for entry in PAPER_CATALOG:
            assert len(entry) == 4
            name, width, height, orient = entry
            assert isinstance(name, str)
            assert isinstance(width, float)
            assert isinstance(height, float)
            assert orient in ('portrait', 'landscape')

    def test_catalog_has_both_orientations(self):
        """Verify the catalog includes both portrait and landscape entries."""
        orientations = {entry[3] for entry in PAPER_CATALOG}

        assert 'portrait' in orientations
        assert 'landscape' in orientations

    def test_landscape_entries_have_wider_dimension_first(self):
        """Verify landscape entries have width > height."""
        for entry in PAPER_CATALOG:
            name, width, height, orient = entry
            if orient == 'landscape':
                assert width > height, (
                    f'Landscape entry {name} has width ({width}) <= height ({height})'
                )
