# Testing

## Overview

| Workspace | Framework | Runner | Location |
|-----------|-----------|--------|----------|
| Backend | Vitest 2.1 | `npm run test -w be` | `be/tests/` |
| Frontend | Vitest 3.0 + jsdom | `npm run test -w fe` | `fe/tests/` |
| RAG Worker | None | — | — |
| Converter | None | — | — |

---

## Backend Testing

### Setup
- **Framework:** Vitest 2.1
- **Config:** `be/vitest.config.ts`
- **Coverage:** `@vitest/coverage-v8`
- **Commands:**
  - `npm run test -w be` — Single run
  - `npm run test:watch -w be` — Watch mode
  - `npm run test:coverage -w be` — With coverage
  - `npm run test:ui -w be` — Vitest UI

### Structure
```
be/tests/
├── admin/
├── audit/
├── auth/
├── broadcast/
├── chat/
├── glossary/
├── rag/
├── search/
├── shared/
├── system-tools/
├── teams/
├── user-history/
├── users/
└── setup.ts              # Global test setup
```

Tests mirror the module structure. Each module directory under `tests/` contains tests for its corresponding `src/modules/` module.

### Patterns
- Test files: `*.test.ts`
- Global setup in `be/tests/setup.ts`
- Coverage report: `be/coverage.txt`, `be/TEST_COVERAGE_SUMMARY.md`

---

## Frontend Testing

### Setup
- **Framework:** Vitest 3.0 with jsdom environment
- **Testing Library:** `@testing-library/react` + `@testing-library/user-event`
- **Config:** `fe/vitest.config.ts`
- **E2E:** `@playwright/test` (available but separate)

### Structure
```
fe/tests/
├── app/
├── components/
├── features/
├── i18n/
├── layouts/
├── lib/
├── utils/
├── setup.ts              # Global mocks and setup
├── test-utils.tsx         # Render helpers
└── version.test.ts
```

### Test Utilities (`fe/tests/test-utils.tsx`)
- `renderWithProviders()` — Wraps component in QueryClient + providers
- `renderWithRouter()` — Wraps component in Router + providers

### Global Mocks (`fe/tests/setup.ts`)
- `localStorage` — In-memory mock
- `matchMedia` — Mock for responsive queries
- `ResizeObserver` — Mock
- `IntersectionObserver` — Mock
- `i18next` — Mock translations
- `React Router` — Mock navigation

### Commands
- `npm run test -w fe` — Watch mode
- `npm run test:run -w fe` — Single run (CI)
- `npm run test:coverage -w fe` — Istanbul coverage

---

## Python Testing

### Current State
- **No test framework configured** for `advance-rag` or `converter`
- No `tests/` directories or test files in Python workspaces
- No pytest configuration in `pyproject.toml` files

---

## CI / Root Commands

```bash
npm run test              # Test all workspaces (via npm workspaces --if-present)
npm run lint              # Lint all workspaces
npm run build             # Build all workspaces
```

---

## Coverage

- **BE:** v8-based coverage via `@vitest/coverage-v8`
- **FE:** Istanbul-based coverage via `@vitest/coverage-istanbul` + `@vitest/coverage-v8`
- Coverage summaries maintained in `be/TEST_COVERAGE_SUMMARY.md` and `be/coverage.txt`
