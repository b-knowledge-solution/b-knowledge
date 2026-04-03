"""
Code Graph RAG - Class Ingest Mixin

Main orchestrator for class and method ingestion.
Extracts classes, their methods, inheritance, and method overrides from AST.

Ported from codebase_rag/parsers/class_ingest/mixin.py.
"""
from __future__ import annotations

from loguru import logger
from abc import abstractmethod
from pathlib import Path
from typing import TYPE_CHECKING

from tree_sitter import Node

from .. import constants as cs
from ..models import GraphNode
from ..parsers.utils import ingest_method, safe_decode_text
from ..types_defs import NodeType, PropertyDict, SimpleNameLookup
from . import cpp_modules
from . import identity as id_
from . import node_type as nt
from . import relationships as rel

if TYPE_CHECKING:
    from ..language_spec import LanguageSpec
    from ..services import IngestorProtocol
    from ..types_defs import FunctionRegistryTrieProtocol
    from ..import_processor import ImportProcessor




def _is_nested_inside_function(
    node: Node, class_body: Node, lang_config: LanguageSpec
) -> bool:
    """Check if a node is nested inside a function within a class body."""
    current = node.parent
    while current and current is not class_body:
        if (
            current.type in lang_config.function_node_types
            and current.child_by_field_name(cs.FIELD_BODY) is not None
        ):
            return True
        current = current.parent
    return False


class ClassIngestMixin:
    """
    Mixin providing class and method ingestion capabilities.

    Must be mixed into a class that provides:
    - ingestor: IngestorProtocol
    - repo_path: Path
    - project_name: str
    - function_registry: FunctionRegistryTrieProtocol
    - simple_name_lookup: SimpleNameLookup  
    - module_qn_to_file_path: dict[str, Path]
    - import_processor: ImportProcessor
    - class_inheritance: dict[str, list[str]]
    """
    __slots__ = ()
    ingestor: IngestorProtocol
    repo_path: Path
    project_name: str
    function_registry: FunctionRegistryTrieProtocol
    simple_name_lookup: SimpleNameLookup
    module_qn_to_file_path: dict[str, Path]
    import_processor: ImportProcessor
    class_inheritance: dict[str, list[str]]

    @abstractmethod
    def _get_docstring(self, node: Node) -> str | None: ...

    @abstractmethod
    def _extract_decorators(self, node: Node) -> list[str]: ...

    def _resolve_to_qn(self, name: str, module_qn: str) -> str:
        """Resolve a name to its qualified name."""
        return self._resolve_class_name(name, module_qn) or f"{module_qn}.{name}"

    def _resolve_class_name(self, name: str, module_qn: str) -> str | None:
        """Try to resolve class name via imports (override in subclass)."""
        return None

    def _ingest_cpp_module_declarations(
        self,
        root_node: Node,
        module_qn: str,
        file_path: Path,
    ) -> None:
        """Ingest C++ namespace declarations."""
        cpp_modules.ingest_cpp_module_declarations(
            root_node,
            module_qn,
            file_path,
            self.repo_path,
            self.project_name,
            self.ingestor,
        )

    def _find_cpp_exported_classes(self, root_node: Node) -> list[Node]:
        """Find C++ exported class declarations."""
        return cpp_modules.find_cpp_exported_classes(root_node)

    def _ingest_classes_and_methods(
        self,
        root_node: Node,
        module_qn: str,
        language: cs.SupportedLanguage,
        lang_config: LanguageSpec,
    ) -> None:
        """
        Ingest all classes and their methods from the AST root.

        @param root_node: AST root node.
        @param module_qn: Module qualified name.
        @param language: Source language.
        @param lang_config: Language spec config.
        """
        file_path = self.module_qn_to_file_path.get(module_qn)

        # Find class nodes from tree-sitter
        class_nodes = self._find_class_nodes(root_node, lang_config)

        # Add C++ exported classes
        if language == cs.SupportedLanguage.CPP:
            class_nodes.extend(self._find_cpp_exported_classes(root_node))

        for class_node in class_nodes:
            if isinstance(class_node, Node):
                self._process_class_node(
                    class_node,
                    module_qn,
                    language,
                    lang_config,
                    file_path,
                )

    def _find_class_nodes(self, root_node: Node, lang_config: LanguageSpec) -> list[Node]:
        """Find class-like AST nodes by walking the tree."""
        class_nodes: list[Node] = []
        self._walk_for_classes(root_node, lang_config, class_nodes)
        return class_nodes

    def _walk_for_classes(
        self, node: Node, lang_config: LanguageSpec, results: list[Node]
    ) -> None:
        """Recursively walk AST to find class nodes."""
        if node.type in lang_config.class_node_types:
            results.append(node)
        for child in node.children:
            self._walk_for_classes(child, lang_config, results)

    def _process_class_node(
        self,
        class_node: Node,
        module_qn: str,
        language: cs.SupportedLanguage,
        lang_config: LanguageSpec,
        file_path: Path | None,
    ) -> None:
        """Process a single class node: extract identity, create graph node, ingest methods."""
        # Rust impl blocks
        if language == cs.SupportedLanguage.RUST and class_node.type == cs.TS_IMPL_ITEM:
            self._ingest_rust_impl_methods(class_node, module_qn, language, lang_config)
            return

        # Resolve class identity
        identity = id_.resolve_class_identity(
            class_node,
            module_qn,
            language,
            lang_config,
            file_path,
            self.repo_path,
            self.project_name,
        )
        if not identity:
            return

        class_qn, class_name, is_exported = identity

        # Determine node type (Class, Interface, Enum, etc.)
        node_type = nt.determine_node_type(class_node, class_name, class_qn, language)

        # Build class properties
        class_props: PropertyDict = {
            cs.KEY_QUALIFIED_NAME: class_qn,
            cs.KEY_NAME: class_name,
            "decorators": self._extract_decorators(class_node),
            cs.KEY_START_LINE: class_node.start_point[0] + 1,
            cs.KEY_END_LINE: class_node.end_point[0] + 1,
            "docstring": self._get_docstring(class_node),
        }
        if file_path and self.repo_path:
            class_props[cs.KEY_PATH] = file_path.relative_to(self.repo_path).as_posix()

        # Create graph node
        self.ingestor.ensure_node(GraphNode(
            labels=[node_type],
            properties=class_props,
        ))
        self.function_registry[class_qn] = node_type
        self.simple_name_lookup[class_name].add(class_qn)

        # Create relationships (inheritance, implements, defines)
        rel.create_class_relationships(
            class_node,
            class_qn,
            module_qn,
            node_type,
            is_exported,
            language,
            self.class_inheritance,
            self.ingestor,
            self.import_processor if hasattr(self, 'import_processor') else None,
            self._resolve_to_qn,
            self.function_registry,
        )

        # Ingest methods
        self._ingest_class_methods(
            class_node, class_qn, node_type, language, lang_config, file_path
        )

    def _ingest_class_methods(
        self,
        class_node: Node,
        class_qn: str,
        node_type: str,
        language: cs.SupportedLanguage,
        lang_config: LanguageSpec,
        file_path: Path | None,
    ) -> None:
        """Ingest methods defined within a class body."""
        body_node = class_node.child_by_field_name(cs.FIELD_BODY)
        if not body_node:
            return

        for child in body_node.children:
            if child.type in lang_config.function_node_types:
                if not _is_nested_inside_function(child, body_node, lang_config):
                    ingest_method(
                        child,
                        class_qn,
                        node_type,
                        self.ingestor,
                        self.function_registry,
                        self.simple_name_lookup,
                        self._get_docstring,
                        language=language,
                        extract_decorators_func=self._extract_decorators,
                        file_path=file_path,
                        repo_path=self.repo_path,
                    )

    def _ingest_rust_impl_methods(
        self,
        impl_node: Node,
        module_qn: str,
        language: cs.SupportedLanguage,
        lang_config: LanguageSpec,
    ) -> None:
        """Ingest methods from a Rust impl block."""
        from ..rs import utils as rs_utils
        target = rs_utils.extract_impl_target(impl_node)
        if not target:
            return

        impl_qn = f"{module_qn}.{target}"

        body_node = impl_node.child_by_field_name(cs.FIELD_BODY)
        if not body_node:
            return

        for child in body_node.children:
            if child.type in lang_config.function_node_types:
                ingest_method(
                    child,
                    impl_qn,
                    NodeType.CLASS,
                    self.ingestor,
                    self.function_registry,
                    self.simple_name_lookup,
                    self._get_docstring,
                    language=language,
                )
