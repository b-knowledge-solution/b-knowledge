"""
Code Graph RAG - Top-Level Type Inference Engine

Orchestrates per-language type inference engines (Python, JS/TS, Java, Lua).
Delegates to language-specific engines for variable type resolution
and method call resolution.

Ported from codebase_rag/parsers/type_inference.py.
"""
from __future__ import annotations

from loguru import logger
from pathlib import Path
from typing import TYPE_CHECKING

from tree_sitter import Node

from . import constants as cs
from .java.type_inference import JavaTypeInferenceEngine
from .js_ts.type_inference import JsTypeInferenceEngine
from .lua.type_inference import LuaTypeInferenceEngine
from .py.type_inference import extract_type_annotation, extract_return_type

if TYPE_CHECKING:
    from .import_processor import ImportProcessor
    from .types_defs import FunctionRegistryTrieProtocol, SimpleNameLookup




class TypeInferenceEngine:
    """
    Top-level type inference engine dispatching to per-language engines.

    Lazily initializes language-specific engines on first use.
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
        "_java_engine",
        "_lua_engine",
        "_js_engine",
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

        self._java_engine: JavaTypeInferenceEngine | None = None
        self._lua_engine: LuaTypeInferenceEngine | None = None
        self._js_engine: JsTypeInferenceEngine | None = None

    @property
    def java_type_inference(self) -> JavaTypeInferenceEngine:
        """Lazy-initialized Java type inference engine."""
        if self._java_engine is None:
            self._java_engine = JavaTypeInferenceEngine(
                import_processor=self.import_processor,
                function_registry=self.function_registry,
                repo_path=self.repo_path,
                project_name=self.project_name,
                ast_cache=self.ast_cache,
                queries=self.queries,
                module_qn_to_file_path=self.module_qn_to_file_path,
                class_inheritance=self.class_inheritance,
                simple_name_lookup=self.simple_name_lookup,
            )
        return self._java_engine

    @property
    def lua_type_inference(self) -> LuaTypeInferenceEngine:
        """Lazy-initialized Lua type inference engine."""
        if self._lua_engine is None:
            self._lua_engine = LuaTypeInferenceEngine(
                import_processor=self.import_processor,
                function_registry=self.function_registry,
                project_name=self.project_name,
            )
        return self._lua_engine

    @property
    def js_type_inference(self) -> JsTypeInferenceEngine:
        """Lazy-initialized JS/TS type inference engine."""
        if self._js_engine is None:
            self._js_engine = JsTypeInferenceEngine(
                import_processor=self.import_processor,
                function_registry=self.function_registry,
                project_name=self.project_name,
            )
        return self._js_engine

    def build_local_variable_type_map(
        self,
        scope_node: Node,
        module_qn: str,
        language: cs.SupportedLanguage,
    ) -> dict[str, str]:
        """
        Build a variable → type map for a scope, dispatching to the
        appropriate language engine.

        @param scope_node: AST scope node.
        @param module_qn: Module QN.
        @param language: Source language.
        @returns: Map of variable name → resolved type QN.
        """
        if language == cs.SupportedLanguage.JAVA:
            return self.java_type_inference.build_variable_type_map(
                scope_node, module_qn
            )

        if language == cs.SupportedLanguage.LUA:
            return self.lua_type_inference.build_variable_type_map(
                scope_node, module_qn
            )

        # Python / JS / others: basic implementation
        return {}

    def resolve_method_call(
        self,
        call_node: Node,
        local_var_types: dict[str, str],
        module_qn: str,
        language: cs.SupportedLanguage,
    ) -> tuple[str, str] | None:
        """
        Resolve a method call dispatching to language-specific resolver.

        @param call_node: AST call node.
        @param local_var_types: Variable type map.
        @param module_qn: Module QN.
        @param language: Source language.
        @returns: (receiver_type, callee_qn) or None.
        """
        if language == cs.SupportedLanguage.JAVA:
            return self.java_type_inference.resolve_java_method_call(
                call_node, local_var_types, module_qn,
            )

        return None
