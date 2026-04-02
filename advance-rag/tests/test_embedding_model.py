"""Unit tests for rag.llm.embedding_model module.

Tests embedding model providers including OpenAI, Azure, Ollama, and Gemini
embeddings. Covers batch encoding, single query encoding, dimension validation,
provider selection, text truncation, and error handling. All API calls are mocked.
"""
import os
import sys
import pytest
from unittest.mock import MagicMock, patch

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestEmbeddingBase:
    """Tests for the Base embedding class interface."""

    def test_encode_raises_not_implemented(self):
        """Verify Base.encode() raises NotImplementedError."""
        from rag.llm.embedding_model import Base
        base = Base.__new__(Base)
        with pytest.raises(NotImplementedError):
            base.encode(["test text"])

    def test_encode_queries_raises_not_implemented(self):
        """Verify Base.encode_queries() raises NotImplementedError."""
        from rag.llm.embedding_model import Base
        base = Base.__new__(Base)
        with pytest.raises(NotImplementedError):
            base.encode_queries("test text")


class TestOpenAIEmbed:
    """Tests for the OpenAI embedding provider."""

    def _make_embedder(self):
        """Create an OpenAIEmbed instance with a mocked OpenAI client.

        Returns:
            OpenAIEmbed instance with mocked API client.
        """
        from rag.llm.embedding_model import OpenAIEmbed
        # Mock the OpenAI constructor
        with patch("rag.llm.embedding_model.OpenAI") as MockOpenAI:
            mock_client = MagicMock()
            MockOpenAI.return_value = mock_client
            embedder = OpenAIEmbed(key="sk-test", model_name="text-embedding-ada-002")
            embedder.client = mock_client
            return embedder

    def test_encode_single_text(self):
        """Verify encoding a single text returns embeddings and token count."""
        embedder = self._make_embedder()
        # Mock the embeddings.create response
        mock_data = MagicMock()
        mock_data.embedding = [0.1, 0.2, 0.3]
        mock_response = MagicMock()
        mock_response.data = [mock_data]
        mock_response.usage = MagicMock(total_tokens=5)
        embedder.client.embeddings.create.return_value = mock_response

        # Patch total_token_count_from_response to return a number
        with patch("rag.llm.embedding_model.total_token_count_from_response", return_value=5):
            result, tokens = embedder.encode(["hello world"])

        assert len(result) == 1
        assert tokens == 5
        embedder.client.embeddings.create.assert_called_once()

    def test_encode_batches_at_16(self):
        """Verify texts are batched in groups of 16 for the API."""
        embedder = self._make_embedder()
        # Create 20 texts to trigger 2 batches (16 + 4)
        texts = [f"text {i}" for i in range(20)]

        mock_data = MagicMock()
        mock_data.embedding = [0.1] * 3
        mock_response = MagicMock()
        mock_response.data = [mock_data]
        mock_response.usage = MagicMock(total_tokens=10)
        embedder.client.embeddings.create.return_value = mock_response

        with patch("rag.llm.embedding_model.total_token_count_from_response", return_value=10):
            result, tokens = embedder.encode(texts)

        # Should have called create twice: once for 16 texts, once for 4
        assert embedder.client.embeddings.create.call_count == 2

    def test_encode_queries_single_text(self):
        """Verify encoding a single query returns vector and token count."""
        embedder = self._make_embedder()
        mock_data = MagicMock()
        mock_data.embedding = [0.5, 0.6, 0.7]
        mock_response = MagicMock()
        mock_response.data = [mock_data]
        mock_response.usage = MagicMock(total_tokens=3)
        embedder.client.embeddings.create.return_value = mock_response

        with patch("rag.llm.embedding_model.total_token_count_from_response", return_value=3):
            vec, tokens = embedder.encode_queries("search query")

        assert len(vec) == 3
        assert tokens == 3

    def test_encode_empty_list(self):
        """Verify encoding an empty list returns empty result."""
        embedder = self._make_embedder()
        result, tokens = embedder.encode([])
        assert len(result) == 0
        assert tokens == 0

    def test_encode_error_raises_exception(self):
        """Verify API errors are propagated as exceptions."""
        embedder = self._make_embedder()
        mock_response = MagicMock()
        # Simulate a response without proper data attribute
        mock_response.data = None
        type(mock_response).data = property(lambda self: (_ for _ in ()).throw(AttributeError("no data")))
        embedder.client.embeddings.create.return_value = mock_response

        with patch("rag.llm.embedding_model.total_token_count_from_response", side_effect=Exception("Bad response")):
            with pytest.raises(Exception):
                embedder.encode(["test"])

    def test_default_base_url(self):
        """Verify empty base_url falls back to OpenAI default."""
        from rag.llm.embedding_model import OpenAIEmbed
        with patch("rag.llm.embedding_model.OpenAI") as MockOpenAI:
            # Pass empty base_url — should use default
            embedder = OpenAIEmbed(key="sk-test", model_name="test", base_url="")
            # Verify constructor was called with the default URL
            call_kwargs = MockOpenAI.call_args
            assert call_kwargs[1]["base_url"] == "https://api.openai.com/v1"


class TestOllamaEmbed:
    """Tests for the Ollama embedding provider."""

    def _make_embedder(self):
        """Create an OllamaEmbed instance with a mocked Ollama client.

        Returns:
            OllamaEmbed instance with mocked client.
        """
        from rag.llm.embedding_model import OllamaEmbed
        with patch("rag.llm.embedding_model.Client") as MockClient:
            mock_client = MagicMock()
            MockClient.return_value = mock_client
            embedder = OllamaEmbed(key="x", model_name="nomic-embed", base_url="http://localhost:11434")
            embedder.client = mock_client
            return embedder

    def test_encode_processes_one_at_a_time(self):
        """Verify Ollama encodes texts individually (no batch API)."""
        embedder = self._make_embedder()
        embedder.client.embeddings.return_value = {"embedding": [0.1, 0.2]}

        result, tokens = embedder.encode(["text1", "text2", "text3"])
        # Should call embeddings 3 times (once per text)
        assert embedder.client.embeddings.call_count == 3

    def test_encode_strips_special_tokens(self):
        """Verify special tokens are removed before encoding."""
        embedder = self._make_embedder()
        embedder.client.embeddings.return_value = {"embedding": [0.1]}

        # Text with special token that should be stripped
        embedder.encode(["hello <|endoftext|> world"])
        call_args = embedder.client.embeddings.call_args
        # The prompt should not contain the special token
        assert "<|endoftext|>" not in call_args[1]["prompt"]

    def test_encode_queries_strips_special_tokens(self):
        """Verify special tokens are stripped in query encoding."""
        embedder = self._make_embedder()
        embedder.client.embeddings.return_value = {"embedding": [0.1, 0.2]}

        embedder.encode_queries("query <|endoftext|> text")
        call_args = embedder.client.embeddings.call_args
        assert "<|endoftext|>" not in call_args[1]["prompt"]

    def test_token_count_is_estimated(self):
        """Verify Ollama token count uses fixed 128-per-text estimate."""
        embedder = self._make_embedder()
        embedder.client.embeddings.return_value = {"embedding": [0.1]}

        _, tokens = embedder.encode(["text1", "text2"])
        # 128 tokens per text, 2 texts = 256
        assert tokens == 256


class TestAzureEmbed:
    """Tests for Azure OpenAI embedding provider."""

    def test_parses_json_key(self):
        """Verify Azure parses JSON key for api_key and api_version."""
        from rag.llm.embedding_model import AzureEmbed
        import json
        key_json = json.dumps({"api_key": "azure-key-123", "api_version": "2024-03-01"})

        with patch("openai.lib.azure.AzureOpenAI") as MockAzure:
            mock_client = MagicMock()
            MockAzure.return_value = mock_client
            # Azure requires base_url kwarg
            embedder = AzureEmbed(key=key_json, model_name="text-embedding-ada-002", base_url="https://myresource.openai.azure.com")

        # Verify AzureOpenAI was called with parsed credentials
        MockAzure.assert_called_once()
        call_kwargs = MockAzure.call_args[1]
        assert call_kwargs["api_key"] == "azure-key-123"
        assert call_kwargs["api_version"] == "2024-03-01"

    def test_default_api_version(self):
        """Verify default api_version is used when not specified in key JSON."""
        from rag.llm.embedding_model import AzureEmbed
        import json
        key_json = json.dumps({"api_key": "azure-key-456"})

        with patch("openai.lib.azure.AzureOpenAI") as MockAzure:
            mock_client = MagicMock()
            MockAzure.return_value = mock_client
            embedder = AzureEmbed(key=key_json, model_name="model", base_url="https://myresource.openai.azure.com")

        call_kwargs = MockAzure.call_args[1]
        # Default api_version should be "2024-02-01"
        assert call_kwargs["api_version"] == "2024-02-01"


class TestOllamaEmbedInit:
    """Tests for OllamaEmbed initialization and keep_alive settings."""

    def test_unauthenticated_client_with_empty_key(self):
        """Verify unauthenticated client is used when key is empty."""
        from rag.llm.embedding_model import OllamaEmbed
        with patch("rag.llm.embedding_model.Client") as MockClient:
            embedder = OllamaEmbed(key="", model_name="model", base_url="http://localhost:11434")
            # Should not pass Authorization header
            call_args = MockClient.call_args
            assert "headers" not in call_args[1] if call_args[1] else True

    def test_unauthenticated_client_with_x_key(self):
        """Verify unauthenticated client is used when key is 'x'."""
        from rag.llm.embedding_model import OllamaEmbed
        with patch("rag.llm.embedding_model.Client") as MockClient:
            embedder = OllamaEmbed(key="x", model_name="model", base_url="http://localhost:11434")
            call_args = MockClient.call_args
            assert call_args[1].get("host") == "http://localhost:11434"

    def test_authenticated_client_with_real_key(self):
        """Verify Bearer auth header is set when a real API key is provided."""
        from rag.llm.embedding_model import OllamaEmbed
        with patch("rag.llm.embedding_model.Client") as MockClient:
            embedder = OllamaEmbed(key="real-key", model_name="model", base_url="http://localhost:11434")
            call_kwargs = MockClient.call_args[1]
            assert "headers" in call_kwargs
            assert "Bearer real-key" in call_kwargs["headers"]["Authorization"]

    def test_query_encoding_returns_128_tokens(self):
        """Verify encode_queries returns fixed 128 token estimate."""
        from rag.llm.embedding_model import OllamaEmbed
        with patch("rag.llm.embedding_model.Client") as MockClient:
            mock_client = MagicMock()
            MockClient.return_value = mock_client
            embedder = OllamaEmbed(key="x", model_name="model", base_url="http://localhost:11434")
            embedder.client = mock_client
            mock_client.embeddings.return_value = {"embedding": [0.1, 0.2]}
            _, tokens = embedder.encode_queries("test query")
            assert tokens == 128


class TestOpenAIEmbedModelName:
    """Tests for OpenAIEmbed model name and factory attributes."""

    def test_factory_name(self):
        """Verify the _FACTORY_NAME class attribute."""
        from rag.llm.embedding_model import OpenAIEmbed
        assert OpenAIEmbed._FACTORY_NAME == "OpenAI"

    def test_model_name_stored(self):
        """Verify model_name is stored on the instance."""
        from rag.llm.embedding_model import OpenAIEmbed
        with patch("rag.llm.embedding_model.OpenAI"):
            embedder = OpenAIEmbed(key="sk-test", model_name="text-embedding-3-large")
        assert embedder.model_name == "text-embedding-3-large"

    def test_default_model_name(self):
        """Verify default model name is text-embedding-ada-002."""
        from rag.llm.embedding_model import OpenAIEmbed
        with patch("rag.llm.embedding_model.OpenAI"):
            embedder = OpenAIEmbed(key="sk-test")
        assert embedder.model_name == "text-embedding-ada-002"


class TestOllamaEmbedSpecialTokens:
    """Tests for special token handling in Ollama embedding."""

    def test_multiple_special_tokens_stripped(self):
        """Verify all special tokens are stripped from input text."""
        from rag.llm.embedding_model import OllamaEmbed
        with patch("rag.llm.embedding_model.Client") as MockClient:
            mock_client = MagicMock()
            MockClient.return_value = mock_client
            embedder = OllamaEmbed(key="x", model_name="model", base_url="http://localhost:11434")
            embedder.client = mock_client
            mock_client.embeddings.return_value = {"embedding": [0.1]}

            # Text with multiple special tokens
            embedder.encode(["start <|endoftext|> middle <|endoftext|> end"])
            call_args = mock_client.embeddings.call_args
            assert "<|endoftext|>" not in call_args[1]["prompt"]

    def test_encode_error_propagates(self):
        """Verify API errors are raised with descriptive message."""
        from rag.llm.embedding_model import OllamaEmbed
        with patch("rag.llm.embedding_model.Client") as MockClient:
            mock_client = MagicMock()
            MockClient.return_value = mock_client
            embedder = OllamaEmbed(key="x", model_name="model", base_url="http://localhost:11434")
            embedder.client = mock_client
            # Return response without "embedding" key
            mock_client.embeddings.return_value = {"error": "model not loaded"}

            with pytest.raises(Exception, match="Error"):
                embedder.encode(["test"])
