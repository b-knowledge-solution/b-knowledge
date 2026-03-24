"""
Base Provider Interface for RAG Evaluation System

Defines the abstract interface that all providers must implement.

@description Abstract base class for provider implementations
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class ProviderResponse:
    """
    Standard response format from providers.
    
    @param text: The main response text
    @param metadata: Additional metadata (tokens, latency, etc)
    @param raw: Raw response from the provider
    """
    text: str
    metadata: Optional[Dict[str, Any]] = None
    raw: Optional[Dict[str, Any]] = None


class BaseProvider(ABC):
    """
    Abstract base class for all evaluation providers.
    
    All provider implementations must inherit from this class and implement
    the required abstract methods.
    """
    
    def __init__(self, api_url: str, timeout: int = 30):
        """
        Initialize the provider.
        
        @param api_url: API endpoint URL
        @param timeout: Request timeout in seconds
        """
        self.api_url = api_url
        self.timeout = timeout
    
    @abstractmethod
    async def query(self, prompt: str, **kwargs) -> ProviderResponse:
        """
        Execute a query against the provider.
        
        @param prompt: The query prompt
        @param kwargs: Additional provider-specific arguments
        @returns: ProviderResponse with text and metadata
        """
        pass
    
    @abstractmethod
    async def health_check(self) -> bool:
        """
        Check if the provider is healthy and accessible.
        
        @returns: True if healthy, False otherwise
        """
        pass
    
    def __repr__(self) -> str:
        """String representation of provider."""
        return f"{self.__class__.__name__}(url={self.api_url})"
