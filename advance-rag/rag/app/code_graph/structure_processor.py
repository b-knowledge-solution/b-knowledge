"""
Code Graph RAG - Structure Processor

Scans the project directory structure and creates Project, Folder, Package,
and File nodes with CONTAINS relationships.
"""
from __future__ import annotations

import logging
from pathlib import Path

from .constants import (
    SupportedLanguage, NodeLabel, RelationshipType,
    KEY_QUALIFIED_NAME, KEY_NAME, KEY_PATH, KEY_RELATIVE_PATH, KEY_LANGUAGE, KEY_KB_ID,
    EXTENSION_TO_LANGUAGE, PACKAGE_INDICATORS,
)
from .models import GraphNode, GraphRelationship
from .services import IngestorProtocol
from . import logs as ls

logger = logging.getLogger(__name__)


class StructureProcessor:
    """
    Scans directory structure to create hierarchical graph nodes.

    Creates Project → Folder/Package → File relationships, detecting
    packages via language-specific indicator files.

    @param ingestor: IngestorProtocol implementation for graph writes.
    @param project_root: Root path of the project/repository.
    @param project_name: Human-readable project name.
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
        self._processed_dirs: set[Path] = set()

    def identify_structure(self, languages: set[SupportedLanguage] | None = None) -> None:
        """
        Scan project root and create structural graph nodes.

        @param languages: Optional set of languages to process.
            If None, processes all supported languages.
        """
        # Create project root node
        project_qn = self.project_name
        self.ingestor.ensure_node(GraphNode(
            node_id=project_qn,
            labels=[NodeLabel.PROJECT],
            properties={
                KEY_QUALIFIED_NAME: project_qn,
                KEY_NAME: self.project_name,
                KEY_PATH: str(self.project_root),
                KEY_KB_ID: self.kb_id,
            },
        ))

        # Walk directory tree
        self._scan_directory(self.project_root, project_qn, languages)

    def _scan_directory(
        self,
        directory: Path,
        parent_qn: str,
        languages: set[SupportedLanguage] | None,
    ) -> None:
        """Recursively scan directory and create folder/package/file nodes."""
        if directory in self._processed_dirs:
            return
        self._processed_dirs.add(directory)

        try:
            entries = sorted(directory.iterdir())
        except PermissionError:
            return

        for entry in entries:
            if entry.name.startswith(".") or entry.name == "__pycache__":
                continue

            if entry.is_dir():
                self._process_directory(entry, parent_qn, languages)
            elif entry.is_file():
                self._process_file(entry, parent_qn, languages)

    def _process_directory(
        self,
        directory: Path,
        parent_qn: str,
        languages: set[SupportedLanguage] | None,
    ) -> None:
        """Create Folder or Package node based on indicator files."""
        relative = directory.relative_to(self.project_root)
        dir_qn = f"{self.project_name}.{'.'.join(relative.parts)}"

        # Detect if this is a package
        is_package = False
        detected_language = None

        for lang, indicators in PACKAGE_INDICATORS.items():
            if languages and lang not in languages:
                continue
            for indicator in indicators:
                if (directory / indicator).exists():
                    is_package = True
                    detected_language = lang
                    break
            if is_package:
                break

        label = NodeLabel.PACKAGE if is_package else NodeLabel.FOLDER
        rel_type = RelationshipType.CONTAINS_PACKAGE if is_package else RelationshipType.CONTAINS

        if is_package:
            logger.debug(ls.LOG_FOUND_PACKAGE.format(dir_qn))
        else:
            logger.debug(ls.LOG_FOUND_FOLDER.format(dir_qn))

        props: dict = {
            KEY_QUALIFIED_NAME: dir_qn,
            KEY_NAME: directory.name,
            KEY_PATH: str(directory),
            KEY_RELATIVE_PATH: str(relative),
            KEY_KB_ID: self.kb_id,
        }
        if detected_language:
            props[KEY_LANGUAGE] = detected_language.value

        self.ingestor.ensure_node(GraphNode(
            node_id=dir_qn,
            labels=[label],
            properties=props,
        ))

        # Relationship: parent CONTAINS this directory
        self.ingestor.ensure_relationship(GraphRelationship(
            from_id=parent_qn,
            to_id=dir_qn,
            rel_type=rel_type,
        ))

        # Recurse into subdirectory
        self._scan_directory(directory, dir_qn, languages)

    def _process_file(
        self,
        filepath: Path,
        parent_qn: str,
        languages: set[SupportedLanguage] | None,
    ) -> None:
        """Create File/Module node for a source file."""
        ext = filepath.suffix.lower()
        language = EXTENSION_TO_LANGUAGE.get(ext)

        # Skip unsupported files
        if language is None:
            return
        if languages and language not in languages:
            return

        relative = filepath.relative_to(self.project_root)
        file_qn = f"{self.project_name}.{'.'.join(relative.with_suffix('').parts)}"

        self.ingestor.ensure_node(GraphNode(
            node_id=file_qn,
            labels=[NodeLabel.MODULE],
            properties={
                KEY_QUALIFIED_NAME: file_qn,
                KEY_NAME: filepath.stem,
                KEY_PATH: str(filepath),
                KEY_RELATIVE_PATH: str(relative),
                KEY_LANGUAGE: language.value,
                KEY_KB_ID: self.kb_id,
            },
        ))

        # Relationship: parent CONTAINS_MODULE this file
        self.ingestor.ensure_relationship(GraphRelationship(
            from_id=parent_qn,
            to_id=file_qn,
            rel_type=RelationshipType.CONTAINS_MODULE,
        ))
