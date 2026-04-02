"""
Code Graph RAG - Java Type Resolver Mixin

Resolves Java type names to qualified names using imports, package
declarations, and the function registry.

Ported from codebase_rag/parsers/java/type_resolver.py.
"""
from __future__ import annotations

from loguru import logger
from typing import TYPE_CHECKING

from .. import constants as cs

if TYPE_CHECKING:
    pass




class JavaTypeResolverMixin:
    """
    Mixin providing Java type resolution capabilities.

    Must be mixed into a class that provides:
    - import_processor: ImportProcessor
    - function_registry: FunctionRegistryTrieProtocol
    - simple_name_lookup: SimpleNameLookup
    - _lookup_cache: dict[str, str | None]
    - _lookup_in_progress: set[str]
    - _fqn_to_module_qn: dict[str, list[str]]
    """

    def resolve_java_type(
        self, type_name: str, module_qn: str
    ) -> str | None:
        """
        Resolve a Java type name to its qualified name.

        @param type_name: Simple or partially qualified type name.
        @param module_qn: Current module QN.
        @returns: Resolved QN or None.
        """
        cache_key = f"{module_qn}:{type_name}"

        if cache_key in self._lookup_cache:
            return self._lookup_cache[cache_key]

        if cache_key in self._lookup_in_progress:
            return None
        self._lookup_in_progress.add(cache_key)

        try:
            result = self._do_resolve_java_type(type_name, module_qn)
            self._lookup_cache[cache_key] = result
            return result
        finally:
            self._lookup_in_progress.discard(cache_key)

    def _do_resolve_java_type(
        self, type_name: str, module_qn: str
    ) -> str | None:
        """Internal type resolution logic."""
        # Strip generics: List<String> → List
        base_type = type_name.split("<")[0].strip()

        # Exact match in registry
        if base_type in self.function_registry:
            return base_type

        # Module-qualified
        module_qualified = f"{module_qn}.{base_type}"
        if module_qualified in self.function_registry:
            return module_qualified

        # Import resolution
        if hasattr(self, 'import_processor') and self.import_processor:
            imports = self.import_processor.get_imports_for_module(module_qn)
            if imports and base_type in imports:
                imported_qn = imports[base_type]
                if imported_qn in self.function_registry:
                    return imported_qn

        # Simple name lookup
        if base_type in self.simple_name_lookup:
            candidates = self.simple_name_lookup[base_type]
            if len(candidates) == 1:
                return next(iter(candidates))

        # FQN map lookup
        if base_type in self._fqn_to_module_qn:
            modules = self._fqn_to_module_qn[base_type]
            if len(modules) == 1:
                return f"{modules[0]}.{base_type}"

        return None

    def resolve_generic_type_args(
        self, type_name: str, module_qn: str
    ) -> list[str]:
        """
        Resolve generic type arguments.

        @param type_name: Full type with generics (e.g., Map<String, Integer>).
        @param module_qn: Current module QN.
        @returns: List of resolved type QNs for generic args.
        """
        if "<" not in type_name:
            return []

        inner = type_name[type_name.index("<") + 1:type_name.rindex(">")]
        args = [a.strip() for a in inner.split(",")]

        resolved: list[str] = []
        for arg in args:
            if r := self.resolve_java_type(arg, module_qn):
                resolved.append(r)
            else:
                resolved.append(arg)
        return resolved
