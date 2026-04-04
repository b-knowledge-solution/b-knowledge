"""Utilities for resolving and validating local embedding model paths."""

import json
from pathlib import Path


def normalize_local_embedding_path(path_value: str) -> str:
    """Normalize an environment-provided local embedding path.

    Args:
        path_value: Raw LOCAL_EMBEDDING_PATH value from environment config.

    Returns:
        Cleaned path string with surrounding whitespace and matching quotes removed.
    """
    normalized = path_value.strip()

    # Docker env files often include quoted values; strip a matching quote pair.
    if len(normalized) >= 2 and normalized[0] == normalized[-1] and normalized[0] in {'"', "'"}:
        normalized = normalized[1:-1].strip()

    return normalized


def resolve_sentence_transformer_path(path_value: str) -> str:
    """Resolve a usable SentenceTransformers directory from a local path.

    Supports either:
    - a direct SentenceTransformers export directory, or
    - a Hugging Face cache repo directory containing ``snapshots/<revision>``.

    Args:
        path_value: Raw LOCAL_EMBEDDING_PATH environment value.

    Returns:
        Resolved directory path to pass into ``SentenceTransformer``.
    """
    normalized = normalize_local_embedding_path(path_value)
    if not normalized:
        return ""

    model_dir = Path(normalized)
    if not model_dir.exists():
        return normalized

    # Prefer a direct SentenceTransformers directory when modules.json is present.
    if (model_dir / "modules.json").is_file():
        return str(model_dir)

    # Support Hugging Face cache repo directories by resolving the sole snapshot.
    snapshots_dir = model_dir / "snapshots"
    if snapshots_dir.is_dir():
        snapshot_candidates = [
            candidate for candidate in snapshots_dir.iterdir() if candidate.is_dir()
        ]
        if len(snapshot_candidates) == 1 and (snapshot_candidates[0] / "modules.json").is_file():
            return str(snapshot_candidates[0])

    return str(model_dir)


def validate_sentence_transformer_path(path_value: str) -> str:
    """Validate that a local path contains a usable SentenceTransformers model.

    Args:
        path_value: Raw LOCAL_EMBEDDING_PATH environment value.

    Returns:
        Resolved local model directory.

    Raises:
        FileNotFoundError: If the resolved path does not exist.
        ValueError: If required SentenceTransformers metadata is missing or invalid.
    """
    resolved_path = resolve_sentence_transformer_path(path_value)
    if not resolved_path:
        return ""

    model_dir = Path(resolved_path)
    if not model_dir.exists():
        raise FileNotFoundError(
            f"LOCAL_EMBEDDING_PATH does not exist: {resolved_path}"
        )

    modules_file = model_dir / "modules.json"
    if not modules_file.is_file():
        raise ValueError(
            "LOCAL_EMBEDDING_PATH must point to a SentenceTransformers model directory "
            f"containing modules.json. Resolved path: {resolved_path}"
        )

    modules = json.loads(modules_file.read_text(encoding="utf-8"))
    for module in modules:
        module_type = module.get("type", "")
        module_path = module.get("path", "")

        # Pooling config must define word_embedding_dimension for ST model reloads.
        if module_type == "sentence_transformers.models.Pooling":
            pooling_config = model_dir / module_path / "config.json"
            if not pooling_config.is_file():
                raise ValueError(
                    "LOCAL_EMBEDDING_PATH is missing SentenceTransformers pooling config: "
                    f"{pooling_config}"
                )

            pooling_data = json.loads(pooling_config.read_text(encoding="utf-8"))
            if "word_embedding_dimension" not in pooling_data:
                raise ValueError(
                    "LOCAL_EMBEDDING_PATH has an invalid pooling config. "
                    "Expected key 'word_embedding_dimension' in "
                    f"{pooling_config}"
                )

    return resolved_path
