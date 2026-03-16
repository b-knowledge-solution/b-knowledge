"""Prompt template loader for the RAG prompt system.

This module provides a caching mechanism to load prompt templates from
Markdown files stored in the ``prompts/`` directory.  Each prompt is
identified by name, and the corresponding file is ``<name>.md``.
Once loaded, prompts are cached in memory so subsequent requests are
served without disk I/O.
"""

import os

# Directory containing prompt Markdown files (same directory as this module)
PROMPT_DIR = os.path.dirname(__file__)

# In-memory cache mapping prompt name -> loaded content string
_loaded_prompts = {}


def load_prompt(name: str) -> str:
    """Load a prompt template from disk, returning cached content if available.

    Prompt files are expected at ``<PROMPT_DIR>/<name>.md``.  The file
    content is stripped of leading/trailing whitespace and stored in
    ``_loaded_prompts`` for subsequent calls.

    Args:
        name: Logical name of the prompt (without ``.md`` extension).

    Returns:
        The prompt template content as a string.

    Raises:
        FileNotFoundError: If the corresponding Markdown file does not exist.
    """
    # Return from cache when available
    if name in _loaded_prompts:
        return _loaded_prompts[name]

    path = os.path.join(PROMPT_DIR, f"{name}.md")
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Prompt file '{name}.md' not found in prompts/ directory.")

    # Read, strip, cache, and return
    with open(path, "r", encoding="utf-8") as f:
        content = f.read().strip()
        _loaded_prompts[name] = content
        return content
