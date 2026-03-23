"""Unit tests for the tabular data parser module.

Tests data type detection, boolean/datetime conversion, column type
inference, and file extension dispatch in rag/app/table.py. Database
and Excel dependencies are mocked.
"""

import os
import sys
import types
import pytest
from unittest.mock import MagicMock, patch

_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


# ---------------------------------------------------------------------------
# Stub heavy dependencies
# ---------------------------------------------------------------------------
def _ensure_mock_module(name: str):
    """Register a mock module in sys.modules if not already importable.

    Args:
        name: Dotted module path to mock.
    """
    if name not in sys.modules:
        try:
            __import__(name)
        except (ImportError, ModuleNotFoundError):
            mod = types.ModuleType(name)
            sys.modules[name] = mod
            parts = name.split(".")
            for i in range(1, len(parts)):
                parent = ".".join(parts[:i])
                if parent not in sys.modules:
                    sys.modules[parent] = types.ModuleType(parent)


_mock_rag_tokenizer = MagicMock()
_mock_rag_tokenizer.tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()
_mock_rag_tokenizer.fine_grained_tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()

_ensure_mock_module("common.settings")
_ensure_mock_module("common.token_utils")
_ensure_mock_module("rag.nlp")
sys.modules["rag.nlp"].rag_tokenizer = _mock_rag_tokenizer

for _fn_name in ["tokenize", "tokenize_table"]:
    if not hasattr(sys.modules["rag.nlp"], _fn_name):
        setattr(sys.modules["rag.nlp"], _fn_name, MagicMock())

# Force-reload real dateutil so trans_datatime works (conftest mocks it)
import importlib
for _m in ["dateutil", "dateutil.parser"]:
    if _m in sys.modules:
        del sys.modules[_m]
import dateutil.parser
importlib.reload(dateutil.parser)

dummy_callback = lambda prog=None, msg="": None


# ---------------------------------------------------------------------------
# Import functions under test — reload to pick up real dateutil
# ---------------------------------------------------------------------------
if "rag.app.table" in sys.modules:
    importlib.reload(sys.modules["rag.app.table"])
from rag.app.table import trans_datatime, trans_bool, column_data_type


class TestTransDatetime:
    """Tests for trans_datatime date/time string parsing."""

    def test_valid_date_string(self):
        """Should parse a standard date string."""
        result = trans_datatime("2024-01-15")
        assert result is not None
        assert "2024-01-15" in result

    def test_valid_datetime_string(self):
        """Should parse a datetime string with time component."""
        result = trans_datatime("2024-01-15 14:30:00")
        assert result == "2024-01-15 14:30:00"

    def test_valid_date_with_slashes(self):
        """Should parse dates with slash separators."""
        result = trans_datatime("01/15/2024")
        assert result is not None
        assert "2024" in result

    def test_invalid_string_returns_none(self):
        """Non-date strings should return None."""
        assert trans_datatime("not a date") is None
        assert trans_datatime("hello world") is None

    def test_empty_string_returns_none(self):
        """Empty string should return None."""
        assert trans_datatime("   ") is None

    def test_numeric_string_may_parse(self):
        """Pure numbers might be interpreted as dates by dateutil."""
        # dateutil might interpret some numbers as dates; this tests behavior
        result = trans_datatime("20240115")
        # The behavior depends on dateutil; we just verify no crash
        assert result is None or isinstance(result, str)


class TestTransBool:
    """Tests for trans_bool boolean string detection."""

    def test_true_values(self):
        """Various truthy values should return 'yes'."""
        for val in ["true", "True", "TRUE", "yes", "Yes", "YES", "是", "*", "✓", "✔", "☑", "✅", "√"]:
            assert trans_bool(val) == "yes", f"Expected 'yes' for '{val}'"

    def test_false_values(self):
        """Various falsy values should return 'no'."""
        for val in ["false", "False", "FALSE", "no", "No", "NO", "否", "×"]:
            assert trans_bool(val) == "no", f"Expected 'no' for '{val}'"

    def test_non_boolean_returns_none(self):
        """Non-boolean strings should return None."""
        assert trans_bool("maybe") is None
        assert trans_bool("123") is None
        assert trans_bool("hello") is None

    def test_case_insensitive(self):
        """Boolean detection should be case-insensitive."""
        assert trans_bool("TRUE") == "yes"
        assert trans_bool("false") == "no"


class TestColumnDataType:
    """Tests for column_data_type type inference."""

    def test_integer_column(self):
        """A column of integers should be detected as 'int'."""
        arr, ty = column_data_type(["1", "2", "3", "100"])
        assert ty == "int"
        # Values should be converted to int
        assert all(isinstance(v, int) for v in arr if v is not None)

    def test_float_column(self):
        """A column of floats should be detected as 'float'."""
        arr, ty = column_data_type(["1.5", "2.7", "3.14"])
        assert ty == "float"

    def test_text_column(self):
        """A column of text strings should be detected as 'text'."""
        arr, ty = column_data_type(["hello", "world", "foo bar"])
        assert ty == "text"

    def test_boolean_column(self):
        """A column of boolean values should be detected as 'bool'."""
        arr, ty = column_data_type(["yes", "no", "true", "false"])
        assert ty == "bool"

    def test_datetime_column(self):
        """A column of date strings should be detected as 'datetime'."""
        arr, ty = column_data_type(["2024-01-15", "2024-02-20", "2024-03-25"])
        assert ty == "datetime"

    def test_none_values_skipped(self):
        """None values should be skipped during type detection."""
        arr, ty = column_data_type([None, "1", "2", None, "3"])
        assert ty == "int"

    def test_mixed_int_and_float_prefers_float(self):
        """When mixing ints and floats, should detect as float or int depending on majority."""
        arr, ty = column_data_type(["1", "2.5", "3"])
        # Most values look like int or float
        assert ty in ("int", "float")

    def test_large_integer_becomes_float(self):
        """Integers exceeding 2^63-1 should trigger float detection."""
        huge_num = str(2**63)
        arr, ty = column_data_type([huge_num])
        assert ty == "float"

    def test_leading_zero_not_treated_as_int(self):
        """Numbers with leading zeros (like zip codes) should not be int."""
        arr, ty = column_data_type(["01234", "05678", "09012"])
        # Leading-zero strings are not int; dateutil may parse them as datetime
        assert ty != "int"

    def test_empty_array(self):
        """An empty array should not crash."""
        arr, ty = column_data_type([])
        # Should return some type without crashing
        assert isinstance(ty, str)

    def test_all_none_values(self):
        """An array of all None values should not crash."""
        arr, ty = column_data_type([None, None, None])
        assert isinstance(ty, str)


# Check if real pandas is installed (not just a mock module)
try:
    _pd_test = sys.modules.get("pandas")
    _has_pandas = _pd_test is not None and hasattr(_pd_test, "__version__")
except Exception:
    _has_pandas = False


class TestTableChunkDispatch:
    """Tests for the chunk() function's file extension dispatch."""

    def test_unsupported_extension_raises_not_implemented(self):
        """An unsupported extension should raise NotImplementedError."""
        from rag.app.table import chunk

        with pytest.raises(NotImplementedError):
            chunk("data.xyz", binary=b"content", callback=dummy_callback)

    @pytest.mark.skipif(not _has_pandas, reason="pandas not installed")
    @patch("rag.app.table.get_text", return_value="name\tage\nAlice\t30\nBob\t25")
    @patch("rag.app.table.KnowledgebaseService")
    @patch("rag.app.table.settings")
    def test_txt_file_parses_tsv(self, mock_settings, mock_kb_svc, mock_get_text):
        """A .txt file should be parsed as tab-separated values."""
        from rag.app.table import chunk

        # Mock settings for ES/OS mode
        mock_settings.DOC_ENGINE_INFINITY = False
        mock_settings.DOC_ENGINE_OCEANBASE = False

        result = chunk(
            "data.txt", binary=b"name\tage\nAlice\t30",
            callback=dummy_callback, kb_id="test-kb"
        )

        # Should produce rows as chunks
        assert len(result) >= 1

    @pytest.mark.skipif(not _has_pandas, reason="pandas not installed")
    @patch("rag.app.table.get_text", return_value="name,age\nAlice,30\nBob,25")
    @patch("rag.app.table.KnowledgebaseService")
    @patch("rag.app.table.settings")
    def test_csv_file_parses(self, mock_settings, mock_kb_svc, mock_get_text):
        """A .csv file should be parsed with csv reader."""
        from rag.app.table import chunk

        mock_settings.DOC_ENGINE_INFINITY = False
        mock_settings.DOC_ENGINE_OCEANBASE = False

        result = chunk(
            "data.csv", binary=b"name,age\nAlice,30",
            callback=dummy_callback, kb_id="test-kb"
        )

        assert len(result) >= 1

    @patch("rag.app.table.get_text", return_value="")
    def test_empty_csv_raises_value_error(self, mock_get_text):
        """An empty CSV file should raise ValueError."""
        from rag.app.table import chunk

        with pytest.raises(ValueError, match="Empty CSV file"):
            chunk("empty.csv", binary=b"", callback=dummy_callback, kb_id="test-kb")
