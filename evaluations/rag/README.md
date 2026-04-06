# RAG Evaluation System

Automated evaluation system for the B-Knowledge RAG pipeline.  
Measures accuracy, F1, precision, and recall using an LLM-as-judge approach.

---

## Tổng quan

Hệ thống có **2 web UI** — QA hoàn toàn tự chủ từ đầu đến cuối, không cần biết terminal hay Docker:

| URL | Dùng để làm gì |
|-----|----------------|
| **http://localhost:1717** | Tạo và quản lý bộ câu hỏi – đáp (Easy Dataset) |
| **http://localhost:4000** | Chạy evaluation + xem kết quả trực tiếp (Eval UI) |

---

## Quick Start

### Bước 1 — Setup một lần (Developer / Operator)

```bash
# Windows (PowerShell)
.\setup.ps1

# Linux / Mac / Git Bash
./setup.sh
```

Script tự động: kiểm tra Docker, điền `.env`, build Docker image, khởi động cả hai web UI.  
Sau bước này mọi người dùng chỉ cần mở trình duyệt.

### Bước 2 — Mở Eval UI (tất cả mọi người)

```
http://localhost:4000
```

Đây là nơi làm mọi thứ sau khi setup xong.

---

## Ai làm gì

### QA — chuẩn bị dataset và tự chạy evaluation

**Chuẩn bị dataset:**

1. Mở **http://localhost:1717** (Easy Dataset)
2. Tạo project, upload tài liệu KB, sinh Q&A pairs tự động
3. Review và chỉnh sửa các cặp Q&A
4. Export → chọn format **Alpaca JSON**
5. Mở terminal, chạy lệnh convert (một lần sau mỗi lần export):
   ```bash
   python scripts/json_to_yaml.py dataset/export_alpaca.json dataset/eval_dataset.yaml
   ```

**Chạy evaluation:**

1. Mở **http://localhost:4000** (Eval UI)
2. Kiểm tra 2 ô `Readiness` đều hiện ✓ (config OK + dataset ready)
3. Bấm **▶ Run Evaluation**
4. Theo dõi log trực tiếp — không cần chờ email hay hỏi ai
5. Khi xong, report hiện ngay trong trang — gửi link hoặc download file cho Tech Lead

### Developer / Operator — setup một lần

1. Chạy `.\setup.ps1` (Windows) hoặc `./setup.sh` (Linux/Mac)
2. Điền các token vào `.env` khi được nhắc:
   - `BKNOWLEDGE_CHAT_TOKEN` — lấy từ B-Knowledge › Settings › Embed Tokens
   - `LLM_JUDGE_API_KEY` — OpenAI hoặc Anthropic API key
3. Sau đó không cần làm gì thêm — QA tự vận hành

### Tech Lead / Product Owner — đọc kết quả

- Mở **http://localhost:4000** — report render sẵn trong trang sau mỗi lần chạy
- Download `eval_summary.md` hoặc `eval_output.json` trực tiếp từ UI

---

## Configuration (.env)

Copy `.env.example` to `.env` and fill in:

```bash
# B-Knowledge instance
BKNOWLEDGE_API_URL=http://host.docker.internal:3001
BKNOWLEDGE_CHAT_TOKEN=<Settings > Embed Tokens > Chat App>
BKNOWLEDGE_SEARCH_TOKEN=<Settings > Embed Tokens > Search>

# LLM judge (used to grade answers)
LLM_JUDGE_PROVIDER=openai            # openai | anthropic
LLM_JUDGE_MODEL=gpt-4o-mini
LLM_JUDGE_API_KEY=sk-...

# Langfuse (optional — for observability)
LANGFUSE_HOST=https://cloud.langfuse.com
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
```

---

## Project Layout

```
evaluations/rag/
├── setup.ps1 / setup.sh       ← Chạy một lần để cài môi trường
├── run-eval.ps1 / run-eval.sh ← Chạy evaluation từ terminal (thay thế cho web UI)
├── Dockerfile                 ← Docker image (Node 22 + Python 3.11)
├── docker-compose.yml         ← Services: rag-evaluator, easy-dataset
├── .env.example               ← Template cấu hình
│
├── eval-ui/                   ← Web UI (http://localhost:4000)
│   ├── server.js              ← Express server — trigger run + SSE log stream
│   ├── package.json
│   └── public/index.html      ← Single-page UI
│
├── dataset/
│   ├── eval_dataset.yaml      ← Bộ Q&A do QA team tạo (từ Easy Dataset)
│   └── eval_dataset_test.yaml ← 20 câu hỏi smoke-test (luôn sẵn có)
│
├── providers/
│   └── rag_provider.py        ← Gọi B-Knowledge /api/chat/stream (SSE)
│
├── metrics/
│   ├── accuracy.py
│   ├── f1.py
│   ├── precision.py
│   └── recall.py
│
├── scripts/
│   ├── json_to_yaml.py        ← Convert Easy Dataset export → eval_dataset.yaml
│   └── generate_summary.py    ← Tạo eval_summary.md từ eval_output.json
│
└── results/                   ← Report được sinh ra (gitignored)
    ├── eval_output.json
    └── eval_summary.md
```

---

## Troubleshooting

| Vấn đề | Cách xử lý |
|--------|-----------|
| Setup script báo blocker | Làm theo hướng dẫn Problem / Fix được in ra |
| Docker Desktop chưa chạy | Mở Docker Desktop, chờ icon tray hiện "Engine running" |
| `.env` còn giá trị trống | Chạy lại setup và điền token khi được hỏi |
| Easy Dataset không mở được ở :1717 | `docker compose up -d easy-dataset` hoặc chạy lại setup |
| Eval UI không mở được ở :4000 | `cd eval-ui && npm install && node server.js` |
| B-Knowledge không kết nối được | Kiểm tra `BKNOWLEDGE_API_URL` trong `.env`; xác nhận B-Knowledge đang chạy |
| `eval_dataset.yaml` không tồn tại | QA team cần hoàn thành export + chạy `json_to_yaml.py` trước |
| Readiness check trên UI hiện ✗ | Xem tooltip để biết vấn đề cụ thể |

For detailed deployment notes, see [DEPLOYMENT.md](DEPLOYMENT.md).
