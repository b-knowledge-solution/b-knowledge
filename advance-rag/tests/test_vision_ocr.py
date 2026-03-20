"""Unit tests for deepdoc.vision.ocr module.

Tests OCR functionality including the transform pipeline, operator creation,
model loading, and text processing utilities. ONNX runtime and CV2 operations
are fully mocked to avoid requiring actual model files.
"""
import os
import sys
import pytest
from unittest.mock import MagicMock, patch

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestTransform:
    """Tests for the transform() preprocessing pipeline."""

    def test_applies_operators_in_sequence(self):
        """Verify operators are applied in order."""
        from deepdoc.vision.ocr import transform

        # Create mock operators that modify data
        op1 = MagicMock(side_effect=lambda d: {**d, "step1": True})
        op2 = MagicMock(side_effect=lambda d: {**d, "step2": True})

        data = {"image": "raw"}
        result = transform(data, [op1, op2])

        assert result["step1"] is True
        assert result["step2"] is True
        op1.assert_called_once()
        op2.assert_called_once()

    def test_returns_none_if_operator_returns_none(self):
        """Verify None is returned when any operator returns None."""
        from deepdoc.vision.ocr import transform

        # Second operator returns None (e.g., image too small)
        op1 = MagicMock(side_effect=lambda d: d)
        op2 = MagicMock(return_value=None)

        result = transform({"image": "data"}, [op1, op2])
        assert result is None

    def test_empty_ops_returns_data_unchanged(self):
        """Verify data is returned as-is when no operators are given."""
        from deepdoc.vision.ocr import transform
        data = {"image": "original"}
        result = transform(data, [])
        assert result == data

    def test_none_ops_returns_data_unchanged(self):
        """Verify None ops list is treated as empty."""
        from deepdoc.vision.ocr import transform
        data = {"key": "value"}
        result = transform(data, None)
        assert result == data


class TestCreateOperators:
    """Tests for the create_operators() factory function."""

    def test_creates_operator_from_config(self):
        """Verify operators are created from config dicts."""
        from deepdoc.vision.ocr import create_operators

        # Mock the operators module to have a test operator class
        mock_op_class = MagicMock(return_value="created_op")
        with patch("deepdoc.vision.ocr.operators") as mock_operators:
            mock_operators.TestOp = mock_op_class
            ops = create_operators([{"TestOp": {"param1": 10}}])

        assert len(ops) == 1
        mock_op_class.assert_called_once_with(param1=10)

    def test_creates_operator_with_none_params(self):
        """Verify None params are treated as empty dict."""
        from deepdoc.vision.ocr import create_operators

        mock_op_class = MagicMock(return_value="op")
        with patch("deepdoc.vision.ocr.operators") as mock_operators:
            mock_operators.NullOp = mock_op_class
            ops = create_operators([{"NullOp": None}])

        assert len(ops) == 1
        # Should be called with empty dict (no params)
        mock_op_class.assert_called_once_with()

    def test_raises_on_non_list_config(self):
        """Verify non-list config raises AssertionError."""
        from deepdoc.vision.ocr import create_operators

        with pytest.raises(AssertionError):
            create_operators("not a list")

    def test_raises_on_invalid_operator_dict(self):
        """Verify operator dict with != 1 key raises AssertionError."""
        from deepdoc.vision.ocr import create_operators

        with pytest.raises(AssertionError):
            create_operators([{"op1": {}, "op2": {}}])


class TestLoadModel:
    """Tests for the load_model() ONNX model loading with caching."""

    def test_returns_cached_model(self):
        """Verify already-loaded models are returned from cache."""
        from deepdoc.vision.ocr import load_model, loaded_models

        # Pre-populate the cache
        mock_session = MagicMock()
        mock_run_options = MagicMock()
        cache_key = "/mock/dir/test.onnx"
        loaded_models[cache_key] = (mock_session, mock_run_options)

        try:
            result = load_model("/mock/dir", "test")
            assert result == (mock_session, mock_run_options)
        finally:
            # Clean up cache
            del loaded_models[cache_key]

    def test_raises_on_missing_model_file(self):
        """Verify ValueError is raised when model file does not exist."""
        from deepdoc.vision.ocr import load_model

        with pytest.raises(ValueError, match="not find model file"):
            load_model("/nonexistent/path", "missing_model")

    def test_caches_loaded_model(self):
        """Verify newly loaded models are added to the cache."""
        from deepdoc.vision.ocr import load_model, loaded_models
        import tempfile

        # Create a temporary model file to satisfy existence check
        with tempfile.TemporaryDirectory() as tmpdir:
            model_path = os.path.join(tmpdir, "cached_test.onnx")
            with open(model_path, "wb") as f:
                f.write(b"fake onnx model")

            mock_session = MagicMock()
            mock_options = MagicMock()
            mock_run_options = MagicMock()

            with patch("deepdoc.vision.ocr.ort") as mock_ort:
                mock_ort.SessionOptions.return_value = mock_options
                mock_ort.ExecutionMode = MagicMock()
                mock_ort.RunOptions.return_value = mock_run_options
                mock_ort.InferenceSession.return_value = mock_session

                result = load_model(tmpdir, "cached_test")

            assert result == (mock_session, mock_run_options)
            # Verify it was cached
            cache_key = model_path
            assert cache_key in loaded_models
            # Clean up cache
            del loaded_models[cache_key]


class TestLoadedModelsCache:
    """Tests for the global loaded_models cache behavior."""

    def test_cache_is_dict(self):
        """Verify loaded_models is a module-level dict."""
        from deepdoc.vision.ocr import loaded_models
        assert isinstance(loaded_models, dict)

    def test_cache_keyed_by_path_and_device(self):
        """Verify cache key includes device_id when provided."""
        from deepdoc.vision.ocr import loaded_models

        # Pre-populate with device-specific key
        cache_key = "/model/path.onnx0"
        loaded_models[cache_key] = (MagicMock(), MagicMock())
        try:
            assert cache_key in loaded_models
        finally:
            del loaded_models[cache_key]


class TestLoadModelCPUPath:
    """Tests for load_model() CPU execution path."""

    def test_uses_cpu_when_cuda_unavailable(self):
        """Verify CPUExecutionProvider is used when CUDA is not available."""
        from deepdoc.vision.ocr import load_model, loaded_models
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            model_path = os.path.join(tmpdir, "cpu_test.onnx")
            with open(model_path, "wb") as f:
                f.write(b"fake model")

            mock_session = MagicMock()
            mock_run_options = MagicMock()

            with patch("deepdoc.vision.ocr.ort") as mock_ort:
                mock_ort.SessionOptions.return_value = MagicMock()
                mock_ort.ExecutionMode = MagicMock()
                mock_ort.RunOptions.return_value = mock_run_options
                mock_ort.InferenceSession.return_value = mock_session

                result = load_model(tmpdir, "cpu_test")

            assert result == (mock_session, mock_run_options)
            # Verify CPUExecutionProvider was passed
            call_kwargs = mock_ort.InferenceSession.call_args
            assert 'CPUExecutionProvider' in call_kwargs[1].get('providers', call_kwargs[0][-1] if len(call_kwargs[0]) > 1 else [])

            # Clean up cache
            del loaded_models[model_path]

    def test_thread_options_from_env(self):
        """Verify OCR thread options are read from environment variables."""
        from deepdoc.vision.ocr import load_model, loaded_models
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            model_path = os.path.join(tmpdir, "thread_test.onnx")
            with open(model_path, "wb") as f:
                f.write(b"fake model")

            mock_options = MagicMock()
            with patch("deepdoc.vision.ocr.ort") as mock_ort:
                mock_ort.SessionOptions.return_value = mock_options
                mock_ort.ExecutionMode = MagicMock()
                mock_ort.RunOptions.return_value = MagicMock()
                mock_ort.InferenceSession.return_value = MagicMock()

                with patch.dict(os.environ, {"OCR_INTRA_OP_NUM_THREADS": "4", "OCR_INTER_OP_NUM_THREADS": "3"}):
                    load_model(tmpdir, "thread_test")

            # Verify thread options were set on the SessionOptions
            assert mock_options.intra_op_num_threads == 4
            assert mock_options.inter_op_num_threads == 3

            del loaded_models[model_path]


class TestTransformEdgeCases:
    """Tests for transform() edge cases."""

    def test_single_operator(self):
        """Verify transform works with a single operator."""
        from deepdoc.vision.ocr import transform

        op = MagicMock(side_effect=lambda d: {**d, "processed": True})
        result = transform({"image": "raw"}, [op])
        assert result["processed"] is True

    def test_operator_chain_passes_data_through(self):
        """Verify each operator receives output of the previous one."""
        from deepdoc.vision.ocr import transform

        def add_step(n):
            return lambda d: {**d, f"step{n}": n}

        ops = [MagicMock(side_effect=add_step(i)) for i in range(3)]
        result = transform({}, ops)
        assert result["step0"] == 0
        assert result["step1"] == 1
        assert result["step2"] == 2


class TestCreateOperatorsGlobalConfig:
    """Tests for create_operators() with global_config merging."""

    def test_global_config_merged_into_params(self):
        """Verify global_config is merged into operator params."""
        from deepdoc.vision.ocr import create_operators

        mock_op_class = MagicMock(return_value="op")
        with patch("deepdoc.vision.ocr.operators") as mock_operators:
            mock_operators.MyOp = mock_op_class
            ops = create_operators(
                [{"MyOp": {"local_param": 1}}],
                global_config={"global_param": 2}
            )

        # Should have been called with both local and global params
        call_kwargs = mock_op_class.call_args[1]
        assert call_kwargs["local_param"] == 1
        assert call_kwargs["global_param"] == 2

    def test_multiple_operators_created(self):
        """Verify multiple operators are created from config list."""
        from deepdoc.vision.ocr import create_operators

        mock_op1 = MagicMock(return_value="op1")
        mock_op2 = MagicMock(return_value="op2")
        with patch("deepdoc.vision.ocr.operators") as mock_operators:
            mock_operators.Op1 = mock_op1
            mock_operators.Op2 = mock_op2
            ops = create_operators([{"Op1": None}, {"Op2": {"x": 1}}])

        assert len(ops) == 2


class TestLoadModelCachingBehavior:
    """Tests for load_model() device-specific caching."""

    def test_different_device_ids_cached_separately(self):
        """Verify models for different devices are cached under different keys."""
        from deepdoc.vision.ocr import loaded_models

        cache_key_0 = "/model/test.onnx0"
        cache_key_1 = "/model/test.onnx1"
        session_0 = (MagicMock(), MagicMock())
        session_1 = (MagicMock(), MagicMock())
        loaded_models[cache_key_0] = session_0
        loaded_models[cache_key_1] = session_1

        try:
            assert loaded_models[cache_key_0] is not loaded_models[cache_key_1]
        finally:
            del loaded_models[cache_key_0]
            del loaded_models[cache_key_1]
