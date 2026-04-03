"""
Code Graph RAG - Language Specifications

LanguageSpec + FQNSpec definitions for all 12 supported languages.
Maps each language to its AST node types, file extensions, and name resolution rules.
"""
from __future__ import annotations

from pathlib import Path

from .constants import (
    SupportedLanguage,
    PYTHON_EXTENSIONS, JS_EXTENSIONS, TS_EXTENSIONS, RUST_EXTENSIONS,
    JAVA_EXTENSIONS, C_EXTENSIONS, CPP_EXTENSIONS, LUA_EXTENSIONS,
    GO_EXTENSIONS, SCALA_EXTENSIONS, CSHARP_EXTENSIONS, PHP_EXTENSIONS,
    PACKAGE_INDICATORS,
    SPEC_PY_FUNC, SPEC_PY_CLASS, SPEC_PY_CALL, SPEC_PY_IMPORT,
    SPEC_JS_FUNC, SPEC_JS_CLASS, SPEC_JS_CALL, SPEC_JS_IMPORT,
    SPEC_TS_FUNC, SPEC_TS_CLASS, SPEC_TS_CALL, SPEC_TS_IMPORT,
    SPEC_JAVA_FUNC, SPEC_JAVA_CLASS, SPEC_JAVA_CALL, SPEC_JAVA_IMPORT,
    SPEC_C_FUNC, SPEC_C_CLASS, SPEC_C_CALL, SPEC_C_IMPORT,
    SPEC_CPP_FUNC, SPEC_CPP_CLASS, SPEC_CPP_CALL, SPEC_CPP_IMPORT,
    SPEC_RUST_FUNC, SPEC_RUST_CLASS, SPEC_RUST_CALL, SPEC_RUST_IMPORT,
    SPEC_LUA_FUNC, SPEC_LUA_CALL, SPEC_LUA_IMPORT,
    SPEC_GO_FUNC, SPEC_GO_CLASS, SPEC_GO_CALL, SPEC_GO_IMPORT,
    SPEC_SCALA_FUNC, SPEC_SCALA_CLASS, SPEC_SCALA_CALL, SPEC_SCALA_IMPORT,
    SPEC_CSHARP_FUNC, SPEC_CSHARP_CLASS, SPEC_CSHARP_CALL, SPEC_CSHARP_IMPORT,
    SPEC_PHP_FUNC, SPEC_PHP_CLASS, SPEC_PHP_CALL, SPEC_PHP_IMPORT,
    AST_NAME_FIELD, AST_DECLARATOR_FIELD,
)
from .models import FQNSpec, LanguageSpec


# =============================================================================
# Name Extraction Functions
# =============================================================================

def _python_get_name(node) -> str | None:
    """Extract name from a Python AST node."""
    name_node = node.child_by_field_name(AST_NAME_FIELD)
    return name_node.text.decode("utf-8") if name_node else None


def _js_get_name(node) -> str | None:
    """Extract name from a JS/TS AST node."""
    # Handle various JS/TS declaration patterns
    name_node = node.child_by_field_name(AST_NAME_FIELD)
    if name_node:
        return name_node.text.decode("utf-8")

    # Arrow functions assigned to variables: const foo = () => {}
    if node.type in ("arrow_function", "function_expression"):
        parent = node.parent
        if parent and parent.type == "variable_declarator":
            name_node = parent.child_by_field_name(AST_NAME_FIELD)
            if name_node:
                return name_node.text.decode("utf-8")
    return None


def _rust_get_name(node) -> str | None:
    """Extract name from a Rust AST node."""
    name_node = node.child_by_field_name(AST_NAME_FIELD)
    if name_node:
        return name_node.text.decode("utf-8")
    # impl blocks: use type name
    if node.type == "impl_item":
        type_node = node.child_by_field_name("type")
        if type_node:
            return type_node.text.decode("utf-8")
    return None


def _c_get_name(node) -> str | None:
    """Extract name from a C AST node."""
    name_node = node.child_by_field_name(AST_NAME_FIELD)
    if name_node:
        return name_node.text.decode("utf-8")
    # Function definitions: name is in the declarator
    declarator = node.child_by_field_name(AST_DECLARATOR_FIELD)
    if declarator:
        name_node = declarator.child_by_field_name(AST_NAME_FIELD)
        if not name_node:
            name_node = declarator.child_by_field_name(AST_DECLARATOR_FIELD)
            if name_node:
                inner = name_node.child_by_field_name(AST_NAME_FIELD)
                if inner:
                    return inner.text.decode("utf-8")
                return name_node.text.decode("utf-8")
        if name_node:
            return name_node.text.decode("utf-8")
    return None


def _cpp_get_name(node) -> str | None:
    """Extract name from a C++ AST node."""
    # C++ reuses C naming with namespace support
    name = _c_get_name(node)
    if name:
        return name
    # namespace_definition
    if node.type == "namespace_definition":
        name_node = node.child_by_field_name(AST_NAME_FIELD)
        if name_node:
            return name_node.text.decode("utf-8")
    return None


def _generic_get_name(node) -> str | None:
    """Generic name extraction — tries 'name' field first."""
    name_node = node.child_by_field_name(AST_NAME_FIELD)
    return name_node.text.decode("utf-8") if name_node else None


# =============================================================================
# File-to-Module Conversion Functions
# =============================================================================

def _python_file_to_module(filepath: Path, project_root: Path) -> list[str]:
    """Convert Python file path to module parts (e.g., ['rag', 'app', 'code'])."""
    relative = filepath.relative_to(project_root)
    parts = list(relative.with_suffix("").parts)
    # Remove __init__ from module path
    if parts and parts[-1] == "__init__":
        parts = parts[:-1]
    return parts


def _js_file_to_module(filepath: Path, project_root: Path) -> list[str]:
    """Convert JS/TS file path to module parts."""
    relative = filepath.relative_to(project_root)
    parts = list(relative.with_suffix("").parts)
    # Remove index from module path
    if parts and parts[-1] in ("index",):
        parts = parts[:-1]
    return parts


def _rust_file_to_module(filepath: Path, project_root: Path) -> list[str]:
    """Convert Rust file path to module parts."""
    relative = filepath.relative_to(project_root)
    parts = list(relative.with_suffix("").parts)
    # Remove mod from module path
    if parts and parts[-1] == "mod":
        parts = parts[:-1]
    # Remove src from path
    if parts and parts[0] == "src":
        parts = parts[1:]
    return parts


def _java_file_to_module(filepath: Path, project_root: Path) -> list[str]:
    """Convert Java file path to module parts."""
    relative = filepath.relative_to(project_root)
    parts = list(relative.with_suffix("").parts)
    # Skip common Java source roots
    for skip in ("src/main/java", "src/test/java", "src"):
        skip_parts = skip.split("/")
        if parts[:len(skip_parts)] == skip_parts:
            parts = parts[len(skip_parts):]
            break
    return parts


def _php_file_to_module(filepath: Path, project_root: Path) -> list[str]:
    """Convert PHP file path to module parts."""
    relative = filepath.relative_to(project_root)
    parts = list(relative.with_suffix("").parts)
    # Skip common PHP source roots
    if parts and parts[0] in ("src", "lib", "app"):
        parts = parts[1:]
    return parts


def _generic_file_to_module(filepath: Path, project_root: Path) -> list[str]:
    """Generic file-to-module conversion."""
    relative = filepath.relative_to(project_root)
    return list(relative.with_suffix("").parts)


# =============================================================================
# FQN Specs per Language
# =============================================================================

PYTHON_FQN_SPEC = FQNSpec(
    scope_node_types=("class_definition", "function_definition", "module"),
    function_node_types=SPEC_PY_FUNC,
    get_name=_python_get_name,
    file_to_module_parts=_python_file_to_module,
)

JS_FQN_SPEC = FQNSpec(
    scope_node_types=("class_declaration", "class", "function_declaration", "method_definition", "program"),
    function_node_types=SPEC_JS_FUNC,
    get_name=_js_get_name,
    file_to_module_parts=_js_file_to_module,
)

TS_FQN_SPEC = FQNSpec(
    scope_node_types=("class_declaration", "class", "interface_declaration",
                      "function_declaration", "method_definition", "program"),
    function_node_types=SPEC_TS_FUNC,
    get_name=_js_get_name,
    file_to_module_parts=_js_file_to_module,
)

RUST_FQN_SPEC = FQNSpec(
    scope_node_types=("impl_item", "struct_item", "enum_item", "trait_item",
                      "mod_item", "function_item"),
    function_node_types=SPEC_RUST_FUNC,
    get_name=_rust_get_name,
    file_to_module_parts=_rust_file_to_module,
)

JAVA_FQN_SPEC = FQNSpec(
    scope_node_types=("class_declaration", "interface_declaration",
                      "enum_declaration", "method_declaration", "program"),
    function_node_types=SPEC_JAVA_FUNC,
    get_name=_generic_get_name,
    file_to_module_parts=_java_file_to_module,
)

CPP_FQN_SPEC = FQNSpec(
    scope_node_types=("class_specifier", "struct_specifier", "namespace_definition",
                      "function_definition"),
    function_node_types=SPEC_CPP_FUNC,
    get_name=_cpp_get_name,
    file_to_module_parts=_generic_file_to_module,
)

C_FQN_SPEC = FQNSpec(
    scope_node_types=("struct_specifier", "union_specifier", "function_definition"),
    function_node_types=SPEC_C_FUNC,
    get_name=_c_get_name,
    file_to_module_parts=_generic_file_to_module,
)

LUA_FQN_SPEC = FQNSpec(
    scope_node_types=("function_declaration", "function_definition_statement"),
    function_node_types=SPEC_LUA_FUNC,
    get_name=_generic_get_name,
    file_to_module_parts=_generic_file_to_module,
)

GO_FQN_SPEC = FQNSpec(
    scope_node_types=("type_declaration", "function_declaration", "method_declaration"),
    function_node_types=SPEC_GO_FUNC,
    get_name=_generic_get_name,
    file_to_module_parts=_generic_file_to_module,
)

SCALA_FQN_SPEC = FQNSpec(
    scope_node_types=("class_definition", "object_definition", "trait_definition",
                      "function_definition"),
    function_node_types=SPEC_SCALA_FUNC,
    get_name=_generic_get_name,
    file_to_module_parts=_generic_file_to_module,
)

CSHARP_FQN_SPEC = FQNSpec(
    scope_node_types=("class_declaration", "interface_declaration", "struct_declaration",
                      "namespace_declaration", "method_declaration"),
    function_node_types=SPEC_CSHARP_FUNC,
    get_name=_generic_get_name,
    file_to_module_parts=_generic_file_to_module,
)

PHP_FQN_SPEC = FQNSpec(
    scope_node_types=("class_declaration", "interface_declaration", "trait_declaration",
                      "function_definition", "method_declaration"),
    function_node_types=SPEC_PHP_FUNC,
    get_name=_generic_get_name,
    file_to_module_parts=_php_file_to_module,
)


# =============================================================================
# FQN Spec Registry
# =============================================================================

LANGUAGE_FQN_SPECS: dict[SupportedLanguage, FQNSpec] = {
    SupportedLanguage.PYTHON: PYTHON_FQN_SPEC,
    SupportedLanguage.JAVASCRIPT: JS_FQN_SPEC,
    SupportedLanguage.TYPESCRIPT: TS_FQN_SPEC,
    SupportedLanguage.RUST: RUST_FQN_SPEC,
    SupportedLanguage.JAVA: JAVA_FQN_SPEC,
    SupportedLanguage.CPP: CPP_FQN_SPEC,
    SupportedLanguage.C: C_FQN_SPEC,
    SupportedLanguage.LUA: LUA_FQN_SPEC,
    SupportedLanguage.GO: GO_FQN_SPEC,
    SupportedLanguage.SCALA: SCALA_FQN_SPEC,
    SupportedLanguage.CSHARP: CSHARP_FQN_SPEC,
    SupportedLanguage.PHP: PHP_FQN_SPEC,
}


# =============================================================================
# Language Specs (12 languages)
# =============================================================================

LANGUAGE_SPECS: dict[SupportedLanguage, LanguageSpec] = {
    SupportedLanguage.PYTHON: LanguageSpec(
        language=SupportedLanguage.PYTHON,
        file_extensions=PYTHON_EXTENSIONS,
        function_node_types=SPEC_PY_FUNC,
        class_node_types=SPEC_PY_CLASS,
        call_node_types=SPEC_PY_CALL,
        import_node_types=SPEC_PY_IMPORT,
        module_node_types=("module",),
        package_indicators=PACKAGE_INDICATORS[SupportedLanguage.PYTHON],
    ),
    SupportedLanguage.JAVASCRIPT: LanguageSpec(
        language=SupportedLanguage.JAVASCRIPT,
        file_extensions=JS_EXTENSIONS,
        function_node_types=SPEC_JS_FUNC,
        class_node_types=SPEC_JS_CLASS,
        call_node_types=SPEC_JS_CALL,
        import_node_types=SPEC_JS_IMPORT,
        module_node_types=("program",),
        package_indicators=PACKAGE_INDICATORS[SupportedLanguage.JAVASCRIPT],
    ),
    SupportedLanguage.TYPESCRIPT: LanguageSpec(
        language=SupportedLanguage.TYPESCRIPT,
        file_extensions=TS_EXTENSIONS,
        function_node_types=SPEC_TS_FUNC,
        class_node_types=SPEC_TS_CLASS,
        call_node_types=SPEC_TS_CALL,
        import_node_types=SPEC_TS_IMPORT,
        module_node_types=("program",),
        package_indicators=PACKAGE_INDICATORS[SupportedLanguage.TYPESCRIPT],
    ),
    SupportedLanguage.RUST: LanguageSpec(
        language=SupportedLanguage.RUST,
        file_extensions=RUST_EXTENSIONS,
        function_node_types=SPEC_RUST_FUNC,
        class_node_types=SPEC_RUST_CLASS,
        call_node_types=SPEC_RUST_CALL,
        import_node_types=SPEC_RUST_IMPORT,
        package_indicators=PACKAGE_INDICATORS[SupportedLanguage.RUST],
    ),
    SupportedLanguage.JAVA: LanguageSpec(
        language=SupportedLanguage.JAVA,
        file_extensions=JAVA_EXTENSIONS,
        function_node_types=SPEC_JAVA_FUNC,
        class_node_types=SPEC_JAVA_CLASS,
        call_node_types=SPEC_JAVA_CALL,
        import_node_types=SPEC_JAVA_IMPORT,
        module_node_types=("program",),
        package_indicators=PACKAGE_INDICATORS[SupportedLanguage.JAVA],
    ),
    SupportedLanguage.C: LanguageSpec(
        language=SupportedLanguage.C,
        file_extensions=C_EXTENSIONS,
        function_node_types=SPEC_C_FUNC,
        class_node_types=SPEC_C_CLASS,
        call_node_types=SPEC_C_CALL,
        import_node_types=SPEC_C_IMPORT,
        package_indicators=PACKAGE_INDICATORS[SupportedLanguage.C],
    ),
    SupportedLanguage.CPP: LanguageSpec(
        language=SupportedLanguage.CPP,
        file_extensions=CPP_EXTENSIONS,
        function_node_types=SPEC_CPP_FUNC,
        class_node_types=SPEC_CPP_CLASS,
        call_node_types=SPEC_CPP_CALL,
        import_node_types=SPEC_CPP_IMPORT,
        package_indicators=PACKAGE_INDICATORS[SupportedLanguage.CPP],
    ),
    SupportedLanguage.LUA: LanguageSpec(
        language=SupportedLanguage.LUA,
        file_extensions=LUA_EXTENSIONS,
        function_node_types=SPEC_LUA_FUNC,
        class_node_types=(),
        call_node_types=SPEC_LUA_CALL,
        import_node_types=SPEC_LUA_IMPORT,
        package_indicators=PACKAGE_INDICATORS[SupportedLanguage.LUA],
    ),
    SupportedLanguage.GO: LanguageSpec(
        language=SupportedLanguage.GO,
        file_extensions=GO_EXTENSIONS,
        function_node_types=SPEC_GO_FUNC,
        class_node_types=SPEC_GO_CLASS,
        call_node_types=SPEC_GO_CALL,
        import_node_types=SPEC_GO_IMPORT,
        package_indicators=PACKAGE_INDICATORS[SupportedLanguage.GO],
    ),
    SupportedLanguage.SCALA: LanguageSpec(
        language=SupportedLanguage.SCALA,
        file_extensions=SCALA_EXTENSIONS,
        function_node_types=SPEC_SCALA_FUNC,
        class_node_types=SPEC_SCALA_CLASS,
        call_node_types=SPEC_SCALA_CALL,
        import_node_types=SPEC_SCALA_IMPORT,
        package_indicators=PACKAGE_INDICATORS[SupportedLanguage.SCALA],
    ),
    SupportedLanguage.CSHARP: LanguageSpec(
        language=SupportedLanguage.CSHARP,
        file_extensions=CSHARP_EXTENSIONS,
        function_node_types=SPEC_CSHARP_FUNC,
        class_node_types=SPEC_CSHARP_CLASS,
        call_node_types=SPEC_CSHARP_CALL,
        import_node_types=SPEC_CSHARP_IMPORT,
        package_indicators=PACKAGE_INDICATORS[SupportedLanguage.CSHARP],
    ),
    SupportedLanguage.PHP: LanguageSpec(
        language=SupportedLanguage.PHP,
        file_extensions=PHP_EXTENSIONS,
        function_node_types=SPEC_PHP_FUNC,
        class_node_types=SPEC_PHP_CLASS,
        call_node_types=SPEC_PHP_CALL,
        import_node_types=SPEC_PHP_IMPORT,
        package_indicators=PACKAGE_INDICATORS[SupportedLanguage.PHP],
    ),
}
