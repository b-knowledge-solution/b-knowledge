# Detailed Plan: Fix All Test Coverage Gaps

## Phase 1 — CI/CD & Infrastructure (Foundation)

### 1.1 Enable tests in GitHub Actions CI
**File:** `.github/workflows/buid-ci.yml`

**Changes:**
- Uncomment `npm test` line
- Add Python test steps for `advance-rag` and `converter`
- Add Python 3.11 setup step
- Add `npm run setup:python` or direct venv creation for CI
- Cache npm and pip dependencies for speed

**Target workflow:**
```yaml
steps:
  - uses: actions/checkout@v4
  - name: Use Node.js ${{ matrix.node-version }}
    uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node-version }}
      cache: 'npm'
  - name: Set up Python 3.11
    uses: actions/setup-python@v5
    with:
      python-version: '3.11'
      cache: 'pip'
  - run: npm ci
  - run: npm run build --if-present
  - run: npm test
  - name: Run advance-rag tests
    working-directory: advance-rag
    run: |
      python -m venv .venv
      source .venv/bin/activate
      pip install -e ".[dev]" || pip install -e .
      pip install pytest pytest-cov
      python -m pytest tests/ --tb=short
  - name: Run converter tests
    working-directory: converter
    run: |
      python -m venv .venv
      source .venv/bin/activate
      pip install -e ".[dev]" || pip install -e .
      pip install pytest pytest-cov
      python -m pytest tests/ --tb=short
```

### 1.2 Add pytest configuration to Python projects
**Files:**
- `advance-rag/pyproject.toml` — Add `[tool.pytest.ini_options]` section
- `converter/pyproject.toml` — Add `[tool.pytest.ini_options]` section

**Changes for both:**
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_functions = ["test_*"]
addopts = "-v --tb=short"

[project.optional-dependencies]
dev = ["pytest>=7.0", "pytest-cov>=4.0", "pytest-mock>=3.0"]
```

### 1.3 Raise frontend coverage thresholds
**File:** `fe/vitest.config.ts`

**Change coverage thresholds from:**
```typescript
thresholds: { lines: 5, functions: 5, branches: 3, statements: 5 }
```
**To:**
```typescript
thresholds: { lines: 30, functions: 30, branches: 20, statements: 30 }
```

This is an interim target. Raise further as coverage improves.

---

## Phase 2 — Fix Excluded/Broken Frontend Tests (Tech Debt)

### 2.1 Diagnose and fix the lucide-react Proxy mock issue
**Root cause:** The global `lucide-react` Proxy mock in `fe/tests/setup.ts` causes module loading hangs for components that import icons in certain patterns.

**Files to modify:**
- `fe/tests/setup.ts` — Replace the global Proxy mock with a targeted `vi.mock('lucide-react', ...)` that returns named exports instead of using Proxy

**Approach:**
1. Read the current Proxy-based mock in `setup.ts`
2. Identify which icons are actually imported across the codebase
3. Replace with explicit mock exports (or a factory that generates simple span elements)
4. Re-enable the 23 tests excluded due to "module loading issues with global Proxy lucide-react mock":
   - `tests/components/ConfirmDialog.test.tsx`
   - `tests/components/Dialog.test.tsx`
   - `tests/components/SettingsDialog.test.tsx`
   - `tests/components/ErrorPage.test.tsx`
   - `tests/components/MetadataFilterEditor.test.tsx`
   - `tests/features/histories/pages/HistoriesPage.test.tsx`
   - `tests/layouts/MainLayout.test.tsx`
   - `tests/app/App.test.tsx`
   - `tests/features/documents/components/FilePreview/PreviewComponents/ImagePreview.test.tsx`
   - `tests/features/documents/components/FilePreview/PreviewComponents/PdfPreview.test.tsx`
   - `tests/features/documents/components/FilePreview/PreviewComponents/TextPreview.test.tsx`
   - `tests/features/users/pages/PermissionManagementPage.test.tsx`
   - `tests/features/users/components/UserMultiSelect.test.tsx`
   - `tests/features/auth/components/ProtectedRoute.test.tsx`
   - `tests/features/auth/components/AdminRoute.test.tsx`
   - `tests/features/auth/components/RoleRoute.test.tsx`
   - `tests/features/system/SystemMonitorPage.test.tsx`
   - `tests/features/system/SystemToolsPage.test.tsx`
   - `tests/features/chat/ChatAssistantConfig.test.tsx`
   - `tests/features/search/SearchAppConfig.test.tsx`
   - `tests/features/search/SearchPage.test.tsx`
   - `tests/features/chat/ChatPage.test.tsx`
   - `tests/components/RouteProgressBar.test.tsx`

4. Run each re-enabled test individually to verify it passes

### 2.2 Delete tests for deleted/renamed source files
**Action:** Remove the 20 test files whose source modules no longer exist:
- `tests/features/ai/AiChatPage.test.tsx`
- `tests/features/ai/AiSearchPage.test.tsx`
- `tests/features/ai/IframeActionButtons.test.tsx`
- `tests/features/ai/RagflowIframe.comprehensive.test.tsx`
- `tests/features/ai/RagflowIframe.test.tsx`
- `tests/features/ai/useRagflowIframe.test.ts`
- `tests/features/documents/DocumentManagerPage.test.tsx`
- `tests/features/documents/DocumentPermissionModal.test.tsx`
- `tests/features/documents/FilePreviewModal.test.tsx`
- `tests/features/documents/SourcePermissionsModal.test.tsx`
- `tests/features/documents/documentService.test.ts`
- `tests/features/documents/api/documentService.test.ts`
- `tests/features/documents/api/shared-storage.service.test.ts`
- `tests/features/knowledge-base/KnowledgeBaseConfigPage.test.tsx`
- `tests/features/knowledge-base/KnowledgeBaseContext.test.tsx`
- `tests/features/knowledge-base/knowledgeBaseService.test.tsx`
- `tests/features/storage/StoragePage.test.tsx`
- `tests/features/histories/api/historiesService.test.ts`
- `tests/features/prompts/api/promptService.test.ts`
- `tests/features/broadcast/broadcastMessageService.test.tsx`

**Verify:** Confirm each corresponding source file is actually deleted before removing the test. For files that were renamed (not deleted), update imports instead.

### 2.3 Fix remaining excluded tests with import resolution issues
**Files (8):**
- `tests/features/history/api/historyService.test.ts`
- `tests/features/history/pages/ChatHistoryPage.test.tsx`
- `tests/features/history/pages/SearchHistoryPage.test.tsx`
- `tests/features/glossary/useGlossaryKeywords.test.ts`
- `tests/features/glossary/useGlossaryTasks.test.ts`
- `tests/features/teams/hooks/useTeamMembers.test.tsx`
- `tests/features/teams/hooks/useTeams.test.tsx`
- `tests/features/users/useSharedUser.test.tsx`

**Approach:** For each file, check if the source module was moved/renamed — if so, update imports. If source was deleted, delete the test.

---

## Phase 3 — Backend Test Gaps

### 3.1 Add `llm-provider` module tests
**New files to create:**
- `be/tests/llm-provider/llm-provider.service.test.ts`
- `be/tests/llm-provider/llm-provider.schemas.test.ts`
- `be/tests/llm-provider/llm-provider.controller.test.ts`

**Source files to test:**
- `be/src/modules/llm-provider/services/llm-provider.service.ts`
- `be/src/modules/llm-provider/schemas/llm-provider.schemas.ts`
- `be/src/modules/llm-provider/controllers/llm-provider.controller.ts`

**Test scope:**
- Service: CRUD operations for LLM providers (create, list, update, delete, get by ID)
- Service: Factory preset loading from `factory-presets.json`
- Service: Provider validation (API key testing, model listing)
- Schemas: Zod validation for create/update payloads, query params
- Controller: Request handling, input validation, error responses

### 3.2 Install `supertest` and add route integration tests
**Step 1:** Install dependency
```bash
cd be && npm install --save-dev supertest @types/supertest
```

**Step 2:** Create test helper for Express app instantiation
**New file:** `be/tests/helpers/create-test-app.ts`
- Import Express app factory (or create a minimal one with routes mounted)
- Set up middleware (auth mock, tenant mock, validation)
- Export function that returns a supertest agent

**Step 3:** Add route tests for the most critical untested routes (pick 5 highest-traffic):
- `be/tests/chat/chat-conversation.routes.test.ts` — Chat conversation CRUD
- `be/tests/chat/chat-assistant.routes.test.ts` — Chat assistant config
- `be/tests/projects/projects.routes.test.ts` — Project management
- `be/tests/llm-provider/llm-provider.routes.test.ts` — LLM provider endpoints
- `be/tests/users/users.routes.test.ts` — User management

**Each route test should cover:**
- Correct HTTP status codes (200, 201, 400, 401, 403, 404)
- Request body validation (invalid payloads → 400)
- Auth middleware enforcement (missing token → 401)
- RBAC enforcement (wrong role → 403)
- Response shape validation

### 3.3 Raise backend coverage threshold
**File:** `be/vitest.config.ts`

**Change from 50% to 60%** (statements, branches, functions, lines) after adding the above tests. This is an incremental step — raise further as coverage grows.

---

## Phase 4 — Frontend Feature Test Gaps

### 4.1 Add tests for `chat-widget` feature
**New files:**
- `fe/tests/features/chat-widget/chatWidgetApi.test.ts` — Test API calls (mock HTTP)
- `fe/tests/features/chat-widget/ChatWidget.test.tsx` — Test main component render, open/close behavior
- `fe/tests/features/chat-widget/ChatWidgetButton.test.tsx` — Test button click triggers widget open
- `fe/tests/features/chat-widget/ChatWidgetWindow.test.tsx` — Test window render, message sending, streaming

**Source files (5):**
- `fe/src/features/chat-widget/chatWidgetApi.ts`
- `fe/src/features/chat-widget/ChatWidget.tsx`
- `fe/src/features/chat-widget/ChatWidgetButton.tsx`
- `fe/src/features/chat-widget/ChatWidgetWindow.tsx`

### 4.2 Add tests for `search-widget` feature
**New files:**
- `fe/tests/features/search-widget/searchWidgetApi.test.ts` — Test API calls
- `fe/tests/features/search-widget/SearchWidget.test.tsx` — Test main component
- `fe/tests/features/search-widget/SearchWidgetBar.test.tsx` — Test search input, submit behavior
- `fe/tests/features/search-widget/SearchWidgetResults.test.tsx` — Test result rendering, pagination

**Source files (5):**
- `fe/src/features/search-widget/searchWidgetApi.ts`
- `fe/src/features/search-widget/SearchWidget.tsx`
- `fe/src/features/search-widget/SearchWidgetBar.tsx`
- `fe/src/features/search-widget/SearchWidgetResults.tsx`

### 4.3 Add tests for `guideline` feature
**New files:**
- `fe/tests/features/guideline/hooks/useFirstVisit.test.ts` — Test localStorage-based first visit detection
- `fe/tests/features/guideline/hooks/useGuideline.test.ts` — Test guideline loading/state
- `fe/tests/features/guideline/hooks/useGuidedTour.test.ts` — Test tour step progression
- `fe/tests/features/guideline/components/GuidedTour.test.tsx` — Test tour overlay rendering
- `fe/tests/features/guideline/components/GuidelineDialog.test.tsx` — Test dialog open/close/content

**Source files (17):** Hooks (4), components (3), data definitions (10)

### 4.4 Add tests for `landing` feature
**New files:**
- `fe/tests/features/landing/LandingPage.test.tsx` — Test page composition, all sections render
- `fe/tests/features/landing/components/HeroSection.test.tsx` — Test CTA rendering
- `fe/tests/features/landing/components/FeaturesSection.test.tsx` — Test feature cards render

**Source files (9):** Purely presentational — render tests and snapshot tests suffice.

### 4.5 Add tests for high-usage shared components
**Priority components (test the 10 most impactful, currently only 14/77 tested):**

| Component | New test file | What to test |
|-----------|--------------|-------------|
| `ConfirmDialog` | Fix excluded test (Phase 2.1) | Open/close, confirm/cancel callbacks |
| `SettingsDialog` | Fix excluded test (Phase 2.1) | Tab switching, settings persistence |
| `ErrorBoundary` | `tests/components/ErrorBoundary.test.tsx` | Error catching, fallback UI rendering |
| `MarkdownRenderer` | `tests/components/MarkdownRenderer.test.tsx` | Markdown rendering, code blocks, links |
| `EmbedTokenManager` | `tests/components/EmbedTokenManager.test.tsx` | Token create/copy/delete |
| `PermissionsSelector` | `tests/components/PermissionsSelector.test.tsx` | User/team selection, permission levels |
| `MetadataFilterBuilder` | Fix excluded test (Phase 2.1) | Filter add/remove, condition building |
| `Select` | `tests/components/Select.test.tsx` | Open, search, select, multi-select |
| `RadioGroup` | `tests/components/RadioGroup.test.tsx` | Selection, keyboard navigation |
| `OrgSwitcher` | `tests/components/OrgSwitcher.test.tsx` | Org listing, switch action |

---

## Phase 5 — Python advance-rag Test Gaps

### 5.1 Add tests for LLM integration modules (4,925 LOC, 0 tests)
**New files:**
- `advance-rag/tests/test_chat_model.py` — Test chat completion wrappers
- `advance-rag/tests/test_embedding_model.py` — Test embedding generation
- `advance-rag/tests/test_rerank_model.py` — Test reranking logic

**Approach:** Mock actual API calls (OpenAI, Azure, Ollama). Test:
- Provider selection logic (which client to instantiate)
- Request construction (prompt formatting, token counting)
- Response parsing (streaming vs non-streaming)
- Error handling (rate limits, timeouts, invalid responses)
- Model-specific parameter mapping

**Source files:**
- `advance-rag/rag/llm/chat_model.py` (1,719 LOC — highest priority)
- `advance-rag/rag/llm/embedding_model.py` (508 LOC)
- `advance-rag/rag/llm/rerank_model.py` (293 LOC)

### 5.2 Add tests for GraphRAG modules (5,568 LOC, 0 tests)
**New files:**
- `advance-rag/tests/test_graphrag_utils.py` — Test graph utility functions (1,063 LOC of utils)
- `advance-rag/tests/test_graphrag_entity_resolution.py` — Test entity dedup/merging
- `advance-rag/tests/test_graphrag_search.py` — Test graph search queries
- `advance-rag/tests/test_graphrag_extractor.py` — Test entity/relation extraction
- `advance-rag/tests/test_graphrag_index.py` — Test graph indexing pipeline

**Approach:** Mock LLM calls and graph database operations. Test:
- Entity extraction from text chunks
- Relation extraction and linking
- Entity resolution (deduplication)
- Community detection (Leiden algorithm wrapper)
- Graph search traversal and result ranking
- Mind map extraction

**Source files (priority order):**
1. `rag/graphrag/utils.py` (1,063 LOC)
2. `rag/graphrag/general/index.py` (546 LOC)
3. `rag/graphrag/general/extractor.py` (500 LOC)
4. `rag/graphrag/search.py` (491 LOC)
5. `rag/graphrag/entity_resolution.py` (417 LOC)

### 5.3 Add tests for Vision/OCR modules (4,133 LOC, 0 tests)
**New files:**
- `advance-rag/tests/test_vision_ocr.py` — Test OCR text extraction
- `advance-rag/tests/test_vision_layout.py` — Test layout recognition
- `advance-rag/tests/test_vision_table.py` — Test table structure recognition
- `advance-rag/tests/test_vision_operators.py` — Test image preprocessing operators

**Approach:** Mock ONNX/model inference. Test:
- Image preprocessing pipelines
- Bounding box post-processing
- OCR text extraction and ordering
- Table cell detection and grid reconstruction
- Layout classification (text, table, figure, title regions)

**Source files (priority order):**
1. `deepdoc/vision/ocr.py` (825 LOC)
2. `deepdoc/vision/operators.py` (763 LOC)
3. `deepdoc/vision/table_structure_recognizer.py` (633 LOC)
4. `deepdoc/vision/layout_recognizer.py` (487 LOC)

### 5.4 Add tests for storage/connector utilities (7,430 LOC, 0 tests)
**New files:**
- `advance-rag/tests/test_opensearch_conn.py` — Test OpenSearch operations
- `advance-rag/tests/test_redis_conn.py` — Test Redis caching/pub-sub
- `advance-rag/tests/test_minio_conn.py` — Test MinIO/S3 operations
- `advance-rag/tests/test_es_conn.py` — Test Elasticsearch operations

**Approach:** Mock actual connections. Test:
- Connection initialization and config parsing
- Index creation/deletion
- Document indexing and search queries
- Bulk operations and error handling
- Connection pooling behavior

**Source files (priority order):**
1. `rag/utils/ob_conn.py` (1,709 LOC)
2. `rag/utils/infinity_conn.py` (912 LOC)
3. `rag/utils/opensearch_conn.py` (756 LOC)
4. `rag/utils/redis_conn.py` (684 LOC)
5. `rag/utils/es_conn.py` (638 LOC)

---

## Phase 6 — Python converter Test Gaps

### 6.1 Add unit tests for individual converters
**New files:**
- `converter/tests/test_word_converter.py` — Test Word-to-PDF conversion logic
- `converter/tests/test_powerpoint_converter.py` — Test PPT-to-PDF conversion logic
- `converter/tests/test_excel_converter.py` — Test Excel-to-PDF conversion logic

**Source files:**
- `converter/src/word_converter.py` (106 LOC)
- `converter/src/powerpoint_converter.py` (107 LOC)
- `converter/src/excel_converter.py` (486 LOC)

**Approach:** Mock `subprocess.run` (LibreOffice calls) and file I/O. Test:
- Correct LibreOffice CLI arguments constructed for each file type
- Temp directory management (created/cleaned)
- Output file renaming and path handling
- Error handling for corrupt files, missing LibreOffice, conversion failures
- Excel-specific: orientation, page size, column width calculations

---

## Phase 7 — E2E Test Expansion

### 7.1 Expand Playwright E2E tests
**New files:**
- `fe/e2e/auth/login-logout.spec.ts` — Test login flow, session persistence, logout
- `fe/e2e/auth/role-access.spec.ts` — Test admin vs user access to routes
- `fe/e2e/projects/project-crud.spec.ts` — Test project create/edit/delete
- `fe/e2e/llm-provider/llm-provider-config.spec.ts` — Test LLM provider setup
- `fe/e2e/users/user-management.spec.ts` — Test user invite/role change/delete

**Approach:**
- Reuse existing auth setup (persistent storageState)
- Each test is self-contained (creates its own data, cleans up after)
- Use Playwright's `expect` for assertions
- Keep sequential execution (1 worker) to avoid DB conflicts

### 7.2 Add backend E2E/integration tests with real services
**File:** `be/tests/e2e/api.test.ts` (enhance existing)

**Install supertest:**
```bash
cd be && npm install --save-dev supertest @types/supertest
```

**New E2E tests:**
- Health check (already exists)
- Authentication flow (login → token → authenticated request)
- CRUD lifecycle (create → read → update → delete)
- Error handling (404, validation errors, unauthorized)

---

## Phase 8 — Ongoing Quality Gates

### 8.1 Progressive threshold increases
**Schedule (after each phase completes):**

| Milestone | FE threshold | BE threshold |
|-----------|-------------|-------------|
| After Phase 2 | 15% | 50% (unchanged) |
| After Phase 3 | 20% | 60% |
| After Phase 4 | 30% | 60% |
| After Phase 7 | 40% | 65% |
| Long-term target | 60% | 75% |

### 8.2 Add coverage reporting to CI
**File:** `.github/workflows/buid-ci.yml`

Add after test steps:
```yaml
- name: Backend coverage
  working-directory: be
  run: npx vitest run --coverage
- name: Frontend coverage
  working-directory: fe
  run: npx vitest run --coverage
- name: Upload coverage artifacts
  uses: actions/upload-artifact@v4
  with:
    name: coverage-reports
    path: |
      be/coverage/
      fe/coverage/
```

---

## Execution Order & Dependencies

```
Phase 1 (CI + infra)          ← Do first, unblocks everything
  ├── 1.1 Enable CI tests
  ├── 1.2 Add pytest config
  └── 1.3 Raise FE thresholds (to 30%)
       │
Phase 2 (Fix broken FE tests) ← Do second, highest ROI
  ├── 2.1 Fix lucide-react mock (re-enables 23 tests)
  ├── 2.2 Delete orphaned tests (removes 20 dead files)
  └── 2.3 Fix import resolution (fixes 8 tests)
       │
Phase 3 (BE gaps)              ← Can run parallel with Phase 4
  ├── 3.1 llm-provider tests
  ├── 3.2 supertest + route tests
  └── 3.3 Raise BE threshold (to 60%)
       │
Phase 4 (FE feature gaps)      ← Can run parallel with Phase 3
  ├── 4.1 chat-widget tests
  ├── 4.2 search-widget tests
  ├── 4.3 guideline tests
  ├── 4.4 landing tests
  └── 4.5 shared component tests
       │
Phase 5 (Python advance-rag)   ← Can run parallel with Phase 6
  ├── 5.1 LLM integration tests
  ├── 5.2 GraphRAG tests
  ├── 5.3 Vision/OCR tests
  └── 5.4 Storage connector tests
       │
Phase 6 (Python converter)     ← Can run parallel with Phase 5
  └── 6.1 Individual converter tests
       │
Phase 7 (E2E expansion)        ← Do after unit tests stabilize
  ├── 7.1 Playwright E2E expansion
  └── 7.2 Backend E2E with supertest
       │
Phase 8 (Quality gates)        ← Ongoing after each phase
  ├── 8.1 Progressive threshold increases
  └── 8.2 Coverage reporting in CI
```

## Estimated New Test Files

| Phase | New/Fixed test files | Lines of test code (est.) |
|-------|---------------------|--------------------------|
| Phase 1 | 3 config files modified | ~50 |
| Phase 2 | 23 re-enabled, 20 deleted, 8 fixed | ~0 net new (recovery) |
| Phase 3 | 8 new test files | ~2,000 |
| Phase 4 | 17 new test files | ~3,500 |
| Phase 5 | 12 new test files | ~4,000 |
| Phase 6 | 3 new test files | ~800 |
| Phase 7 | 7 new test files | ~1,500 |
| **Total** | **~47 new + 23 recovered** | **~11,850 new LOC** |
