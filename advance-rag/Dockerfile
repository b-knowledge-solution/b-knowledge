FROM python:3.11-slim

WORKDIR /app

# System dependencies for ONNX, PDF parsing, tika (requires JRE), etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    poppler-utils \
    tesseract-ocr \
    default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-downloaded deepdoc models from ragflow_deps image
# Models are stored under /huggingface.co/InfiniFlow/ in the deps image
RUN mkdir -p /app/rag/res/deepdoc
RUN --mount=type=bind,from=infiniflow/ragflow_deps:latest,source=/huggingface.co,target=/huggingface.co \
    tar --exclude='.*' -cf - \
        /huggingface.co/InfiniFlow/text_concat_xgb_v1.0 \
        /huggingface.co/InfiniFlow/deepdoc \
        | tar -xf - --strip-components=3 -C /app/rag/res/deepdoc

# Copy NLTK data, tika JAR, and tiktoken encoding from ragflow_deps image
# tika JAR enables offline .doc parsing without downloading from Apache at runtime
# tiktoken encoding file is stored with its hash as filename for cl100k_base
RUN --mount=type=bind,from=infiniflow/ragflow_deps:latest,source=/,target=/deps \
    cp -r /deps/nltk_data /root/ && \
    cp /deps/tika-server-standard-3.2.3.jar /deps/tika-server-standard-3.2.3.jar.md5 /app/ && \
    cp /deps/cl100k_base.tiktoken /app/9b5ad71b2ce5302211f9c61530b329a4922fc6a4

# Point tika-python to the local JAR so it never fetches from the internet
ENV TIKA_SERVER_JAR="file:///app/tika-server-standard-3.2.3.jar"

# Set tiktoken cache to project base so it finds the pre-downloaded encoding file
ENV TIKTOKEN_CACHE_DIR=/app

# Install PyTorch CPU-only build FIRST (per D-03)
# Using separate index to avoid pulling CUDA wheels (~2.5GB vs ~250MB)
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu --no-cache-dir

# Install sentence-transformers for local embedding support
RUN pip install sentence-transformers --no-cache-dir

# Install Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[all]" 2>/dev/null || pip install --no-cache-dir .

# Copy source code
COPY . .

# Normalize Windows line endings before marking the script executable.
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Set advance-rag as project base for common/file_utils.py
ENV RAG_PROJECT_BASE=/app
ENV DB_TYPE=postgres
ENV PYTHONPATH=/app

# WORKER_MODE controls which worker process is started by entrypoint.sh:
#   task-executor (default) | connector-sync | embedding | web-crawl
ENV WORKER_MODE=task-executor

ENTRYPOINT ["/app/entrypoint.sh"]
