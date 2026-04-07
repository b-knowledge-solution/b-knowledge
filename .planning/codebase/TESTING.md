# Testing Patterns

**Analysis Date:** 2026-04-07

The B-Knowledge monorepo uses **Vitest** for both TypeScript workspaces and **pytest** for Python workers. There is no shared test runner — each workspace runs its own suite via npm workspace commands.

## Test Frameworks By Workspace

| Workspace | Runner | Environment | Config |
|-----------|--------|-------------|--------|
| `be/` | Vitest 2.1 | Node | `be/vitest.config.ts` |
| `fe/` (unit) | Vitest 3.x | Node | `fe/vitest.unit.config.ts` |
| `fe/` (UI) | Vitest 3.x | jsdom | `fe/vitest.ui.config.ts` |
| `fe/` (e2e) | Playwright 1.57 | Chromium | `fe/playwright.config.ts` |
| `advance-rag/` | pytest 7+ (with `pytest-mock`, `pytest-cov`) | Python 3.11 | `[tool.pytest.ini_options]` in `advance-rag/pyproject.toml` |
| `converter/` | Not detected | — | — |

## Run Commands

### Root (all workspaces)

```bash
npm run test                # Runs `npm run test` in every workspace via --if-present
```

### Backend (`be/`)

```bash
npm run test -w be          # vitest run (single pass)
npm run test:watch -w be    # watch mode
npm run test:coverage -w be # v8 coverage
npm run test:ui -w be       # Vitest UI
```

### Frontend (`fe/`)

```bash
npm run test -w fe              # alias for test:run (unit + ui sequentially)
npm run test:run -w fe          # unit then UI tests
npm run test:run:unit -w fe     # business-logic tests in Node env
npm run test:run:ui -w fe       # component tests in jsdom env
npm run test:coverage -w fe     # both suites with coverage
npm run test:e2e -w fe          # Playwright (chromium project)
npm run test:e2e:smoke -w fe    # Playwright @smoke tag
npm run test:e2e:setup -w fe    # Install Chromium browser
```

### advance-rag (`advance-rag/`)

```bash
# From project root, with .venv activated
source .venv/bin/activate
cd advance-rag
pytest                      # Run full test suite
pytest tests/test_chat_model.py     # Single file
pytest -k "embedding"               # Filter by name
pytest --cov                        # With coverage (pytest-cov)
```

## Test File Locations

| Workspace | Pattern | Location |
|-----------|---------|----------|
| Backend | `tests/**/*.test.ts` | `be/tests/` (mirrors `src/` layout: `tests/<module>/<file>.test.ts`) |
| Frontend | `tests/**/*.test.{ts,tsx}` | `fe/tests/` (mirrors `src/`: `tests/features/<domain>/...`) |
| advance-rag | `test_*.py` | `advance-rag/tests/` (flat) |

Tests are **NOT** co-located with source files in any workspace. They live in a parallel `tests/` tree.

### Notable test directories

- `be/tests/setup.ts` — global Vitest setup (mocks, env)
- `be/tests/e2e/` — e2e API tests (`api.test.ts`, `html-to-markdown-e2e.test.ts`)
- `be/tests/compliance/` — compliance test suites (access-control, audit-trail, authentication, data-integrity, error-handling, software-lifecycle)
- `fe/tests/setup.ts` — jsdom mocks (localStorage, matchMedia, ResizeObserver, IntersectionObserver, i18next, React Router)
- `fe/tests/test-utils.tsx` — `renderWithProviders()`, `renderWithRouter()` helpers
- `fe/tests/compliance/security-ui.compliance.test.ts` — UI compliance suite
- `advance-rag/tests/conftest.py` — pytest fixtures
- `advance-rag/tests/fixtures/` — sample documents for parser tests (Java, Python, TS, OpenAPI YAML, Swagger JSON, ADRs, clinical protocol)

## Backend Vitest Config (`be/vitest.config.ts`)

- Environment: `node`
- Globals: enabled (`describe`, `it`, `expect` available without import)
- Setup file: `./tests/setup.ts`
- Test timeout: `10000` ms
- Typecheck: enabled against `./tsconfig.json`
- Path alias: `@` → `./src`
- Coverage provider: `v8`
- Coverage reporters: `text`, `text-summary`, `json`, `html`, `lcov`
- Coverage output: `./coverage`

### Backend coverage thresholds

| Metric | Threshold |
|--------|-----------|
| Statements | 60% |
| Branches | 55% |
| Functions | 60% |
| Lines | 60% |

### Backend coverage exclusions

The following are excluded from coverage (require integration tests or are entry points):
- `src/index.ts` — entry point
- `src/scripts/**` — CLI scripts
- `src/db/migrations/**` — DB migrations
- `src/db/adapters/**` — DB adapters (need integration tests)
- `src/db/migrate.ts` — migration runner
- `src/routes/**` — routes (tested via service layer)
- `src/services/minio.service.ts` — needs real MinIO
- `src/services/logger.service.ts` — Winston structural test only
- `**/*.d.ts`

## Frontend Vitest Config

The frontend splits tests into TWO Vitest configs sharing a `vitest.shared.ts` base:

### `fe/vitest.unit.config.ts`
- Pure business logic and Node-runnable tests
- Files matched in shared config

### `fe/vitest.ui.config.ts`
- Environment: `jsdom`
- Globals: enabled
- Setup file: `./tests/setup.ts`
- Include: `tests/**/*.test.{ts,tsx}`
- Excludes: shared `commonExcludes`

The two suites run **sequentially** in `npm run test:run -w fe` (unit first, UI second).

### Coverage providers
- `@vitest/coverage-istanbul` and `@vitest/coverage-v8` are both installed.

### FE testing libraries
- `@testing-library/react` 16
- `@testing-library/jest-dom` 6
- `@testing-library/user-event` 14

### FE test utilities
- `renderWithProviders()` and `renderWithRouter()` in `fe/tests/test-utils.tsx`
- Mocks set up in `fe/tests/setup.ts`: `localStorage`, `matchMedia`, `ResizeObserver`, `IntersectionObserver`, `i18next`, React Router

## Frontend E2E (Playwright)

- Config: `fe/playwright.config.ts`
- Project: `chromium`
- Smoke tag: `@smoke`
- Setup: `npm run test:e2e:setup -w fe` installs the Chromium binary before first run.

## advance-rag pytest

- Configured via `[tool.pytest.ini_options]` in `advance-rag/pyproject.toml`
- Dev dependencies declared in `pyproject.toml`:
  - `pytest>=7.0`
  - `pytest-cov>=4.0`
  - `pytest-mock>=3.0`
- Fixtures live in `advance-rag/tests/conftest.py`
- Sample document fixtures in `advance-rag/tests/fixtures/`
- E2E test logs persist to `tests/e2e_stdout.log`, `tests/e2e_stderr.log`, `tests/e2e_results.log`
- Notable e2e tests: `test_e2e_pipeline.py`, `test_e2e_parse_index.py`

## Test Coverage Areas

### Backend test domains (sampling from `be/tests/`)
`admin`, `agent` (controller, model, service, schemas, debug, embed, executor, redis, sandbox, tool-credential, webhook), `audit`, `auth`, `broadcast`, `chat` (conversation, dialog, message, RBAC, html-to-markdown), `compliance` (6 suites), `e2e`, `external` (api-key, auth middleware), `glossary`, `llm-provider`, `memory`, `dashboard`, `preview`, `projects`, `rag` (search, document, controller, service, language-detect, metadata-tagging, version-history, aggregated-status, document-delete-all), `search` (RBAC, comprehensive, html-to-markdown), `shared` (config, db adapters, knex, models, scripts, services, utils, middleware), `teams`, `users`.

### Frontend test domains (sampling from `fe/tests/`)
Components (`Checkbox`, `RadioGroup`, `Select`, `ModelSelector`, `RerankSelector`, `LlmSettingFields`, `SliderWithToggle`, `Spotlight`, `FeedbackCommentPopover`, llm-presets), features (`agent`, `api-keys`, `audit`, `auth`, `broadcast`, `chat-widget`, `chat`, `code-graph`, `dashboard`, `datasets`, `glossary`, `guideline`, `histories`, `knowledge-base`, `landing`, `llm-provider`, `memory`, `search-widget`, `search`, `system`, `teams`, `users`, `ai`), hooks (`useDebounce`, `useSocket`, `useUrlState`), lib (`api`, `ability`, `queryKeys`, `socket`, `utils`, `widgetAuth`), `i18n`, `compliance/security-ui`, `app/contexts/SettingsContext`, `version`, `config`.

### advance-rag test domains
Parsers (`adr`, `clinical`, `code`, `email`, `epub`, `laws`, `naive`, `openapi`, `presentation`, `qa`, `table`), agent (`consumer`, `executor`, `node_executor`, `tools`, `tools_registry`), code-graph (constants, models, pipeline), connectors (`minio`, `opensearch`, `redis`, `chat_model`, `embedding_model`, `embedding_registry`, `rerank_model`, `local_embedding_utils`, `connector_test_connection`), flow (`hierarchical_merger`, `pipeline`, `splitter`), graphrag (`entity_resolution`, `search`, `utils`), nlp (`query`, `search`, `synonym`, `term_weight`, `utils`), services (`document_service`, `knowledgebase_service`), sync (`delta_sync`, `cross_kb_collision_guard`, `deadlock_retry`, `parsing_status`, `uuid_standardization`), e2e (`pipeline`, `parse_index`), utils (`crypto`, `encoding`, `file_type`, `file`, `float`, `json`, `metadata`, `string`, `text`, `time`, `token`), vision (`layout`, `ocr`, `table`), `raptor`, `memory_handlers`, `canvas_version_release`, `storage_factory`.

## Common Patterns

### Backend test structure
- Tests mirror `src/` layout under `tests/`.
- Globals enabled — no need to import `describe`/`it`/`expect`.
- Mocking: Vitest's `vi.mock()` for external services (Redis, MinIO, OpenSearch, Langfuse).
- Service layer tests mock `ModelFactory` to isolate business logic from the DB.
- E2E tests under `be/tests/e2e/` exercise full HTTP request paths.

### Frontend test structure
- UI tests use `renderWithProviders()` to wrap components in QueryClient + Router + i18n providers.
- API tests (`*Api.test.ts`) mock `lib/api.ts` fetch calls.
- Query hook tests (`*Queries.test.ts`) wrap hooks with QueryClientProvider.

### Python test structure
- Each test module is named `test_<subject>.py`.
- Shared fixtures in `conftest.py`.
- Use `pytest-mock`'s `mocker` fixture to patch DB / Redis / OpenSearch clients.
- Sample-data fixtures live in `tests/fixtures/` and are loaded via path constants.

## Coverage State

| Workspace | Enforced Threshold | Reporters |
|-----------|--------------------|-----------|
| Backend | 60% statements / 55% branches / 60% functions / 60% lines | text, text-summary, json, html, lcov |
| Frontend | Not enforced (coverage runnable via `test:coverage`) | istanbul + v8 |
| advance-rag | Not enforced (pytest-cov available) | configurable via CLI |

## Documentation Reminders for Tests

Per the project's mandatory doc-comment rule, **test files must also include doc comments** for non-trivial helpers and complex test setups. Inline comments are required above guard clauses, mocked integration points, and any non-obvious assertion.

---

*Testing analysis: 2026-04-07*
