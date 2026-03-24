"""
Code Graph RAG - Java Variable Analyzer Mixin

Analyzes variable declarations, assignments, and field accesses in Java
AST to build local variable type maps for call resolution.

Ported from codebase_rag/parsers/java/variable_analyzer.py.
"""
from __future__ import annotations

from loguru import logger
from typing import TYPE_CHECKING

from tree_sitter import Node

from .. import constants as cs
from ..parsers.utils import safe_decode_text

if TYPE_CHECKING:
    pass




class JavaVariableAnalyzerMixin:
    """
    Mixin providing Java variable analysis capabilities.

    Must be mixed into a class that provides:
    - function_registry: FunctionRegistryTrieProtocol
    - resolve_java_type(type_name, module_qn) -> str | None
    """

    def _collect_all_variable_types(
        self,
        scope_node: Node,
        var_types: dict[str, str],
        module_qn: str,
    ) -> None:
        """
        Walk scope and collect variable → type mappings.

        @param scope_node: AST scope node (method body, block).
        @param var_types: Mutable dict to populate.
        @param module_qn: Module QN for type resolution.
        """
        self._walk_for_variable_declarations(scope_node, var_types, module_qn)

    def _walk_for_variable_declarations(
        self,
        node: Node,
        var_types: dict[str, str],
        module_qn: str,
    ) -> None:
        """Walk AST collecting variable type info."""
        if node.type == cs.TS_LOCAL_VARIABLE_DECLARATION:
            self._extract_local_variable(node, var_types, module_qn)
        elif node.type == cs.TS_ENHANCED_FOR_STATEMENT:
            self._extract_for_each_variable(node, var_types, module_qn)
        elif node.type == cs.TS_FORMAL_PARAMETER:
            self._extract_parameter(node, var_types, module_qn)

        # Don't recurse into nested classes
        if node.type not in (
            cs.TS_CLASS_DECLARATION, cs.TS_INTERFACE_DECLARATION,
            cs.TS_ENUM_DECLARATION,
        ) or node == node:
            for child in node.children:
                if child.type not in (
                    cs.TS_CLASS_DECLARATION, cs.TS_INTERFACE_DECLARATION,
                ):
                    self._walk_for_variable_declarations(child, var_types, module_qn)

    def _extract_local_variable(
        self,
        decl_node: Node,
        var_types: dict[str, str],
        module_qn: str,
    ) -> None:
        """Extract type info from a local_variable_declaration."""
        type_node = decl_node.child_by_field_name("type")
        if not type_node or not type_node.text:
            return

        type_name = safe_decode_text(type_node)

        for child in decl_node.children:
            if child.type == cs.TS_VARIABLE_DECLARATOR:
                name_node = child.child_by_field_name(cs.FIELD_NAME)
                if name_node and name_node.text:
                    var_name = safe_decode_text(name_node)
                    if var_name and type_name:
                        resolved = self.resolve_java_type(type_name, module_qn)
                        var_types[var_name] = resolved or type_name

    def _extract_for_each_variable(
        self,
        for_node: Node,
        var_types: dict[str, str],
        module_qn: str,
    ) -> None:
        """Extract type from enhanced for loop (for-each)."""
        type_node = for_node.child_by_field_name("type")
        name_node = for_node.child_by_field_name(cs.FIELD_NAME)

        if type_node and name_node and type_node.text and name_node.text:
            type_name = safe_decode_text(type_node)
            var_name = safe_decode_text(name_node)
            if var_name and type_name:
                resolved = self.resolve_java_type(type_name, module_qn)
                var_types[var_name] = resolved or type_name

    def _extract_parameter(
        self,
        param_node: Node,
        var_types: dict[str, str],
        module_qn: str,
    ) -> None:
        """Extract type from a formal_parameter node."""
        type_node = param_node.child_by_field_name("type")
        name_node = param_node.child_by_field_name(cs.FIELD_NAME)

        if type_node and name_node and type_node.text and name_node.text:
            type_name = safe_decode_text(type_node)
            var_name = safe_decode_text(name_node)
            if var_name and type_name:
                resolved = self.resolve_java_type(type_name, module_qn)
                var_types[var_name] = resolved or type_name
