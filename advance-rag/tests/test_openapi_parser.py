"""Unit tests for the OpenAPI/Swagger spec parser module.

Tests endpoint-per-chunk parsing for OpenAPI 3.x YAML and Swagger 2.0 JSON
specs. Validates ref resolution, metadata extraction, chunk structure, and
error handling for malformed input.
"""

import os
import sys
import types
import pytest
from unittest.mock import MagicMock

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

# Dummy callback matching the parser contract
dummy_callback = lambda prog, msg="": None


def _read_fixture(name: str) -> bytes:
    """Read a fixture file and return its content as bytes.

    Args:
        name: Filename inside the fixtures directory.

    Returns:
        Raw bytes of the fixture file.
    """
    path = os.path.join(FIXTURES_DIR, name)
    with open(path, "rb") as f:
        return f.read()


# ---------------------------------------------------------------------------
# Stub out heavy dependencies that openapi.py's rag_tokenizer import chain
# needs. Same pattern as test_code_parser.py.
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


# Mock the tokenizer with simple lowercase passthrough
_mock_rag_tokenizer = MagicMock()
_mock_rag_tokenizer.tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()
_mock_rag_tokenizer.fine_grained_tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()

# Pre-register modules that may have heavy deps not installed in test env
_ensure_mock_module("common.settings")
_ensure_mock_module("common.token_utils")
_ensure_mock_module("rag.nlp")
sys.modules["rag.nlp"].rag_tokenizer = _mock_rag_tokenizer

# Mock prance.ResolvingParser to parse YAML/JSON and do simple ref resolution
import yaml as _yaml

def _resolve_refs(spec, root=None):
    """Recursively resolve $ref pointers in an OpenAPI spec dict."""
    if root is None:
        root = spec
    if isinstance(spec, dict):
        if "$ref" in spec:
            ref_path = spec["$ref"].lstrip("#/").split("/")
            resolved = root
            for part in ref_path:
                resolved = resolved.get(part, {})
            return _resolve_refs(resolved, root)
        return {k: _resolve_refs(v, root) for k, v in spec.items()}
    if isinstance(spec, list):
        return [_resolve_refs(item, root) for item in spec]
    return spec

class _MockResolvingParser:
    """Mock prance.ResolvingParser that parses YAML/JSON and resolves refs."""
    def __init__(self, spec_string=None, content_type=None, **kwargs):
        if content_type and "json" in content_type:
            import json as _json
            raw = _json.loads(spec_string)
        else:
            raw = _yaml.safe_load(spec_string)
        self.specification = _resolve_refs(raw)

_ensure_mock_module("prance")
sys.modules["prance"].ResolvingParser = _MockResolvingParser


class TestOpenAPI3YamlParsing:
    """Tests for OpenAPI 3.x YAML spec parsing."""

    def test_produces_one_chunk_per_endpoint(self):
        """OpenAPI 3.0 YAML with 3 endpoints should produce 3 chunks."""
        from rag.app.openapi import chunk

        binary = _read_fixture("sample_openapi3.yaml")
        chunks = chunk("sample_openapi3.yaml", binary=binary, callback=dummy_callback)

        # 3 endpoints: GET /users, POST /users, GET /users/{id}
        assert len(chunks) == 3

    def test_chunk_contains_path_and_method_in_content(self):
        """Each endpoint chunk content should include the path and HTTP method."""
        from rag.app.openapi import chunk

        binary = _read_fixture("sample_openapi3.yaml")
        chunks = chunk("sample_openapi3.yaml", binary=binary, callback=dummy_callback)

        # Find the GET /users chunk
        get_users = [c for c in chunks if c.get("http_method") == "get" and c.get("path") == "/users"]
        assert len(get_users) == 1
        content = get_users[0]["content_with_weight"]
        assert "GET" in content
        assert "/users" in content

    def test_chunk_contains_summary_parameters_and_responses(self):
        """Endpoint chunk should include summary, parameters, and response info."""
        from rag.app.openapi import chunk

        binary = _read_fixture("sample_openapi3.yaml")
        chunks = chunk("sample_openapi3.yaml", binary=binary, callback=dummy_callback)

        # GET /users has parameters and summary
        get_users = [c for c in chunks if c.get("operation_id") == "listUsers"][0]
        content = get_users["content_with_weight"]
        assert "List all users" in content
        assert "limit" in content
        assert "200" in content

    def test_ref_pointers_resolved_and_schemas_inlined(self):
        """$ref pointers should be resolved and schemas inlined in chunk content."""
        from rag.app.openapi import chunk

        binary = _read_fixture("sample_openapi3.yaml")
        chunks = chunk("sample_openapi3.yaml", binary=binary, callback=dummy_callback)

        # POST /users references CreateUserRequest schema via $ref
        post_users = [c for c in chunks if c.get("operation_id") == "createUser"][0]
        content = post_users["content_with_weight"]
        # After resolution, the actual schema fields should be present (not $ref)
        assert "name" in content
        assert "email" in content

    def test_endpoint_metadata_fields(self):
        """Each chunk should have metadata: path, http_method, operation_id, tags, summary, security."""
        from rag.app.openapi import chunk

        binary = _read_fixture("sample_openapi3.yaml")
        chunks = chunk("sample_openapi3.yaml", binary=binary, callback=dummy_callback)

        # POST /users has security requirement
        post_users = [c for c in chunks if c.get("operation_id") == "createUser"][0]
        assert post_users["path"] == "/users"
        assert post_users["http_method"] == "post"
        assert post_users["operation_id"] == "createUser"
        assert "users" in post_users["tags"]
        assert post_users["summary"] == "Create a new user"
        assert isinstance(post_users["security"], list)
        assert len(post_users["security"]) > 0

    def test_required_chunk_dict_fields(self):
        """Every chunk must have content_with_weight, content_ltks, content_sm_ltks, docnm_kwd, title_tks."""
        from rag.app.openapi import chunk

        binary = _read_fixture("sample_openapi3.yaml")
        chunks = chunk("sample_openapi3.yaml", binary=binary, callback=dummy_callback)

        required_fields = ["content_with_weight", "content_ltks", "content_sm_ltks", "docnm_kwd", "title_tks"]
        for c in chunks:
            for field in required_fields:
                assert field in c, f"Missing field '{field}' in chunk"
            assert c["docnm_kwd"] == "sample_openapi3.yaml"


class TestSwagger2JsonParsing:
    """Tests for Swagger 2.0 JSON spec parsing."""

    def test_swagger2_produces_per_endpoint_chunks(self):
        """Swagger 2.0 JSON with 2 endpoints should produce 2 chunks."""
        from rag.app.openapi import chunk

        binary = _read_fixture("sample_swagger2.json")
        chunks = chunk("sample_swagger2.json", binary=binary, callback=dummy_callback)

        # 2 endpoints: GET /items, POST /items
        assert len(chunks) == 2

    def test_swagger2_ref_resolution(self):
        """Swagger 2.0 $ref to definitions should be resolved."""
        from rag.app.openapi import chunk

        binary = _read_fixture("sample_swagger2.json")
        chunks = chunk("sample_swagger2.json", binary=binary, callback=dummy_callback)

        # POST /items references CreateItemRequest via $ref
        post_items = [c for c in chunks if c.get("operation_id") == "createItem"][0]
        content = post_items["content_with_weight"]
        # Schema fields should be present after resolution
        assert "name" in content

    def test_swagger2_chunk_has_required_fields(self):
        """Swagger 2.0 chunks should have all required chunk dict fields."""
        from rag.app.openapi import chunk

        binary = _read_fixture("sample_swagger2.json")
        chunks = chunk("sample_swagger2.json", binary=binary, callback=dummy_callback)

        required_fields = ["content_with_weight", "content_ltks", "content_sm_ltks", "docnm_kwd", "title_tks"]
        for c in chunks:
            for field in required_fields:
                assert field in c, f"Missing field '{field}' in chunk"


class TestBothFormatsAccepted:
    """Tests that both YAML and JSON input formats are handled."""

    def test_yaml_format_accepted(self):
        """YAML OpenAPI spec should parse without error."""
        from rag.app.openapi import chunk

        binary = _read_fixture("sample_openapi3.yaml")
        chunks = chunk("spec.yaml", binary=binary, callback=dummy_callback)
        assert len(chunks) > 0

    def test_json_format_accepted(self):
        """JSON Swagger spec should parse without error."""
        from rag.app.openapi import chunk

        binary = _read_fixture("sample_swagger2.json")
        chunks = chunk("spec.json", binary=binary, callback=dummy_callback)
        assert len(chunks) > 0


class TestErrorHandling:
    """Tests for graceful error handling of invalid input."""

    def test_malformed_spec_returns_empty_list(self):
        """Invalid/malformed spec should produce empty list, not crash."""
        from rag.app.openapi import chunk

        malformed = b"this is not valid yaml or json: {{{"
        result = chunk("bad_spec.yaml", binary=malformed, callback=dummy_callback)
        assert isinstance(result, list)
        assert len(result) == 0

    def test_empty_binary_returns_empty_list(self):
        """Empty binary input should produce empty list."""
        from rag.app.openapi import chunk

        result = chunk("empty.yaml", binary=b"", callback=dummy_callback)
        assert isinstance(result, list)
        assert len(result) == 0
