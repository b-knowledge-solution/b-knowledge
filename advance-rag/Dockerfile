FROM python:3.11-slim

WORKDIR /app

# System dependencies for ONNX, PDF parsing, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    poppler-utils \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[all]" 2>/dev/null || pip install --no-cache-dir .

# Copy source code
COPY . .

# Set advance-rag as project base for common/file_utils.py
ENV RAG_PROJECT_BASE=/app
ENV DB_TYPE=postgres
ENV PYTHONPATH=/app

EXPOSE 9380

CMD ["python", "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "9380"]
