# Codebase Concerns

**Analysis Date:** 2026-03-23

## Tech Debt

**No Custom Error Classes:**
- Issue: The backend has no custom error classes. Instead, errors get `statusCode` set via `(error as any).statusCode = 404` -- a type-unsafe workaround repeated 12 times across agent and other services.
- Files: `be/src/modules/agents/services/agent-embed.service.ts`, `be/src/modules/agents/services/agent.service.ts`
- Impact: No typed error handling; controllers cannot pattern-match on error types. The global error handler in `be/src/app/routes.ts:272` only returns a generic 500 for anything it catches.
- Fix approach: Create `be/src/shared/errors/` with `NotFoundError`, `ConflictError`, `UnauthorizedError` etc. extending a base `AppError`. Update the global error handler to map these to proper HTTP status codes.

**Pervasive `catch (error: any)` Pattern:**
- Issue: 93 occurrences of `catch (error: any)` in backend code bypass TypeScript strict mode.
- Files: Throughout `be/src/modules/agents/controllers/`, `be/src/modules/chat/controllers/`, and most other controllers.
- Impact: Loses type safety in error handling paths. Hides potential issues where error might not be an Error instance.
- Fix approach: Use `catch (error: unknown)` with `instanceof Error` guards, or use the custom error classes recommended above.

**`as any` Type Assertions:**
- Issue: 97 `as any` casts in backend (excluding `catch` blocks), 15 in frontend. Includes unsafe session access (`(req.session as any)?.user?.id`) in agent controllers.
- Files: `be/src/modules/agents/controllers/agent-debug.controller.ts:32,59,79`, `be/src/modules/agents/services/agent-debug.service.ts:99`, `be/src/modules/agents/services/agent.service.ts:66,241`
- Impact: Defeats TypeScript's type checking at critical authentication and data access points.
- Fix approach: Extend Express session type definitions in `be/src/shared/types/express.d.ts` to include `user` property. Replace `as any` with proper type narrowing.

**Dead Code -- RAGFlow Client Service:**
- Issue: `be/src/shared/services/ragflow-client.service.ts` exports `ragflowClient` singleton but no file imports it. It also reads `process.env` directly (violating the config convention).
- Files: `be/src/shared/services/ragflow-client.service.ts`
- Impact: Dead code that reads env vars at module load time. Confusing for developers.
- Fix approach: Delete the file. If RAGFlow integration is needed later, rebuild it using the `config` object.

**Legacy `ragflow_` Column References:**
- Issue: Multiple schema fields and service methods reference `ragflow_dataset_id`, `ragflow_dataset_name`, `ragflow_dataset_ids`, `ragflow_doc_id` -- legacy naming from the RAGFlow migration.
- Files: `be/src/modules/projects/schemas/projects.schemas.ts:150-196`, `be/src/modules/projects/services/project-category.service.ts:138-139`, `be/src/modules/projects/services/project-chat.service.ts:44,66`, `be/src/modules/projects/services/project-search.service.ts:45,67`, `be/src/modules/rag/models/document-version-file.model.ts:31,41`, `be/src/modules/rag/schemas/rag.schemas.ts:80-81`
- Impact: Confusing naming that no longer reflects the system's architecture. Makes onboarding harder.
- Fix approach: Rename columns via a migration to remove the `ragflow_` prefix. Update all references. This is a coordinated change across BE, FE, and potentially advance-rag.

**Oversized Files:**
- Issue: Several files exceed reasonable complexity thresholds.
- Files:
  - `be/src/modules/rag/controllers/rag.controller.ts` (1759 lines) -- should be split into sub-controllers
  - `be/src/modules/chat/services/chat-conversation.service.ts` (1342 lines) -- mixes conversation CRUD with RAG pipeline orchestration
  - `be/src/shared/models/types.ts` (1480 lines) -- monolithic type definitions
  - `be/src/shared/models/factory.ts` (736 lines) -- centralized singleton registering all models
  - `advance-rag/rag/app/resume.py` (2743 lines) -- massive resume parser
  - `advance-rag/rag/agent/node_executor.py` (2000 lines)
  - `advance-rag/deepdoc/parser/pdf_parser.py` (1897 lines)
  - `advance-rag/rag/svr/task_executor.py` (1806 lines)
- Impact: Hard to test, hard to review, high merge conflict risk. Adding new models requires modifying the centralized `factory.ts`.
- Fix approach: Extract sub-controllers (e.g., `rag-dataset.controller.ts`, `rag-document.controller.ts`). Split `chat-conversation.service.ts` into CRUD vs pipeline services.

**`process.env` Access Outside Config:**
- Issue: Several files read `process.env` directly, violating the established convention of using the `config` object.
- Files: `be/src/shared/services/ragflow-client.service.ts:14,17`, `be/src/shared/services/crypto.service.ts:66`, `be/src/shared/services/logger.service.ts:81`, `be/src/shared/services/queue.service.ts:68`, `be/src/shared/db/migrations/20260312000000_initial_schema.ts:459,935`
- Impact: Environment configuration is scattered, making it hard to audit what env vars the app needs.
- Fix approach: Route all env access through `be/src/shared/config/index.ts`. Add missing variables to the config object.

**Shared Database Without Schema Coordination:**
- Issue: Backend manages migrations via Knex. RAG Worker uses Peewee models that must match the Knex schema. No automated validation that Peewee models stay in sync with Knex migrations.
- Files: `be/src/shared/db/migrations/`, `advance-rag/db/db_models.py`
- Impact: Migration changes in BE can silently break RAG Worker.
- Fix approach: Add a CI check that validates Peewee model definitions against the current Knex schema.

**Missing Python Lock File:**
- Issue: Both Python workspaces use `pyproject.toml` without a lock file (no `requirements.lock` or `poetry.lock`).
- Files: `advance-rag/pyproject.toml`, `converter/pyproject.toml`
- Impact: Non-deterministic builds. 108+ dependencies in advance-rag without pinning.
- Fix approach: Add `uv.lock` or use `pip-compile` to generate `requirements.txt`.

## Security Concerns

**Multi-Tenant Isolation Gap in Embed/OpenAI Endpoints:**
- Risk: Five TODO comments marked `TODO(ACCS)` indicate that embed and OpenAI-compatible endpoints do not resolve tenant from the embed token. In a multi-tenant deployment, this could allow cross-tenant data access.
- Files: `be/src/modules/chat/controllers/chat-embed.controller.ts:228`, `be/src/modules/chat/controllers/chat-openai.controller.ts:100,126`, `be/src/modules/search/controllers/search-embed.controller.ts:175`, `be/src/modules/search/controllers/search-openai.controller.ts:90,99`
- Current mitigation: Single-tenant deployments are unaffected. The embed token validates the resource exists but does not enforce tenant boundaries.
- Recommendations: Implement tenant resolution from embed tokens before enabling multi-tenant mode in production.

**No CSRF Protection on Mutation Endpoints:**
- Risk: The backend uses session-based auth with cookies but has no CSRF token validation on POST/PUT/DELETE endpoints. Only OAuth login flow has CSRF state validation.
- Files: `be/src/app/routes.ts` (no CSRF middleware registered), `be/src/shared/middleware/` (no CSRF middleware file)
- Current mitigation: CORS is configured with specific origins. SameSite cookie attribute provides partial protection.
- Recommendations: Add CSRF tokens for session-based mutation endpoints, or ensure SameSite=Strict is set on all session cookies.

**Rate Limiting Uses In-Memory Store:**
- Risk: Rate limiting in `be/src/app/routes.ts:60-71` uses the default in-memory store, which resets on restart and does not work across multiple backend instances.
- Files: `be/src/app/routes.ts:60-75`
- Current mitigation: Single-instance deployment. Auth endpoints have a stricter 20/15min limit.
- Recommendations: Use a Redis-backed rate limit store (`rate-limit-redis`) for production multi-instance deployments.

**Default Docker Credentials:**
- Risk: `docker-compose-base.yml` uses default passwords (e.g., `change_me_in_production`).
- Current mitigation: Production checklist in CLAUDE.md mentions changing them.
- Recommendations: Fail-safe: add a startup check that rejects default passwords in production mode.

**HTTPS Silent Fallback:**
- Risk: If SSL cert files are missing, server silently falls back to HTTP with no warning to operators.
- Files: `be/src/app/index.ts`
- Recommendations: Log a prominent warning when HTTPS is enabled but cert files are missing.

## Performance Risks

**Dashboard Service Uses Raw SQL with String Interpolation:**
- Problem: `getDailyCount` interpolates `dateCol` directly into `db.raw()` template strings. While `dateCol` is currently hardcoded at call sites (not user input), this pattern is fragile and could become a SQL injection vector if refactored carelessly.
- Files: `be/src/modules/dashboard/dashboard.service.ts:218,220`
- Cause: Knex `db.raw()` with template literals instead of parameterized placeholders.
- Improvement path: Use Knex's parameterized raw queries: `db.raw('date_trunc(?, ??)::date', ['day', dateCol])`.

**Large Python Files Imply Complex Processing:**
- Problem: Resume parser (2743 lines), task executor (1806 lines), and PDF parser (1897 lines) are monolithic and likely perform heavy computation in single threads.
- Files: `advance-rag/rag/app/resume.py`, `advance-rag/rag/svr/task_executor.py`, `advance-rag/deepdoc/parser/pdf_parser.py`
- Improvement path: Break into smaller modules. Consider async processing for CPU-bound parsing tasks.

**Heavy Python Dependencies:**
- Problem: 108 packages in `advance-rag/pyproject.toml` including ML frameworks (transformers, numpy, etc.). Requires system packages: `poppler-utils`, `tesseract-ocr`, JRE (Tika). Build times are slow.
- Impact: Docker builds take a long time. Dev environment setup is complex on non-Linux systems.
- Improvement path: Split optional dependencies into extras (e.g., `[ocr]`, `[ml]`). Use multi-stage Docker builds with cached layers.

## Architectural Concerns

**Cross-Module Import Violations (Backend):**
- Issue: Multiple modules import directly from other modules' internal files instead of through barrel exports (`index.ts`). The `chat` module has 7 deep imports from `rag` internals. `search`, `external`, and `sync` also import `rag` services directly.
- Files:
  - `be/src/modules/chat/services/chat-conversation.service.ts` -> 7 deep imports from `rag` services
  - `be/src/modules/external/services/external-api.service.ts` -> 3 deep imports from `rag`
  - `be/src/modules/search/services/search.service.ts` -> 3 deep imports from `rag`
  - `be/src/modules/sync/services/sync-worker.service.ts` -> 3 deep imports from `rag`
  - Various modules importing from `audit`, `teams`, `users` internals
- Impact: Tight coupling between modules. Changes to `rag` internal structure break `chat`, `search`, `external`, and `sync`. Violates the NX-style boundary rules documented in `CLAUDE.md`.
- Fix approach: Export needed services through `be/src/modules/rag/index.ts` barrel. Refactor consumers to import from barrel only.

**Cross-Feature Import Violations (Frontend):**
- Issue: 35+ cross-feature imports detected. The `users` feature imports from `auth` 9 times. `projects` imports from `teams`, `users`, `auth`, `system`, and `datasets`.
- Files: `fe/src/features/users/` -> `fe/src/features/auth/`, `fe/src/features/projects/` -> multiple other features
- Impact: Circular dependency risk. Makes features non-portable.
- Fix approach: Extract shared types/hooks (e.g., `useAuth`, `User` type) into `fe/src/hooks/` or `fe/src/lib/`. Features should only import from shared code, never from each other.

**Chat Module Tightly Coupled to RAG:**
- Issue: `chat-conversation.service.ts` directly imports and orchestrates 6 different RAG services (search, rerank, citation, SQL, graphrag, deep-research). This makes the chat module effectively a monolithic RAG pipeline controller.
- Files: `be/src/modules/chat/services/chat-conversation.service.ts:24-30`
- Impact: Cannot modify RAG pipeline without touching chat. Cannot test chat logic in isolation.
- Fix approach: Create a `rag-pipeline.service.ts` facade in the `rag` module that the `chat` module calls through the barrel export.

## Dependency Risks

**`react-pdf-highlighter` at RC Version:**
- Risk: Using `^8.0.0-rc.0` -- a release candidate, not a stable version. May have breaking changes before GA.
- Files: `fe/package.json:69`
- Impact: Potential breakage on npm update. RC APIs may change.
- Migration plan: Pin to exact version until stable 8.x release, then upgrade.

**`xlsx` Package (SheetJS) License Concern:**
- Risk: `xlsx@0.18.5` is the last version under the Apache-2.0 license. Later versions moved to a proprietary license. The `^0.18.5` range cap means npm will never install a breaking version, but it also means no security patches.
- Files: `fe/package.json:79`
- Impact: No future security updates. Potential license compliance issues if accidentally upgraded.
- Migration plan: Consider switching to `exceljs` (MIT) or `sheetjs-ce` (community edition) if xlsx functionality is critical.

**`@types/socket.io` is Deprecated:**
- Risk: `@types/socket.io@^3.0.1` is for Socket.IO v3, but the project uses `socket.io@^4.8.3`. Socket.IO v4 bundles its own types.
- Files: `be/package.json:36`
- Impact: Type definitions may not match actual API. Could cause silent type errors.
- Migration plan: Remove `@types/socket.io` from dependencies entirely. Socket.IO 4.x ships its own TypeScript types.

**`@types` Packages in Production Dependencies:**
- Risk: `@types/dockerode` and `@types/socket.io` are in BE `dependencies` (not `devDependencies`). `@types/dompurify` and `@types/papaparse` are in FE `dependencies`.
- Files: `be/package.json:35-36`, `fe/package.json:44-45`
- Impact: Bloats production Docker images.
- Fix approach: Move all `@types/*` packages to `devDependencies`.

## Operational Concerns

**Console.log in Frontend Production Code:**
- Issue: 74 `console.log/warn/error` calls in frontend source files, including debug logging in auth flow, API client, file preview, and navigation.
- Files: `fe/src/features/auth/hooks/useAuth.tsx:172,179,192,230`, `fe/src/lib/api.ts:42`, `fe/src/components/FilePreview/FilePreviewModal.tsx:58`, `fe/src/components/NavigationLoader.tsx:105`
- Impact: Noisy browser console in production. Auth flow details visible to end users via DevTools.
- Fix approach: Replace with a conditional logger that only outputs in development, or remove debug statements entirely.

**No Dedicated Error Tracking Service:**
- Issue: Backend uses Winston for logging and Langfuse for LLM tracing, but there is no dedicated error tracking service (Sentry, Bugsnag, etc.).
- Files: `be/src/shared/services/logger.service.ts` (Winston), `be/src/shared/services/langfuse.service.ts` (LLM tracing only)
- Impact: Production errors are only visible in log files. No alerting, no error grouping, no stack trace aggregation.
- Fix approach: Integrate Sentry or similar service for both backend and frontend error tracking.

**Global Error Handler Returns Generic 500:**
- Issue: The Express error handler at `be/src/app/routes.ts:272` always returns `{ error: 'Internal server error' }` with status 500, regardless of error type.
- Files: `be/src/app/routes.ts:272-275`
- Impact: Clients receive no useful error information. No distinction between validation errors, not-found errors, and actual server failures.
- Fix approach: Implement error-type-aware handler that maps `AppError` subclasses to appropriate HTTP status codes and messages.

**Feature Flag Proliferation:**
- Issue: Frontend uses `VITE_ENABLE_*` flags for feature toggling with no centralized management -- just env vars.
- Files: `fe/src/config.ts`
- Impact: As features grow, managing per-environment flags becomes error-prone.
- Fix approach: Consider a structured feature flag configuration (centralized config object with defaults and documentation).

## Test Coverage Gaps

**Frontend Features Without Tests:**
- What's not tested: `agent-widget` and `histories` features have zero unit or e2e tests.
- Files: `fe/src/features/agent-widget/`, `fe/src/features/histories/`
- Risk: Regressions in widget embedding and history browsing go undetected.
- Priority: Medium

**Test Directory Naming Mismatch:**
- What's wrong: Frontend agent tests live in `fe/tests/features/agent/` (singular) while the source feature is `fe/src/features/agents/` (plural). Similarly, BE tests are in `be/tests/agent/` while the module is `be/src/modules/agents/`.
- Files: `fe/tests/features/agent/`, `be/tests/agent/`
- Risk: Confusion when navigating between source and tests.
- Priority: Low

**Advance-RAG Test Coverage for Complex Parsers:**
- What's not tested adequately: The largest and most complex files (`resume.py` at 2743 lines, `pdf_parser.py` at 1897 lines, `task_executor.py` at 1806 lines) are unlikely to have proportional test coverage.
- Files: `advance-rag/rag/app/resume.py`, `advance-rag/deepdoc/parser/pdf_parser.py`, `advance-rag/rag/svr/task_executor.py`
- Risk: Parser bugs affect document processing quality -- the core value proposition of the product.
- Priority: High

## Open TODOs in Codebase

| Location | TODO | Impact |
|----------|------|--------|
| `be/src/modules/chat/controllers/chat-embed.controller.ts:228` | Resolve tenant from embed token (ACCS) | Multi-tenant security |
| `be/src/modules/chat/controllers/chat-openai.controller.ts:100,126` | Resolve tenant from embed token (ACCS) | Multi-tenant security |
| `be/src/modules/search/controllers/search-embed.controller.ts:175` | Resolve tenant from embed token (ACCS) | Multi-tenant security |
| `be/src/modules/search/controllers/search-openai.controller.ts:90,99` | Resolve tenant from embed token (ACCS) | Multi-tenant security |
| `fe/src/features/projects/pages/ProjectListPage.tsx:159` | Sync config via separate API call | Feature incomplete |
| `advance-rag/rag/app/book.py:107` | Table of contents removal | Parser quality |
| `advance-rag/rag/graphrag/general/graph_extractor.py:101` | Streamline construction | Code quality |
| `advance-rag/rag/graphrag/general/mind_map_extractor.py:83` | Streamline construction | Code quality |
| `advance-rag/rag/nlp/search.py:125` | Nullable column handling | Data integrity |
| `advance-rag/deepdoc/parser/paddleocr_parser.py:230` | Check URL availability/token validity | Reliability |

---

*Concerns audit: 2026-03-23*
