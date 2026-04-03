"""
Code Graph RAG - Log Messages

Standardized log message constants for the parser pipeline.
"""

# Structure processor
LOG_SCANNING_DIR = "Scanning directory: {}"
LOG_FOUND_PACKAGE = "Found package: {}"
LOG_FOUND_FOLDER = "Found folder: {}"

# Import processor
LOG_PARSING_IMPORTS = "Parsing imports for: {}"
LOG_RESOLVED_IMPORT = "Resolved import: {} -> {}"
LOG_UNRESOLVED_IMPORT = "Unresolved import: {}"

# Definition processor
LOG_PROCESSING_FILE = "Processing definitions in: {}"
LOG_FOUND_FUNCTION = "Found function: {}"
LOG_FOUND_CLASS = "Found class: {}"
LOG_FOUND_METHOD = "Found method: {}.{}"

# Call processor
LOG_PROCESSING_CALLS = "Processing calls in: {}"
LOG_RESOLVED_CALL = "Resolved call: {} -> {}"
LOG_UNRESOLVED_CALL = "Unresolved call: {}"

# Pipeline
LOG_PIPELINE_START = "Starting code graph extraction for: {}"
LOG_PIPELINE_COMPLETE = "Code graph extraction complete: {} nodes, {} relationships"
LOG_PIPELINE_ERROR = "Code graph extraction failed for {}: {}"
LOG_LANGUAGE_DETECTED = "Detected language: {} for file: {}"
LOG_LANGUAGE_UNSUPPORTED = "Unsupported language for file: {}"

# Memgraph
LOG_MEMGRAPH_CONNECTING = "Connecting to Memgraph at: {}"
LOG_MEMGRAPH_FLUSHING = "Flushing {} nodes and {} relationships to Memgraph"
LOG_MEMGRAPH_ERROR = "Memgraph write error: {}"
