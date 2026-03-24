"""
Code Graph RAG - Constants Module

AST node type constants, supported languages, node labels, relationship types,
and property keys for the code knowledge graph.

Ported from https://github.com/vitali87/code-graph-rag and adapted for b-knowledge.
"""
from enum import StrEnum


# =============================================================================
# Supported Languages
# =============================================================================

class SupportedLanguage(StrEnum):
    """Languages supported by the code graph parser."""
    PYTHON = "python"
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    RUST = "rust"
    JAVA = "java"
    C = "c"
    CPP = "cpp"
    LUA = "lua"
    GO = "go"
    SCALA = "scala"
    CSHARP = "c_sharp"
    PHP = "php"


# =============================================================================
# Graph Node Labels
# =============================================================================

class NodeLabel(StrEnum):
    """Labels for nodes in the code knowledge graph."""
    PROJECT = "Project"
    FOLDER = "Folder"
    PACKAGE = "Package"
    MODULE = "Module"
    FILE = "File"
    FUNCTION = "Function"
    METHOD = "Method"
    CLASS = "Class"
    INTERFACE = "Interface"
    ENUM = "Enum"
    TRAIT = "Trait"
    STRUCT = "Struct"
    TYPE = "Type"
    UNION = "Union"


# =============================================================================
# Graph Relationship Types
# =============================================================================

class RelationshipType(StrEnum):
    """Edge types in the code knowledge graph."""
    CONTAINS = "CONTAINS"
    CONTAINS_MODULE = "CONTAINS_MODULE"
    CONTAINS_PACKAGE = "CONTAINS_PACKAGE"
    DEFINES = "DEFINES"
    CALLS = "CALLS"
    IMPORTS = "IMPORTS"
    INHERITS = "INHERITS"
    IMPLEMENTS = "IMPLEMENTS"


# =============================================================================
# Property Keys (used on graph nodes)
# =============================================================================

KEY_QUALIFIED_NAME = "qualified_name"
KEY_NAME = "name"
KEY_PATH = "path"
KEY_RELATIVE_PATH = "relative_path"
KEY_SOURCE_CODE = "source_code"
KEY_START_LINE = "start_line"
KEY_END_LINE = "end_line"
KEY_PARAMETERS = "parameters"
KEY_RETURN_TYPE = "return_type"
KEY_LANGUAGE = "language"
KEY_KB_ID = "kb_id"


# =============================================================================
# File Extension → Language Mapping
# =============================================================================

EXTENSION_TO_LANGUAGE: dict[str, SupportedLanguage] = {
    ".py": SupportedLanguage.PYTHON,
    ".pyi": SupportedLanguage.PYTHON,
    ".js": SupportedLanguage.JAVASCRIPT,
    ".jsx": SupportedLanguage.JAVASCRIPT,
    ".mjs": SupportedLanguage.JAVASCRIPT,
    ".cjs": SupportedLanguage.JAVASCRIPT,
    ".ts": SupportedLanguage.TYPESCRIPT,
    ".tsx": SupportedLanguage.TYPESCRIPT,
    ".mts": SupportedLanguage.TYPESCRIPT,
    ".cts": SupportedLanguage.TYPESCRIPT,
    ".rs": SupportedLanguage.RUST,
    ".java": SupportedLanguage.JAVA,
    ".c": SupportedLanguage.C,
    ".h": SupportedLanguage.C,
    ".cpp": SupportedLanguage.CPP,
    ".cc": SupportedLanguage.CPP,
    ".cxx": SupportedLanguage.CPP,
    ".hpp": SupportedLanguage.CPP,
    ".hxx": SupportedLanguage.CPP,
    ".lua": SupportedLanguage.LUA,
    ".go": SupportedLanguage.GO,
    ".scala": SupportedLanguage.SCALA,
    ".sc": SupportedLanguage.SCALA,
    ".cs": SupportedLanguage.CSHARP,
    ".php": SupportedLanguage.PHP,
}

# Language-specific file extensions as tuples
PYTHON_EXTENSIONS = (".py", ".pyi")
JS_EXTENSIONS = (".js", ".jsx", ".mjs", ".cjs")
TS_EXTENSIONS = (".ts", ".tsx", ".mts", ".cts")
RUST_EXTENSIONS = (".rs",)
JAVA_EXTENSIONS = (".java",)
C_EXTENSIONS = (".c", ".h")
CPP_EXTENSIONS = (".cpp", ".cc", ".cxx", ".hpp", ".hxx")
LUA_EXTENSIONS = (".lua",)
GO_EXTENSIONS = (".go",)
SCALA_EXTENSIONS = (".scala", ".sc")
CSHARP_EXTENSIONS = (".cs",)
PHP_EXTENSIONS = (".php",)


# =============================================================================
# Package Indicators (files that indicate a package root)
# =============================================================================

PACKAGE_INDICATORS: dict[SupportedLanguage, tuple[str, ...]] = {
    SupportedLanguage.PYTHON: ("__init__.py",),
    SupportedLanguage.JAVASCRIPT: ("package.json",),
    SupportedLanguage.TYPESCRIPT: ("package.json", "tsconfig.json"),
    SupportedLanguage.RUST: ("Cargo.toml",),
    SupportedLanguage.JAVA: ("pom.xml", "build.gradle"),
    SupportedLanguage.C: ("CMakeLists.txt", "Makefile"),
    SupportedLanguage.CPP: ("CMakeLists.txt", "Makefile"),
    SupportedLanguage.LUA: ("init.lua",),
    SupportedLanguage.GO: ("go.mod",),
    SupportedLanguage.SCALA: ("build.sbt",),
    SupportedLanguage.CSHARP: (".csproj",),
    SupportedLanguage.PHP: ("composer.json",),
}


# =============================================================================
# AST Node Types per Language (Tree-sitter)
# =============================================================================

# Python AST node types
SPEC_PY_FUNC = ("function_definition",)
SPEC_PY_CLASS = ("class_definition",)
SPEC_PY_CALL = ("call",)
SPEC_PY_IMPORT = ("import_statement", "import_from_statement")
SPEC_PY_MODULE = ("module",)

# JavaScript/TypeScript AST node types
SPEC_JS_FUNC = ("function_declaration", "arrow_function", "function_expression",
                "method_definition", "generator_function_declaration")
SPEC_JS_CLASS = ("class_declaration", "class")
SPEC_JS_CALL = ("call_expression", "new_expression")
SPEC_JS_IMPORT = ("import_statement", "import_specifier")
SPEC_JS_MODULE = ("program",)

# TypeScript-specific node types
SPEC_TS_FUNC = SPEC_JS_FUNC + ("method_signature",)
SPEC_TS_CLASS = SPEC_JS_CLASS + ("interface_declaration", "type_alias_declaration",
                                  "enum_declaration")
SPEC_TS_IMPORT = SPEC_JS_IMPORT
SPEC_TS_CALL = SPEC_JS_CALL

# Java AST node types
SPEC_JAVA_FUNC = ("method_declaration", "constructor_declaration")
SPEC_JAVA_CLASS = ("class_declaration", "interface_declaration",
                   "enum_declaration", "record_declaration", "annotation_type_declaration")
SPEC_JAVA_CALL = ("method_invocation", "object_creation_expression")
SPEC_JAVA_IMPORT = ("import_declaration",)
SPEC_JAVA_MODULE = ("program",)

# C AST node types
SPEC_C_FUNC = ("function_definition",)
SPEC_C_CLASS = ("struct_specifier", "union_specifier", "enum_specifier")
SPEC_C_CALL = ("call_expression",)
SPEC_C_IMPORT = ("preproc_include",)

# C++ AST node types
SPEC_CPP_FUNC = ("function_definition", "template_declaration")
SPEC_CPP_CLASS = ("class_specifier", "struct_specifier", "union_specifier",
                  "enum_specifier", "namespace_definition")
SPEC_CPP_CALL = ("call_expression",)
SPEC_CPP_IMPORT = ("preproc_include", "using_declaration", "using_directive")

# Rust AST node types
SPEC_RUST_FUNC = ("function_item",)
SPEC_RUST_CLASS = ("struct_item", "enum_item", "trait_item", "impl_item",
                   "type_item", "union_item")
SPEC_RUST_CALL = ("call_expression", "macro_invocation")
SPEC_RUST_IMPORT = ("use_declaration",)

# Lua AST node types
SPEC_LUA_FUNC = ("function_declaration", "function_definition_statement",
                 "local_function_declaration_statement")
SPEC_LUA_CALL = ("function_call",)
SPEC_LUA_IMPORT = ("function_call",)  # require() calls

# Go AST node types
SPEC_GO_FUNC = ("function_declaration", "method_declaration")
SPEC_GO_CLASS = ("type_declaration",)
SPEC_GO_CALL = ("call_expression",)
SPEC_GO_IMPORT = ("import_declaration",)

# Scala AST node types
SPEC_SCALA_FUNC = ("function_definition", "val_definition")
SPEC_SCALA_CLASS = ("class_definition", "object_definition",
                    "trait_definition", "enum_definition")
SPEC_SCALA_CALL = ("call_expression",)
SPEC_SCALA_IMPORT = ("import_declaration",)

# C# AST node types
SPEC_CSHARP_FUNC = ("method_declaration", "constructor_declaration",
                    "local_function_statement")
SPEC_CSHARP_CLASS = ("class_declaration", "interface_declaration",
                     "struct_declaration", "enum_declaration",
                     "record_declaration", "namespace_declaration")
SPEC_CSHARP_CALL = ("invocation_expression", "object_creation_expression")
SPEC_CSHARP_IMPORT = ("using_directive",)

# PHP AST node types
SPEC_PHP_FUNC = ("function_definition", "method_declaration")
SPEC_PHP_CLASS = ("class_declaration", "interface_declaration",
                  "trait_declaration", "enum_declaration")
SPEC_PHP_CALL = ("function_call_expression", "member_call_expression",
                 "scoped_call_expression")
SPEC_PHP_IMPORT = ("namespace_use_declaration",)


# =============================================================================
# Qualified Name Separators per Language
# =============================================================================

QN_SEPARATOR: dict[SupportedLanguage, str] = {
    SupportedLanguage.PYTHON: ".",
    SupportedLanguage.JAVASCRIPT: ".",
    SupportedLanguage.TYPESCRIPT: ".",
    SupportedLanguage.RUST: "::",
    SupportedLanguage.JAVA: ".",
    SupportedLanguage.C: "::",
    SupportedLanguage.CPP: "::",
    SupportedLanguage.LUA: ".",
    SupportedLanguage.GO: ".",
    SupportedLanguage.SCALA: ".",
    SupportedLanguage.CSHARP: ".",
    SupportedLanguage.PHP: "\\",
}


# =============================================================================
# AST Field Names for Name Extraction
# =============================================================================

AST_NAME_FIELD = "name"
AST_BODY_FIELD = "body"
AST_PARAMETERS_FIELD = "parameters"
AST_RETURN_TYPE_FIELD = "return_type"
AST_SUPERCLASSES_FIELD = "superclasses"
AST_VALUE_FIELD = "value"
AST_TYPE_FIELD = "type"
AST_FUNCTION_FIELD = "function"
AST_ARGUMENTS_FIELD = "arguments"
AST_OBJECT_FIELD = "object"
AST_ATTRIBUTE_FIELD = "attribute"
AST_LEFT_FIELD = "left"
AST_RIGHT_FIELD = "right"
AST_DECLARATOR_FIELD = "declarator"
AST_PATH_FIELD = "path"
AST_SOURCE_FIELD = "source"
AST_MODULE_FIELD = "module_name"


# =============================================================================
# Index File Names (denote module root in JS/TS, Lua)
# =============================================================================

INDEX_FILE_NAMES = ("index.js", "index.ts", "index.jsx", "index.tsx",
                    "index.mjs", "index.cjs", "init.lua")


# =============================================================================
# Anonymous Function Name Prefixes
# =============================================================================

ANON_FUNC_PREFIX = "<anonymous>"
LAMBDA_PREFIX = "<lambda>"


# =============================================================================
# Cypher Query Templates
# =============================================================================

CYPHER_CALLERS = """
MATCH (caller {{kb_id: $kb_id}})-[:CALLS]->(target {{kb_id: $kb_id}})
WHERE target.name = $name OR target.qualified_name ENDS WITH $dot_name
RETURN caller.qualified_name AS caller, caller.path AS file,
       target.qualified_name AS target
"""

CYPHER_CALLEES = """
MATCH (source {{kb_id: $kb_id}})-[:CALLS]->(callee {{kb_id: $kb_id}})
WHERE source.name = $name OR source.qualified_name ENDS WITH $dot_name
RETURN callee.qualified_name AS callee, callee.path AS file,
       source.qualified_name AS source
"""

CYPHER_HIERARCHY = """
MATCH path = (child {{kb_id: $kb_id}})-[:INHERITS*1..5]->(parent {{kb_id: $kb_id}})
WHERE child.name = $name OR parent.name = $name
RETURN [n IN nodes(path) | {{name: n.name, qualified_name: n.qualified_name,
       labels: labels(n)}}] AS chain
"""

CYPHER_SNIPPET = """
MATCH (n {{kb_id: $kb_id}})
WHERE (n:Function OR n:Method) AND
      (n.name = $name OR n.qualified_name ENDS WITH $dot_name)
RETURN n.qualified_name AS name, n.source_code AS code,
       n.path AS file, n.start_line AS start_line, n.end_line AS end_line
"""

CYPHER_STATS_NODES = """
MATCH (n {kb_id: $kb_id})
RETURN labels(n) AS label, count(n) AS count
"""

CYPHER_STATS_RELS = """
MATCH (n {kb_id: $kb_id})-[r]->(m {kb_id: $kb_id})
RETURN type(r) AS type, count(r) AS count
"""

CYPHER_FULL_GRAPH = """
MATCH (n {kb_id: $kb_id})
OPTIONAL MATCH (n)-[r]->(m {kb_id: $kb_id})
RETURN id(n) AS id, labels(n) AS labels, properties(n) AS props,
       id(m) AS target_id, type(r) AS rel_type
LIMIT $limit
"""


def detect_language(filename: str) -> SupportedLanguage | None:
    """
    Detect programming language from file extension.

    @param filename: Source file name or path.
    @returns: SupportedLanguage enum value or None if unsupported.
    """
    import os
    ext = os.path.splitext(filename)[1].lower()
    return EXTENSION_TO_LANGUAGE.get(ext)
