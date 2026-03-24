"""
Code Graph RAG - Language Handlers Package

Exports the handler registry, protocol, and base handler.
"""
from .base import BaseLanguageHandler
from .protocol import LanguageHandler
from .registry import get_handler

__all__ = [
    "BaseLanguageHandler",
    "LanguageHandler",
    "get_handler",
]
