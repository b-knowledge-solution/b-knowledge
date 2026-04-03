"""
Code Graph RAG - Call Processor

Resolves function/method calls in source code and creates CALLS relationships.
Uses import_mapping, function_registry, and type inference for cross-file resolution.
"""
from __future__ import annotations

from loguru import logger
from pathlib import Path

from .constants import (
    SupportedLanguage, RelationshipType,
    AST_FUNCTION_FIELD, AST_ARGUMENTS_FIELD, AST_OBJECT_FIELD,
    AST_ATTRIBUTE_FIELD, AST_NAME_FIELD,
    QN_SEPARATOR,
)
from .models import GraphRelationship
from .services import IngestorProtocol
from . import logs as ls




class CallProcessor:
    """
    Processes function/method calls and creates CALLS relationships.

    Uses the function_registry (from DefinitionProcessor) and import_mapping
    (from ImportProcessor) to resolve call targets across files.

    @param ingestor: IngestorProtocol for graph writes.
    @param project_root: Root path of the project.
    @param project_name: Project name for qualified name construction.
    @param function_registry: Dict mapping qualified_name -> node_type.
    @param import_mapping: Dict mapping filepath -> {local_name -> qualified_name}.
    @param simple_name_lookup: Dict mapping simple_name -> {qualified_names}.
    @param kb_id: Knowledge base ID for tenant isolation.
    """

    def __init__(
        self,
        ingestor: IngestorProtocol,
        project_root: Path,
        project_name: str,
        function_registry: dict[str, str],
        import_mapping: dict[str, dict[str, str]],
        simple_name_lookup: dict[str, set[str]],
        kb_id: str = "",
    ) -> None:
        self.ingestor = ingestor
        self.project_root = project_root
        self.project_name = project_name
        self.function_registry = function_registry
        self.import_mapping = import_mapping
        self.simple_name_lookup = simple_name_lookup
        self.kb_id = kb_id

    def process_calls_in_file(
        self,
        filepath: Path,
        tree_root,
        language: SupportedLanguage,
        module_qn: str,
    ) -> None:
        """
        Process all function/method calls in a file and create CALLS edges.

        @param filepath: Absolute path to the source file.
        @param tree_root: Root AST node from Tree-sitter.
        @param language: Language of the source file.
        @param module_qn: Qualified name of the containing module.
        """
        logger.debug(ls.LOG_PROCESSING_CALLS.format(filepath.name))

        file_imports = self.import_mapping.get(str(filepath), {})
        separator = QN_SEPARATOR.get(language, ".")

        # Find all call expressions
        for node in self._walk_ast(tree_root):
            if node.type in self._get_call_types(language):
                self._process_call(node, filepath, language, module_qn,
                                   file_imports, separator)

    def _process_call(
        self,
        node,
        filepath: Path,
        language: SupportedLanguage,
        module_qn: str,
        file_imports: dict[str, str],
        separator: str,
    ) -> None:
        """Process a single call expression and resolve target."""
        call_name = self._extract_call_name(node, language)
        if not call_name:
            return

        # Find the enclosing function/method
        caller_qn = self._find_enclosing_function(node, module_qn, separator, language)

        # Resolve the call target
        target_qn = self._resolve_call_target(call_name, file_imports, module_qn, separator)

        if target_qn and caller_qn:
            logger.debug(ls.LOG_RESOLVED_CALL.format(caller_qn, target_qn))
            self.ingestor.ensure_relationship(GraphRelationship(
                from_id=caller_qn,
                to_id=target_qn,
                rel_type=RelationshipType.CALLS,
            ))
        elif call_name and caller_qn:
            logger.debug(ls.LOG_UNRESOLVED_CALL.format(call_name))

    def _extract_call_name(self, node, language: SupportedLanguage) -> str | None:
        """Extract the name of the called function/method from a call AST node."""
        # Direct function call: foo()
        fn_node = node.child_by_field_name(AST_FUNCTION_FIELD)
        if fn_node:
            if fn_node.type == "identifier":
                return fn_node.text.decode("utf-8")

            # Method call: obj.method()
            if fn_node.type in ("member_expression", "attribute"):
                attr = fn_node.child_by_field_name(AST_ATTRIBUTE_FIELD)
                if not attr:
                    attr = fn_node.child_by_field_name("property")
                obj = fn_node.child_by_field_name(AST_OBJECT_FIELD)

                attr_name = attr.text.decode("utf-8") if attr else None
                obj_name = obj.text.decode("utf-8") if obj else None

                if obj_name and attr_name:
                    return f"{obj_name}.{attr_name}"
                return attr_name

            # Scoped call: Foo::bar() (Rust, C++)
            if fn_node.type in ("scoped_identifier", "qualified_identifier"):
                return fn_node.text.decode("utf-8")

            # Field expression: obj.method (Rust)
            if fn_node.type == "field_expression":
                return fn_node.text.decode("utf-8")

            return fn_node.text.decode("utf-8")

        # New expression: new Foo()
        if node.type == "new_expression":
            for child in node.children:
                if child.type in ("identifier", "type_identifier"):
                    return child.text.decode("utf-8")

        # Method invocation (Java): obj.method()
        if node.type == "method_invocation":
            name_node = node.child_by_field_name("name")
            obj_node = node.child_by_field_name("object")
            if name_node:
                method_name = name_node.text.decode("utf-8")
                if obj_node:
                    return f"{obj_node.text.decode('utf-8')}.{method_name}"
                return method_name

        return None

    def _find_enclosing_function(
        self, node, module_qn: str, separator: str, language: SupportedLanguage,
    ) -> str | None:
        """Walk up AST to find the enclosing function/method definition."""
        from .language_spec import LANGUAGE_FQN_SPECS

        fqn_spec = LANGUAGE_FQN_SPECS.get(language)
        if not fqn_spec:
            return module_qn

        current = node.parent
        scope_parts: list[str] = []

        while current:
            if current.type in fqn_spec.function_node_types or \
               current.type in fqn_spec.scope_node_types:
                name = fqn_spec.get_name(current)
                if name:
                    scope_parts.insert(0, name)
            current = current.parent

        if scope_parts:
            return f"{module_qn}{separator}{separator.join(scope_parts)}"
        return module_qn

    def _resolve_call_target(
        self,
        call_name: str,
        file_imports: dict[str, str],
        module_qn: str,
        separator: str,
    ) -> str | None:
        """
        Resolve a call name to a qualified name in the graph.

        Resolution order:
        1. Direct match in function_registry
        2. Module-local qualified name
        3. Via import mapping
        4. Via simple name lookup (global search)
        """
        # 1. Direct match
        if call_name in self.function_registry:
            return call_name

        # 2. Module-local: module_qn.call_name
        local_qn = f"{module_qn}{separator}{call_name}"
        if local_qn in self.function_registry:
            return local_qn

        # Split compound names (obj.method)
        parts = call_name.replace("::", ".").split(".")

        # 3. Via import mapping
        if parts[0] in file_imports:
            imported_qn = file_imports[parts[0]]
            if len(parts) > 1:
                # obj.method → imported_module.method
                resolved = f"{imported_qn}{separator}{separator.join(parts[1:])}"
            else:
                resolved = imported_qn

            if resolved in self.function_registry:
                return resolved

            # Try with different separators
            for candidate_qn in self.function_registry:
                if candidate_qn.endswith(f"{separator}{parts[-1]}"):
                    if imported_qn in candidate_qn:
                        return candidate_qn

        # 4. Simple name lookup
        simple = parts[-1]
        if simple in self.simple_name_lookup:
            candidates = self.simple_name_lookup[simple]
            if len(candidates) == 1:
                return next(iter(candidates))
            # Multiple matches — prefer same module
            for candidate in candidates:
                if candidate.startswith(module_qn):
                    return candidate
            # Return first match as best guess
            return next(iter(candidates))

        return None

    def _get_call_types(self, language: SupportedLanguage) -> tuple[str, ...]:
        """Get AST call node types for a language."""
        from .language_spec import LANGUAGE_SPECS
        spec = LANGUAGE_SPECS.get(language)
        return spec.call_node_types if spec else ("call_expression",)

    @staticmethod
    def _walk_ast(node):
        """Walk AST tree depth-first."""
        yield node
        for child in node.children:
            yield from CallProcessor._walk_ast(child)
