"""
Code Graph RAG - Java Method Resolver Mixin

Resolves Java method invocations to their target qualified names
using receiver type inference and method chain analysis.

Ported from codebase_rag/parsers/java/method_resolver.py.
"""
from __future__ import annotations

from loguru import logger
from typing import TYPE_CHECKING

from tree_sitter import Node

from .. import constants as cs
from ..parsers.utils import safe_decode_text

if TYPE_CHECKING:
    pass




class JavaMethodResolverMixin:
    """
    Mixin providing Java method call resolution.

    Must be mixed into a class that provides:
    - function_registry: FunctionRegistryTrieProtocol
    - simple_name_lookup: SimpleNameLookup
    - resolve_java_type(type_name, module_qn) -> str | None
    """

    def _do_resolve_java_method_call(
        self,
        call_node: Node,
        local_var_types: dict[str, str],
        module_qn: str,
    ) -> tuple[str, str] | None:
        """
        Resolve a Java method invocation to (caller_type, callee_qn).

        @param call_node: method_invocation AST node.
        @param local_var_types: Map of variable name → type QN.
        @param module_qn: Current module QN.
        @returns: (caller_type, callee_qn) or None.
        """
        if call_node.type != cs.TS_METHOD_INVOCATION:
            return None

        method_name_node = call_node.child_by_field_name(cs.FIELD_NAME)
        if not method_name_node or not method_name_node.text:
            return None
        method_name = safe_decode_text(method_name_node)

        object_node = call_node.child_by_field_name(cs.FIELD_OBJECT)
        if not object_node:
            # Unqualified call: resolve in current class
            return self._resolve_unqualified_call(method_name, module_qn)

        return self._resolve_qualified_call(
            object_node, method_name, local_var_types, module_qn
        )

    def _resolve_unqualified_call(
        self, method_name: str, module_qn: str
    ) -> tuple[str, str] | None:
        """Resolve an unqualified method call (this.method() or static import)."""
        # Try current module
        candidate = f"{module_qn}.{method_name}"
        if candidate in self.function_registry:
            return module_qn, candidate

        # Try simple name lookup
        if method_name in self.simple_name_lookup:
            candidates = self.simple_name_lookup[method_name]
            if len(candidates) == 1:
                target = next(iter(candidates))
                return module_qn, target

        return None

    def _resolve_qualified_call(
        self,
        object_node: Node,
        method_name: str,
        local_var_types: dict[str, str],
        module_qn: str,
    ) -> tuple[str, str] | None:
        """Resolve a qualified method call (receiver.method())."""
        if not object_node.text:
            return None

        object_text = safe_decode_text(object_node)
        if not object_text:
            return None

        # this.method()
        if object_text == "this":
            return self._resolve_this_call(method_name, module_qn)

        # super.method()
        if object_text == "super":
            return self._resolve_super_call(method_name, module_qn)

        # variable.method() — use var type map
        if object_text in local_var_types:
            receiver_type = local_var_types[object_text]
            candidate = f"{receiver_type}.{method_name}"
            if candidate in self.function_registry:
                return receiver_type, candidate

        # Static call: ClassName.method()
        resolved_type = self.resolve_java_type(object_text, module_qn)
        if resolved_type:
            candidate = f"{resolved_type}.{method_name}"
            if candidate in self.function_registry:
                return resolved_type, candidate

        # Method chain: expr.method()
        if object_node.type == cs.TS_METHOD_INVOCATION:
            chain_result = self._do_resolve_java_method_call(
                object_node, local_var_types, module_qn
            )
            if chain_result:
                caller_type, callee_qn = chain_result
                # The return type of the caller is the receiver
                class_qn = callee_qn.rsplit(".", 1)[0] if "." in callee_qn else callee_qn
                candidate = f"{class_qn}.{method_name}"
                if candidate in self.function_registry:
                    return class_qn, candidate

        return None

    def _resolve_this_call(
        self, method_name: str, module_qn: str
    ) -> tuple[str, str] | None:
        """Resolve this.method() in the current class."""
        candidate = f"{module_qn}.{method_name}"
        if candidate in self.function_registry:
            return module_qn, candidate
        return None

    def _resolve_super_call(
        self, method_name: str, module_qn: str
    ) -> tuple[str, str] | None:
        """Resolve super.method() via inheritance chain."""
        if hasattr(self, 'class_inheritance') and module_qn in self.class_inheritance:
            for parent_qn in self.class_inheritance[module_qn]:
                candidate = f"{parent_qn}.{method_name}"
                if candidate in self.function_registry:
                    return parent_qn, candidate
        return None
