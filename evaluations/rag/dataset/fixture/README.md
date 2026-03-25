# Fixture System - Phase 2 Setup Guide

## Overview
This directory contains sample documents and Q&A pairs to test the RAG evaluation pipeline. The fixture files are **NOT real data** but serve as a template for QA team to understand the workflow.

## Directory Structure

```
fixture/
├── sample_docs/              # Sample markdown documents (reference content)
│   ├── 01-quickstart.md     # Installation & setup guide
│   ├── 02-api-reference.md  # API endpoints documentation
│   ├── 03-troubleshooting.md # Common issues & solutions
│   ├── 04-configuration.md   # Environment & config variables
│   ├── 05-architecture.md    # System design overview
│   └── 06-security.md        # Authentication & compliance
│
└── reference/               # Q&A reference files
    └── qa_pairs_fixture.csv # 30 sample Q&A pairs (generated from docs)
```

## How to Use This Fixture

### Step 1: Understand the Content
- Review all markdown files in `sample_docs/`
- These represent the knowledge base documents
- Q&A pairs in `qa_pairs_fixture.csv` are derived from these docs

### Step 2: Test the Complete Flow
```bash
cd evaluations/rag

# 1. Convert fixture CSV to YAML (test converter)
python scripts/csv_to_yaml.py \
  dataset/fixture/reference/qa_pairs_fixture.csv \
  dataset/eval_dataset_fixture.yaml

# 2. Run evaluation with fixture data
docker-compose up -d

# 3. Execute evaluation pipeline
docker exec ragflow-eval bash run_eval.sh

# 4. Check results
cat results/eval_report.md
```

### Step 3: Verify Output
Expected outputs:
- ✅ 30 Q&A pairs converted to YAML
- ✅ Each pair has: question, expected_answer, source_doc, category, difficulty
- ✅ Evaluation metrics calculated
- ✅ Report generated with results

## CSV Format Reference

| Column | Type | Example | Notes |
|--------|------|---------|-------|
| test | string | "Q1: Installation Methods" | Unique test identifier |
| question | string | "What are the ways to install?" | The actual question |
| expected_answer | string | "Docker, npm, or source" | Correct/ideal answer |
| source_doc | string | "01-quickstart.md" | Reference document |
| category | string | "process" | See categories below |
| difficulty | string | "easy" | easy, medium, hard |

### Valid Categories
- `factual` - Factual knowledge questions (what, where, when)
- `process` - Step-by-step procedures (how-to)
- `technical` - Technical implementation details
- `troubleshoot` - Problem-solving questions
- `comparison` - Comparison between options

### Difficulty Levels
- `easy` - Basic knowledge, straightforward answers
- `medium` - Requires understanding context, multiple sources
- `hard` - Complex reasoning, edge cases, advanced topics

## Phase 2 QA Workflow

### For QA Team:
After Phase 1 setup completes, QA will:

1. **Replace Fixture Documents**
   ```bash
   rm dataset/fixture/sample_docs/*
   # Copy actual B-Knowledge documentation here
   ```

2. **Expand Q&A Dataset**
   ```bash
   # Edit dataset/fixture/reference/qa_pairs_fixture.csv
   # Add 50-70 more Q&A pairs (total 80-100)
   ```

3. **Validate Each Q&A**
   - Question is clear and unambiguous
   - Expected answer matches source document
   - Category accurately reflects question type
   - Difficulty level is appropriate

4. **Test the Pipeline**
   ```bash
   make eval-fixture  # Runs complete evaluation
   ```

5. **Move to Production**
   ```bash
   cp dataset/fixture/reference/qa_pairs_fixture.csv \
      dataset/qa_pairs.csv
   
   make eval-full     # Run with production data
   ```

## Testing Checklist

- [ ] All 6 sample documents readable and valid markdown
- [ ] All 30 Q&A pairs have required fields (6 columns)
- [ ] CSV can convert to valid YAML without errors
- [ ] Evaluation pipeline runs with fixture data
- [ ] Results report is generated
- [ ] No data loss during CSV↔YAML conversion

## Troubleshooting

### CSV Validation Fails
```bash
# Check CSV format
python scripts/csv_to_yaml.py dataset/fixture/reference/qa_pairs_fixture.csv -v
```

### YAML Conversion Issues
- Ensure CSV headers match exactly: test, question, expected_answer, source_doc, category, difficulty
- No missing required fields
- Category values must be in [factual, process, technical, troubleshoot, comparison]
- Difficulty must be in [easy, medium, hard]

### Documents Not Found in Evaluation
- Ensure source_doc in CSV matches actual filename in sample_docs/
- File extensions must match (e.g., "01-quickstart.md" not "01-quickstart")

## Next Steps

1. **Phase 2 Begins**: QA replaces test fixtures with real content
2. **Manual Curation**: 6-10 hours to review and improve Q&A pairs
3. **Phase 3 Ready**: Evaluation system ready for implementation
