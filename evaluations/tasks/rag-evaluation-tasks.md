# RAG Evaluation System — Task Breakdown (Docker-First)

> **Mục tiêu:** Xây dựng hệ thống evaluation đóng gói hoàn toàn trong Docker container
> **Tools:** Docker · promptfoo · Python · RAGAS · Langfuse · Easy Dataset
> **Giả định:** Toàn bộ pipeline chạy BÊN TRONG container, không cần cài local tools
> **Ước tính tổng:** 48–60 giờ

---

## Tổng quan các Phase (Docker-First)

| Phase | Tên | Giờ ước tính | Chạy ở đâu |
|---|---|---|---|
| 1 | Docker Setup & Configuration | 5–6h | Host + Container test |
| 2 | Dataset Creation | 14–20h | Host machine (UI) / Docker (process data) |
| 3 | Application Code | 20–22h | Inside container |
| 4 | Testing & Validation | 8–12h | Inside container |
| | **Tổng** | **48–60h** | — |

---

## Phase 1 · Docker Setup & Configuration `~5–6h`

**Mục tiêu:** Xây dựng Docker image, cấu hình container, verify kết nối tới B-Knowledge API

**Lưu ý:** Tất cả commands chạy từ folder `evaluations/rag/` trừ khi có ghi chú khác

**Giả định:** Sau Phase 1, bạn có:
- ✅ Docker image đã build
- ✅ `docker-compose.yml` sẵn sàng chạy
- ✅ `.env` cấu hình API endpoints
- ✅ Kết nối container → B-Knowledge API được test

---

- [ ] **T1.1** · Tạo embed tokens + chuẩn bị `.env` `0.5h`
  - Tạo embed tokens trong B-Knowledge UI (Settings → Embed Tokens) cho Chat App + Search App
  - Tạo `.env` từ template `.env.example`:
    ```
    BKNOWLEDGE_API_URL=http://host.docker.internal:3001  # hoặc B-Knowledge container name
    BKNOWLEDGE_CHAT_TOKEN=<embed token>
    BKNOWLEDGE_SEARCH_TOKEN=<embed token>
    LLM_JUDGE_API_KEY=<OpenAI/Anthropic key cho eval judge>
    LANGFUSE_HOST=<host>
    LANGFUSE_PUBLIC_KEY=<key>
    LANGFUSE_SECRET_KEY=<key>
    ```
  - Commit `.env.example` vào repo (không commit `.env` chứa secrets)

- [ ] **T1.2** · Viết `Dockerfile` multi-stage `2h`
  - **Stage 1 (base):** `node:22-slim` → cài global `promptfoo`
    ```dockerfile
    FROM node:22-slim AS promptfoo-base
    RUN npm install -g promptfoo
    ```
  - **Stage 2 (eval):** `python:3.11-slim` → cài Python dependencies từ `requirements.txt`
    ```dockerfile
    FROM python:3.11-slim
    COPY requirements.txt .
    RUN pip install --no-cache-dir -r requirements.txt
    ```
  - **Stage 3 (final):** Merge Node (promptfoo) + Python
    ```dockerfile
    FROM node:22-slim
    COPY --from=promptfoo-base /usr/local/lib/node_modules/promptfoo /usr/local/lib/node_modules/promptfoo
    RUN ln -s /usr/local/lib/node_modules/promptfoo/bin/promptfoo /usr/local/bin/promptfoo
    
    # Install Python
    RUN apt-get update && apt-get install -y python3.11 pip && rm -rf /var/lib/apt/lists/*
    COPY requirements.txt .
    RUN pip install --no-cache-dir -r requirements.txt
    
    # Set workdir + entrypoint
    WORKDIR /app
    COPY . .
    ENTRYPOINT ["./run_eval.sh"]
    ```
  - Tạo `.dockerignore`: `results/`, `.env`, `__pycache__`, `.git`, `node_modules`, `.pytest_cache`
  - Test syntax: `docker build --dry-run -t rag-eval .`

- [ ] **T1.3** · Viết `docker-compose.yml` `1.5h`
  - Service `rag-eval` (production):
    ```yaml
    services:
      rag-eval:
        build: .
        container_name: rag-eval
        env_file: .env
        volumes:
          - ./dataset:/app/dataset:ro        # dataset read-only
          - ./results:/app/results           # results mounted out
        networks:
          - eval
        extra_hosts:
          - "host.docker.internal:host-gateway"  # Access host's localhost
    ```
  - Service `rag-eval-shell` (for debug):
    ```yaml
      rag-eval-shell:
        extends: rag-eval
        profiles: ["debug"]
        entrypoint: /bin/bash
        stdin_open: true
        tty: true
    ```
  - Network configuration (nếu B-Knowledge cũng Docker):
    ```yaml
    networks:
      eval:
        driver: bridge
    ```

- [ ] **T1.4** · Build Docker image `1h`
  - `docker compose build rag-eval`
  - Verify output: image size khoảng 800MB–1.2GB (Node + Python)

- [ ] **T1.5** · Test kết nối API từ container `1h`
  - Chạy container: `docker compose run --rm rag-eval bash`
  - Từ trong container, test:
    ```bash
    curl http://host.docker.internal:3001/api/v1/health    # hoặc endpoint gì đó
    python -c "import httpx; requests.get('http://host.docker.internal:3001')"  # verify Python
    promptfoo --version                                      # verify promptfoo
    ```
  - Verify volumes: `ls -la /app/dataset /app/results`
  - Nếu lỗi: debug networking (thử `network_mode: host`, hoặc Docker Desktop network settings)

- [ ] **T1.6** · Viết `run_eval.sh` basic template `0.5h`
  - Script này là `ENTRYPOINT` của container
  - Template:
    ```bash
    #!/bin/bash
    set -e
    echo "🚀 Starting RAG Evaluation inside Docker..."
    
    # Verify env vars are set
    [ -z "$BKNOWLEDGE_API_URL" ] && { echo "❌ BKNOWLEDGE_API_URL not set"; exit 1; }
    
    # Run promptfoo eval
    cd /app
    promptfoo eval -c promptfooconfig.yaml --output results/results.json
    
    # Generate report (sẽ implement ở Phase 4)
    python reporting/generate_report.py
    
    echo "✅ Evaluation complete. Results in /app/results/"
    ```
  - Make executable: `chmod +x run_eval.sh`

- [ ] **T1.7** · Viết `Makefile` shortcuts cho dev `0.5h`
  - `make build` → `docker compose build rag-eval`
  - `make eval` → `docker compose run --rm rag-eval`
  - `make shell` → `docker compose run --rm -it rag-eval bash`
  - `make report` → `docker compose run --rm rag-eval python reporting/generate_report.py`
  - `make logs` → `docker compose logs -f rag-eval`

**End-of-Phase Checklist:**
- ✅ Docker image builds successfully
- ✅ Container starts and promptfoo + Python work
- ✅ `.env` configured
- ✅ Volume mounts work (dataset read, results write)
- ✅ Container can reach B-Knowledge API

---

## Phase 2 · Dataset Creation `~14–20h`

**Mục tiêu:** Chuẩn bị dataset evaluation gồm Q+A pairs đã verify, stored trong `evaluations/rag/dataset/` folder

---

- [ ] **T2.1** · Chọn input documents `2–4h`
  - Ưu tiên: Function Spec, Screen Spec (rõ ràng, dễ verify)
  - Tránh: tài liệu mơ hồ, outdated, thay đổi thường xuyên
  - **Quan trọng:** Phải là cùng docs đã index vào Knowledge Base của B-Knowledge
  - Tải về hoặc link tới từng doc, lưu vào `/dataset/raw/`

- [ ] **T2.2** · Upload docs vào Easy Dataset, gen Q+A `1.5h`
  - Upload documents vào Easy Dataset UI
  - Configure generation settings: loại câu hỏi, LLM model, quantity
  - Trigger generation → chờ LLM generate Q+A pairs

- [ ] **T2.3** · **Verify & curate dataset thủ công** `6–10h`
  - Bottleneck chính: ~5–10 phút/câu × 80–100 câu
  - Checklist mỗi Q+A pair:
    - ✅ Câu hỏi rõ ràng, không ambiguous?
    - ✅ Câu trả lời chính xác vs tài liệu?
    - ✅ Câu trả lời đủ đầy, không thiếu info?
    - ✅ Câu hỏi realistic (user thật sẽ hỏi)?
  - Xóa/sửa câu không đạt chuẩn
  - Export sau khi verify

- [ ] **T2.4** · Annotate source docs + transform format `1.5h`
  - Thêm `source_doc` field cho mỗi Q+A: map về file/section tài liệu
  - Phân loại theo category: `factual`, `process`, `comparison`, `technical`, `troubleshoot`
  - Export từ Easy Dataset UI → `eval_dataset.json` (structured format)

- [ ] **T2.5** · Convert sang promptfoo YAML format `1h`
  - Viết Python script convert: `eval_dataset.json` → `eval_dataset.yaml`
  - Output format:
    ```yaml
    - test: Question about X
      vars:
        question: "What is...?"
        ground_truth: "Answer is..."
        source_doc: "docs/readme.md#section-1"
        category: "factual"
    ```
  - Commit `.yaml` file vào repo (dùng làm input cho promptfoo)

**End-of-Phase Checklist:**
- ✅ Dataset file `/dataset/eval_dataset.yaml` ready
- ✅ 80–100 Q+A pairs verified + curated
- ✅ All questions testable (no ambiguity)
- ✅ Ground truth answers accurate per docs

---

## Phase 3 · Application Code (Development inside Docker) `~20–22h`

**Mục tiêu:** Phát triển toàn bộ application code (promptfoo config + Python metrics) sẽ chạy BÊN TRONG container

**Workflow:** Tất cả các file viết ở `./providers`, `./metrics`, `./assertors`, `./reporting` (trong `evaluations/rag/`) được mount vào container qua volumes để dev nhanh

---

### 3.1 · Promptfoo Configuration `~3h`

- [ ] **T3.1.1** · Viết `promptfooconfig.yaml` `1.5h`
  - Định nghĩa custom provider trỏ tới B-Knowledge native SSE endpoint (KHÔNG dùng OpenAI-compat)
  - Provider config:
    ```yaml
    providers:
      - id: rag-eval-provider
        config:
          module: ./providers/rag_provider.py
          method: evaluate
    ```
  - Load test cases từ `dataset/eval_dataset.yaml`
  - Assertions: built-in (`contains`, `regex`, `similarity`) + custom Python assertors
  - Thresholds cho mỗi metric (Faithfulness ≥ 0.80, etc.)

- [ ] **T3.1.2** · Define built-in assertions `1h`
  - `contains` / `regex` cho factual questions
  - `similarity` (embedding cosine) cho semantic matching
  - `llm-rubric` cho open-ended evaluation

- [ ] **T3.1.3** · Dry-run với 5 câu test `0.5h`
  - `docker compose run --rm rag-eval promptfoo eval -c promptfooconfig.yaml --maxTests 5`
  - Verify: provider connects, assertions run, output format correct

### 3.2 · Custom Python Provider (Most Complex) `~5h`

- [ ] **T3.2.1** · **`providers/rag_provider.py`** — SSE client `4–5h`
  - Gọi B-Knowledge **native SSE endpoint** (hd. API sẽ define exact endpoint)
  - Parse SSE stream: tách `delta` text events + `reference` (citation) events
  - Output: `{answer: str, citations: List[str]}`
  - Handle:
    - Streaming timeout + retry logic
    - Malformed SSE packets
    - Connection errors
  - Test với curl/postman trước → confirm endpoint + format
  - **Quan trọng:** T1.5 sẽ define endpoint format, T3.2 implement client

### 3.3 · Custom Python Metrics (Async-friendly) `~12h`

- [ ] **T3.3.1** · **`assertors/chunk_extractor.py`** `1.5h`
  - Input: `citations[]` từ provider output
  - Output: clean text chunks
  - Handle: citation format parsing, dedup, filtering

- [ ] **T3.3.2** · **`metrics/faithfulness.py`** `3h`
  - Prompt: "Does each claim in ANSWER is grounded in CHUNKS?"
  - Output: score 0–1
  - Use LLM-as-judge (call via LLM_JUDGE_API_KEY)
  - Cache results tránh re-eval same claim

- [ ] **T3.3.3** · **`metrics/context_recall.py`** `2h`
  - Prompt: "Are all important points from GROUND_TRUTH covered in CHUNKS?"
  - Output: score 0–1
  - Metric: portion of ground_truth covered by context

- [ ] **T3.3.4** · **`metrics/answer_relevancy.py`** `2h`
  - Prompt: "Is ANSWER directly answering QUESTION?"
  - Output: score 0–1
  - Use semantic similarity or LLM judge

- [ ] **T3.3.5** · **`metrics/answer_correctness.py`** `2h`
  - Compare: ANSWER vs GROUND_TRUTH
  - Output: score 0–1
  - Combine: semantic similarity + factual overlap

- [ ] **T3.3.6** · **`reporting/langfuse_push.py`** — Score API integration `1.5h`
  - Annotate Langfuse traces với eval scores
  - Match `trace_id` or `span_id` từ eval run

### 3.4 · Wire Everything Together `~2h`

- [ ] **T3.4.1** · Register custom assertors trong `promptfooconfig.yaml` `0.5h`

- [ ] **T3.4.2** · Test mỗi assertor độc lập (unit test) `0.5h`

- [ ] **T3.4.3** · Integration test: chạy all assertors trong 1 eval run `1h`

**End-of-Phase Checklist:**
- ✅ `promptfooconfig.yaml` complete + working
- ✅ All Python files implemented + unit tested
- ✅ SSE provider streams correctly
- ✅ All metrics calculate without errors
- ✅ Docker image rebuilt with new code
- ✅ `make eval` runs promptfoo inside container

---

## Phase 4 · Testing & Validation (Inside Docker) `~8–12h`

**Mục tiêu:** Chạy full evaluation pipeline, generate reports, validate results

**Working Directory:** `evaluations/rag/`

**Prerequisites:** Phase 1-3 complete, Docker image built with all code

---

### 4.1 · Full Evaluation Run `~2–3h`

- [ ] **T4.1.1** · Run promptfoo eval trên full dataset `1–2h`
  - Command: `docker compose run --rm rag-eval promptfoo eval -c promptfooconfig.yaml`
  - Monitor output: điểm số metrics từng câu, pass/fail tally
  - Output saved → `/app/results/results.json`
  - Time estimate: ~1–2 min per question × 80–100 questions = 80–200 min

- [ ] **T4.1.2** · Verify promptfoo output format `0.5–1h`
  - Check `results.json` structure: test results + scores per metric
  - Verify all assertions ran (faithfulness, context_recall, etc.)
  - Spot-check 5–10 scores manually

### 4.2 · Generate Reports `~2–3h`

- [ ] **T4.2.1** · Viết `reporting/generate_report.py` `2h`
  - Input: `results.json` từ promptfoo
  - Outputs:
    - Summary table (score per metric, % pass)
    - Per-category breakdown (factual vs process vs etc.)
    - Trend analysis (if multiple runs)
  - Export: HTML + Markdown

- [ ] **T4.2.2** · Optional: Push scores to Langfuse `1h`
  - Run `reporting/langfuse_push.py`
  - Annotate production traces với eval scores

### 4.3 · Validation & Debugging `~2–3h`

- [ ] **T4.3.1** · Manual sanity check `1h`
  - Pick 5–10 questions, manually grade answers
  - Compare your grades vs automated scores

- [ ] **T4.3.2** · Debug & iterate issues `1–2h`
  - If failures: adjust thresholds or improve prompts
  - Re-run subset to validate fixes

### 4.4 · Documentation & Reproducibility `~2–3h`

- [ ] **T4.4.1** · Write `README.md` `1h`
  - Quick-start: `cp .env.example .env && make build && make eval`
  - Usage instructions, troubleshooting guide

- [ ] **T4.4.2** · Create `ARCHITECTURE.md` `0.5h`
  - Diagram: Provider → Metrics → Report

- [ ] **T4.4.3** · Finalize `Dockerfile` + `.dockerignore` `0.5h`

- [ ] **T4.4.4** · Version lock `requirements.txt` + `.nvmrc` `0.5h`

### 4.5 · Test on Clean Machine `~1–2h`

- [ ] **T4.5.1** · Dry-run on fresh Docker install `1–2h`
  - Clone repo → `docker compose run --rm rag-eval`
  - Verify: all metrics compute, report generates, no missing deps

**End-of-Phase Checklist:**
- ✅ Full eval completed on 80–100 Q&A pairs
- ✅ HTML + Markdown reports generated
- ✅ Manual validation passed
- ✅ Reproducible on clean machine (Docker only)
- ✅ Project ready for deployment

---

## Rủi ro cần lưu ý

| Rủi ro | Task liên quan | Mức độ |
|---|---|---|
| OpenAI-compat endpoint không trả về citations → phải dùng native SSE endpoint | T3.2.1 | 🔴 Cao |
| Dataset quality thấp → toàn bộ eval vô nghĩa | T2.3 | 🔴 Cao |
| LLM judge cần API key riêng + phát sinh cost | T3.3.2–3.3.5 | 🟡 Trung bình |
| Custom metrics chậm (mỗi câu gọi LLM multiple times) → cần cache/rate limiting | T3.3.2–3.3.5 | 🟡 Trung bình |
| Docker networking: container không kết nối được B-Knowledge API | T1.5–T1.6 | 🟡 Trung bình |
| SSE stream parsing: malformed packets, timeout handling | T3.2.1 | 🟡 Trung bình |

---

## Cấu trúc thư mục đề xuất

Tất cả code sẽ được đặt trong folder `evaluations/rag/`:

```
evaluations/
├── tasks/
│   └── rag-evaluation-tasks.md        # Task breakdown (file này)
│
└── rag/                               # RAG Evaluation application
    ├── .env                           # API keys, endpoints (git-ignored)
    ├── .env.example                   # Template .env (commit vào repo)
    ├── .dockerignore                  # Exclude results/, .env, __pycache__
    ├── Dockerfile                     # Multi-stage: Node 22 + Python 3.11
    ├── docker-compose.yml             # Service rag-eval + volumes
    ├── Makefile                       # Shortcuts: make eval, make report, make shell
    ├── run_eval.sh                    # Entry point: chạy toàn bộ pipeline (ENTRYPOINT)
    ├── requirements.txt               # Python dependencies (pinned versions)
    ├── promptfooconfig.yaml           # promptfoo config (provider, tests, assertions)
    ├── README.md                      # Quick-start guide + troubleshooting
    ├── ARCHITECTURE.md                # System design + API contracts
    ├── dataset/
    │   ├── raw/                       # Docs từ Easy Dataset (chưa verify)
    │   ├── eval_dataset.json          # Verified + annotated Q&A pairs
    │   └── eval_dataset.yaml          # Converted for promptfoo (test cases)
    ├── providers/
    │   └── rag_provider.py            # Custom SSE streaming provider (T3.2.1)
    ├── assertors/
    │   └── chunk_extractor.py         # Parse citations from provider output (T3.3.1)
    ├── metrics/
    │   ├── __init__.py
    │   ├── faithfulness.py            # LLM-as-judge: answer grounded in chunks? (T3.3.2)
    │   ├── context_recall.py          # Retrieved chunks cover ground_truth? (T3.3.3)
    │   ├── answer_relevancy.py        # Answer directly answers question? (T3.3.4)
    │   └── answer_correctness.py      # Answer matches ground_truth? (T3.3.5)
    ├── reporting/
    │   ├── __init__.py
    │   ├── generate_report.py         # Metric summary + HTML/MD export (T4.2.1)
    │   └── langfuse_push.py           # Annotate traces with eval scores (T3.3.6)
    ├── results/                       # Volume-mounted output directory
    │   ├── results.json               # Raw promptfoo eval output
    │   ├── report.html                # Generated HTML report
    │   └── report.md                  # Generated Markdown report
    └── tests/
        ├── __init__.py
        └── test_metrics.py            # Unit tests for metrics (T3.4.2)
```

**Lưu ý:**
- Tất cả dev work xảy ra trong `evaluations/rag/`
- Task breakdown doc ở `evaluations/tasks/rag-evaluation-tasks.md` (tham khảo)
- Docker commands chạy từ `evaluations/rag/` folder

---

## Tóm tắt: Docker-First Workflow

Chạy từ folder `evaluations/rag/`:

```bash
cd evaluations/rag

# 1️⃣ Setup (Phase 1)
cp .env.example .env
# Edit .env with B-Knowledge API URL + API keys
docker compose build rag-eval
docker compose run --rm rag-eval bash   # Verify container runs

# 2️⃣ Prepare dataset (Phase 2)
# Upload docs to Easy Dataset UI
# Curate Q&A pairs manually
# Export to dataset/eval_dataset.yaml

# 3️⃣ Develop code (Phase 3)
# Edit promptfooconfig.yaml + Python files on host
# Files auto-mounted in container via volumes
make shell   # Enter container to test interactively
# Run: promptfoo eval -c promptfooconfig.yaml --maxTests 5

# 4️⃣ Run + Validate (Phase 4)
make eval            # Full evaluation run in container
make report          # Generate HTML + Markdown reports
# Open results/report.html in browser
# Manually verify 5-10 scores

# ✅ Done: Results in ./results/, reproducible via Docker
```

**From main repo root:**
```bash
cd evaluations/rag && make eval    # Quick syntax
```

**Or use docker directly:**
```bash
cd evaluations/rag
docker compose run --rm rag-eval promptfoo eval -c promptfooconfig.yaml
docker compose run --rm rag-eval python reporting/generate_report.py
```
