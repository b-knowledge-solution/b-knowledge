"""
Code Graph RAG - ProcessorFactory

Orchestrates the code graph extraction pipeline by wiring all processors
together with shared state.
"""
from __future__ import annotations

from loguru import logger
from pathlib import Path

from tree_sitter_language_pack import get_language, get_parser

from .constants import SupportedLanguage, EXTENSION_TO_LANGUAGE, detect_language
from .services import IngestorProtocol
from .structure_processor import StructureProcessor
from .import_processor import ImportProcessor
from .definition_processor import DefinitionProcessor
from .call_processor import CallProcessor
from . import logs as ls



# Map SupportedLanguage to tree-sitter-language-pack language names
_TS_LANGUAGE_MAP: dict[SupportedLanguage, str] = {
    SupportedLanguage.PYTHON: "python",
    SupportedLanguage.JAVASCRIPT: "javascript",
    SupportedLanguage.TYPESCRIPT: "typescript",
    SupportedLanguage.RUST: "rust",
    SupportedLanguage.JAVA: "java",
    SupportedLanguage.C: "c",
    SupportedLanguage.CPP: "cpp",
    SupportedLanguage.LUA: "lua",
    SupportedLanguage.GO: "go",
    SupportedLanguage.SCALA: "scala",
    SupportedLanguage.CSHARP: "c_sharp",
    SupportedLanguage.PHP: "php",
}


class ProcessorFactory:
    """
    Wires all code graph processors together with shared state.

    Processors are created lazily and share:
    - function_registry: qualified_name -> node_type
    - import_mapping: filepath -> {local_name -> qualified_name}
    - simple_name_lookup: name -> {qualified_names}

    @param ingestor: IngestorProtocol for graph writes.
    @param project_root: Root path of the project.
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

        # Shared state
        self._function_registry: dict[str, str] = {}
        self._simple_name_lookup: dict[str, set[str]] = {}

        # Lazy-initialized processors
        self._structure: StructureProcessor | None = None
        self._import: ImportProcessor | None = None
        self._definition: DefinitionProcessor | None = None
        self._call: CallProcessor | None = None

    @property
    def structure_processor(self) -> StructureProcessor:
        """Lazy-create StructureProcessor."""
        if self._structure is None:
            self._structure = StructureProcessor(
                self.ingestor, self.project_root, self.project_name, self.kb_id,
            )
        return self._structure

    @property
    def import_processor(self) -> ImportProcessor:
        """Lazy-create ImportProcessor."""
        if self._import is None:
            self._import = ImportProcessor(
                self.ingestor, self.project_root, self.project_name, self.kb_id,
            )
        return self._import

    @property
    def definition_processor(self) -> DefinitionProcessor:
        """Lazy-create DefinitionProcessor."""
        if self._definition is None:
            self._definition = DefinitionProcessor(
                self.ingestor, self.project_root, self.project_name, self.kb_id,
            )
        return self._definition

    @property
    def call_processor(self) -> CallProcessor:
        """Lazy-create CallProcessor with shared state from other processors."""
        if self._call is None:
            self._call = CallProcessor(
                ingestor=self.ingestor,
                project_root=self.project_root,
                project_name=self.project_name,
                function_registry=self._function_registry,
                import_mapping=self.import_processor.import_mapping,
                simple_name_lookup=self._simple_name_lookup,
                kb_id=self.kb_id,
            )
        return self._call

    def process_file(self, filepath: Path, source_bytes: bytes | None = None) -> bool:
        """
        Run the full extraction pipeline for a single source file.

        Pipeline order: import → definition → call
        (Structure is run separately for the whole project)

        @param filepath: Absolute path to the source file.
        @param source_bytes: Optional raw file bytes (reads from disk if None).
        @returns: True if extraction succeeded, False otherwise.
        """
        # Detect language
        language = detect_language(filepath.name)
        if language is None:
            logger.debug(ls.LOG_LANGUAGE_UNSUPPORTED.format(filepath.name))
            return False

        logger.info(ls.LOG_LANGUAGE_DETECTED.format(language.value, filepath.name))

        # Read source if not provided
        if source_bytes is None:
            try:
                source_bytes = filepath.read_bytes()
            except Exception as e:
                logger.warning(f"Cannot read {filepath}: {e}")
                return False

        # Parse with Tree-sitter
        tree_root = self._parse_ast(source_bytes, language)
        if tree_root is None:
            return False

        # Build module qualified name
        try:
            relative = filepath.relative_to(self.project_root)
            module_qn = f"{self.project_name}.{'.'.join(relative.with_suffix('').parts)}"
        except ValueError:
            module_qn = f"{self.project_name}.{filepath.stem}"

        # 1. Parse imports
        self.import_processor.parse_imports(filepath, tree_root, language, module_qn)

        # 2. Extract definitions (functions, classes, methods)
        self.definition_processor.process_file(
            filepath, tree_root, language, module_qn, source_bytes,
        )

        # Sync shared state from definition processor
        self._function_registry.update(self.definition_processor.function_registry)
        self._simple_name_lookup.update(self.definition_processor.simple_name_lookup)

        # 3. Resolve calls (needs import_mapping + function_registry)
        self.call_processor.process_calls_in_file(
            filepath, tree_root, language, module_qn,
        )

        return True

    def _parse_ast(self, source_bytes: bytes, language: SupportedLanguage):
        """Parse source bytes into a Tree-sitter AST."""
        ts_lang_name = _TS_LANGUAGE_MAP.get(language)
        if not ts_lang_name:
            return None

        try:
            parser = get_parser(ts_lang_name)
            tree = parser.parse(source_bytes)
            return tree.root_node
        except Exception as e:
            logger.warning(f"Tree-sitter parse error for {language}: {e}")
            return None
