"""
Code Graph RAG - Type Definitions

Type aliases and protocols for the parser pipeline.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import ItemsView, KeysView
from typing import TYPE_CHECKING, Protocol

from .constants import NodeLabel, SupportedLanguage

if TYPE_CHECKING:
    from pathlib import Path
    from tree_sitter import Node

# Simple type aliases
type PropertyValue = str | int | float | bool | list[str] | None
type PropertyDict = dict[str, PropertyValue]
type SimpleName = str
type QualifiedName = str
type SimpleNameLookup = defaultdict[SimpleName, set[QualifiedName]]
type NodeIdentifier = tuple[NodeLabel | str, str, str | None]
type ASTNode = Node


class NodeType:
    """Node type classification for function registry."""
    FUNCTION = "Function"
    METHOD = "Method"
    CLASS = "Class"
    MODULE = "Module"
    INTERFACE = "Interface"
    PACKAGE = "Package"
    ENUM = "Enum"
    TYPE = "Type"


class FunctionRegistryTrieProtocol(Protocol):
    """Protocol for the function registry trie data structure."""
    def __contains__(self, qualified_name: QualifiedName) -> bool: ...
    def __getitem__(self, qualified_name: QualifiedName) -> str: ...
    def __setitem__(self, qualified_name: QualifiedName, func_type: str) -> None: ...
    def get(self, qualified_name: QualifiedName, default: str | None = None) -> str | None: ...
    def keys(self) -> KeysView[QualifiedName]: ...
    def items(self) -> ItemsView[QualifiedName, str]: ...


class ASTCacheProtocol(Protocol):
    """Protocol for caching parsed AST trees."""
    def __setitem__(self, key: Path, value: tuple[Node, SupportedLanguage]) -> None: ...
    def __getitem__(self, key: Path) -> tuple[Node, SupportedLanguage]: ...
    def __contains__(self, key: Path) -> bool: ...
    def items(self) -> ItemsView[Path, tuple[Node, SupportedLanguage]]: ...
