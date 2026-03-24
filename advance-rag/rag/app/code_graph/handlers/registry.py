"""
Code Graph RAG - Handler Registry

Maps SupportedLanguage → handler instance via cached dispatcher.
Ported from codebase_rag/parsers/handlers/registry.py.
"""
from __future__ import annotations

from functools import lru_cache

from ..constants import SupportedLanguage
from .base import BaseLanguageHandler
from .cpp import CppHandler
from .java import JavaHandler
from .js_ts import JsTsHandler
from .lua import LuaHandler
from .php import PhpHandler
from .protocol import LanguageHandler
from .python import PythonHandler
from .rust import RustHandler

_HANDLERS: dict[SupportedLanguage, type[BaseLanguageHandler]] = {
    SupportedLanguage.PYTHON: PythonHandler,
    SupportedLanguage.JAVASCRIPT: JsTsHandler,
    SupportedLanguage.TYPESCRIPT: JsTsHandler,
    SupportedLanguage.CPP: CppHandler,
    SupportedLanguage.RUST: RustHandler,
    SupportedLanguage.JAVA: JavaHandler,
    SupportedLanguage.LUA: LuaHandler,
    SupportedLanguage.PHP: PhpHandler,
}

_DEFAULT_HANDLER = BaseLanguageHandler


@lru_cache(maxsize=16)
def get_handler(language: SupportedLanguage) -> LanguageHandler:
    """
    Get the language-specific handler (cached singleton per language).

    @param language: The supported language enum value.
    @returns: A LanguageHandler implementation instance.
    """
    handler_class = _HANDLERS.get(language, _DEFAULT_HANDLER)
    return handler_class()
