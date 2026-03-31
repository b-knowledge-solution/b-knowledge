"""Agent execution package for processing agent node tasks from Redis Streams.

This package provides the consumer loop and node execution dispatch for the
agent workflow engine. The Node.js orchestrator dispatches compute-heavy node
tasks via Redis Streams (XADD), and this consumer picks them up (XREADGROUP),
executes them, and publishes results back via Redis pub/sub.
"""
