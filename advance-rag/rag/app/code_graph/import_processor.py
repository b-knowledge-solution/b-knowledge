"""
Code Graph RAG - Import Processor

Parses import statements for all 12 supported languages using Tree-sitter AST.
Builds an import_mapping dict for cross-file call resolution.
"""
from __future__ import annotations

from loguru import logger
from functools import lru_cache
from pathlib import Path

from .constants import (
    SupportedLanguage, NodeLabel, RelationshipType,
    KEY_QUALIFIED_NAME, KEY_NAME, KEY_KB_ID,
    AST_NAME_FIELD, AST_SOURCE_FIELD, AST_PATH_FIELD, AST_MODULE_FIELD,
)
from .models import GraphNode, GraphRelationship
from .services import IngestorProtocol
from . import logs as ls




class ImportProcessor:
    """
    Parses import statements and builds cross-file import mappings.

    Each language has its own import syntax. This processor handles all 12
    and creates IMPORTS relationships in the graph.

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
        # import_mapping: local_name -> qualified_name
        self.import_mapping: dict[str, dict[str, str]] = {}

    def parse_imports(
        self,
        filepath: Path,
        tree_root,
        language: SupportedLanguage,
        module_qn: str,
    ) -> dict[str, str]:
        """
        Parse all import statements in a file.

        @param filepath: Absolute path to the source file.
        @param tree_root: Root AST node from Tree-sitter.
        @param language: Language of the source file.
        @param module_qn: Qualified name of the containing module.
        @returns: Dict mapping local import names to qualified names.
        """
        logger.debug(ls.LOG_PARSING_IMPORTS.format(filepath.name))

        file_imports: dict[str, str] = {}

        # Dispatch to language-specific parser
        parser_method = {
            SupportedLanguage.PYTHON: self._parse_python_imports,
            SupportedLanguage.JAVASCRIPT: self._parse_js_ts_imports,
            SupportedLanguage.TYPESCRIPT: self._parse_js_ts_imports,
            SupportedLanguage.JAVA: self._parse_java_imports,
            SupportedLanguage.RUST: self._parse_rust_imports,
            SupportedLanguage.GO: self._parse_go_imports,
            SupportedLanguage.C: self._parse_c_cpp_imports,
            SupportedLanguage.CPP: self._parse_c_cpp_imports,
            SupportedLanguage.LUA: self._parse_lua_imports,
            SupportedLanguage.PHP: self._parse_php_imports,
            SupportedLanguage.SCALA: self._parse_scala_imports,
            SupportedLanguage.CSHARP: self._parse_csharp_imports,
        }.get(language)

        if parser_method:
            file_imports = parser_method(filepath, tree_root, module_qn)

        # Store in global mapping
        file_key = str(filepath)
        self.import_mapping[file_key] = file_imports

        return file_imports

    def _parse_python_imports(
        self, filepath: Path, tree_root, module_qn: str,
    ) -> dict[str, str]:
        """Parse Python import and from...import statements."""
        imports: dict[str, str] = {}

        for node in self._walk_ast(tree_root):
            if node.type == "import_statement":
                # import os, import os.path
                for child in node.children:
                    if child.type == "dotted_name":
                        name = child.text.decode("utf-8")
                        local_name = name.split(".")[-1]
                        resolved = self._resolve_python_module(name, filepath)
                        imports[local_name] = resolved or name
                    elif child.type == "aliased_import":
                        dotted = child.child_by_field_name("name")
                        alias = child.child_by_field_name("alias")
                        if dotted and alias:
                            name = dotted.text.decode("utf-8")
                            local_name = alias.text.decode("utf-8")
                            resolved = self._resolve_python_module(name, filepath)
                            imports[local_name] = resolved or name

            elif node.type == "import_from_statement":
                # from os.path import join
                module_node = node.child_by_field_name(AST_MODULE_FIELD)
                if not module_node:
                    # Try alternative: module_name might be under "name"
                    for child in node.children:
                        if child.type == "dotted_name":
                            module_node = child
                            break

                module_name = module_node.text.decode("utf-8") if module_node else ""

                for child in node.children:
                    if child.type == "dotted_name" and child != module_node:
                        name = child.text.decode("utf-8")
                        full_name = f"{module_name}.{name}" if module_name else name
                        imports[name] = self._resolve_python_module(full_name, filepath) or full_name
                    elif child.type == "aliased_import":
                        orig = child.child_by_field_name("name")
                        alias = child.child_by_field_name("alias")
                        if orig:
                            name = orig.text.decode("utf-8")
                            full_name = f"{module_name}.{name}" if module_name else name
                            local = alias.text.decode("utf-8") if alias else name
                            imports[local] = self._resolve_python_module(full_name, filepath) or full_name

        return imports

    def _parse_js_ts_imports(
        self, filepath: Path, tree_root, module_qn: str,
    ) -> dict[str, str]:
        """Parse JS/TS import statements (ES6 and CommonJS)."""
        imports: dict[str, str] = {}

        for node in self._walk_ast(tree_root):
            if node.type == "import_statement":
                source_node = node.child_by_field_name(AST_SOURCE_FIELD)
                if not source_node:
                    continue
                source = source_node.text.decode("utf-8").strip("'\"")
                resolved = self._resolve_js_module(source, filepath)

                # Extract imported names
                for child in node.children:
                    if child.type == "import_clause":
                        for clause_child in child.children:
                            if clause_child.type == "identifier":
                                name = clause_child.text.decode("utf-8")
                                imports[name] = resolved or source
                            elif clause_child.type == "named_imports":
                                for spec in clause_child.children:
                                    if spec.type == "import_specifier":
                                        name_node = spec.child_by_field_name("name")
                                        alias_node = spec.child_by_field_name("alias")
                                        if name_node:
                                            name = name_node.text.decode("utf-8")
                                            local = alias_node.text.decode("utf-8") if alias_node else name
                                            imports[local] = f"{resolved or source}.{name}"
                            elif clause_child.type == "namespace_import":
                                for ns_child in clause_child.children:
                                    if ns_child.type == "identifier":
                                        imports[ns_child.text.decode("utf-8")] = resolved or source

            # CommonJS: const x = require('...')
            elif node.type == "lexical_declaration" or node.type == "variable_declaration":
                for child in node.children:
                    if child.type == "variable_declarator":
                        value = child.child_by_field_name("value")
                        if value and value.type == "call_expression":
                            fn = value.child_by_field_name("function")
                            if fn and fn.text.decode("utf-8") == "require":
                                args = value.child_by_field_name("arguments")
                                if args and args.child_count > 0:
                                    for arg in args.children:
                                        if arg.type == "string":
                                            source = arg.text.decode("utf-8").strip("'\"")
                                            name_node = child.child_by_field_name("name")
                                            if name_node:
                                                name = name_node.text.decode("utf-8")
                                                resolved = self._resolve_js_module(source, filepath)
                                                imports[name] = resolved or source

        return imports

    def _parse_java_imports(
        self, filepath: Path, tree_root, module_qn: str,
    ) -> dict[str, str]:
        """Parse Java import declarations."""
        imports: dict[str, str] = {}
        for node in self._walk_ast(tree_root):
            if node.type == "import_declaration":
                # import com.example.MyClass;
                for child in node.children:
                    if child.type == "scoped_identifier" or child.type == "identifier":
                        full_name = child.text.decode("utf-8")
                        local_name = full_name.split(".")[-1]
                        if local_name != "*":
                            imports[local_name] = full_name
        return imports

    def _parse_rust_imports(
        self, filepath: Path, tree_root, module_qn: str,
    ) -> dict[str, str]:
        """Parse Rust use declarations."""
        imports: dict[str, str] = {}
        for node in self._walk_ast(tree_root):
            if node.type == "use_declaration":
                path_text = ""
                for child in node.children:
                    if child.type in ("scoped_identifier", "identifier", "use_wildcard",
                                      "scoped_use_list", "use_as_clause"):
                        path_text = child.text.decode("utf-8")

                if path_text:
                    # Simple: use std::collections::HashMap;
                    parts = path_text.replace("::", ".").split(".")
                    local_name = parts[-1] if parts else path_text
                    if local_name != "*" and local_name != "{":
                        imports[local_name] = path_text.replace("::", ".")
        return imports

    def _parse_go_imports(
        self, filepath: Path, tree_root, module_qn: str,
    ) -> dict[str, str]:
        """Parse Go import declarations."""
        imports: dict[str, str] = {}
        for node in self._walk_ast(tree_root):
            if node.type == "import_declaration":
                for child in node.children:
                    if child.type == "import_spec":
                        path_node = child.child_by_field_name("path")
                        name_node = child.child_by_field_name("name")
                        if path_node:
                            pkg_path = path_node.text.decode("utf-8").strip('"')
                            local = name_node.text.decode("utf-8") if name_node else pkg_path.split("/")[-1]
                            imports[local] = pkg_path
                    elif child.type == "import_spec_list":
                        for spec in child.children:
                            if spec.type == "import_spec":
                                path_node = spec.child_by_field_name("path")
                                name_node = spec.child_by_field_name("name")
                                if path_node:
                                    pkg_path = path_node.text.decode("utf-8").strip('"')
                                    local = name_node.text.decode("utf-8") if name_node else pkg_path.split("/")[-1]
                                    imports[local] = pkg_path
                    elif child.type == "interpreted_string_literal":
                        pkg_path = child.text.decode("utf-8").strip('"')
                        imports[pkg_path.split("/")[-1]] = pkg_path
        return imports

    def _parse_c_cpp_imports(
        self, filepath: Path, tree_root, module_qn: str,
    ) -> dict[str, str]:
        """Parse C/C++ #include and using directives."""
        imports: dict[str, str] = {}
        for node in self._walk_ast(tree_root):
            if node.type == "preproc_include":
                path_node = node.child_by_field_name("path")
                if path_node:
                    include_path = path_node.text.decode("utf-8").strip('<>"')
                    # Use the filename without extension as local name
                    local_name = Path(include_path).stem
                    imports[local_name] = include_path
            elif node.type in ("using_declaration", "using_directive"):
                text = node.text.decode("utf-8")
                # Extract namespace/type from using statement
                parts = text.replace("using", "").replace("namespace", "").strip().rstrip(";").split("::")
                if parts:
                    local_name = parts[-1].strip()
                    if local_name:
                        imports[local_name] = "::".join(p.strip() for p in parts)
        return imports

    def _parse_lua_imports(
        self, filepath: Path, tree_root, module_qn: str,
    ) -> dict[str, str]:
        """Parse Lua require() calls."""
        imports: dict[str, str] = {}
        for node in self._walk_ast(tree_root):
            if node.type == "function_call":
                fn_name = ""
                for child in node.children:
                    if child.type == "identifier":
                        fn_name = child.text.decode("utf-8")

                if fn_name == "require":
                    # require("module.name")
                    args = node.child_by_field_name("arguments")
                    if args:
                        for arg in args.children:
                            if arg.type == "string":
                                mod_path = arg.text.decode("utf-8").strip("'\"")
                                local_name = mod_path.split(".")[-1]
                                imports[local_name] = mod_path
        return imports

    def _parse_php_imports(
        self, filepath: Path, tree_root, module_qn: str,
    ) -> dict[str, str]:
        """Parse PHP use declarations."""
        imports: dict[str, str] = {}
        for node in self._walk_ast(tree_root):
            if node.type == "namespace_use_declaration":
                for child in node.children:
                    if child.type == "namespace_use_clause":
                        name_text = child.text.decode("utf-8")
                        local_name = name_text.split("\\")[-1]
                        imports[local_name] = name_text.replace("\\", ".")
        return imports

    def _parse_scala_imports(
        self, filepath: Path, tree_root, module_qn: str,
    ) -> dict[str, str]:
        """Parse Scala import declarations."""
        imports: dict[str, str] = {}
        for node in self._walk_ast(tree_root):
            if node.type == "import_declaration":
                text = node.text.decode("utf-8").replace("import ", "")
                parts = text.split(".")
                if parts:
                    local_name = parts[-1].strip()
                    if local_name and local_name != "_":
                        imports[local_name] = text.strip()
        return imports

    def _parse_csharp_imports(
        self, filepath: Path, tree_root, module_qn: str,
    ) -> dict[str, str]:
        """Parse C# using directives."""
        imports: dict[str, str] = {}
        for node in self._walk_ast(tree_root):
            if node.type == "using_directive":
                for child in node.children:
                    if child.type in ("qualified_name", "identifier"):
                        full_name = child.text.decode("utf-8")
                        local_name = full_name.split(".")[-1]
                        imports[local_name] = full_name
        return imports

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    @lru_cache(maxsize=1024)
    def _resolve_python_module(self, module_name: str, filepath: Path) -> str | None:
        """Resolve Python module name to project-local qualified name."""
        parts = module_name.split(".")
        # Try to find the module file relative to project root
        candidate = self.project_root
        for part in parts:
            candidate = candidate / part
            if (candidate.with_suffix(".py")).exists():
                relative = (candidate.with_suffix(".py")).relative_to(self.project_root)
                return f"{self.project_name}.{'.'.join(relative.with_suffix('').parts)}"
            if (candidate / "__init__.py").exists():
                relative = candidate.relative_to(self.project_root)
                return f"{self.project_name}.{'.'.join(relative.parts)}"
        return None

    @lru_cache(maxsize=1024)
    def _resolve_js_module(self, source: str, filepath: Path) -> str | None:
        """Resolve JS/TS relative import to project-local qualified name."""
        if not source.startswith("."):
            return None  # External package

        base_dir = filepath.parent
        resolved = (base_dir / source).resolve()

        # Try with extensions
        for ext in (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"):
            candidate = resolved.with_suffix(ext)
            if candidate.exists():
                try:
                    relative = candidate.relative_to(self.project_root)
                    return f"{self.project_name}.{'.'.join(relative.with_suffix('').parts)}"
                except ValueError:
                    pass

        # Try index files
        if resolved.is_dir():
            for index in ("index.ts", "index.tsx", "index.js", "index.jsx"):
                candidate = resolved / index
                if candidate.exists():
                    try:
                        relative = candidate.relative_to(self.project_root)
                        return f"{self.project_name}.{'.'.join(relative.with_suffix('').parts)}"
                    except ValueError:
                        pass

        return None

    @staticmethod
    def _walk_ast(node):
        """Walk AST tree depth-first, yielding each node."""
        yield node
        for child in node.children:
            yield from ImportProcessor._walk_ast(child)
