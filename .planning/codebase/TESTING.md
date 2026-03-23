# Testing Patterns

**Analysis Date:** 2026-03-23

## Test Frameworks

| Layer | Framework | Config | Test Count |
|-------|----------|--------|------------|
| Backend unit | Vitest 2.1 (node) | `be/vitest.config.ts` | 146 files |
| Frontend unit | Vitest 3.0 (jsdom) | `fe/vitest.config.ts` | 82 files |
| Frontend E2E | Playwright 1.57 | `fe/playwright.config.ts` | 30 files |
| Python unit | pytest 7+ | `advance-rag/pyproject.toml` [tool.pytest] | 54 files |

## Running Tests

```bash
# All workspaces
npm run test                        # Run all (BE + FE unit)

# Backend
npm run test -w be                  # Vitest run (single pass)
npm run test:watch -w be            # Vitest watch mode
npm run test:coverage -w be         # With V8 coverage
npm run test:ui -w be               # Vitest UI

# Frontend unit
npm run test -w fe                  # Vitest (watch by default in FE)
npm run test:run -w fe              # Single run (CI)
npm run test:coverage -w fe         # Istanbul coverage

# Frontend E2E
npm run test:e2e -w fe              # Playwright (chromium)
npm run test:e2e:smoke -w fe        # Smoke tests only (@smoke tag)
npm run test:e2e:setup -w fe        # Install Playwright browsers

# Python
cd advance-rag && python -m pytest  # Run all Python tests
python -m pytest -v --tb=short      # Verbose with short tracebacks
```

## Test File Organization

### Backend (`be/tests/`)

**Location:** Separate `tests/` directory mirroring module structure.

**Structure:**
```
be/tests/
  setup.ts                          # Global mocks (logger, DB)
  agent/
    agent.service.test.ts
    agent.controller.test.ts
    agent.model.test.ts
    agent.schemas.test.ts
    agent-executor.service.test.ts
    agent-debug.service.test.ts
    ...
  chat/
    chat-conversation.service.test.ts
    chat-message.model.test.ts
    ...
  rag/
    rag.service.test.ts
    rag.controller.test.ts
    ...
  memory/
    memory.service.test.ts
    ...
  shared/
    config/
    db/
    middleware/
    models/
    services/
    utils/
```

**Naming:** `<domain>.<layer>.test.ts` (e.g., `agent.service.test.ts`, `agent.model.test.ts`)

### Frontend Unit (`fe/tests/`)

**Location:** Separate `tests/` directory mirroring feature structure.

**Structure:**
```
fe/tests/
  setup.ts                          # Browser API mocks, i18n mock
  test-utils.tsx                    # Custom render functions
  features/
    agent/
      AgentCard.test.tsx
      AgentListPage.test.tsx
      agentApi.test.ts
      agentQueries.test.ts
      canvasStore.test.ts
      useAgentCanvas.test.ts
      ...
    memory/
      MemoryCard.test.tsx
      memoryApi.test.ts
      ...
    chat/
    datasets/
    ...
  components/
  hooks/
  lib/
  utils/
```

**Naming:** Matches source file name + `.test.{ts,tsx}` extension.

### Frontend E2E (`fe/e2e/`)

**Structure:**
```
fe/e2e/
  smoke.spec.ts                     # Quick validation
  agent/
    agent-crud.spec.ts
    agent-canvas.spec.ts
    agent-api.spec.ts
    agent-navigation.spec.ts
    agent-template.spec.ts
    agent-version.spec.ts
  memory/
    memory-crud.spec.ts
    memory-api.spec.ts
    memory-navigation.spec.ts
  chat/
  dataset/
  search/
  helpers/
    api.helper.ts                   # Direct API calls for setup/teardown
  fixtures/
  test-data/
```

**Naming:** `<feature>-<aspect>.spec.ts` (e.g., `agent-crud.spec.ts`)

### Python (`advance-rag/tests/`)

**Structure:**
```
advance-rag/tests/
  conftest.py                       # Shared fixtures, path setup, dependency mocking
  fixtures/                         # Test data files
  test_agent_tools.py
  test_agent_consumer.py
  test_flow_splitter.py
  test_nlp_search.py
  test_opensearch_conn.py
  ...
```

**Naming:** `test_<module>.py` with `test_<function>` test functions.

## Backend Test Patterns

### Global Setup (`be/tests/setup.ts`)

Mocks logger and database module globally. Provides factory functions for Express mocks:

```typescript
// Auto-mocked for all tests
vi.mock('../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../src/shared/db/index.js', () => ({
  query: vi.fn(), queryOne: vi.fn(), getClient: vi.fn(),
  getAdapter: vi.fn(), closePool: vi.fn(), checkConnection: vi.fn(),
  db: { query: vi.fn(), queryOne: vi.fn(), getClient: vi.fn() },
}))
```

**Express mock utilities:**
```typescript
import { createMockRequest, createMockResponse, createMockNext, createMockUser } from '../setup'
```

### Lifecycle

```typescript
beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.resetAllMocks() })
```

### Mocking Strategy (hoisted mocks)

Use `vi.hoisted()` for mock objects referenced before `vi.mock()`:
```typescript
const mockAgentModel = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getKnex: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    agent: mockAgentModel,
    agentTemplate: mockAgentTemplateModel,
  },
}))
```

### Knex Builder Mocks

For testing services that use Knex query builders, create chainable mock builders:
```typescript
function makeBuilder(result: unknown) {
  const builder: any = {
    where: vi.fn().mockReturnThis(),
    whereNull: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    clone: vi.fn().mockReturnThis(),
    count: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(result),
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    // ...
  }
  return builder
}
```

### Test Data Factories

Use `build<Entity>()` helper functions with spread overrides:
```typescript
function buildAgent(overrides: Partial<any> = {}): any {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    status: 'draft',
    dsl: { nodes: {}, edges: [] },
    tenant_id: 'tenant-1',
    ...overrides,
  }
}
```

### Suite Organization

```typescript
describe('AgentService', () => {
  describe('list()', () => {
    it('should return paginated agents for tenant', async () => { ... })
    it('should filter by mode when provided', async () => { ... })
  })

  describe('create()', () => {
    it('should create agent with default DSL', async () => { ... })
    it('should apply template DSL when template_id provided', async () => { ... })
  })
})
```

### Vitest Config (`be/vitest.config.ts`)

- Environment: `node`
- Globals: enabled (`describe`, `it`, `expect` available without import)
- Typecheck: enabled with tsconfig
- Timeout: 10 seconds
- Coverage: V8 provider
- Coverage thresholds: statements 60%, branches 55%, functions 60%, lines 60%
- Setup file: `be/tests/setup.ts`

## Frontend Unit Test Patterns

### Global Setup (`fe/tests/setup.ts`)

Mocks browser APIs and libraries:
- `window.matchMedia` (responsive/theme)
- `localStorage` and `sessionStorage`
- `ResizeObserver`, `IntersectionObserver`
- `DOMMatrix` (for pdfjs-dist)
- `fetch` (global)
- `indexedDB`
- `BroadcastChannel`
- `react-i18next` (returns translation keys)
- `react-router-dom` (mockNavigate, mockLocation, mockSearchParams)
- `lucide-react` (Proxy returning null components)
- `@headlessui/react` (no-animation versions)

### Custom Render Functions (`fe/tests/test-utils.tsx`)

Three render wrappers for different test scopes:

```typescript
// Full provider stack (QueryClient + Router + Auth + Settings + Ragflow)
renderWithProviders(ui, { initialRoute, authValue, settingsValue })

// Router only
renderWithRouter(ui, { initialRoute })

// QueryClient only
renderWithQueryClient(ui)
```

All create fresh `QueryClient` instances with retries disabled and infinite gcTime.

### Component Test Pattern

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock UI dependencies as simple HTML elements
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, onClick, className }: any) => (
    <div data-testid="card" className={className} onClick={onClick}>{children}</div>
  ),
}))

// Import component under test AFTER mocks
import { AgentCard } from '@/features/agents/components/AgentCard'

describe('AgentCard', () => {
  it('renders agent name and description', () => {
    render(<AgentCard agent={buildAgent()} onDelete={vi.fn()} />)
    expect(screen.getByText('My Agent')).toBeInTheDocument()
  })
})
```

### Mock Data Factories (`fe/tests/test-utils.tsx`)

```typescript
createMockUser({ role: 'admin' })
createMockAdmin()
createMockLeader()
createMockRagflowConfig()
```

### Fetch Mocking

```typescript
import { mockFetch, mockFetchError, createMockResponse } from '../test-utils'

global.fetch = mockFetch({ data: [...] })
// or
global.fetch = mockFetchError('Network error')
```

### Vitest Config (`fe/vitest.config.ts`)

- Environment: `jsdom`
- Pool: `forks` (for stability)
- Globals: enabled
- Isolation: true (clear memory after each file)
- Timeout: 10 seconds (test + hook)
- Coverage: Istanbul provider
- Coverage thresholds: statements 30%, branches 20%, functions 30%, lines 30%
- React deps pre-bundled for speed
- Setup file: `fe/tests/setup.ts`

## Frontend E2E Test Patterns

### Playwright Config (`fe/playwright.config.ts`)

- Test directory: `fe/e2e/`
- Sequential execution (not parallel) to avoid DB race conditions
- Single worker
- 2-minute timeout per test (document parsing is slow)
- Retries: 1
- Trace: on first retry
- Screenshot: only on failure
- Auth: setup project runs first, persists state to `e2e/.auth/user.json`

### E2E Test Structure

```typescript
import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'

let api: ApiHelper
let agentId: string

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)
})

test.afterAll(async ({ request }) => {
  // Cleanup created resources
  if (agentId) {
    try { await request.delete(`${API_BASE}/api/agents/${agentId}`) }
    catch { /* ignore */ }
  }
})

test('Navigate to /agents page @smoke', async ({ page }) => {
  await page.goto('/agents')
  await page.waitForLoadState('networkidle')
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toBeVisible({ timeout: 10_000 })
})
```

### E2E Tagging

- `@smoke` tag for minimal happy-path tests: `npm run test:e2e:smoke -w fe`

### E2E API Helper (`fe/e2e/helpers/api.helper.ts`)

Wraps Playwright's `APIRequestContext` for direct backend API calls, used for test setup/teardown without going through the UI.

## Python Test Patterns

### Configuration (`advance-rag/pyproject.toml`)

```ini
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_functions = ["test_*"]
addopts = "-v --tb=short"
```

Optional dev dependencies: `pytest>=7.0`, `pytest-cov>=4.0`, `pytest-mock>=3.0`

### Conftest (`advance-rag/tests/conftest.py`)

Heavy dependency mocking strategy. Pre-mocks 100+ third-party modules that may not be installed in test environments:
```python
_THIRD_PARTY_MOCKS = [
    "docx", "docx.document", "openpyxl", "numpy", "scipy",
    "sklearn", "pandas", "PIL", "mammoth", "pypdf", ...
]
for mod_name in _THIRD_PARTY_MOCKS:
    _ensure_mock_module(mod_name)
```

This allows running unit tests without the full 108-package dependency tree.

### Test Pattern

```python
"""Unit tests for individual agent tool implementations."""
import pytest
from unittest.mock import MagicMock, patch

class TestTavilyTool:
    def test_execute_returns_results(self):
        tool = TavilyTool()
        with patch('httpx.get') as mock_get:
            mock_get.return_value = MagicMock(json=lambda: {"results": [...]})
            result = tool.execute({"query": "test"}, config={})
            assert isinstance(result, str)
```

### Mocking Strategy

- `unittest.mock.MagicMock` and `patch` for standard mocking
- Module-level sys.modules manipulation for heavy optional dependencies
- Fallback class stubs when real imports fail:
```python
try:
    from rag.agent.tools.base_tool import BaseTool
except Exception:
    class BaseTool(ABC):
        def execute(self, input_data, config, credentials=None): ...
```

## Coverage

### Backend Coverage Thresholds (`be/vitest.config.ts`)

| Metric | Threshold |
|--------|-----------|
| Statements | 60% |
| Branches | 55% |
| Functions | 60% |
| Lines | 60% |

Coverage excludes: entry point, scripts, migrations, DB adapters, routes, MinIO service, logger.

### Frontend Coverage Thresholds (`fe/vitest.config.ts`)

| Metric | Threshold |
|--------|-----------|
| Statements | 30% |
| Branches | 20% |
| Functions | 30% |
| Lines | 30% |

Coverage excludes: `.d.ts`, `main.tsx`, `vite-env.d.ts`, assets, i18n locales, test files.

### View Coverage

```bash
npm run test:coverage -w be   # V8 coverage -> be/coverage/
npm run test:coverage -w fe   # Istanbul coverage -> fe/coverage/
```

## What to Mock

**Backend:**
- Always mock: logger, database module, external services (Redis, MinIO, OpenSearch)
- Use `vi.hoisted()` for mock objects referenced in `vi.mock()` calls
- Create Knex builder chains for service tests

**Frontend:**
- Always mock: `react-i18next`, `react-router-dom`, `lucide-react`, `@headlessui/react`
- Mock shadcn/ui components as simple HTML elements with `data-testid`
- Use `renderWithProviders()` for integration-style component tests
- Mock `fetch` globally, override per-test as needed

**Python:**
- Pre-mock heavy ML/NLP libraries in conftest.py
- Use `unittest.mock.patch` for HTTP clients and external services
- Provide fallback class stubs when imports fail

## What NOT to Mock

**Backend:**
- Zod schemas (test validation directly)
- Pure utility functions
- Type definitions

**Frontend:**
- TanStack Query (use real QueryClient via `renderWithQueryClient()`)
- React state management (test actual state changes)

---

*Testing analysis: 2026-03-23*
