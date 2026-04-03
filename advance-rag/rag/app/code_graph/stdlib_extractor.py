"""
Code Graph RAG - Standard Library Extractor

Recognizes standard library modules/functions across languages to reduce
false-positive CALLS edges. When a call target matches a stdlib symbol,
it can be excluded from cross-file call resolution.

Ported from codebase_rag/parsers/stdlib_extractor.py.
"""
from __future__ import annotations

from .constants import SupportedLanguage

# Per-language sets of well-known stdlib top-level modules/packages.
# These are only the top-level names; sub-modules are matched via prefix.

_PYTHON_STDLIB = frozenset({
    "os", "sys", "io", "re", "json", "math", "time", "datetime",
    "collections", "itertools", "functools", "operator", "pathlib",
    "typing", "abc", "enum", "dataclasses", "contextlib", "copy",
    "hashlib", "hmac", "secrets", "random", "string", "textwrap",
    "struct", "codecs", "unicodedata", "locale",
    "logging", "warnings", "traceback", "pdb", "inspect",
    "unittest", "pytest", "doctest",
    "subprocess", "shutil", "tempfile", "glob", "fnmatch",
    "threading", "multiprocessing", "concurrent", "asyncio",
    "socket", "http", "urllib", "email", "smtplib", "ftplib",
    "sqlite3", "csv", "configparser", "argparse", "optparse",
    "pprint", "pickle", "shelve", "marshal",
    "xml", "html",
    "builtins", "print", "len", "range", "enumerate", "zip", "map",
    "filter", "sorted", "reversed", "any", "all", "sum", "min", "max",
    "abs", "round", "pow", "divmod", "hash", "id", "type",
    "isinstance", "issubclass", "callable", "getattr", "setattr",
    "hasattr", "delattr", "vars", "dir", "repr", "str", "int",
    "float", "bool", "list", "dict", "set", "tuple", "frozenset",
    "bytes", "bytearray", "memoryview", "object", "property",
    "staticmethod", "classmethod", "super", "open", "input",
})

_JS_TS_STDLIB = frozenset({
    "console", "Math", "JSON", "Date", "Array", "Object", "String",
    "Number", "Boolean", "RegExp", "Error", "TypeError", "RangeError",
    "Map", "Set", "WeakMap", "WeakSet", "Promise", "Proxy", "Reflect",
    "Symbol", "BigInt", "ArrayBuffer", "DataView", "Float32Array",
    "Float64Array", "Int8Array", "Int16Array", "Int32Array",
    "Uint8Array", "Uint16Array", "Uint32Array",
    "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURI",
    "decodeURI", "encodeURIComponent", "decodeURIComponent",
    "setTimeout", "setInterval", "clearTimeout", "clearInterval",
    "fetch", "URL", "URLSearchParams", "Headers", "Request", "Response",
    "FormData", "Blob", "File", "FileReader",
    "require", "module", "exports", "__dirname", "__filename",
    "process", "Buffer", "global",
})

_JAVA_STDLIB = frozenset({
    "java.lang", "java.util", "java.io", "java.nio", "java.net",
    "java.math", "java.time", "java.text", "java.sql",
    "java.security", "java.crypto", "javax.servlet",
    "System", "String", "Integer", "Long", "Double", "Float",
    "Boolean", "Character", "Byte", "Short", "Math",
    "Object", "Class", "Thread", "Runnable",
    "List", "ArrayList", "LinkedList", "Map", "HashMap",
    "TreeMap", "Set", "HashSet", "TreeSet", "Queue",
    "Collections", "Arrays", "Optional", "Stream",
    "StringBuilder", "StringBuffer",
    "Exception", "RuntimeException", "IOException",
    "NullPointerException", "IllegalArgumentException",
})

_RUST_STDLIB = frozenset({
    "std", "core", "alloc", "collections", "env", "fmt", "fs",
    "io", "iter", "mem", "net", "num", "ops", "os", "path",
    "process", "ptr", "rc", "result", "slice", "str", "string",
    "sync", "thread", "time", "vec",
    "println", "eprintln", "format", "panic", "assert",
    "assert_eq", "assert_ne", "debug_assert", "todo", "unimplemented",
    "Vec", "String", "Box", "Rc", "Arc", "Mutex", "RwLock",
    "HashMap", "HashSet", "BTreeMap", "BTreeSet",
    "Option", "Result", "Ok", "Err", "Some", "None",
})

_GO_STDLIB = frozenset({
    "fmt", "os", "io", "log", "net", "http", "json",
    "strings", "strconv", "bytes", "bufio", "sort",
    "sync", "context", "time", "math", "regexp",
    "errors", "flag", "path", "filepath", "testing",
    "encoding", "crypto", "hash", "reflect", "unsafe",
    "make", "len", "cap", "append", "copy", "delete",
    "close", "panic", "recover", "print", "println",
    "new", "complex", "real", "imag",
})

_CPP_STDLIB = frozenset({
    "std", "iostream", "vector", "string", "map", "set",
    "unordered_map", "unordered_set", "list", "deque", "queue",
    "stack", "array", "tuple", "pair", "memory", "algorithm",
    "functional", "iterator", "numeric", "cmath", "cstdlib",
    "cstdio", "cstring", "cassert", "fstream", "sstream",
    "iomanip", "chrono", "thread", "mutex", "condition_variable",
    "atomic", "future", "regex", "filesystem", "optional",
    "variant", "any", "bitset", "complex", "random",
    "cout", "cerr", "cin", "endl", "printf", "scanf",
    "malloc", "free", "new", "delete",
})

_LUA_STDLIB = frozenset({
    "print", "type", "tonumber", "tostring", "error", "pcall",
    "xpcall", "select", "pairs", "ipairs", "next", "unpack",
    "rawget", "rawset", "rawequal", "rawlen", "setmetatable",
    "getmetatable", "require", "dofile", "load", "loadfile",
    "assert", "collectgarbage",
    "string", "table", "math", "io", "os", "coroutine",
    "debug", "package", "utf8",
})

_PHP_STDLIB = frozenset({
    "echo", "print", "var_dump", "print_r", "die", "exit",
    "isset", "unset", "empty", "is_null", "is_array",
    "is_string", "is_int", "is_float", "is_bool", "is_object",
    "count", "sizeof", "strlen", "strpos", "substr",
    "str_replace", "explode", "implode", "trim", "strtolower",
    "strtoupper", "sprintf", "printf", "array_map", "array_filter",
    "array_reduce", "array_push", "array_pop", "array_shift",
    "array_merge", "array_keys", "array_values", "in_array",
    "sort", "asort", "ksort", "usort", "json_encode", "json_decode",
    "file_get_contents", "file_put_contents", "fopen", "fclose",
    "date", "time", "strtotime", "header", "session_start",
    "Exception", "RuntimeException", "InvalidArgumentException",
})

_SCALA_STDLIB = frozenset({
    "scala", "Predef", "println", "print",
    "List", "Seq", "Map", "Set", "Vector", "Array",
    "Option", "Some", "None", "Either", "Left", "Right",
    "Try", "Success", "Failure", "Future",
    "String", "Int", "Long", "Double", "Float", "Boolean",
    "Unit", "Any", "AnyRef", "Nothing", "Null",
})

_CSHARP_STDLIB = frozenset({
    "System", "Console", "Math", "String", "Int32", "Int64",
    "Double", "Float", "Boolean", "Char", "Byte",
    "List", "Dictionary", "HashSet", "Queue", "Stack",
    "Array", "Tuple", "Task", "Thread", "Mutex",
    "DateTime", "TimeSpan", "Guid", "Regex",
    "File", "Directory", "Path", "Stream",
    "Exception", "ArgumentException", "InvalidOperationException",
    "Console.WriteLine", "Console.ReadLine",
})

_STDLIB_MAP: dict[SupportedLanguage, frozenset[str]] = {
    SupportedLanguage.PYTHON: _PYTHON_STDLIB,
    SupportedLanguage.JAVASCRIPT: _JS_TS_STDLIB,
    SupportedLanguage.TYPESCRIPT: _JS_TS_STDLIB,
    SupportedLanguage.JAVA: _JAVA_STDLIB,
    SupportedLanguage.RUST: _RUST_STDLIB,
    SupportedLanguage.GO: _GO_STDLIB,
    SupportedLanguage.C: _CPP_STDLIB,
    SupportedLanguage.CPP: _CPP_STDLIB,
    SupportedLanguage.LUA: _LUA_STDLIB,
    SupportedLanguage.PHP: _PHP_STDLIB,
    SupportedLanguage.SCALA: _SCALA_STDLIB,
    SupportedLanguage.CSHARP: _CSHARP_STDLIB,
}


def is_stdlib(name: str, language: SupportedLanguage) -> bool:
    """
    Check if a name belongs to the standard library of the given language.

    @param name: Function/module name (may be dotted).
    @param language: Source language.
    @returns: True if the name is a standard library symbol.
    """
    stdlib_set = _STDLIB_MAP.get(language)
    if not stdlib_set:
        return False

    # Exact match
    if name in stdlib_set:
        return True

    # Top-level prefix match (e.g., 'os.path' → 'os')
    top_level = name.split(".")[0]
    if top_level in stdlib_set:
        return True

    # C++ :: prefix (e.g., 'std::vector')
    if "::" in name:
        top_level = name.split("::")[0]
        if top_level in stdlib_set:
            return True

    return False


def get_stdlib_set(language: SupportedLanguage) -> frozenset[str]:
    """
    Get the full stdlib set for a language.

    @param language: Source language.
    @returns: Frozenset of stdlib names.
    """
    return _STDLIB_MAP.get(language, frozenset())
