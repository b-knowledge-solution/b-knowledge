# Multi-stage Dockerfile for RAG Evaluation System
# Stage 1: Node.js for promptfoo orchestrator
FROM node:22-slim AS promptfoo-stage

WORKDIR /app

# Install promptfoo and dependencies
RUN npm install -g promptfoo

# Copy any promptfoo-specific files (will be mounted via volume)
COPY package*.json ./
RUN npm install --only=production 2>/dev/null || true

# Stage 2: Python for metrics and providers
FROM python:3.11-slim AS python-stage

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements from build context
COPY requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python scripts (will be mounted via volume)
COPY scripts/ ./scripts/
COPY providers/ ./providers/ || true
COPY metrics/ ./metrics/ || true

# Stage 3: Final image combining both
FROM python:3.11-slim

WORKDIR /app

# Install Node.js
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install promptfoo
RUN npm install -g promptfoo

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Create necessary directories
RUN mkdir -p \
    /app/dataset \
    /app/results \
    /app/scripts \
    /app/providers \
    /app/metrics \
    /app/logs

# Copy scripts and configuration
COPY scripts/ ./scripts/
COPY run_eval.sh ./
RUN chmod +x ./run_eval.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Default command
CMD ["./run_eval.sh"]
