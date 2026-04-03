"""
Code Graph RAG - Lua Type Inference Engine

Infers types from Lua AST nodes: constructor patterns,
table assignments, and function return value analysis.

Ported from codebase_rag/parsers/lua/type_inference.py.
"""
from __future__ import annotations

from loguru import logger
from typing import TYPE_CHECKING

from tree_sitter import Node

from .. import constants as cs
from ..parsers.utils import safe_decode_text

if TYPE_CHECKING:
    from ..import_processor import ImportProcessor
    from ..types_defs import FunctionRegistryTrieProtocol




class LuaTypeInferenceEngine:
    """
    Type inference engine for Lua.

    Resolves variable types from table constructor patterns,
    require() calls, and function return analysis.
    """

    __slots__ = (
        "import_processor",
        "function_registry",
        "project_name",
    )

    def __init__(
        self,
        import_processor: ImportProcessor,
        function_registry: FunctionRegistryTrieProtocol,
        project_name: str,
    ) -> None:
        self.import_processor = import_processor
        self.function_registry = function_registry
        self.project_name = project_name

    def resolve_variable_type(
        self,
        var_name: str,
        scope_node: Node,
        module_qn: str,
    ) -> str | None:
        """
        Resolve the type of a Lua variable from its assignment.

        @param var_name: Variable name.
        @param scope_node: Scope AST node.
        @param module_qn: Module QN.
        @returns: Resolved type or None.
        """
        for child in scope_node.children:
            if child.type == "variable_declaration":
                result = self._check_variable_declaration(
                    child, var_name, module_qn
                )
                if result:
                    return result
            elif child.type == "assignment_statement":
                result = self._check_assignment(child, var_name, module_qn)
                if result:
                    return result

        return None

    def _check_variable_declaration(
        self, decl_node: Node, var_name: str, module_qn: str
    ) -> str | None:
        """Check a variable_declaration node for type info."""
        names: list[str] = []
        values: list[Node] = []

        for child in decl_node.children:
            if child.type == "variable_list":
                for name in child.children:
                    if name.type == "identifier" and name.text:
                        names.append(safe_decode_text(name) or "")
            elif child.type == "expression_list":
                values.extend(
                    c for c in child.children
                    if c.type not in (",",)
                )

        for i, name in enumerate(names):
            if name == var_name and i < len(values):
                return self._infer_from_expression(values[i], module_qn)

        return None

    def _check_assignment(
        self, assign_node: Node, var_name: str, module_qn: str
    ) -> str | None:
        """Check an assignment_statement for type info."""
        variables: list[str] = []
        values: list[Node] = []

        for child in assign_node.children:
            if child.type == "variable_list":
                for v in child.children:
                    if v.type == "identifier" and v.text:
                        variables.append(safe_decode_text(v) or "")
            elif child.type == "expression_list":
                values.extend(
                    c for c in child.children
                    if c.type not in (",",)
                )

        for i, name in enumerate(variables):
            if name == var_name and i < len(values):
                return self._infer_from_expression(values[i], module_qn)

        return None

    def _infer_from_expression(
        self, expr_node: Node, module_qn: str
    ) -> str | None:
        """Infer type from an expression node."""
        # Table constructor: local obj = {} → table
        if expr_node.type == "table_constructor":
            return "table"

        # Function call: local obj = SomeClass.new() → SomeClass
        if expr_node.type == "function_call":
            func_name_node = expr_node.child_by_field_name("name")
            if not func_name_node:
                # Try first child
                for child in expr_node.children:
                    if child.type in ("dot_index_expression", "method_index_expression"):
                        func_name_node = child
                        break

            if func_name_node and func_name_node.text:
                func_text = safe_decode_text(func_name_node)
                if func_text:
                    # SomeClass.new() → SomeClass
                    if "." in func_text:
                        obj_name = func_text.split(".")[0]
                        candidate = f"{module_qn}.{obj_name}"
                        if candidate in self.function_registry:
                            return candidate
                        return obj_name

                    candidate = f"{module_qn}.{func_text}"
                    if candidate in self.function_registry:
                        return candidate

        # require() call
        if expr_node.type == "function_call":
            for child in expr_node.children:
                if child.type == "identifier" and child.text:
                    if safe_decode_text(child) == "require":
                        args = expr_node.child_by_field_name("arguments")
                        if args:
                            for arg in args.children:
                                if arg.type == "string" and arg.text:
                                    return safe_decode_text(arg).strip("'\"")

        return None

    def build_variable_type_map(
        self, scope_node: Node, module_qn: str
    ) -> dict[str, str]:
        """
        Build a variable → type map for an entire scope.

        @param scope_node: AST scope node.
        @param module_qn: Module QN.
        @returns: Map of variable name → type.
        """
        var_types: dict[str, str] = {}
        self._walk_scope_for_variables(scope_node, var_types, module_qn)
        return var_types

    def _walk_scope_for_variables(
        self,
        node: Node,
        var_types: dict[str, str],
        module_qn: str,
    ) -> None:
        """Walk scope collecting variable types."""
        if node.type == "variable_declaration":
            for child in node.children:
                if child.type == "variable_list":
                    for name_node in child.children:
                        if name_node.type == "identifier" and name_node.text:
                            var_name = safe_decode_text(name_node)
                            if var_name:
                                resolved = self.resolve_variable_type(
                                    var_name, node.parent or node, module_qn
                                )
                                if resolved:
                                    var_types[var_name] = resolved

        # Don't recurse into nested functions
        if node.type not in ("function_definition", "function_declaration"):
            for child in node.children:
                self._walk_scope_for_variables(child, var_types, module_qn)
