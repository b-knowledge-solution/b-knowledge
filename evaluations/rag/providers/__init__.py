"""
RAG Provider Module

Placeholder for custom provider implementations for RAG evaluation.
Providers are responsible for calling the B-Knowledge API and other services.

Structure:
- __init__.py: Module initialization and exports
- rag_provider.py: Main RAG provider implementation
- llm_judge.py: LLM-based judge provider (for evaluation)
- base.py: Base provider interface

@example
    from providers import RAGProvider
    provider = RAGProvider(api_url="http://localhost:3001")
    response = await provider.query("What is B-Knowledge?")
"""

from .base import BaseProvider

__all__ = ['BaseProvider']
