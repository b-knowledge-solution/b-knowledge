# PHASE2_DATASET_PREP_GUIDE — Chuẩn bị Dataset để Evaluate

> **Loại**: Step-by-step Guide | **Đối tượng**: QA | **Phase**: 2 | **Cập nhật**: March 25, 2026

## Mục đích
Hướng dẫn QA thực hiện 4 bước để chuẩn bị dataset đánh giá RAG.  
**Input**: fixture files mẫu → **Output**: `dataset/eval_dataset.yaml` sẵn sàng cho Phase 3.

## ✅ Phase 2 Done khi...
- [ ] `dataset/fixture/sample_docs/` có 10-20 file .md thực từ B-Knowledge (không còn file mẫu)
- [ ] `dataset/fixture/reference/qa_pairs_working.csv` có 85-95 Q&A pairs đã được review
- [ ] `python scripts/csv_validator.py qa_pairs_working.csv` → **0 errors**
- [ ] `dataset/eval_dataset.yaml` tồn tại, có 80-100 records, YAML hợp lệ

## Tiên quyết
- Fixtures đã được tạo sẵn → xem [PHASE2_FIXTURE_REFERENCE.md](PHASE2_FIXTURE_REFERENCE.md)
- Easy Dataset UI tại `http://localhost:1717` đang chạy

---

## QA sẽ làm gì?

### 1️⃣ Replace Documents
**Thay thế file mẫu bằng tài liệu thực**
- Xóa files mẫu: `01-quickstart.md`, `02-api-reference.md`, v.v.
- Copy 10-20 file .md thực từ `docs\` của project vào `evaluations\rag\dataset\fixture\sample_docs\`
  ```
  # Ví dụ: copy từ thư mục gốc project
  Copy-Item docs\*.md evaluations\rag\dataset\fixture\sample_docs\
  ```

**Sample sau khi replace:**
```
dataset/fixture/sample_docs/
├── installation-guide.md
├── api-reference.md
├── configuration.md
├── troubleshooting.md
├── deployment-guide.md
└── ... (10-20 files)
```

---

### 2️⃣ Generate Q&A
**Dùng Easy Dataset để tạo Q&A từ documents**

Easy Dataset UI: Open `http://localhost:1717`
1. Click "New Project" → Name "B-Knowledge-RAG"
2. Upload 10-20 files từ `dataset/fixture/sample_docs/`
3. Click "Generate Q&A" → Set số pairs = 80-100
4. Export CSV → Save as `dataset/fixture/reference/qa_pairs_qa_generated.csv`

**Sample CSV output:**
```csv
test,question,expected_answer,source_doc,category,difficulty
"Q1: Installation","How do I install B-Knowledge?","Run npm install && npm start","installation-guide.md",process,easy
"Q2: API Auth","How do I authenticate API calls?","Use Bearer token in Authorization header","api-reference.md",technical,medium
```

---

### 3️⃣ Manual Review & Fix
**Đọc lần lượt từng Q&A pair, fix cái không ổn**

Open `dataset/fixture/reference/qa_pairs_qa_generated.csv` trong Excel:

**Cái cần fix:**
- ❌ Vague question → Make specific
- ❌ Incomplete answer → Complete it
- ❌ Wrong/bad pair → Delete it
- ❌ Typos → Fix them

**Sample Before/After:**
```
BEFORE:
Q: "What is configuration?"
A: "It's a setting"
source_doc: "configuration.md"
category: "factual"
difficulty: "easy"

AFTER:
Q: "How do I set up OpenAI API in B-Knowledge?"
A: "Set LLM_PROVIDER=openai and LLM_API_KEY in .env file"
source_doc: "configuration.md"
category: "technical"
difficulty: "medium"
```

Save as: `dataset/fixture/reference/qa_pairs_working.csv`

**How many pairs?** 
- Start: 100 pairs (auto-generated)
- After fixing: Keep 85-95 good ones
- Delete bad ones → Quality matters more than quantity

---

### 4️⃣ Validate & Convert
**Check CSV format + convert to YAML**

```powershell
# Check CSV is valid
python scripts/csv_validator.py dataset\fixture\reference\qa_pairs_working.csv

# Convert to YAML
python scripts/csv_to_yaml.py dataset\fixture\reference\qa_pairs_working.csv dataset\eval_dataset.yaml

# Xem 20 dòng đầu của output
Get-Content dataset\eval_dataset.yaml -TotalCount 20
```

**Sample output YAML:**
```yaml
- test: 'Q1: Installation'
  vars:
    question: 'How do I install B-Knowledge?'
    expected_answer: 'Run npm install && npm start'
    source_doc: 'installation-guide.md'
    category: 'process'
    difficulty: 'easy'

- test: 'Q2: API Auth'
  vars:
    question: 'How do I authenticate API calls?'
    expected_answer: 'Use Bearer token in Authorization header'
    source_doc: 'api-reference.md'
    category: 'technical'
    difficulty: 'medium'
```

---

## Summary

| Bước | Làm gì | Input | Output |
|------|--------|-------|--------|
| 1 | Replace docs | Sample .md files | 10-20 real .md files |
| 2 | Generate Q&A | 10-20 .md files | `qa_pairs_qa_generated.csv` (80-100 rows) |
| 3 | Fix Q&A | `qa_pairs_qa_generated.csv` | `qa_pairs_working.csv` (85-95 rows, polished) |
| 4 | Validate & Convert | `qa_pairs_working.csv` | `eval_dataset.yaml` ✅ |

---

## CSV Format (Required)

All CSV files must have these 6 columns:

```csv
test,question,expected_answer,source_doc,category,difficulty
```

| Column | Example | Rules |
|--------|---------|-------|
| **test** | "Q1: How to install?" | Unique identifier |
| **question** | "How do I install B-Knowledge?" | Clear question (8-20 words) |
| **expected_answer** | "Run npm install && npm start" | Complete answer (30-200 chars) |
| **source_doc** | "installation-guide.md" | Must match real filename |
| **category** | "process" | One of: factual, process, technical, troubleshoot, comparison |
| **difficulty** | "easy" | One of: easy, medium, hard |

---

## Key Points

✅ **Quality over quantity** - 85 excellent pairs > 100 mediocre pairs  
✅ **Step 3 is the hardest** - Read and approve every Q&A pair individually  
✅ **CSV must be clean** - No empty cells, valid categories/difficulty  
✅ **Save progressively** - Keep backups at each stage  
✅ **Easy Dataset is your friend** - It does 90% of the work, you just curate  

---

## Verify từng bước

| Bước | Done khi... |
|------|-------------|
| **1** Replace docs | `Get-ChildItem dataset\fixture\sample_docs\*.md` → 10-20 files, không còn `01-quickstart.md` |
| **2** Generate Q&A | File `qa_pairs_qa_generated.csv` tồn tại, có 80-100 rows |
| **3** Review Q&A | File `qa_pairs_working.csv` tồn tại, mỗi câu đã được đọc và approve |
| **4** Validate & Convert | `python scripts/csv_validator.py ... → 0 errors` + `eval_dataset.yaml` tồn tại |

---

## Tools Needed

- Excel or VS Code (edit CSV)
- Browser (Easy Dataset at http://localhost:1717)
- PowerShell/Terminal (run conversion)


