"""
Code Graph RAG - Class Identity Resolution

Resolves class names and qualified names from AST nodes, handling
language-specific naming patterns (C++ namespace, Rust module path, etc.).

Ported from codebase_rag/parsers/class_ingest/identity.py.
"""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from tree_sitter import Node

from .. import constants as cs
from ..parsers.utils import safe_decode_text

if TYPE_CHECKING:
    from ..language_spec import LanguageSpec


def resolve_class_identity(
    class_node: Node,
    module_qn: str,
    language: cs.SupportedLanguage,
    lang_config: LanguageSpec,
    file_path: Path | None,
    repo_path: Path,
    project_name: str,
) -> tuple[str, str, bool] | None:
    """
    Resolve class identity (qualified_name, name, is_exported).

    @param class_node: AST node of the class.
    @param module_qn: Module qualified name.
    @param language: Source language.
    @param lang_config: Language spec config.
    @param file_path: File path.
    @param repo_path: Repository root.
    @param project_name: Project name.
    @returns: Tuple of (qualified_name, name, is_exported) or None.
    """
    return resolve_class_identity_fallback(class_node, module_qn, language, lang_config)


def resolve_class_identity_fallback(
    class_node: Node,
    module_qn: str,
    language: cs.SupportedLanguage,
    lang_config: LanguageSpec,
) -> tuple[str, str, bool] | None:
    """
    Fallback class identity resolution using AST name extraction.

    @param class_node: AST node.
    @param module_qn: Module QN.
    @param language: Source language.
    @param lang_config: Language config.
    @returns: (qualified_name, name, is_exported) or None.
    """
    if language == cs.SupportedLanguage.CPP:
        from ..cpp import utils as cpp_utils
        if class_node.type == cs.CppNodeType.FUNCTION_DEFINITION:
            class_name = cpp_utils.extract_exported_class_name(class_node)
            is_exported = True
        else:
            class_name = extract_cpp_class_name(class_node)
            is_exported = cpp_utils.is_exported(class_node)

        if not class_name:
            return None
        class_qn = cpp_utils.build_qualified_name(class_node, module_qn, class_name)
        return class_qn, class_name, is_exported

    class_name = extract_class_name(class_node)
    if not class_name:
        return None

    nested_qn = build_nested_qualified_name_for_class(
        class_node, module_qn, class_name, lang_config
    )
    return nested_qn or f"{module_qn}.{class_name}", class_name, False


def extract_cpp_class_name(class_node: Node) -> str | None:
    """Extract class name from a C++ class/struct/union node."""
    if class_node.type == cs.CppNodeType.TEMPLATE_DECLARATION:
        for child in class_node.children:
            if child.type in cs.CPP_COMPOUND_TYPES:
                return extract_cpp_class_name(child)

    for child in class_node.children:
        if child.type == cs.TS_TYPE_IDENTIFIER and child.text:
            return safe_decode_text(child)

    name_node = class_node.child_by_field_name(cs.FIELD_NAME)
    return safe_decode_text(name_node) if name_node and name_node.text else None


def extract_class_name(class_node: Node) -> str | None:
    """Extract class name from a generic class AST node."""
    name_node = class_node.child_by_field_name(cs.FIELD_NAME)
    if name_node and name_node.text:
        return safe_decode_text(name_node)

    # Variable assignment pattern: const Foo = class { ... }
    current = class_node.parent
    while current:
        if current.type == cs.TS_VARIABLE_DECLARATOR:
            for child in current.children:
                if child.type == cs.TS_IDENTIFIER and child.text:
                    return safe_decode_text(child)
        current = current.parent

    return None


def build_nested_qualified_name_for_class(
    class_node: Node,
    module_qn: str,
    class_name: str,
    lang_config: LanguageSpec,
) -> str | None:
    """Build nested QN for classes defined inside other classes."""
    if not isinstance(class_node.parent, Node):
        return None

    from ..rs import utils as rs_utils
    path_parts = rs_utils.build_module_path(
        class_node,
        include_classes=True,
        class_node_types=frozenset(lang_config.class_node_types),
    )

    if path_parts:
        return f"{module_qn}.{cs.SEPARATOR_DOT.join(path_parts)}.{class_name}"
    return None
