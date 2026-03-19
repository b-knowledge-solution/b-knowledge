---
phase: 04
slug: domain-specific-parsers
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (advance-rag) + vitest (BE) |
| **Config file** | `advance-rag/pyproject.toml`, `be/vitest.config.ts` |
| **Quick run command** | `cd advance-rag && python -m pytest tests/ -x` |
| **Full suite command** | `cd advance-rag && python -m pytest tests/ && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run parser-specific test file
- **After every plan wave:** Run full pytest suite + npm build
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 01 | 1 | PRSR-01 | unit | `cd advance-rag && python -m pytest tests/test_code_parser.py -v` | W0 | pending |
| 04-01-T2 | 01 | 1 | PRSR-01 | unit | `cd advance-rag && python -m pytest tests/test_code_parser.py -v` | W0 | pending |
| 04-02-T1 | 02 | 2 | PRSR-02 | unit | `cd advance-rag && python -m pytest tests/test_openapi_parser.py -v` | W0 | pending |
| 04-02-T2 | 02 | 2 | PRSR-03 | unit | `cd advance-rag && python -m pytest tests/test_adr_parser.py -v` | W0 | pending |
| 04-03-T1 | 03 | 2 | PRSR-04 | unit | `cd advance-rag && python -m pytest tests/test_clinical_parser.py -v` | W0 | pending |
| 04-03-T2 | 03 | 2 | PRSR-04 | build | `npm run build -w fe` | n/a | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `advance-rag/tests/test_code_parser.py` -- covers PRSR-01 (code-aware chunking)
- [ ] `advance-rag/tests/test_openapi_parser.py` -- covers PRSR-02 (OpenAPI parsing)
- [ ] `advance-rag/tests/test_adr_parser.py` -- covers PRSR-03 (ADR parsing)
- [ ] `advance-rag/tests/test_clinical_parser.py` -- covers PRSR-04 (clinical classification)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Code file chunks by function boundary in UI | PRSR-01 | Requires upload + parse + chunk viewer | Upload a Python file, verify chunks correspond to functions in chunk detail page |
| OpenAPI spec endpoint chunks in search | PRSR-02 | Requires search query matching | Upload OpenAPI spec, search for "how do I call /users", verify endpoint chunk returned |
| ADR decision section surfaced in search | PRSR-03 | Requires search query matching | Upload ADR, search "why we chose PostgreSQL", verify decision section chunk |
| Clinical doc auto-classified | PRSR-04 | Requires upload + metadata check | Upload clinical doc, verify metadata tag clinical_classification is set |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
