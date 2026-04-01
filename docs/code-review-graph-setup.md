# Code Review Graph — Developer Setup

Setup guide for [code-review-graph](https://github.com/tirth8205/code-review-graph/) in the B-Knowledge project. This tool builds a structural knowledge graph of the codebase, enabling AI assistants to review changes with minimal token usage.

## 1. Install

```bash
pip install code-review-graph          # or: pipx install code-review-graph
```

Requires Python 3.10+. For the best experience, install [uv](https://docs.astral.sh/uv/) — the MCP config will use `uvx` if available.

## 2. Configure MCP

```bash
code-review-graph install              # auto-detects all supported platforms
```

Or target a specific platform:

```bash
code-review-graph install --platform claude-code   # → .mcp.json
code-review-graph install --platform cursor        # → .cursor/mcp.json
code-review-graph install --platform windsurf      # → ~/.codeium/windsurf/mcp_config.json
code-review-graph install --platform zed           # → Zed settings.json
code-review-graph install --platform continue      # → ~/.continue/config.json
code-review-graph install --platform opencode      # → .opencode.json
code-review-graph install --platform antigravity   # → ~/.gemini/antigravity/mcp_config.json
```

Restart your editor/tool after installing.

## 3. Build the Graph

```bash
cd /path/to/b-knowledge
code-review-graph build                # initial parse (~10s for 500 files)
```

## 4. Verify

```bash
code-review-graph status               # check graph stats (nodes, edges, languages)
```

After the initial build, the graph updates automatically on file edits and git commits.

## Optional: Enhanced Features

```bash
pip install code-review-graph[embeddings]         # local vector embeddings (semantic search)
pip install code-review-graph[communities]        # community detection (igraph)
pip install code-review-graph[all]                # everything
```

## Excluding Files

A `.code-review-graph-ignore` file can be placed in the project root:

```
generated/**
*.generated.ts
vendor/**
node_modules/**
```
