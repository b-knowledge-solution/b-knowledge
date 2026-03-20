# Test Coverage Analysis

**Date:** 2026-03-20

## Executive Summary

The B-Knowledge monorepo has **251 unit/integration test files** and **8 E2E test files** across four workspaces. Backend testing is the strongest area (112 files, 50% coverage threshold), while frontend coverage is permissive (96 files, 5% threshold), Python RAG coverage is sparse relative to codebase size (35 files for 218 modules), and **CI does not run tests at all**.

---

## Current State by Workspace

### Backend (`be/`) — 112 test files

| Metric | Value |
|--------|-------|
| Framework | Vitest + v8 coverage |
| Coverage threshold | 50% (statements, branches, functions, lines) |
| Modules with tests | 18/19 |
| Shared services tested | 16/17 |

**Strengths:**
- All modules except `llm-provider` have tests
- Strong service-layer unit testing with consistent mocking patterns
- RBAC/permission tests across chat, RAG, and search
- Zod schema validation thoroughly tested
- Good test utilities (mock factories for requests, responses, users)

**Gaps:**
- `llm-provider` module has zero tests
- Only 7/26 route files have direct tests
- Only 1 minimal E2E test file (and `supertest` isn't even installed)
- Controller layer largely untested (relies on service tests)
- All external services fully mocked — no integration tests against real Redis/PostgreSQL/OpenSearch

### Frontend (`fe/`) — 96 test files + 8 E2E

| Metric | Value |
|--------|-------|
| Unit framework | Vitest + Istanbul coverage |
| E2E framework | Playwright |
| Coverage threshold | 5% lines (very permissive) |
| Features with tests | 16/20 |

**Strengths:**
- Well-structured test utilities (`renderWithProviders`, mock data factories)
- E2E tests cover core flows (chat, dataset CRUD, search, feedback)
- Hooks and utils have 100% file-level coverage
- Good browser API mocking infrastructure

**Gaps:**
- 4 features have zero tests: `chat-widget`, `search-widget`, `guideline`, `landing`
- Only 14/77 shared components tested (18%)
- 43 test files excluded due to module loading issues (significant tech debt)
- Coverage threshold is essentially meaningless at 5%
- Dashboard, projects, prompts, llm-provider have only 1 test each

### Python advance-rag — 35 test files

| Metric | Value |
|--------|-------|
| Framework | pytest |
| Source modules | 218 |
| Test-to-source ratio | ~16% |

**Strengths:**
- Utility modules have excellent coverage (crypto, encoding, file, string, text, time, token)
- 10 document parsers tested
- Sophisticated conftest.py mocking 54 third-party libraries
- E2E tests for full parsing + indexing pipeline

**Gaps:**
- GraphRAG (31 modules) — zero tests
- LLM/embedding integration (7 modules) — zero tests
- Vision/OCR (21+ modules) — zero tests
- 13 database services untested
- 6 document store connectors untested
- Memory module (9 modules) — zero tests
- Flow components partially covered (3 of ~12 modules)
- No pytest configuration file exists

### Python converter — 4 test files

| Metric | Value |
|--------|-------|
| Framework | pytest |
| Source modules | 9 |
| Test-to-source ratio | ~44% |

**Strengths:**
- Worker lifecycle comprehensively tested (758-line E2E test)
- PDF post-processing well covered
- Config validation tested

**Gaps:**
- Individual converters (word, powerpoint, excel) have no unit tests
- All LibreOffice subprocess calls are mocked, never validated

---

## Critical Infrastructure Gap: CI Pipeline

The GitHub Actions workflow (`.github/workflows/buid-ci.yml`) has **tests commented out**:
```yaml
#- run: npm test
```

This means no tests run on push to main or on pull requests. All test investment is wasted if tests aren't enforced.

---

## Prioritized Recommendations

### Priority 1 — High Impact, Low Effort

| # | Area | Action | Why |
|---|------|--------|-----|
| 1 | **CI/CD** | Uncomment `npm test` in GitHub Actions workflow and add Python test steps | Tests that don't run in CI provide no safety net. This is the single highest-impact change. |
| 2 | **FE coverage threshold** | Raise from 5% to at least 30% | Current threshold is meaningless — regressions slip through unnoticed. |
| 3 | **FE excluded tests** | Fix or remove the 43 excluded test files | These represent broken tests that erode trust in the test suite. |
| 4 | **BE `llm-provider`** | Add service and schema tests for the LLM provider module | Only module with zero coverage; it's a core integration point. |

### Priority 2 — High Impact, Medium Effort

| # | Area | Action | Why |
|---|------|--------|-----|
| 5 | **FE shared components** | Add tests for the most-used shared components (currently 18% coverage) | Components like Dialog, DataTable, Sidebar are used everywhere — regressions propagate widely. |
| 6 | **FE widget features** | Add basic render + interaction tests for `chat-widget` and `search-widget` | These are user-facing embed widgets with zero test coverage. |
| 7 | **BE route/controller tests** | Add integration tests for untested routes using `supertest` | Only 7/26 routes tested; install `supertest` and test HTTP-level behavior. |
| 8 | **advance-rag DB services** | Add unit tests for the 13 untested database service modules | These handle all data persistence — bugs here cause data loss or corruption. |
| 9 | **advance-rag pytest config** | Add `pyproject.toml [tool.pytest]` with coverage thresholds | No formal configuration means no enforced standards. |

### Priority 3 — Strategic, Higher Effort

| # | Area | Action | Why |
|---|------|--------|-----|
| 10 | **BE integration tests** | Add tests against real PostgreSQL/Redis/OpenSearch (Docker in CI) | All external services are mocked — connection issues, query bugs, and race conditions are invisible. |
| 11 | **advance-rag GraphRAG** | Add tests for the 31-module GraphRAG implementation | This is a major feature with zero test coverage. |
| 12 | **advance-rag Vision/OCR** | Add tests for layout recognition and OCR modules | Critical for document parsing quality. |
| 13 | **FE E2E expansion** | Add Playwright tests for auth flows, admin panel, project management | Only 8 E2E tests exist; major user journeys are uncovered. |
| 14 | **converter unit tests** | Add isolated tests for word/powerpoint/excel converters | Currently only tested through E2E mocks — no validation of actual conversion logic. |
| 15 | **advance-rag LLM integration** | Add tests for chat_model, embedding_model, rerank_model | LLM integration is the core RAG capability with zero tests. |

---

## Coverage Statistics Summary

| Workspace | Test Files | Source Modules | Threshold | CI Enforced |
|-----------|-----------|----------------|-----------|-------------|
| Backend | 112 | ~100 | 50% | No |
| Frontend (unit) | 96 | ~200 | 5% | No |
| Frontend (e2e) | 8 | — | — | No |
| advance-rag | 35 | 218 | None | No |
| converter | 4 | 9 | None | No |
| **Total** | **255** | **~527** | — | **No** |
