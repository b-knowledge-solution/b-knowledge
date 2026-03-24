"""
Code Graph RAG - JS/TS Type Inference Engine

Infers types from JS/TS AST nodes: constructor calls, return types,
this-references, and method chain analysis.

Ported from codebase_rag/parsers/js_ts/type_inference.py.
"""
from __future__ import annotations

from loguru import logger
from typing import TYPE_CHECKING, Callable

from tree_sitter import Node

from .. import constants as cs
from ..parsers.utils import safe_decode_text
from .utils import (
    analyze_return_expression,
    extract_class_qn,
    extract_constructor_name,
    find_return_statements,
)

if TYPE_CHECKING:
    from ..types_defs import FunctionRegistryTrieProtocol
    from ..import_processor import ImportProcessor




class JsTypeInferenceEngine:
    """
    Type inference engine for JavaScript and TypeScript.

    Resolves variable types from new expressions, return statements,
    and method chains.
    """

    __slots__ = (
        "import_processor",
        "function_registry",
        "project_name",
        "_find_method_ast_node_func",
    )

    def __init__(
        self,
        import_processor: ImportProcessor,
        function_registry: FunctionRegistryTrieProtocol,
        project_name: str,
        find_method_ast_node_func: Callable[..., Node | None] | None = None,
    ) -> None:
        self.import_processor = import_processor
        self.function_registry = function_registry
        self.project_name = project_name
        self._find_method_ast_node_func = find_method_ast_node_func

    def resolve_variable_type(
        self,
        var_name: str,
        scope_node: Node,
        module_qn: str,
    ) -> str | None:
        """
        Resolve the type of a variable from its assignment context.

        @param var_name: Variable name.
        @param scope_node: Scope AST node.
        @param module_qn: Module QN.
        @returns: Resolved type QN or None.
        """
        for child in scope_node.children:
            if child.type in (cs.TS_VARIABLE_DECLARATION, cs.TS_LEXICAL_DECLARATION):
                for decl in child.children:
                    if decl.type == cs.TS_VARIABLE_DECLARATOR:
                        name_node = decl.child_by_field_name(cs.FIELD_NAME)
                        value_node = decl.child_by_field_name(cs.FIELD_VALUE)
                        if name_node and value_node and name_node.text:
                            if safe_decode_text(name_node) == var_name:
                                return self._infer_type_from_expression(
                                    value_node, module_qn
                                )
        return None

    def _infer_type_from_expression(
        self, expr_node: Node, module_qn: str
    ) -> str | None:
        """Infer type from an expression node."""
        if expr_node.type == cs.TS_NEW_EXPRESSION:
            if class_name := extract_constructor_name(expr_node):
                return self._resolve_class_name(class_name, module_qn)

        if expr_node.type == cs.TS_CALL_EXPRESSION:
            func_node = expr_node.child_by_field_name("function")
            if func_node and func_node.text:
                called = safe_decode_text(func_node)
                if called and called in self.function_registry:
                    return self._infer_return_type(called)

        return None

    def _resolve_class_name(self, name: str, module_qn: str) -> str | None:
        """Resolve a class name to its QN."""
        candidate = f"{module_qn}.{name}"
        if candidate in self.function_registry:
            return candidate
        return name

    def _infer_return_type(self, method_qn: str) -> str | None:
        """Infer return type of a method by analyzing its return statements."""
        if not self._find_method_ast_node_func:
            return extract_class_qn(method_qn)

        class_qn = extract_class_qn(method_qn)
        if not class_qn:
            return None

        method_name = method_qn.rsplit(cs.SEPARATOR_DOT, 1)[-1]
        class_name = class_qn.rsplit(cs.SEPARATOR_DOT, 1)[-1]

        method_node = self._find_method_ast_node_func(class_name, method_name)
        if not method_node:
            return class_qn

        body = method_node.child_by_field_name(cs.FIELD_BODY)
        if not body:
            return class_qn

        return_nodes: list[Node] = []
        find_return_statements(body, return_nodes)

        for ret in return_nodes:
            if ret.children and len(ret.children) > 1:
                expr = ret.children[1]
                if inferred := analyze_return_expression(expr, method_qn):
                    return inferred

        return class_qn
