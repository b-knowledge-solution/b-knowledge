"""
Code Graph RAG - JS/TS Module System

Handles CommonJS require() and ES6 import/export patterns.
Resolves module specifiers to file paths and qualified names.

Ported from codebase_rag/parsers/js_ts/module_system.py.
"""
from __future__ import annotations

from loguru import logger
from pathlib import Path

from tree_sitter import Node

from .. import constants as cs
from ..parsers.utils import safe_decode_text




def extract_require_calls(root_node: Node) -> list[dict[str, str]]:
    """
    Extract CommonJS require() calls from AST.

    @param root_node: AST root node.
    @returns: List of dicts with 'variable_name' and 'module_path'.
    """
    requires: list[dict[str, str]] = []
    _walk_for_requires(root_node, requires)
    return requires


def _walk_for_requires(node: Node, requires: list[dict[str, str]]) -> None:
    """Walk AST collecting require() calls."""
    if node.type == cs.TS_VARIABLE_DECLARATION:
        for child in node.children:
            if child.type == cs.TS_VARIABLE_DECLARATOR:
                name_node = child.child_by_field_name(cs.FIELD_NAME)
                value_node = child.child_by_field_name(cs.FIELD_VALUE)
                if name_node and value_node and value_node.type == cs.TS_CALL_EXPRESSION:
                    func_node = value_node.child_by_field_name("function")
                    if func_node and func_node.text and safe_decode_text(func_node) == "require":
                        args = value_node.child_by_field_name("arguments")
                        if args:
                            for arg in args.children:
                                if arg.type == cs.TS_STRING and arg.text:
                                    mod_path = safe_decode_text(arg).strip("'\"")
                                    var_name = safe_decode_text(name_node)
                                    if var_name and mod_path:
                                        requires.append({
                                            "variable_name": var_name,
                                            "module_path": mod_path,
                                        })

    for child in node.children:
        _walk_for_requires(child, requires)


def extract_es6_imports(root_node: Node) -> list[dict[str, str | list[str]]]:
    """
    Extract ES6 import declarations from AST.

    @param root_node: AST root node.
    @returns: List of dicts with 'source', 'default_import', 'named_imports'.
    """
    imports: list[dict[str, str | list[str]]] = []

    for child in root_node.children:
        if child.type == cs.TS_IMPORT_STATEMENT:
            source_node = child.child_by_field_name("source")
            if not source_node or not source_node.text:
                continue

            source = safe_decode_text(source_node).strip("'\"")
            import_info: dict[str, str | list[str]] = {"source": source}
            named: list[str] = []

            for sub in child.children:
                if sub.type == cs.TS_IMPORT_CLAUSE:
                    for clause_child in sub.children:
                        if clause_child.type == cs.TS_IDENTIFIER and clause_child.text:
                            import_info["default_import"] = safe_decode_text(clause_child) or ""
                        elif clause_child.type == cs.TS_NAMED_IMPORTS:
                            for spec in clause_child.children:
                                if spec.type == cs.TS_IMPORT_SPECIFIER:
                                    name = spec.child_by_field_name(cs.FIELD_NAME)
                                    if name and name.text:
                                        named.append(safe_decode_text(name) or "")

            if named:
                import_info["named_imports"] = named
            imports.append(import_info)

    return imports


def extract_es6_exports(root_node: Node) -> list[dict[str, str | bool]]:
    """
    Extract ES6 export declarations from AST.

    @param root_node: AST root node.
    @returns: List of dicts with 'name', 'is_default'.
    """
    exports: list[dict[str, str | bool]] = []

    for child in root_node.children:
        if child.type == cs.TS_EXPORT_STATEMENT:
            is_default = any(
                sub.type == "default" for sub in child.children
            )
            declaration = child.child_by_field_name("declaration")
            if declaration:
                name_node = declaration.child_by_field_name(cs.FIELD_NAME)
                if name_node and name_node.text:
                    exports.append({
                        "name": safe_decode_text(name_node) or "",
                        "is_default": is_default,
                    })

    return exports


def resolve_module_path(
    specifier: str,
    current_file: Path,
    project_root: Path,
) -> Path | None:
    """
    Resolve a module specifier to a file path.

    @param specifier: Import path (relative or bare).
    @param current_file: Current source file.
    @param project_root: Project root directory.
    @returns: Resolved file path or None.
    """
    if not specifier.startswith("."):
        return None  # bare specifier (npm package)

    base_dir = current_file.parent
    candidate = base_dir / specifier

    # Try direct match and common extensions
    extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
    if candidate.exists() and candidate.is_file():
        return candidate

    for ext in extensions:
        p = candidate.with_suffix(ext)
        if p.exists():
            return p

    # Try index files
    if candidate.is_dir():
        for ext in extensions:
            index = candidate / f"index{ext}"
            if index.exists():
                return index

    return None
