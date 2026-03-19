"""Code-aware parser module for the RAG pipeline.

Parses source code files using tree-sitter AST parsing to chunk by
function and class boundaries. Supports 20+ programming languages via
tree-sitter-language-pack. Preserves import context as file-level
metadata, extracts structured metadata (function_name, class_name,
parameters, return_type, decorators), and splits large functions at
inner block boundaries. Unsupported file extensions fall back to
naive line-based chunking.
"""

import os
import re
from copy import deepcopy

from tree_sitter_language_pack import get_parser
from rag.nlp import rag_tokenizer


# ---------------------------------------------------------------------------
# Language extension and AST node type mappings
# ---------------------------------------------------------------------------

# Map file extensions to tree-sitter language grammar names
EXTENSION_MAP: dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".jsx": "tsx",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".cpp": "cpp",
    ".c": "c",
    ".cs": "c_sharp",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".lua": "lua",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
    ".r": "r",
    ".dart": "dart",
    ".vue": "vue",
    ".svelte": "svelte",
}

# AST node types that represent function-level scopes per language
FUNCTION_NODE_TYPES: dict[str, list[str]] = {
    "python": ["function_definition", "decorated_definition"],
    "javascript": ["function_declaration", "arrow_function", "method_definition", "function_expression"],
    "typescript": ["function_declaration", "arrow_function", "method_definition", "function_expression"],
    "tsx": ["function_declaration", "arrow_function", "method_definition", "function_expression"],
    "java": ["method_declaration", "constructor_declaration"],
    "go": ["function_declaration", "method_declaration"],
    "rust": ["function_item"],
    "ruby": ["method", "singleton_method"],
    "cpp": ["function_definition"],
    "c": ["function_definition"],
    "c_sharp": ["method_declaration", "constructor_declaration"],
    "php": ["function_definition", "method_declaration"],
    "swift": ["function_declaration"],
    "kotlin": ["function_declaration"],
    "scala": ["function_definition"],
    "lua": ["function_declaration"],
    "bash": ["function_definition"],
    "r": ["function_definition"],
    "dart": ["function_signature", "method_signature"],
}

# AST node types that represent class-level scopes per language
CLASS_NODE_TYPES: dict[str, list[str]] = {
    "python": ["class_definition"],
    "javascript": ["class_declaration"],
    "typescript": ["class_declaration"],
    "tsx": ["class_declaration"],
    "java": ["class_declaration"],
    "go": ["type_declaration"],
    "rust": ["struct_item", "impl_item"],
    "ruby": ["class", "module"],
    "cpp": ["class_specifier", "struct_specifier"],
    "c_sharp": ["class_declaration"],
    "php": ["class_declaration"],
    "swift": ["class_declaration"],
    "kotlin": ["class_declaration"],
    "scala": ["class_definition", "object_definition"],
    "dart": ["class_declaration"],
}

# AST node types for import/include statements per language
IMPORT_NODE_TYPES: dict[str, list[str]] = {
    "python": ["import_statement", "import_from_statement"],
    "javascript": ["import_statement"],
    "typescript": ["import_statement"],
    "tsx": ["import_statement"],
    "java": ["import_declaration", "package_declaration"],
    "go": ["import_declaration"],
    "rust": ["use_declaration"],
    "ruby": ["call"],  # require/require_relative
    "cpp": ["preproc_include"],
    "c": ["preproc_include"],
    "c_sharp": ["using_directive"],
    "php": ["namespace_use_declaration"],
    "swift": ["import_declaration"],
    "kotlin": ["import_list"],
    "scala": ["import_declaration"],
}

# Inner block types used as split boundaries for large functions
BLOCK_SPLIT_TYPES: set[str] = {
    "if_statement", "for_statement", "while_statement", "try_statement",
    "with_statement", "match_statement", "switch_statement",
    "for_in_statement", "do_statement", "enhanced_for_statement",
}


def _get_language_for_extension(ext: str) -> str | None:
    """Look up the tree-sitter language name for a file extension.

    Args:
        ext: File extension including the dot (e.g., '.py').

    Returns:
        Tree-sitter language name, or None if unsupported.
    """
    return EXTENSION_MAP.get(ext.lower())


def _extract_imports(root_node, source_bytes: bytes, language: str) -> str:
    """Extract import/include statements from the AST root.

    Walks the top-level children of the AST root and collects all import
    nodes into a single concatenated string.

    Args:
        root_node: Tree-sitter root node of the parsed file.
        source_bytes: Raw source code bytes.
        language: Tree-sitter language name.

    Returns:
        Concatenated import statement text, or empty string if none found.
    """
    import_types = IMPORT_NODE_TYPES.get(language, [])
    if not import_types:
        return ""

    import_lines = []
    for child in root_node.children:
        # Check top-level nodes for import statements
        if child.type in import_types:
            import_lines.append(child.text.decode("utf-8", errors="replace"))
    return "\n".join(import_lines)


def _get_node_name(node) -> str:
    """Extract the identifier name from an AST node.

    Searches immediate children for an identifier or type_identifier node
    and returns its text content.

    Args:
        node: Tree-sitter AST node (function, class, etc.).

    Returns:
        The name string, or empty string if no identifier found.
    """
    for child in node.children:
        if child.type in ("identifier", "name", "type_identifier", "property_identifier"):
            return child.text.decode("utf-8", errors="replace")
        # For decorated_definition in Python, dig into the inner definition
        if child.type in ("function_definition", "class_definition"):
            return _get_node_name(child)
    return ""


def _get_decorators(node) -> str:
    """Extract decorator/annotation text from a node.

    Args:
        node: Tree-sitter AST node.

    Returns:
        Comma-separated decorator text, or empty string if none.
    """
    decorators = []
    for child in node.children:
        # Python decorators
        if child.type == "decorator":
            decorators.append(child.text.decode("utf-8", errors="replace"))
        # Java/Kotlin annotations
        elif child.type in ("annotation", "marker_annotation"):
            decorators.append(child.text.decode("utf-8", errors="replace"))
    return ", ".join(decorators)


def _get_parameters(node, language: str) -> str:
    """Extract parameter list text from a function node.

    Args:
        node: Tree-sitter function node.
        language: Tree-sitter language name.

    Returns:
        Parameter list as string, or empty string if none found.
    """
    # For decorated_definition, look inside the inner function
    if node.type == "decorated_definition":
        for child in node.children:
            if child.type == "function_definition":
                return _get_parameters(child, language)
        return ""

    for child in node.children:
        if child.type in ("parameters", "formal_parameters", "parameter_list",
                          "formal_parameter_list"):
            return child.text.decode("utf-8", errors="replace")
    return ""


def _get_return_type(node, language: str) -> str:
    """Extract return type annotation from a function node.

    Args:
        node: Tree-sitter function node.
        language: Tree-sitter language name.

    Returns:
        Return type as string, or empty string if none found.
    """
    # For decorated_definition, look inside the inner function
    if node.type == "decorated_definition":
        for child in node.children:
            if child.type == "function_definition":
                return _get_return_type(child, language)
        return ""

    text = node.text.decode("utf-8", errors="replace")
    # Python return type annotation: -> Type
    if language == "python":
        match = re.search(r"->\s*(.+?):", text)
        if match:
            return match.group(1).strip()
    # TypeScript/Java return type patterns
    elif language in ("typescript", "tsx", "javascript"):
        # function name(params): ReturnType
        match = re.search(r"\):\s*([^{]+)", text)
        if match:
            return match.group(1).strip()
    elif language == "java":
        # Return type appears before method name in Java
        for child in node.children:
            if child.type in ("type_identifier", "generic_type", "void_type",
                              "integral_type", "boolean_type"):
                return child.text.decode("utf-8", errors="replace")
    return ""


def _get_docstring(node) -> str:
    """Extract the docstring from a function or class node.

    Looks for the first string literal in the body block of the node,
    which follows Python/JavaScript docstring conventions.

    Args:
        node: Tree-sitter function or class node.

    Returns:
        Docstring text, or empty string if none found.
    """
    # For decorated_definition, look inside the inner definition
    target = node
    if node.type == "decorated_definition":
        for child in node.children:
            if child.type in ("function_definition", "class_definition"):
                target = child
                break

    for child in target.children:
        if child.type in ("block", "statement_block", "class_body"):
            for stmt in child.children:
                # Python: expression_statement containing a string
                if stmt.type == "expression_statement":
                    for expr in stmt.children:
                        if expr.type == "string":
                            return expr.text.decode("utf-8", errors="replace")
                # Direct string node (some grammars)
                elif stmt.type == "string":
                    return stmt.text.decode("utf-8", errors="replace")
                # JavaScript/TypeScript: comment nodes before body
                elif stmt.type == "comment":
                    return stmt.text.decode("utf-8", errors="replace")
                # Skip non-docstring nodes
                elif stmt.type not in ("{", "}", "newline", "indent", "dedent",
                                        "NEWLINE", "INDENT", "DEDENT"):
                    break
    return ""


def _estimate_tokens(text: str) -> int:
    """Estimate token count using whitespace splitting.

    Args:
        text: Text to estimate token count for.

    Returns:
        Approximate token count.
    """
    return len(text.split())


def _extract_scope_nodes(root_node, source_bytes: bytes, language: str) -> list[dict]:
    """Recursively extract function and class scope nodes from the AST.

    Walks the AST tree and collects all function/class definitions with
    their metadata. Methods inside classes get the parent class name.

    Args:
        root_node: Tree-sitter root node.
        source_bytes: Raw source code bytes.
        language: Tree-sitter language name.

    Returns:
        List of scope node dicts with type, name, body, metadata, etc.
    """
    func_types = set(FUNCTION_NODE_TYPES.get(language, []))
    class_types = set(CLASS_NODE_TYPES.get(language, []))
    results = []

    # Node types that contain nested definitions and should be recursed into
    container_types = {"block", "statement_block", "class_body", "program",
                       "module", "declaration_list", "body"}

    def _walk(node, parent_class: str = ""):
        """Recursively walk AST nodes collecting scope boundaries.

        Args:
            node: Current AST node to inspect.
            parent_class: Name of enclosing class, if any.
        """
        for child in node.children:
            node_text = child.text.decode("utf-8", errors="replace")

            # Handle class definitions
            if child.type in class_types:
                class_name = _get_node_name(child)
                results.append({
                    "node_type": "class",
                    "name": class_name,
                    "body": node_text,
                    "start_line": child.start_point[0],
                    "end_line": child.end_point[0],
                    "parent_class": parent_class,
                    "decorators": _get_decorators(child),
                    "parameters": "",
                    "return_type": "",
                    "docstring": _get_docstring(child),
                })
                # Recurse into class body to find methods
                _walk(child, parent_class=class_name)

            # Handle function/method definitions
            elif child.type in func_types:
                # Check if decorated_definition wraps a class (not a function)
                if child.type == "decorated_definition":
                    inner_is_class = any(
                        c.type in class_types for c in child.children
                    )
                    if inner_is_class:
                        class_name = _get_node_name(child)
                        results.append({
                            "node_type": "class",
                            "name": class_name,
                            "body": node_text,
                            "start_line": child.start_point[0],
                            "end_line": child.end_point[0],
                            "parent_class": parent_class,
                            "decorators": _get_decorators(child),
                            "parameters": "",
                            "return_type": "",
                            "docstring": _get_docstring(child),
                        })
                        _walk(child, parent_class=class_name)
                        continue

                func_name = _get_node_name(child)
                results.append({
                    "node_type": "function",
                    "name": func_name,
                    "body": node_text,
                    "start_line": child.start_point[0],
                    "end_line": child.end_point[0],
                    "parent_class": parent_class,
                    "decorators": _get_decorators(child),
                    "parameters": _get_parameters(child, language),
                    "return_type": _get_return_type(child, language),
                    "docstring": _get_docstring(child),
                })

            # Handle export statements (TypeScript/JavaScript)
            elif child.type == "export_statement":
                _walk(child, parent_class=parent_class)

            # Handle lexical_declaration for arrow functions
            elif child.type == "lexical_declaration":
                for var_decl in child.children:
                    if var_decl.type == "variable_declarator":
                        var_name = ""
                        has_arrow = False
                        for vc in var_decl.children:
                            if vc.type == "identifier":
                                var_name = vc.text.decode("utf-8", errors="replace")
                            elif vc.type == "arrow_function":
                                has_arrow = True
                        if has_arrow and var_name:
                            results.append({
                                "node_type": "function",
                                "name": var_name,
                                "body": child.text.decode("utf-8", errors="replace"),
                                "start_line": child.start_point[0],
                                "end_line": child.end_point[0],
                                "parent_class": parent_class,
                                "decorators": "",
                                "parameters": _get_parameters(var_decl.children[-1] if var_decl.children else var_decl, language),
                                "return_type": _get_return_type(var_decl.children[-1] if var_decl.children else var_decl, language),
                                "docstring": "",
                            })

            # Recurse into container nodes (block, class_body, etc.)
            elif child.type in container_types:
                _walk(child, parent_class=parent_class)

    _walk(root_node)
    return results


def _get_signature(body_text: str, max_lines: int = 5) -> str:
    """Extract the function/method signature from the body text.

    Takes the first few lines up to the body block start as the signature.

    Args:
        body_text: Full function text including signature and body.
        max_lines: Maximum number of lines to include in signature.

    Returns:
        Signature text (first line(s) of the function).
    """
    lines = body_text.split("\n")
    sig_lines = []
    for line in lines[:max_lines]:
        sig_lines.append(line)
        # Stop after finding the opening brace or colon (body start)
        stripped = line.rstrip()
        if stripped.endswith(":") or stripped.endswith("{"):
            break
    return "\n".join(sig_lines)


def _split_large_function(node_dict: dict, max_tokens: int) -> list[dict]:
    """Split a large function into sub-chunks at inner block boundaries.

    When a function body exceeds max_tokens, finds inner block-level
    statements (if/for/while/try) and splits at those boundaries. Each
    sub-chunk gets the parent function signature as a content prefix.

    Args:
        node_dict: Scope node dict with body text and metadata.
        max_tokens: Maximum token count per chunk.

    Returns:
        List of sub-chunk dicts, each with the parent signature prefix.
    """
    body_text = node_dict["body"]
    signature = _get_signature(body_text)

    lines = body_text.split("\n")
    # Skip the signature lines to get the body content
    sig_line_count = len(signature.split("\n"))
    body_lines = lines[sig_line_count:]

    if not body_lines:
        return [node_dict]

    # Group body lines into segments separated by block boundaries
    segments = []
    current_segment: list[str] = []

    for line in body_lines:
        stripped = line.strip()
        # Check if this line starts a new block-level statement
        is_block_start = False
        for block_type in ("if ", "for ", "while ", "try:", "with ", "match ",
                           "switch ", "else:", "elif ", "except ", "finally:",
                           "catch ", "case "):
            if stripped.startswith(block_type) or stripped == block_type.strip():
                is_block_start = True
                break

        # Split at block boundaries when current segment is large enough
        if is_block_start and current_segment and _estimate_tokens("\n".join(current_segment)) > max_tokens // 4:
            segments.append("\n".join(current_segment))
            current_segment = []

        current_segment.append(line)

    # Add remaining lines as final segment
    if current_segment:
        segments.append("\n".join(current_segment))

    # If we couldn't split meaningfully, just split by line count
    if len(segments) <= 1:
        chunk_size = max(1, len(body_lines) // max(1, _estimate_tokens(body_text) // max_tokens))
        segments = []
        for i in range(0, len(body_lines), chunk_size):
            segments.append("\n".join(body_lines[i:i + chunk_size]))

    # Build sub-chunks with parent signature prefix
    sub_chunks = []
    for i, segment in enumerate(segments):
        sub_dict = dict(node_dict)
        # Prefix each sub-chunk with the function signature for context
        sub_dict["body"] = signature + "\n" + segment
        sub_dict["_sub_chunk_index"] = i
        sub_chunks.append(sub_dict)

    return sub_chunks


def _build_chunk_dict(
    filename: str,
    content: str,
    node_dict: dict | None = None,
    imports: str = "",
) -> dict:
    """Build a standard chunk dictionary with tokenized content and metadata.

    Args:
        filename: Original source filename.
        content: Text content for this chunk.
        node_dict: Optional scope node dict with metadata.
        imports: Import text to store as file-level metadata.

    Returns:
        Chunk dict with content_with_weight, tokenized fields, and metadata.
    """
    # Tokenize the content for search indexing
    content_ltks = rag_tokenizer.tokenize(content)

    chunk = {
        "docnm_kwd": filename,
        "title_tks": rag_tokenizer.tokenize(re.sub(r"\.[a-zA-Z]+$", "", filename)),
        "content_with_weight": content,
        "content_ltks": content_ltks,
        "content_sm_ltks": rag_tokenizer.fine_grained_tokenize(content_ltks),
    }

    # Add code-specific metadata from the scope node
    if node_dict:
        chunk["function_name"] = node_dict.get("name", "")
        chunk["class_name"] = node_dict.get("parent_class", "")
        chunk["parameters"] = node_dict.get("parameters", "")
        chunk["return_type"] = node_dict.get("return_type", "")
        chunk["decorators"] = node_dict.get("decorators", "")

        # Determine language tag from filename extension
        ext = os.path.splitext(filename)[1].lower()
        lang_name = EXTENSION_MAP.get(ext, "unknown")
        chunk["tag_kwd"] = ["code", lang_name]

    # Store imports as file-level metadata on this chunk
    if imports:
        chunk["imports"] = imports

    return chunk


def _naive_fallback(filename: str, source: str, callback, max_tokens: int = 512) -> list[dict]:
    """Fall back to naive line-based chunking for unsupported file extensions.

    Splits the source text into chunks by grouping lines until the token
    limit is reached.

    Args:
        filename: Original source filename.
        source: Source text content.
        callback: Progress callback function.
        max_tokens: Maximum tokens per chunk.

    Returns:
        List of chunk dicts with standard fields.
    """
    lines = source.split("\n")
    chunks = []
    current_lines: list[str] = []
    current_tokens = 0

    for line in lines:
        line_tokens = _estimate_tokens(line)
        # Start a new chunk when token limit would be exceeded
        if current_tokens + line_tokens > max_tokens and current_lines:
            text = "\n".join(current_lines)
            chunks.append(_build_chunk_dict(filename, text))
            current_lines = []
            current_tokens = 0
        current_lines.append(line)
        current_tokens += line_tokens

    # Add remaining lines as final chunk
    if current_lines:
        text = "\n".join(current_lines)
        chunks.append(_build_chunk_dict(filename, text))

    if callback:
        callback(1.0, f"Fallback chunking complete: {len(chunks)} chunks")

    return chunks


def chunk(filename, binary=None, from_page=0, to_page=100000,
          lang="Chinese", callback=None, **kwargs):
    """Parse a source code file into AST-based chunks.

    Uses tree-sitter to parse the source code and extract function/class
    boundaries as chunk boundaries. Each chunk includes the full function
    or class body with metadata (name, parameters, return type, decorators).
    Imports are stored as file-level metadata on the first chunk.

    For files with unsupported extensions, falls back to naive line-based
    chunking instead of raising an error.

    Args:
        filename: Name of the source code file.
        binary: Raw file content as bytes.
        from_page: Unused (kept for interface compatibility).
        to_page: Unused (kept for interface compatibility).
        lang: Language hint for tokenization.
        callback: Progress callback function (prog: float, msg: str).
        **kwargs: Additional config including parser_config with chunk_token_num.

    Returns:
        List of chunk dicts with content_with_weight, tokenized fields,
        and code-specific metadata.
    """
    # Use no-op callback if none provided
    if callback is None:
        callback = lambda prog, msg="": None

    # Read source from binary or treat filename as file path
    if binary:
        source = binary.decode("utf-8", errors="replace")
        source_bytes = binary
    else:
        with open(filename, "rb") as f:
            source_bytes = f.read()
        source = source_bytes.decode("utf-8", errors="replace")

    # Extract configuration
    parser_config = kwargs.get("parser_config", {}) or {}
    max_tokens = parser_config.get("chunk_token_num", 512)

    # Detect language from file extension
    ext = os.path.splitext(filename)[1].lower()
    language = _get_language_for_extension(ext)

    # Fall back to naive chunking for unsupported extensions
    if not language:
        callback(0.1, f"Unsupported extension '{ext}', falling back to text chunking")
        return _naive_fallback(filename, source, callback, max_tokens)

    callback(0.1, f"Parsing {filename} as {language}")

    # Parse with tree-sitter
    try:
        parser = get_parser(language)
        tree = parser.parse(source_bytes)
    except Exception as e:
        # If tree-sitter parsing fails, fall back to naive chunking
        callback(0.2, f"Tree-sitter parse failed ({e}), falling back to text chunking")
        return _naive_fallback(filename, source, callback, max_tokens)

    root = tree.root_node

    # Extract imports as file-level metadata
    imports = _extract_imports(root, source_bytes, language)
    callback(0.3, "Extracted imports")

    # Extract function/class scope nodes
    scope_nodes = _extract_scope_nodes(root, source_bytes, language)
    callback(0.4, f"Found {len(scope_nodes)} scope nodes")

    chunks = []
    total_nodes = max(len(scope_nodes), 1)

    # Track which lines are covered by scope nodes to find module-level code
    covered_lines: set[int] = set()

    for i, node_dict in enumerate(scope_nodes):
        # Track covered line ranges
        for ln in range(node_dict["start_line"], node_dict["end_line"] + 1):
            covered_lines.add(ln)

        # Skip class-level nodes (their methods are extracted separately)
        if node_dict["node_type"] == "class":
            continue

        body_text = node_dict["body"]

        # Split large functions at inner block boundaries
        if _estimate_tokens(body_text) > max_tokens:
            sub_chunks = _split_large_function(node_dict, max_tokens)
            for j, sub in enumerate(sub_chunks):
                # Attach imports to the first chunk only
                is_first = (len(chunks) == 0)
                c = _build_chunk_dict(
                    filename,
                    sub["body"],
                    node_dict=sub,
                    imports=imports if is_first else "",
                )
                chunks.append(c)
        else:
            # Build a single chunk for this scope node
            is_first = (len(chunks) == 0)
            c = _build_chunk_dict(
                filename,
                body_text,
                node_dict=node_dict,
                imports=imports if is_first else "",
            )
            chunks.append(c)

        # Report progress
        progress = 0.4 + (i + 1) / total_nodes * 0.5
        callback(progress, f"Processed {i + 1}/{total_nodes} nodes")

    # Collect module-level code not inside any function or class
    source_lines = source.split("\n")
    module_lines: list[str] = []
    for ln, line in enumerate(source_lines):
        # Skip import lines (already stored as metadata)
        if ln not in covered_lines and line.strip():
            # Skip lines that are part of imports
            stripped = line.strip()
            if stripped.startswith(("import ", "from ")) and language == "python":
                continue
            if stripped.startswith("import ") and language in ("javascript", "typescript", "tsx", "java"):
                continue
            if stripped.startswith("package ") and language == "java":
                continue
            module_lines.append(line)

    # Add module-level code as a chunk if there is substantial content
    if module_lines:
        module_text = "\n".join(module_lines).strip()
        # Only create a module-level chunk if it has meaningful content beyond comments/docstrings
        if module_text and _estimate_tokens(module_text) > 3:
            is_first = (len(chunks) == 0)
            c = _build_chunk_dict(
                filename,
                module_text,
                imports=imports if is_first else "",
            )
            chunks.append(c)

    # If no chunks were created (e.g., empty file), create one with the full source
    if not chunks:
        chunks.append(_build_chunk_dict(filename, source, imports=imports))

    callback(1.0, f"Code chunking complete: {len(chunks)} chunks")
    return chunks
