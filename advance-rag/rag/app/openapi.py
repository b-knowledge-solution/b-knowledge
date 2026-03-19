"""OpenAPI/Swagger spec parser module for the RAG pipeline.

Parses OpenAPI 3.x and Swagger 2.0 specification files into structured
endpoint chunks. Each path+method combination becomes a separate chunk
with inlined schema definitions. Uses prance for ref resolution.
"""

import json
import logging
import re
from copy import deepcopy

from rag.nlp import rag_tokenizer

logger = logging.getLogger(__name__)


def _parse_spec(binary: bytes, filename: str) -> dict:
    """Parse and resolve an OpenAPI/Swagger spec file.

    Detects YAML vs JSON format from file extension or content. Uses
    prance.ResolvingParser to resolve all $ref pointers. Supports both
    OpenAPI 3.x and Swagger 2.0 specs.

    Args:
        binary: Raw file bytes (YAML or JSON).
        filename: Original filename for format detection.

    Returns:
        Fully resolved spec dict with all refs inlined.

    Raises:
        Exception: If the spec cannot be parsed or resolved.
    """
    import prance

    spec_string = binary.decode("utf-8")

    # Detect if the content is JSON to set the appropriate content type
    is_json = filename.lower().endswith(".json")
    if not is_json:
        # Try detecting from content if extension is ambiguous
        stripped = spec_string.strip()
        is_json = stripped.startswith("{")

    content_type = "application/json" if is_json else "application/x-yaml"

    # prance resolves refs in both OpenAPI 3.x and Swagger 2.0
    parser = prance.ResolvingParser(
        spec_string=spec_string,
        content_type=content_type,
        backend="openapi-spec-validator",
        strict=False,
    )
    return parser.specification


def _schema_to_text(schema: dict, depth: int = 0, max_depth: int = 3) -> str:
    """Convert a JSON Schema object to human-readable text.

    Recursively renders schema properties, types, and nested objects
    into an indented text representation. Limits recursion to avoid
    infinite loops from circular references.

    Args:
        schema: JSON Schema dict (from resolved OpenAPI spec).
        depth: Current recursion depth.
        max_depth: Maximum recursion depth to prevent infinite loops.

    Returns:
        Human-readable schema representation string.
    """
    if not schema or not isinstance(schema, dict):
        return ""

    # Guard against circular ref / deep nesting
    if depth >= max_depth:
        return "  " * depth + "(...)"

    indent = "  " * depth
    lines = []

    schema_type = schema.get("type", "object")
    required_fields = set(schema.get("required", []))

    if schema_type == "object" and "properties" in schema:
        for prop_name, prop_schema in schema["properties"].items():
            req_marker = " (required)" if prop_name in required_fields else ""
            prop_type = prop_schema.get("type", "object")
            prop_format = prop_schema.get("format", "")
            type_str = f"{prop_type}" + (f" ({prop_format})" if prop_format else "")

            lines.append(f"{indent}- {prop_name}: {type_str}{req_marker}")

            # Recurse into nested objects
            if prop_type == "object" and "properties" in prop_schema:
                lines.append(_schema_to_text(prop_schema, depth + 1, max_depth))
            # Recurse into array items
            elif prop_type == "array" and "items" in prop_schema:
                item_schema = prop_schema["items"]
                item_type = item_schema.get("type", "object")
                lines.append(f"{indent}  items: {item_type}")
                if item_type == "object" and "properties" in item_schema:
                    lines.append(_schema_to_text(item_schema, depth + 1, max_depth))

    elif schema_type == "array" and "items" in schema:
        item_schema = schema["items"]
        item_type = item_schema.get("type", "object")
        lines.append(f"{indent}array of {item_type}")
        if "properties" in item_schema:
            lines.append(_schema_to_text(item_schema, depth + 1, max_depth))
    else:
        # Simple type
        fmt = schema.get("format", "")
        lines.append(f"{indent}{schema_type}" + (f" ({fmt})" if fmt else ""))

    return "\n".join(filter(None, lines))


def _endpoint_to_chunk_text(path: str, method: str, operation: dict) -> str:
    """Build human-readable text for one API endpoint.

    Formats the endpoint path, method, summary, parameters, request body,
    and responses into a structured text block for search indexing.

    Args:
        path: URL path (e.g., '/users/{id}').
        method: HTTP method (e.g., 'get').
        operation: Operation object from the resolved spec.

    Returns:
        Formatted endpoint text with all details.
    """
    lines = [f"{method.upper()} {path}"]

    # Summary
    summary = operation.get("summary", "")
    if summary:
        lines.append(f"\nSummary: {summary}")

    # Description
    description = operation.get("description", "")
    if description:
        lines.append(f"\nDescription: {description}")

    # Parameters
    params = operation.get("parameters", [])
    if params:
        lines.append("\nParameters:")
        for param in params:
            param_name = param.get("name", "unknown")
            param_in = param.get("in", "")
            param_required = param.get("required", False)
            param_desc = param.get("description", "")
            param_schema = param.get("schema", {})
            param_type = param_schema.get("type", param.get("type", ""))

            req_str = " (required)" if param_required else ""
            lines.append(f"  - {param_name} [{param_in}]: {param_type}{req_str}")
            if param_desc:
                lines.append(f"    {param_desc}")

    # Request body (OpenAPI 3.x style)
    request_body = operation.get("requestBody", {})
    if request_body:
        lines.append("\nRequest Body:")
        rb_required = request_body.get("required", False)
        if rb_required:
            lines.append("  Required: true")
        content = request_body.get("content", {})
        for media_type, media_obj in content.items():
            lines.append(f"  Content-Type: {media_type}")
            schema = media_obj.get("schema", {})
            if schema:
                lines.append(f"  Schema:")
                lines.append(_schema_to_text(schema, depth=2))

    # Responses
    responses = operation.get("responses", {})
    if responses:
        lines.append("\nResponses:")
        for status_code, response_obj in responses.items():
            resp_desc = response_obj.get("description", "")
            lines.append(f"  {status_code}: {resp_desc}")
            # OpenAPI 3.x response content
            resp_content = response_obj.get("content", {})
            for media_type, media_obj in resp_content.items():
                schema = media_obj.get("schema", {})
                if schema:
                    lines.append(_schema_to_text(schema, depth=2))
            # Swagger 2.0 response schema
            resp_schema = response_obj.get("schema", {})
            if resp_schema and not resp_content:
                lines.append(_schema_to_text(resp_schema, depth=2))

    return "\n".join(lines)


def _extract_endpoint_metadata(path: str, method: str, operation: dict) -> dict:
    """Extract structured metadata from an API endpoint operation.

    Args:
        path: URL path (e.g., '/users/{id}').
        method: HTTP method lowercase (e.g., 'get').
        operation: Operation object from the resolved spec.

    Returns:
        Dict with path, http_method, operation_id, tags, summary, security.
    """
    return {
        "path": path,
        "http_method": method.lower(),
        "operation_id": operation.get("operationId", ""),
        "tags": operation.get("tags", []),
        "summary": operation.get("summary", ""),
        "security": operation.get("security", []),
    }


def chunk(filename, binary=None, from_page=0, to_page=100000,
          lang="Chinese", callback=None, **kwargs):
    """Parse an OpenAPI/Swagger spec file into per-endpoint chunks.

    Each path+method combination in the spec becomes one chunk with the
    full endpoint details (parameters, request body, responses, schemas)
    inlined as readable text. Supports OpenAPI 3.x YAML/JSON and Swagger
    2.0 JSON.

    Args:
        filename: Name of the spec file (YAML or JSON).
        binary: Raw file content as bytes.
        from_page: Unused (kept for interface compatibility).
        to_page: Unused (kept for interface compatibility).
        lang: Language hint for tokenization.
        callback: Progress callback function(progress_float, message_str).
        **kwargs: Additional config including parser_config, kb_id, tenant_id.

    Returns:
        List of chunk dicts, each containing content_with_weight, tokenized
        fields, filename, and endpoint metadata (path, method, operation_id,
        tags, summary, security).
    """
    if callback is None:
        callback = lambda prog, msg="": None

    # Handle empty input
    if not binary:
        return []

    # Parse and resolve the spec
    try:
        spec = _parse_spec(binary, filename)
    except Exception as e:
        logger.warning("Failed to parse OpenAPI spec '%s': %s", filename, e)
        return []

    # Base document fields shared across all chunks
    doc = {
        "docnm_kwd": filename,
        "title_tks": rag_tokenizer.tokenize(re.sub(r"\.[a-zA-Z]+$", "", filename)),
    }

    callback(0.1, "Start to parse OpenAPI spec.")

    # Iterate over all paths and methods to produce one chunk per endpoint
    paths = spec.get("paths", {})
    res = []
    total_endpoints = sum(
        1 for p in paths.values()
        for m in p.keys()
        if m.lower() in ("get", "post", "put", "delete", "patch", "options", "head")
    )
    processed = 0

    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue

        for method, operation in path_item.items():
            # Skip non-HTTP-method keys like 'parameters', 'summary', etc.
            if method.lower() not in ("get", "post", "put", "delete", "patch", "options", "head"):
                continue

            if not isinstance(operation, dict):
                continue

            # Build chunk text with full endpoint details
            chunk_text = _endpoint_to_chunk_text(path, method, operation)

            # Extract structured metadata
            metadata = _extract_endpoint_metadata(path, method, operation)

            # Build the chunk dict
            d = deepcopy(doc)
            d["content_with_weight"] = chunk_text
            d["content_ltks"] = rag_tokenizer.tokenize(chunk_text)
            d["content_sm_ltks"] = rag_tokenizer.fine_grained_tokenize(d["content_ltks"])

            # Tag keywords for search filtering
            d["tag_kwd"] = ["openapi", method.lower()] + operation.get("tags", [])

            # Merge metadata fields into the chunk dict
            d.update(metadata)

            res.append(d)

            processed += 1
            if total_endpoints > 0:
                callback(0.1 + 0.5 * processed / total_endpoints,
                         f"Parsed endpoint {processed}/{total_endpoints}: {method.upper()} {path}")

    callback(0.6, f"Parsed {len(res)} endpoints from OpenAPI spec.")
    return res
