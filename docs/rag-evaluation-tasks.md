# RAG Evaluation System — Task Breakdown

> **Mục tiêu:** Xây dựng hệ thống evaluation cho RAG responses của B-Knowledge
> **Tools:** Easy Dataset · promptfoo · Python · RAGAS · Langfuse
> **Ước tính tổng:** 49–59 giờ

---

## Tổng quan các Phase

| Phase | Tên | Giờ ước tính |
|---|---|---|
| 1 | Setup & Infrastructure | 4h |
| 2 | Dataset Creation | 14–20h |
| 3 | promptfoo Config | 5h |
| 4 | Python Scripts | 16–20h |
| 5 | Reports & Thresholds | 4h |
| 6 | Integration & End-to-end Testing | 6h |
| | **Tổng** | **49–59h** |

---

## Phase 1 · Setup & Infrastructure `~4h`

- [ ] **T1.1** · Cài promptfoo global, verify chạy được `0.5h`
  - `npm i -g promptfoo && promptfoo --version`

- [ ] **T1.2** · Setup Python venv, cài dependencies `1h`
  - Packages: `ragas`, `langfuse`, `httpx`, `python-dotenv`, `sseclient-py`
  - Lưu ý: resolve dependency conflicts giữa ragas và các package khác

- [ ] **T1.3** · Tạo embed token trong B-Knowledge cho Chat App + Search App `0.5h`
  - Tạo qua UI → Settings → Embed Tokens
  - Lưu token vào `.env` của eval system

- [ ] **T1.4** · Viết `.env` cho eval system `0.5h`
  - B-Knowledge API URL + embed tokens
  - LLM judge API key (tách biệt với LLM của RAG pipeline)
  - Langfuse host + public key + secret key

- [ ] **T1.5** · Test gọi B-Knowledge native SSE endpoint bằng `httpx` `1.5h`
  - Gọi trực tiếp (không qua OpenAI-compat) để xem response format
  - Xác định format của `citations[]` / reference events trong SSE stream
  - **Quan trọng:** OpenAI-compat endpoint strip citations — phải dùng native endpoint

---

## Phase 2 · Dataset Creation `~14–20h`

- [ ] **T2.1** · Chọn và collect input documents `2–4h`
  - Ưu tiên: Function Spec, Screen Spec (nội dung rõ ràng, dễ verify)
  - Tránh: tài liệu mơ hồ, outdated, hoặc thay đổi thường xuyên
  - Đây phải là **cùng tài liệu đã index vào Knowledge Base**

- [ ] **T2.2** · Upload docs vào Easy Dataset, cấu hình generation settings `1h`
  - Cấu hình loại câu hỏi muốn generate
  - Chọn LLM model để generate

- [ ] **T2.3** · Generate Q+A pairs từ Easy Dataset `0.5h`
  - Automated — chỉ cần trigger và chờ

- [ ] **T2.4** · **Verify và curate dataset thủ công** `6–10h`
  - Đây là bottleneck chính (~5–10 phút/câu × 80–100 câu)
  - Checklist cho mỗi Q+A pair:
    - [ ] Câu hỏi rõ ràng, không ambiguous?
    - [ ] Câu trả lời đúng với nội dung tài liệu?
    - [ ] Câu trả lời đầy đủ, không thiếu thông tin quan trọng?
    - [ ] Câu hỏi realistic (user thật sự sẽ hỏi vậy không)?
  - Xóa hoặc sửa các câu không đạt

- [ ] **T2.5** · Thêm `source_doc` cho mỗi Q+A pair `1h`
  - Map mỗi câu hỏi về đúng file/trang tài liệu nguồn

- [ ] **T2.6** · Export ra `eval_dataset.json` + convert sang promptfoo YAML format `1h`
  - Viết script convert 1 lần, tái sử dụng cho các lần sau

- [ ] **T2.7** · Phân loại câu hỏi theo category `0.5h`
  - `factual` — "threshold mặc định là bao nhiêu?"
  - `process` — "các bước để tạo X?"
  - `comparison` — "Search vs Chat khác nhau thế nào?"
  - `technical` — "endpoint nào để gọi API?"
  - `troubleshoot` — "khi nào dùng X thay vì Y?"

---

## Phase 3 · promptfoo Config `~5h`

- [ ] **T3.1** · Viết `promptfooconfig.yaml` với custom provider `1.5h`
  - Trỏ vào B-Knowledge **native SSE endpoint** (không dùng OpenAI-compat)
  - Lý do: OpenAI-compat endpoint bỏ qua citations, không lấy được retrieved chunks

- [ ] **T3.2** · Map eval dataset vào promptfoo test cases `1h`
  - Load từ `eval_dataset.yaml`
  - Đảm bảo `question` và `ground_truth` được pass đúng vào vars

- [ ] **T3.3** · Cấu hình built-in assertions `1h`
  - `contains` / `regex` — cho câu factual có giá trị cụ thể
  - `llm-rubric` — LLM-as-judge cho câu open-ended
  - `similarity` — embedding cosine similarity với ground truth

- [ ] **T3.4** · Định nghĩa threshold cho từng metric `0.5h`
  - Suggested starting point:
    - Faithfulness ≥ 0.80
    - Answer Relevancy ≥ 0.75
    - Context Recall ≥ 0.70
    - Context Precision ≥ 0.70
    - Answer Correctness ≥ 0.75

- [ ] **T3.5** · Chạy dry run với 3–5 câu hỏi, verify output format `1h`

---

## Phase 4 · Python Scripts `~16–20h`

- [ ] **T4.1** · **`rag_provider.py`** — Custom promptfoo provider `4–5h`
  - Gọi B-Knowledge native SSE endpoint
  - Parse SSE stream: tách `delta` text và `reference` events
  - Output 2 thứ: `answer` (string) + `citations` (list of chunks)
  - Handle timeout, retry, stream errors
  - **Task khó nhất — cần test kỹ**

- [ ] **T4.2** · **`chunk_extractor.py`** — Parse citations từ provider output `1.5h`
  - Input: raw `citations[]` từ T4.1
  - Output: list retrieved chunk texts để feed vào RAGAS metrics
  - Phụ thuộc vào format citations của B-Knowledge (xác định ở T1.5)

- [ ] **T4.3** · **`metrics/faithfulness.py`** — LLM-as-judge `2.5h`
  - Đánh giá: answer có grounded trong retrieved chunks không?
  - Dùng LLM judge để check từng claim trong answer vs chunks
  - Prompt engineering để đạt kết quả ổn định

- [ ] **T4.4** · **`metrics/context_recall.py`** `2h`
  - Đánh giá: retrieved chunks có cover được nội dung ground truth không?
  - Score cao = pipeline retrieve đúng chunks cần thiết

- [ ] **T4.5** · **`metrics/answer_relevancy.py`** `2h`
  - Đánh giá: answer có thực sự trả lời câu hỏi không?
  - Dùng embedding similarity hoặc LLM-as-judge

- [ ] **T4.6** · **`metrics/answer_correctness.py`** `2h`
  - Đánh giá: answer khớp ground truth đến mức nào?
  - Kết hợp semantic similarity + factual overlap

- [ ] **T4.7** · **`langfuse_push.py`** — Push scores lên Langfuse `2h`
  - Sau mỗi eval run, annotate Langfuse traces với eval scores
  - Cần match `trace_id` giữa eval run và production trace
  - Dùng Langfuse Score API

- [ ] **T4.8** · Wire tất cả Python assertors vào promptfoo config `1h`
  - Đăng ký custom assertors trong `promptfooconfig.yaml`
  - Test từng assertor độc lập trước khi wire vào

---

## Phase 5 · Reports & Thresholds `~4h`

- [ ] **T5.1** · Configure promptfoo HTML report output `0.5h`
  - Built-in feature, cần ít config
  - `promptfoo view` để mở dashboard

- [ ] **T5.2** · Viết `generate_report.py` — metric summary report `2h`
  - Input: `results.json` từ promptfoo output
  - Output: bảng tổng hợp score per metric, pass/fail per threshold
  - Nếu có nhiều run: hiển thị trend theo thời gian
  - Export ra HTML hoặc Markdown

- [ ] **T5.3** · Setup Langfuse dashboard để xem scores gắn trên traces `1h`
  - Tạo view trong Langfuse để filter traces theo eval scores
  - Verify scores từ T4.7 hiển thị đúng

- [ ] **T5.4** · Viết `README.md` hướng dẫn vận hành `0.5h`
  - Cách chạy eval: lệnh duy nhất
  - Cách đọc kết quả
  - Cách thêm câu hỏi mới vào dataset

---

## Phase 6 · Integration & End-to-end Testing `~6h`

- [ ] **T6.1** · Chạy full eval với toàn bộ dataset lần đầu `1h`

- [ ] **T6.2** · Debug issues `2–3h`
  - SSE stream parse errors
  - Timeout khi RAG pipeline chậm
  - Metric calculation bugs
  - LLM judge trả về format không nhất quán

- [ ] **T6.3** · Sanity check kết quả bằng tay `1h`
  - Chọn 5–10 câu, tự đánh giá rồi so với score của hệ thống
  - Verify scores có ý nghĩa, không bị inflated/deflated

- [ ] **T6.4** · Viết `run_eval.sh` — chạy toàn bộ pipeline 1 lệnh `0.5h`
  - `./run_eval.sh` → chạy eval → generate report → open dashboard

---

## Rủi ro cần lưu ý

| Rủi ro | Task liên quan | Mức độ |
|---|---|---|
| OpenAI-compat endpoint không trả về citations → phải dùng native SSE endpoint | T1.5, T4.1 | 🔴 Cao |
| Dataset quality thấp → toàn bộ eval vô nghĩa | T2.4 | 🔴 Cao |
| LLM judge cần API key riêng + phát sinh cost | T4.3–4.6 | 🟡 Trung bình |
| RAGAS scoring chậm (mỗi câu gọi LLM 2–3 lần) → cần rate limiting | T4.3–4.6 | 🟡 Trung bình |
| `trace_id` khó match giữa eval run và Langfuse production trace | T4.7 | 🟡 Trung bình |

---

## Cấu trúc thư mục đề xuất

```
rag-evaluation/
├── .env                        # API keys, endpoints
├── run_eval.sh                 # Entry point: chạy toàn bộ pipeline
├── promptfooconfig.yaml        # promptfoo config (provider, tests, assertions)
├── dataset/
│   ├── raw/                    # Output từ Easy Dataset (chưa verify)
│   ├── eval_dataset.json       # Đã verify + annotated
│   └── eval_dataset.yaml       # Converted cho promptfoo
├── providers/
│   └── rag_provider.py         # Custom promptfoo provider (T4.1)
├── assertors/
│   └── chunk_extractor.py      # Parse citations (T4.2)
├── metrics/
│   ├── faithfulness.py         # T4.3
│   ├── context_recall.py       # T4.4
│   ├── answer_relevancy.py     # T4.5
│   └── answer_correctness.py   # T4.6
├── reporting/
│   ├── generate_report.py      # T5.2
│   └── langfuse_push.py        # T4.7
└── results/
    ├── results.json            # Raw promptfoo output
    └── report.html             # Generated report
```
