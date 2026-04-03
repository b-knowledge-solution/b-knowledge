"""
Code Graph RAG - Java Type Inference Engine

Composes type resolver, variable analyzer, and method resolver mixins
into a unified Java type inference engine.

Ported from codebase_rag/parsers/java/type_inference.py.
"""
from __future__ import annotations

from loguru import logger
from pathlib import Path
from typing import TYPE_CHECKING

from tree_sitter import Node

from .. import constants as cs
from .method_resolver import JavaMethodResolverMixin
from .type_resolver import JavaTypeResolverMixin
from .variable_analyzer import JavaVariableAnalyzerMixin
from .utils import find_package_start_index

if TYPE_CHECKING:
    from ..import_processor import ImportProcessor
    from ..types_defs import FunctionRegistryTrieProtocol, SimpleNameLookup




class JavaTypeInferenceEngine(
    JavaTypeResolverMixin,
    JavaVariableAnalyzerMixin,
    JavaMethodResolverMixin,
):
    """
    Java type inference engine combining type resolution,
    variable analysis, and method call resolution.
    """

    __slots__ = (
        "import_processor",
        "function_registry",
        "repo_path",
        "project_name",
        "ast_cache",
        "queries",
        "module_qn_to_file_path",
        "class_inheritance",
        "simple_name_lookup",
        "_lookup_cache",
        "_lookup_in_progress",
        "_fqn_to_module_qn",
    )

    def __init__(
        self,
        import_processor: ImportProcessor,
        function_registry: FunctionRegistryTrieProtocol,
        repo_path: Path,
        project_name: str,
        ast_cache: object | None = None,
        queries: dict | None = None,
        module_qn_to_file_path: dict[str, Path] | None = None,
        class_inheritance: dict[str, list[str]] | None = None,
        simple_name_lookup: SimpleNameLookup | None = None,
    ) -> None:
        self.import_processor = import_processor
        self.function_registry = function_registry
        self.repo_path = repo_path
        self.project_name = project_name
        self.ast_cache = ast_cache
        self.queries = queries or {}
        self.module_qn_to_file_path = module_qn_to_file_path or {}
        self.class_inheritance = class_inheritance or {}
        self.simple_name_lookup = simple_name_lookup or {}

        self._lookup_cache: dict[str, str | None] = {}
        self._lookup_in_progress: set[str] = set()
        self._fqn_to_module_qn: dict[str, list[str]] = self._build_fqn_lookup_map()

    def _build_fqn_lookup_map(self) -> dict[str, list[str]]:
        """Build a reverse map from simple class name → module QNs."""
        fqn_map: dict[str, list[str]] = {}

        for module_qn in self.module_qn_to_file_path:
            parts = module_qn.split(cs.SEPARATOR_DOT)
            if package_start_idx := find_package_start_index(parts):
                simple_name = cs.SEPARATOR_DOT.join(parts[package_start_idx:])
                if simple_name:
                    modules = fqn_map.setdefault(simple_name, [])
                    if module_qn not in modules:
                        modules.append(module_qn)

                    # Also map all suffixes
                    class_parts = simple_name.split(cs.SEPARATOR_DOT)
                    for j in range(1, len(class_parts)):
                        suffix = cs.SEPARATOR_DOT.join(class_parts[j:])
                        modules = fqn_map.setdefault(suffix, [])
                        if module_qn not in modules:
                            modules.append(module_qn)

        return fqn_map

    def build_variable_type_map(
        self, scope_node: Node, module_qn: str
    ) -> dict[str, str]:
        """
        Build a variable → type map for a scope.

        @param scope_node: AST scope node.
        @param module_qn: Module QN.
        @returns: Map of variable name → type QN.
        """
        var_types: dict[str, str] = {}
        try:
            self._collect_all_variable_types(scope_node, var_types, module_qn)
            logger.debug(f"Java var type map: {len(var_types)} entries")
        except Exception as e:
            logger.error(f"Java var type map failed: {e}")
        return var_types

    def resolve_java_method_call(
        self,
        call_node: Node,
        local_var_types: dict[str, str],
        module_qn: str,
    ) -> tuple[str, str] | None:
        """
        Resolve a Java method call to (receiver_type, callee_qn).

        @param call_node: method_invocation AST node.
        @param local_var_types: Variable type map.
        @param module_qn: Module QN.
        @returns: (receiver_type, callee_qn) or None.
        """
        return self._do_resolve_java_method_call(call_node, local_var_types, module_qn)

    def _find_containing_java_class(self, node: Node) -> Node | None:
        """Walk up from a node to find the containing Java class."""
        current = node.parent
        while current:
            if current.type in (
                cs.TS_CLASS_DECLARATION,
                cs.TS_INTERFACE_DECLARATION,
                cs.TS_ENUM_DECLARATION,
            ):
                return current
            current = current.parent
        return None
