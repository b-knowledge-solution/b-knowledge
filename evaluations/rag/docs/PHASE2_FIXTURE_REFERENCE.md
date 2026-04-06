# PHASE2_FIXTURE_REFERENCE — Dataset Fixtures

> **Loại**: Reference | **Đối tượng**: QA / Dev | **Phase**: 2 | **Cập nhật**: March 25, 2026

## Mục đích
Mô tả các fixture files đã được tạo sẵn cho Phase 2. QA dùng tài liệu này để hiểu **cấu trúc dataset** trước khi thay thế bằng dữ liệu thực.

## ✅ Fixtures Ready-to-use khi...
- [x] `dataset/fixture/sample_docs/` có 6 file .md mẫu
- [x] `dataset/fixture/reference/qa_pairs_fixture.csv` có 30 Q&A pairs
- [x] `scripts/csv_validator.py` validate CSV không có lỗi

## Bước tiếp theo (Phase 2 bắt đầu)
→ Xem hướng dẫn chi tiết tại: [PHASE2_DATASET_PREP_GUIDE.md](PHASE2_DATASET_PREP_GUIDE.md)

---

**Created**: March 25, 2026  
**Status**: ✅ Ready for QA  
**Total Files**: 9 (6 sample docs + CSV + 2 README)

## 📂 Structure Created

```
evaluations/rag/
├── dataset/
│   └── fixture/
│       ├── README.md                         (4.9 KB) - Fixture guide
│       ├── sample_docs/
│       │   ├── 01-quickstart.md              (1.2 KB) - Installation guide
│       │   ├── 02-api-reference.md           (1.8 KB) - API documentation
│       │   ├── 03-troubleshooting.md         (2.3 KB) - Problem solving
│       │   ├── 04-configuration.md           (2.6 KB) - Config reference
│       │   ├── 05-architecture.md            (5.7 KB) - System design
│       │   └── 06-security.md                (2.8 KB) - Security guide
│       └── reference/
│           └── qa_pairs_fixture.csv          (5.5 KB) - 30 Q&A pairs
│
└── PHASE2_FIXTURE_SETUP.md                   - Complete workflow guide
```

## 📋 Files Created

### Sample Documents (6 files, 19.6 KB total)
| Filename | Size | Content | Q&A Pairs |
|----------|------|---------|-----------|
| 01-quickstart.md | 1.2 KB | Installation, setup, troubleshooting | 6 |
| 02-api-reference.md | 1.8 KB | API endpoints, auth, rate limits | 9 |
| 03-troubleshooting.md | 2.3 KB | Common issues and solutions | 6 |
| 04-configuration.md | 2.6 KB | Environment variables and config | 5 |
| 05-architecture.md | 5.7 KB | System design and components | 2 |
| 06-security.md | 2.8 KB | Authentication and compliance | (reserved) |
| **TOTAL** | **19.6 KB** | **Real-world documentation examples** | **30** |

### CSV Dataset
- **File**: `dataset/fixture/reference/qa_pairs_fixture.csv`
- **Size**: 5.5 KB
- **Records**: 30 Q&A pairs + 1 header row = 31 rows
- **Columns**: 6 required fields
  - `test` - Unique identifier
  - `question` - The question
  - `expected_answer` - Ideal answer
  - `source_doc` - Reference document
  - `category` - factual|process|technical|troubleshoot|comparison
  - `difficulty` - easy|medium|hard

### Documentation Files
| File | Purpose |
|------|---------|
| dataset/fixture/README.md | Explains fixture structure and usage |
| PHASE2_FIXTURE_SETUP.md | Complete Phase 2 testing workflow |

## 🔄 Workflow for QA

### Phase 2 begins when QA:
1. **Replaces sample documents** with real B-Knowledge documentation
   ```bash
   rm dataset/fixture/sample_docs/*.md
   # Copy actual .md files from docs/ and backend/
   ```

2. **Expands Q&A dataset** from 30 to 80-100 pairs
   ```bash
   vi dataset/fixture/reference/qa_pairs_fixture.csv
   # Add 50-70 more Q&A pairs extracted from real docs
   ```

3. **Curates and validates** each pair
   - Ensure question clarity
   - Verify answers match documentation
   - Check metadata (category, difficulty)

4. **Converts to YAML** for evaluation
   ```bash
   python scripts/csv_to_yaml.py \
     dataset/fixture/reference/qa_pairs_fixture.csv \
     dataset/eval_dataset.yaml
   ```

5. **Tests the pipeline**
   ```bash
   docker-compose up -d
   docker compose run --rm rag-eval bash run_eval.sh
   ```

## 🎯 Key Features of This Setup

### ✅ Clean Separation
- **Dev Input**: Fixture files (sample_docs + CSV)
- **QA Workflow**: Modify fixtures + expand dataset
- **Pipeline**: Automated conversion CSV→YAML→Evaluation

### ✅ Reproducible Flow
```
Raw CSV (30 pairs)
    ↓ [Make changes safe in fixtures]
    ↓ [Expand to 80-100 pairs]
    ↓ [CSV validation OK?]
    ↓ [Convert to YAML]
    ↓ [Run evaluation]
    ↓ [Generate report]
```

### ✅ Makefile Targets Added
```bash
make fixture-verify   # Check fixture status
make fixture-convert  # CSV → YAML conversion
make eval-fixture    # Test with fixtures
make fixture-clean   # Cleanup generated files
```

## 📊 CSV Q&A Distribution

By Category:
- factual: 8 pairs (27%)
- process: 7 pairs (23%)
- technical: 12 pairs (40%)
- troubleshoot: 3 pairs (10%)

By Difficulty:
- easy: 10 pairs (33%)
- medium: 13 pairs (43%)
- hard: 7 pairs (23%)

## ✅ Validation Checklist

Before Phase 2 QA begins:
- [x] All 6 sample documents created ✅
- [x] CSV has 30 Q&A pairs ✅
- [x] All required columns present ✅
- [x] Fixture README created ✅
- [x] PHASE2_FIXTURE_SETUP.md created ✅
- [x] Makefile targets added ✅
- [x] PROJECT_TRACKING.md updated ✅

## 🚀 Next Steps

1. **QA Review** (Today)
   - Read PHASE2_FIXTURE_SETUP.md
   - Understand the fixture workflow
   - Verify structure with: `make fixture-verify`

2. **QA Execution** (Phase 2)
   - Replace sample_docs with real B-Knowledge docs (2-4h)
   - Expand CSV to 80-100 Q&A pairs (6-10h)
   - Curate and validate (2h)

3. **Phase 3 Ready**
   - Create promptfooconfig.yaml
   - Implement evaluation metrics
   - Run full RAG evaluation

## 📞 Questions?

Refer to:
- Quick start: See PHASE2_FIXTURE_SETUP.md
- Structure: See dataset/fixture/README.md
- TrackingL Check PROJECT_TRACKING.md
