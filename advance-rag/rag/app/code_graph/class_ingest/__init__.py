"""
Code Graph RAG - Class Ingest Package

Exports ClassIngestMixin for use by the ProcessorFactory.
"""
from .mixin import ClassIngestMixin
from .method_override import process_all_method_overrides

__all__ = ["ClassIngestMixin", "process_all_method_overrides"]
