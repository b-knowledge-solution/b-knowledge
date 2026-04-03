"""
Code Graph RAG - Call Resolver

Advanced cross-file call resolution using import analysis, function registry,
and method chain inference to create accurate CALLS relationships.

Ported from codebase_rag/parsers/call_resolver.py.
"""
from __future__ import annotations

from loguru import logger
from typing import TYPE_CHECKING

from . import constants as cs
from .models import GraphRelationship
from .parsers.utils import safe_decode_text

if TYPE_CHECKING:
    from tree_sitter import Node

    from .services import IngestorProtocol
    from .types_defs import FunctionRegistryTrieProtocol, SimpleNameLookup




class CallResolver:
    """
    Resolves call expressions to their target functions/methods.

    Uses multiple strategies:
    1. Exact QN match in function registry
    2. Import-based resolution
    3. Simple name lookup (may be ambiguous)
    4. Method chain resolution via attribute access
    """

    def __init__(
        self,
        function_registry: FunctionRegistryTrieProtocol,
        simple_name_lookup: SimpleNameLookup,
        ingestor: IngestorProtocol,
    ) -> None:
        self.function_registry = function_registry
        self.simple_name_lookup = simple_name_lookup
        self.ingestor = ingestor
        self._resolved_count = 0
        self._unresolved_count = 0

    def resolve_calls_in_function(
        self,
        func_node: Node,
        caller_qn: str,
        module_qn: str,
        language: cs.SupportedLanguage,
        imports: dict[str, str] | None = None,
    ) -> None:
        """
        Resolve all call expressions within a function body.

        @param func_node: Function AST node.
        @param caller_qn: Caller's qualified name.
        @param module_qn: Module QN for import-relative resolution.
        @param language: Source language.
        @param imports: Map of imported name → qualified name.
        """
        body = func_node.child_by_field_name(cs.FIELD_BODY)
        if not body:
            return

        call_nodes = self._find_call_nodes(body, language)
        for call_node in call_nodes:
            self._resolve_single_call(
                call_node, caller_qn, module_qn, language, imports or {}
            )

    def _find_call_nodes(self, node: Node, language: cs.SupportedLanguage) -> list[Node]:
        """Recursively find all call expression nodes."""
        call_types = self._get_call_types(language)
        calls: list[Node] = []
        self._walk_for_calls(node, call_types, calls)
        return calls

    def _walk_for_calls(
        self, node: Node, call_types: frozenset[str], calls: list[Node]
    ) -> None:
        """Walk AST collecting call nodes."""
        if node.type in call_types:
            calls.append(node)
        for child in node.children:
            self._walk_for_calls(child, call_types, calls)

    def _resolve_single_call(
        self,
        call_node: Node,
        caller_qn: str,
        module_qn: str,
        language: cs.SupportedLanguage,
        imports: dict[str, str],
    ) -> None:
        """Resolve a single call expression to its target."""
        callee_name = self._extract_callee_name(call_node, language)
        if not callee_name:
            return

        # Strategy 1: Exact match in function registry
        if callee_name in self.function_registry:
            self._create_call_relationship(caller_qn, callee_name)
            return

        # Strategy 2: Module-qualified name
        module_qualified = f"{module_qn}.{callee_name}"
        if module_qualified in self.function_registry:
            self._create_call_relationship(caller_qn, module_qualified)
            return

        # Strategy 3: Import-based resolution
        if callee_name in imports:
            import_target = imports[callee_name]
            if import_target in self.function_registry:
                self._create_call_relationship(caller_qn, import_target)
                return

        # Strategy 4: Dotted path resolution (e.g., module.function)
        if cs.SEPARATOR_DOT in callee_name:
            parts = callee_name.split(cs.SEPARATOR_DOT)
            base = parts[0]
            if base in imports:
                resolved = f"{imports[base]}.{cs.SEPARATOR_DOT.join(parts[1:])}"
                if resolved in self.function_registry:
                    self._create_call_relationship(caller_qn, resolved)
                    return

        # Strategy 5: Simple name lookup (may be ambiguous — pick first)
        if callee_name in self.simple_name_lookup:
            candidates = self.simple_name_lookup[callee_name]
            if len(candidates) == 1:
                self._create_call_relationship(caller_qn, next(iter(candidates)))
                return

        self._unresolved_count += 1
        logger.debug(f"Unresolved call: {callee_name} in {caller_qn}")

    def _extract_callee_name(self, call_node: Node, language: cs.SupportedLanguage) -> str | None:
        """Extract the called function/method name from a call expression."""
        func_node = call_node.child_by_field_name("function")
        if not func_node:
            # Some languages use different field names
            func_node = call_node.child_by_field_name("method")
        if not func_node:
            return None

        return safe_decode_text(func_node)

    def _create_call_relationship(self, caller_qn: str, callee_qn: str) -> None:
        """Create a CALLS graph relationship."""
        caller_type = self.function_registry.get(caller_qn, "Function")
        callee_type = self.function_registry.get(callee_qn, "Function")

        self.ingestor.ensure_relationship(GraphRelationship(
            source_label=caller_type or "Function",
            source_key=cs.KEY_QUALIFIED_NAME,
            source_value=caller_qn,
            target_label=callee_type or "Function",
            target_key=cs.KEY_QUALIFIED_NAME,
            target_value=callee_qn,
            rel_type=cs.RelationshipType.CALLS,
        ))
        self._resolved_count += 1

    def _get_call_types(self, language: cs.SupportedLanguage) -> frozenset[str]:
        """Get AST call node types for the given language."""
        call_map: dict[cs.SupportedLanguage, tuple[str, ...]] = {
            cs.SupportedLanguage.PYTHON: cs.SPEC_PY_CALL,
            cs.SupportedLanguage.JAVASCRIPT: cs.SPEC_JS_CALL,
            cs.SupportedLanguage.TYPESCRIPT: cs.SPEC_TS_CALL,
            cs.SupportedLanguage.JAVA: cs.SPEC_JAVA_CALL,
            cs.SupportedLanguage.CPP: cs.SPEC_CPP_CALL,
            cs.SupportedLanguage.C: cs.SPEC_C_CALL,
            cs.SupportedLanguage.RUST: cs.SPEC_RUST_CALL,
            cs.SupportedLanguage.LUA: cs.SPEC_LUA_CALL,
            cs.SupportedLanguage.GO: cs.SPEC_GO_CALL,
            cs.SupportedLanguage.SCALA: cs.SPEC_SCALA_CALL,
            cs.SupportedLanguage.CSHARP: cs.SPEC_CSHARP_CALL,
            cs.SupportedLanguage.PHP: cs.SPEC_PHP_CALL,
        }
        return frozenset(call_map.get(language, ("call_expression",)))

    @property
    def stats(self) -> dict[str, int]:
        """Return resolution statistics."""
        return {
            "resolved": self._resolved_count,
            "unresolved": self._unresolved_count,
        }
