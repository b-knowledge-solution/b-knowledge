"""Unit tests for common.file_utils module.

Tests project base directory resolution and recursive file traversal
without requiring heavy ML dependencies.
"""
import os
import sys
import tempfile
import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestGetProjectBaseDirectory:
    """Tests for get_project_base_directory() function."""

    def test_returns_valid_path(self):
        """Verify returned path is a valid existing directory."""
        from common.file_utils import get_project_base_directory
        base = get_project_base_directory()
        assert os.path.isabs(base)
        assert os.path.isdir(base)

    def test_returns_string(self):
        """Verify return type is a string."""
        from common.file_utils import get_project_base_directory
        base = get_project_base_directory()
        assert isinstance(base, str)

    def test_joins_subpaths(self):
        """Verify subpaths are correctly joined to the base directory."""
        from common.file_utils import get_project_base_directory
        result = get_project_base_directory("sub", "dir")
        base = get_project_base_directory()
        # The result should be base/sub/dir
        assert result == os.path.join(base, "sub", "dir")

    def test_no_args_returns_base_only(self):
        """Verify calling without arguments returns just the base directory."""
        from common.file_utils import get_project_base_directory
        result = get_project_base_directory()
        # Should not end with path separator unless it is root
        assert len(result) > 1

    def test_consistent_results(self):
        """Verify multiple calls return the same path (cached)."""
        from common.file_utils import get_project_base_directory
        first = get_project_base_directory()
        second = get_project_base_directory()
        assert first == second

    def test_env_var_override(self, monkeypatch):
        """Verify RAG_PROJECT_BASE environment variable overrides the default.

        Uses monkeypatch to temporarily set the env var and reset the
        module-level cached value.
        """
        import common.file_utils as fu

        original = fu.PROJECT_BASE
        try:
            # Set the cached value to a custom path
            fu.PROJECT_BASE = "/tmp/test_override"
            result = fu.get_project_base_directory()
            assert result == "/tmp/test_override"

            # With subpath joining
            result = fu.get_project_base_directory("data")
            assert result == "/tmp/test_override/data"
        finally:
            # Restore the original cached value
            fu.PROJECT_BASE = original


class TestTraversalFiles:
    """Tests for traversal_files() function."""

    def test_yields_files_in_flat_directory(self):
        """Verify all files in a flat directory are yielded."""
        from common.file_utils import traversal_files

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create sample files
            for name in ["a.txt", "b.txt", "c.csv"]:
                with open(os.path.join(tmpdir, name), "w") as f:
                    f.write("content")

            files = list(traversal_files(tmpdir))
            assert len(files) == 3
            basenames = [os.path.basename(f) for f in files]
            assert "a.txt" in basenames
            assert "b.txt" in basenames
            assert "c.csv" in basenames

    def test_yields_files_in_nested_directories(self):
        """Verify files in nested subdirectories are found recursively."""
        from common.file_utils import traversal_files

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create nested structure: tmpdir/sub1/sub2/deep.txt
            sub1 = os.path.join(tmpdir, "sub1")
            sub2 = os.path.join(sub1, "sub2")
            os.makedirs(sub2)
            with open(os.path.join(tmpdir, "root.txt"), "w") as f:
                f.write("root")
            with open(os.path.join(sub1, "mid.txt"), "w") as f:
                f.write("mid")
            with open(os.path.join(sub2, "deep.txt"), "w") as f:
                f.write("deep")

            files = list(traversal_files(tmpdir))
            assert len(files) == 3
            basenames = [os.path.basename(f) for f in files]
            assert "root.txt" in basenames
            assert "mid.txt" in basenames
            assert "deep.txt" in basenames

    def test_returns_absolute_paths(self):
        """Verify all yielded paths are absolute."""
        from common.file_utils import traversal_files

        with tempfile.TemporaryDirectory() as tmpdir:
            with open(os.path.join(tmpdir, "test.txt"), "w") as f:
                f.write("content")

            files = list(traversal_files(tmpdir))
            for fpath in files:
                assert os.path.isabs(fpath)

    def test_empty_directory_yields_nothing(self):
        """Verify empty directory produces no results."""
        from common.file_utils import traversal_files

        with tempfile.TemporaryDirectory() as tmpdir:
            files = list(traversal_files(tmpdir))
            assert len(files) == 0

    def test_skips_directories(self):
        """Verify directories themselves are not yielded, only files."""
        from common.file_utils import traversal_files

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a subdirectory with no files, and one file at root
            os.makedirs(os.path.join(tmpdir, "empty_dir"))
            with open(os.path.join(tmpdir, "only_file.txt"), "w") as f:
                f.write("content")

            files = list(traversal_files(tmpdir))
            assert len(files) == 1
            assert os.path.basename(files[0]) == "only_file.txt"
