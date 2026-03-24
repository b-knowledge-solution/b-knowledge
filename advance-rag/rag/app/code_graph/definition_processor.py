"""
Code Graph RAG - Definition Processor

Extracts function, method, and class definitions from source files using
Tree-sitter AST. Creates graph nodes with qualified names, source code
snippets, and line ranges.
"""
from __future__ import annotations

import logging
from pathlib import Path

from .constants import (
    SupportedLanguage, NodeLabel, RelationshipType,
    KEY_QUALIFIED_NAME, KEY_NAME, KEY_PATH, KEY_RELATIVE_PATH,
    KEY_SOURCE_CODE, KEY_START_LINE, KEY_END_LINE,
    KEY_PARAMETERS, KEY_RETURN_TYPE, KEY_LANGUAGE, KEY_KB_ID,
    QN_SEPARATOR,
    AST_NAME_FIELD, AST_BODY_FIELD, AST_PARAMETERS_FIELD,
    AST_RETURN_TYPE_FIELD, AST_SUPERCLASSES_FIELD,
)
from .models import GraphNode, GraphRelationship
from .services import IngestorProtocol
from .language_spec import LANGUAGE_FQN_SPECS
from . import logs as ls

logger = logging.getLogger(__name__)


class DefinitionProcessor:
    """
    Extracts function/method/class definitions and creates graph nodes.

    Supports nested definitions with fully qualified name tracking.
    Extracts source code snippets for code-snippet retrieval feature.

    @param ingestor: IngestorProtocol for graph writes.
    @param project_root: Root path of the project.
    @param project_name: Project name for qualified name construction.
    @param kb_id: Knowledge base ID for tenant isolation.
    """

    def __init__(
        self,
        ingestor: IngestorProtocol,
        project_root: Path,
        project_name: str,
        kb_id: str = "",
    ) -> None:
        self.ingestor = ingestor
        self.project_root = project_root
        self.project_name = project_name
        self.kb_id = kb_id
        # function_registry: qualified_name -> node_type
        self.function_registry: dict[str, str] = {}
        # class_inheritance: class_qn -> [parent_qn, ...]
        self.class_inheritance: dict[str, list[str]] = {}
        # simple_name_lookup: name -> {qualified_names}
        self.simple_name_lookup: dict[str, set[str]] = {}

    def process_file(
        self,
        filepath: Path,
        tree_root,
        language: SupportedLanguage,
        module_qn: str,
        source_bytes: bytes,
    ) -> None:
        """
        Process all definitions in a source file.

        @param filepath: Absolute path to the source file.
        @param tree_root: Root AST node from Tree-sitter.
        @param language: Language of the source file.
        @param module_qn: Qualified name of the containing module.
        @param source_bytes: Raw file bytes for snippet extraction.
        """
        logger.debug(ls.LOG_PROCESSING_FILE.format(filepath.name))
        separator = QN_SEPARATOR.get(language, ".")
        fqn_spec = LANGUAGE_FQN_SPECS.get(language)

        if not fqn_spec:
            return

        # Walk top-level definitions
        self._process_node(
            node=tree_root,
            filepath=filepath,
            language=language,
            module_qn=module_qn,
            parent_qn=module_qn,
            separator=separator,
            fqn_spec=fqn_spec,
            source_bytes=source_bytes,
            depth=0,
        )

    def _process_node(
        self,
        node,
        filepath: Path,
        language: SupportedLanguage,
        module_qn: str,
        parent_qn: str,
        separator: str,
        fqn_spec,
        source_bytes: bytes,
        depth: int,
    ) -> None:
        """Recursively process AST nodes to find definitions."""
        for child in node.children:
            label = None
            name = None

            # Detect functions/methods
            if child.type in fqn_spec.function_node_types:
                name = fqn_spec.get_name(child)
                if name:
                    # Method if parent is a class scope
                    is_method = parent_qn != module_qn and depth > 0
                    label = NodeLabel.METHOD if is_method else NodeLabel.FUNCTION

                    qualified_name = f"{parent_qn}{separator}{name}"
                    self._create_definition_node(
                        child, filepath, language, qualified_name, name,
                        label, parent_qn, source_bytes,
                    )

                    # Register in function registry
                    self.function_registry[qualified_name] = label
                    self.simple_name_lookup.setdefault(name, set()).add(qualified_name)

                    logger.debug(ls.LOG_FOUND_FUNCTION.format(qualified_name))

                    # Recurse for nested functions
                    body = child.child_by_field_name(AST_BODY_FIELD)
                    if body:
                        self._process_node(
                            body, filepath, language, module_qn,
                            qualified_name, separator, fqn_spec, source_bytes,
                            depth + 1,
                        )
                    continue

            # Detect classes/interfaces/structs/traits
            if child.type in fqn_spec.scope_node_types and child.type not in fqn_spec.function_node_types:
                name = fqn_spec.get_name(child)
                if name:
                    # Determine class-like label
                    label = self._classify_class_node(child, language)
                    qualified_name = f"{parent_qn}{separator}{name}"

                    self._create_definition_node(
                        child, filepath, language, qualified_name, name,
                        label, parent_qn, source_bytes,
                    )

                    # Register in function registry
                    self.function_registry[qualified_name] = label
                    self.simple_name_lookup.setdefault(name, set()).add(qualified_name)

                    logger.debug(ls.LOG_FOUND_CLASS.format(qualified_name))

                    # Extract inheritance
                    self._extract_inheritance(child, qualified_name, language, module_qn)

                    # Recurse into class body
                    body = child.child_by_field_name(AST_BODY_FIELD)
                    if body:
                        self._process_node(
                            body, filepath, language, module_qn,
                            qualified_name, separator, fqn_spec, source_bytes,
                            depth + 1,
                        )
                    else:
                        # Some languages don't use a body field
                        self._process_node(
                            child, filepath, language, module_qn,
                            qualified_name, separator, fqn_spec, source_bytes,
                            depth + 1,
                        )
                    continue

            # Recurse into other nodes (e.g., blocks, statements)
            self._process_node(
                child, filepath, language, module_qn,
                parent_qn, separator, fqn_spec, source_bytes,
                depth,
            )

    def _create_definition_node(
        self,
        node,
        filepath: Path,
        language: SupportedLanguage,
        qualified_name: str,
        name: str,
        label: str,
        parent_qn: str,
        source_bytes: bytes,
    ) -> None:
        """Create a graph node for a function/class definition."""
        relative = filepath.relative_to(self.project_root)

        # Extract source code snippet
        start_byte = node.start_byte
        end_byte = node.end_byte
        source_code = source_bytes[start_byte:end_byte].decode("utf-8", errors="replace")

        # Truncate very long source code (keep first 2000 chars)
        if len(source_code) > 2000:
            source_code = source_code[:2000] + "\n... (truncated)"

        # Extract parameters (for functions/methods)
        params = ""
        params_node = node.child_by_field_name(AST_PARAMETERS_FIELD)
        if params_node:
            params = params_node.text.decode("utf-8", errors="replace")

        # Extract return type
        return_type = ""
        rt_node = node.child_by_field_name(AST_RETURN_TYPE_FIELD)
        if rt_node:
            return_type = rt_node.text.decode("utf-8", errors="replace")

        self.ingestor.ensure_node(GraphNode(
            node_id=qualified_name,
            labels=[label],
            properties={
                KEY_QUALIFIED_NAME: qualified_name,
                KEY_NAME: name,
                KEY_PATH: str(filepath),
                KEY_RELATIVE_PATH: str(relative),
                KEY_SOURCE_CODE: source_code,
                KEY_START_LINE: node.start_point[0] + 1,
                KEY_END_LINE: node.end_point[0] + 1,
                KEY_PARAMETERS: params,
                KEY_RETURN_TYPE: return_type,
                KEY_LANGUAGE: language.value,
                KEY_KB_ID: self.kb_id,
            },
        ))

        # Relationship: parent DEFINES this definition
        self.ingestor.ensure_relationship(GraphRelationship(
            from_id=parent_qn,
            to_id=qualified_name,
            rel_type=RelationshipType.DEFINES,
        ))

    def _classify_class_node(self, node, language: SupportedLanguage) -> str:
        """Classify a class-like AST node into the appropriate label."""
        node_type = node.type

        if "interface" in node_type:
            return NodeLabel.INTERFACE
        elif "enum" in node_type:
            return NodeLabel.ENUM
        elif "trait" in node_type:
            return NodeLabel.TRAIT
        elif "struct" in node_type:
            return NodeLabel.STRUCT
        elif "union" in node_type:
            return NodeLabel.UNION
        elif "type" in node_type and "alias" not in node_type:
            return NodeLabel.TYPE
        elif "namespace" in node_type:
            return NodeLabel.PACKAGE
        else:
            return NodeLabel.CLASS

    def _extract_inheritance(
        self,
        node,
        class_qn: str,
        language: SupportedLanguage,
        module_qn: str,
    ) -> None:
        """Extract class inheritance and create INHERITS relationships."""
        parents: list[str] = []

        # Python: class Foo(Bar, Baz)
        superclasses = node.child_by_field_name(AST_SUPERCLASSES_FIELD)
        if superclasses:
            for child in superclasses.children:
                if child.type in ("identifier", "attribute", "dotted_name"):
                    parent_name = child.text.decode("utf-8")
                    parents.append(parent_name)

        # Java/C#/TS: extends/implements in superclass/interfaces field
        for child in node.children:
            if child.type in ("superclass", "super_interfaces",
                              "extends_clause", "implements_clause",
                              "class_heritage"):
                for heir_child in child.children:
                    if heir_child.type in ("type_identifier", "identifier",
                                           "scoped_type_identifier",
                                           "generic_type"):
                        parent_name = heir_child.text.decode("utf-8").split("<")[0]
                        parents.append(parent_name)

        if parents:
            self.class_inheritance[class_qn] = parents
            # Create INHERITS relationships (best-effort — parent might not be in graph)
            for parent_name in parents:
                self.ingestor.ensure_relationship(GraphRelationship(
                    from_id=class_qn,
                    to_id=parent_name,  # May be unresolved name
                    rel_type=RelationshipType.INHERITS,
                ))
