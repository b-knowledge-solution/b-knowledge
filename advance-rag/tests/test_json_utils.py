"""Unit tests for common.json_utils module.

Tests JSON serialization/deserialization with custom encoder support
for datetime, Enum, set, and BaseType objects.
"""
import os
import sys
import datetime
import json
from enum import Enum, IntEnum

import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

from common.json_utils import (
    BaseType,
    CustomJSONEncoder,
    json_dumps,
    json_loads,
    from_dict_hook,
)


# ── Test helpers ──────────────────────────────────────────────────────

class _Color(Enum):
    """Sample string enum for testing."""
    RED = "red"
    BLUE = "blue"


class _Priority(IntEnum):
    """Sample integer enum for testing."""
    LOW = 1
    HIGH = 2


class _Point(BaseType):
    """Simple BaseType subclass for testing serialization."""

    def __init__(self, x=0, y=0):
        self.x = x
        self.y = y


# ── BaseType ──────────────────────────────────────────────────────────

class TestBaseType:
    """Tests for BaseType.to_dict() and to_dict_with_type()."""

    def test_to_dict_strips_leading_underscores(self):
        """Verify leading underscores on attribute names are stripped."""
        obj = BaseType()
        obj._name = "secret"
        obj.value = 42
        d = obj.to_dict()
        assert "name" in d
        assert "value" in d
        assert "_name" not in d

    def test_to_dict_with_type_includes_module_and_type(self):
        """Verify to_dict_with_type includes module and type metadata."""
        p = _Point(1, 2)
        result = p.to_dict_with_type()
        assert result["type"] == "_Point"
        assert result["module"] is not None
        assert result["data"]["x"]["data"] == 1

    def test_to_dict_basic(self):
        """Verify simple attributes are serialized correctly."""
        p = _Point(3, 4)
        d = p.to_dict()
        assert d == {"x": 3, "y": 4}


# ── CustomJSONEncoder ─────────────────────────────────────────────────

class TestCustomJSONEncoder:
    """Tests for CustomJSONEncoder.default()."""

    def test_encodes_datetime(self):
        """Verify datetime is formatted as 'YYYY-MM-DD HH:MM:SS'."""
        dt = datetime.datetime(2025, 1, 15, 10, 30, 45)
        result = json.dumps(dt, cls=CustomJSONEncoder)
        assert result == '"2025-01-15 10:30:45"'

    def test_encodes_date(self):
        """Verify date is formatted as 'YYYY-MM-DD'."""
        d = datetime.date(2025, 6, 1)
        result = json.dumps(d, cls=CustomJSONEncoder)
        assert result == '"2025-06-01"'

    def test_encodes_timedelta(self):
        """Verify timedelta is serialized as its string representation."""
        td = datetime.timedelta(hours=2, minutes=30)
        result = json.dumps(td, cls=CustomJSONEncoder)
        assert "2:30:00" in result

    def test_encodes_string_enum(self):
        """Verify Enum values are serialized to their value."""
        result = json.dumps(_Color.RED, cls=CustomJSONEncoder)
        assert result == '"red"'

    def test_encodes_int_enum(self):
        """Verify IntEnum values are serialized to their integer value."""
        result = json.dumps(_Priority.HIGH, cls=CustomJSONEncoder)
        assert result == "2"

    def test_encodes_set_as_list(self):
        """Verify sets are serialized as lists."""
        result = json.dumps({"a", "b"}, cls=CustomJSONEncoder)
        parsed = json.loads(result)
        assert sorted(parsed) == ["a", "b"]

    def test_encodes_base_type(self):
        """Verify BaseType subclass is serialized via to_dict."""
        p = _Point(5, 6)
        result = json.dumps(p, cls=CustomJSONEncoder)
        parsed = json.loads(result)
        assert parsed == {"x": 5, "y": 6}

    def test_encodes_type_object(self):
        """Verify type objects are serialized to their __name__."""
        result = json.dumps(int, cls=CustomJSONEncoder)
        assert result == '"int"'

    def test_unsupported_type_raises(self):
        """Verify unsupported types raise TypeError."""
        with pytest.raises(TypeError):
            json.dumps(object(), cls=CustomJSONEncoder)


# ── json_dumps ────────────────────────────────────────────────────────

class TestJsonDumps:
    """Tests for json_dumps() wrapper function."""

    def test_returns_string_by_default(self):
        """Verify json_dumps returns a string when byte=False."""
        result = json_dumps({"key": "value"})
        assert isinstance(result, str)
        assert '"key"' in result

    def test_returns_bytes_when_requested(self):
        """Verify json_dumps returns bytes when byte=True."""
        result = json_dumps({"key": "value"}, byte=True)
        assert isinstance(result, bytes)

    def test_indent_formatting(self):
        """Verify indent parameter produces indented output."""
        result = json_dumps({"a": 1}, indent=2)
        # Indented JSON has newlines
        assert "\n" in result

    def test_handles_nested_custom_types(self):
        """Verify nested custom types (datetime, enum) are serialized."""
        data = {
            "created": datetime.datetime(2025, 1, 1, 0, 0, 0),
            "color": _Color.BLUE,
        }
        result = json_dumps(data)
        parsed = json.loads(result)
        assert parsed["created"] == "2025-01-01 00:00:00"
        assert parsed["color"] == "blue"

    def test_empty_dict(self):
        """Verify empty dict serializes correctly."""
        assert json_dumps({}) == "{}"

    def test_none_value(self):
        """Verify None serializes to 'null'."""
        assert json_dumps(None) == "null"


# ── json_loads ────────────────────────────────────────────────────────

class TestJsonLoads:
    """Tests for json_loads() wrapper function."""

    def test_loads_string(self):
        """Verify JSON string is deserialized to Python dict."""
        result = json_loads('{"key": "value"}')
        assert result == {"key": "value"}

    def test_loads_bytes(self):
        """Verify JSON bytes are deserialized to Python dict."""
        result = json_loads(b'{"num": 42}')
        assert result == {"num": 42}

    def test_loads_with_object_hook(self):
        """Verify custom object_hook is applied during deserialization."""
        # Hook that uppercases all string values
        def upper_hook(d):
            """Uppercase all string values in a dict."""
            return {k: v.upper() if isinstance(v, str) else v for k, v in d.items()}

        result = json_loads('{"name": "alice"}', object_hook=upper_hook)
        assert result["name"] == "ALICE"

    def test_invalid_json_raises(self):
        """Verify invalid JSON raises an error."""
        with pytest.raises(json.JSONDecodeError):
            json_loads("not json at all")

    def test_loads_list(self):
        """Verify JSON array is deserialized correctly."""
        result = json_loads("[1, 2, 3]")
        assert result == [1, 2, 3]


# ── from_dict_hook ────────────────────────────────────────────────────

class TestFromDictHook:
    """Tests for from_dict_hook() object hook."""

    def test_returns_data_when_module_is_none(self):
        """Verify plain typed data without module returns the raw data."""
        result = from_dict_hook({"type": "int", "data": 42, "module": None})
        assert result == 42

    def test_passes_through_regular_dict(self):
        """Verify dicts without type/data keys pass through unchanged."""
        d = {"name": "Alice", "age": 30}
        result = from_dict_hook(d)
        assert result == d

    def test_passes_through_dict_with_partial_keys(self):
        """Verify dicts with only 'type' or only 'data' pass through."""
        assert from_dict_hook({"type": "int"}) == {"type": "int"}
        assert from_dict_hook({"data": 5}) == {"data": 5}
