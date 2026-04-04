"""Tests for local embedding path resolution and validation helpers."""

import os
import sys
from pathlib import Path

import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

from local_embedding_utils import (
    normalize_local_embedding_path,
    resolve_sentence_transformer_path,
    validate_sentence_transformer_path,
)


class TestNormalizeLocalEmbeddingPath:
    """Tests for environment path normalization."""

    def test_strips_matching_quotes(self):
        """Verify matching outer quotes are removed from env values."""
        assert normalize_local_embedding_path('"/app/models/qwen"') == "/app/models/qwen"


class TestResolveSentenceTransformerPath:
    """Tests for local model path resolution."""

    def test_resolves_single_snapshot_directory(self, tmp_path: Path):
        """Verify Hugging Face cache repo directories resolve to the sole snapshot."""
        snapshot_dir = tmp_path / "snapshots" / "revision-1"
        snapshot_dir.mkdir(parents=True)
        (snapshot_dir / "modules.json").write_text("[]", encoding="utf-8")

        assert resolve_sentence_transformer_path(str(tmp_path)) == str(snapshot_dir)


class TestValidateSentenceTransformerPath:
    """Tests for local model directory validation."""

    def test_rejects_missing_pooling_dimension(self, tmp_path: Path):
        """Verify invalid pooling configs raise a clear validation error."""
        model_dir = tmp_path / "qwen"
        pooling_dir = model_dir / "1_Pooling"
        pooling_dir.mkdir(parents=True)
        (model_dir / "modules.json").write_text(
            '[{"type":"sentence_transformers.models.Pooling","path":"1_Pooling"}]',
            encoding="utf-8",
        )
        (pooling_dir / "config.json").write_text("{}", encoding="utf-8")

        with pytest.raises(ValueError, match="word_embedding_dimension"):
            validate_sentence_transformer_path(str(model_dir))
