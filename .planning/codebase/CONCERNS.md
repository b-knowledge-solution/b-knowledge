# Codebase Concerns

**Analysis Date:** 2026-04-07

## Tech Debt

**Cross-language constants drift:**
- Issue: Shared string values (factory names, Redis keys, worker statuses) are duplicated between TypeScript and Python and must be hand-kept in sync.
- Files: `be/src/shared/constants/embedding.ts`, `advance-rag/embed_constants.py`
- Impact: Silent breakage of embedding pipeline if one side changes a key (e.g. `embed:worker:status`) or factory name (`SentenceTransformers`) — backend will read stale/missing Redis keys; worker may publish under the wrong channel; "0 embeddings" without errors.
- Fix approach: Enforce CI check that diffs both files; require comment cross-references on every constant (`// Must match advance-rag/embed_constants.py` and vice versa); consider generating one file from the other.

**Peewee tables managed via Knex migrations:**
- Issue: Tables `document`, `knowledgebase`, `task`, `file`, `tenant_llm`, etc. are read/written by Python (Peewee ORM) but their schema is owned by Knex migrations in the backend.
- Files: `be/src/shared/db/migrations/*.ts`, `advance-rag/api/db/db_models.py` (Peewee models)
- Impact: A Knex migration that renames/removes a column will silently break Python workers at runtime (no compile-time check). Peewee model definitions can drift from actual schema.
- Fix approach: After every migration touching a Peewee-managed table, manually update the corresponding Peewee model and add a smoke-test that boots the worker against the migrated schema. NEVER use Peewee migrators (CLAUDE.md rule).

**Upstream RAGFlow merge gotcha — index prefix rename:**
- Issue: Upstream RAGFlow uses `ragflow_<uid>` as the OpenSearch/Elasticsearch index name; this fork uses `knowledge_<uid>`. Each upstream merge risks reintroducing the original prefix.
- Files: `advance-rag/rag/nlp/search.py` (`def index_name`), plus references in `advance-rag/db/runtime_config.py`, `advance-rag/common/versions.py`, `advance-rag/common/crypto_utils.py`, `advance-rag/api/utils/crypt.py`, both `advance-rag/Dockerfile*`
- Impact: Frontend shows "0 chunks found" because backend queries `knowledge_*` indices while worker writes to `ragflow_*`. Failure is silent — no exception, just empty results.
- Fix approach: Add a pre-commit/grep CI check: `rg "ragflow_" advance-rag/ --type py` must return zero matches in code paths (allowed only in version/license strings). Document in `advance-rag/CLAUDE.md`.

## Known Bugs

**TODO/FIXME density:**
- 33 TODO/FIXME/HACK comments across 19 files (TypeScript + Python).
- Hot spots:
  - `advance-rag/rag/app/resume.py` — 7 TODOs (resume parser shortcuts)
  - `advance-rag/common/data_source/confluence_connector.py` — 4 TODOs
  - `advance-rag/common/data_source/google_drive/connector.py` — 3 TODOs
  - `be/src/modules/search/controllers/search-openai.controller.ts` — 2 TODOs
  - `be/src/modules/chat/controllers/chat-openai.controller.ts` — 2 TODOs
- Risk: Connector TODOs likely indicate partial implementations of Confluence/Google Drive ingestion that may silently drop content.
- Action: Audit each TODO; convert to tracked issues.

## Security Considerations

**Default secrets in `.env.example` files:**
- Files: `docker/.env.example`, `be/.env.example`, `fe/.env.example`, `advance-rag/.env.example`, `evaluations/rag/.env.example`
- Risk: Operators copying `.env.example` to `.env` without rotating defaults (DB passwords, `SESSION_SECRET`, OpenSearch admin credentials, RustFS root keys).
- Current mitigation: CLAUDE.md production checklist mentions rotating defaults.
- Recommendations: Backend should refuse to boot in `NODE_ENV=production` if `SESSION_SECRET`, DB password, or RustFS keys equal known defaults. Add `scripts/check-env.mjs` precheck.

**Local-login enablement:**
- Risk: `ENABLE_LOCAL_LOGIN=true` may ship to production by mistake.
- Recommendation: Default to `false` in production builds; emit a startup warning if enabled.

**Secret files never to read:** `.env`, `*.env`, `certs/`, `keys/` — only `.env.example` files were referenced for this audit.

## Layering Violations to Watch For

**Controller → Model bypass:**
- Current state: Grep across `be/src/modules/**/controllers/*.ts` for `ModelFactory` returned **zero** matches — controllers are clean.
- Risk: Future contributors adding `ModelFactory.x.find(...)` calls in controllers. Frequent code-review hot spot.
- Fix approach: Add ESLint `no-restricted-imports` rule banning `@/shared/models` and `ModelFactory` symbol from `**/controllers/**`.

**Service → DB bypass:**
- Current state: Grep across `be/src/modules/**/services/*.ts` for `db(`, `db.raw`, `db.transaction` returned **zero** matches — services are clean.
- Risk: Inline `db('table')` queries appearing in services bypass model encapsulation.
- Fix approach: ESLint `no-restricted-imports` rule banning `@/shared/db/knex` from `**/services/**`.

## Hardcoded String-Literal Violations

- Risk area: New code introducing bare strings for statuses, factory names, model types, Redis keys (CLAUDE.md mandatory rule).
- Especially likely in: `embedding-stream.service.ts`, `embedding_worker.py`, controllers handling provider/model selection.
- Fix approach: Lint rule (`no-restricted-syntax`) flagging string literals in `===`/`switch case` for known status enums. For Python, add a `ruff` custom check or pre-commit grep targeting comparisons against known sentinel strings.

## Docker Offline vs Online Build Divergence

- Files: `be/Dockerfile` vs `be/Dockerfile.offline`, `advance-rag/Dockerfile` vs `advance-rag/Dockerfile.offline`, `converter/Dockerfile.offline`, `fe/Dockerfile.offline`, `docker/Dockerfile.demo` vs `docker/Dockerfile.demo.offline`
- Risk: Two parallel Dockerfile sets per service. A dependency added to the online image but forgotten in offline image causes air-gapped/Nexus-mirrored builds to fail or to ship missing modules.
- Current mitigation: Demo entrypoint and Nexus env example exist (`docker/demo-entrypoint.sh`, `docker/nexus.env.example`).
- Fix approach: Add a CI matrix that builds both variants on PRs touching `**/Dockerfile*`. Consider extracting common base layers into a shared `Dockerfile.base`.

## Performance Bottlenecks

**Large/complex functions (manual scan; code-review-graph MCP not available in this environment):**
- Suspected hot spots based on connector TODOs and parser size:
  - `advance-rag/rag/app/resume.py` — large parser, 7 TODOs
  - `advance-rag/rag/graphrag/general/graph_extractor.py`, `mind_map_extractor.py`
  - `advance-rag/deepdoc/parser/paddleocr_parser.py`
  - `be/src/shared/services/embedding-stream.service.ts`
- Action: Run `find_large_functions` from `code-review-graph` MCP when available; refactor anything >150 lines.

## Fragile Areas

**Embedding pipeline (BE ↔ Worker via Redis):**
- Files: `be/src/shared/services/embedding-stream.service.ts`, `be/src/shared/constants/embedding.ts`, `advance-rag/embedding_worker.py`, `advance-rag/embed_constants.py`, `advance-rag/local_embedding_utils.py`
- Why fragile: Couples three things that must move in lockstep — Redis key names, status enum values, factory names. No schema validation across the wire.
- Safe modification: Always change both constants files in the same commit; run `advance-rag/tests/test_embedding_registry.py` and `tests/test_local_embedding_utils.py`.
- Test coverage: Limited integration tests for the BE↔worker handshake.

**System history module (recently modified):**
- Files: `be/src/modules/system/controllers/system-history.controller.ts`, `services/system-history.service.ts`, `models/system-history.model.ts`, `routes/system-history.routes.ts`
- Why fragile: Fresh code in working tree; cross-cutting with audit/admin features.
- Action: Ensure new history queries use indexed columns from `20260402130000_add_missing_indexes_for_crud_and_fk_lookups.ts`.

## Migration Ordering Risks

- Files: 9 migrations under `be/src/shared/db/migrations/`, timestamps span 2026-03-12 to 2026-04-03.
- Notable sequence:
  - `20260402000000_rename_projects_to_knowledge_base.ts` — table rename
  - `20260402110000_add_performance_indexes_for_history_and_analytics.ts`
  - `20260402130000_add_missing_indexes_for_crud_and_fk_lookups.ts`
  - `20260403000000_add_is_system_to_model_providers.ts`
- Risk: Branch-merge collisions producing two migrations with the same timestamp; rollback of `rename_projects_to_knowledge_base` is tricky if downstream migrations reference the new name. Peewee models in `advance-rag` referencing `projects` will break post-rename — verify Python side updated.
- Fix approach: Enforce strictly increasing timestamps via pre-commit hook; require all renames to be paired with a Peewee model update PR.

## Test Coverage Gaps

**Areas with limited or no automated tests:**
- BE controllers — most modules lack controller-level tests.
- Embedding worker integration — only registry/utils unit tests visible (`advance-rag/tests/test_embedding_registry.py`, `test_local_embedding_utils.py`).
- Converter service — no visible test directory.
- FE — TanStack Query hooks and i18n string completeness across `en`/`vi`/`ja` are not regression-tested.
- Docker demo build — no smoke test that the all-in-one image actually starts.
- Evaluations RAG harness (`evaluations/rag/`) — fixture-based, not part of CI gating.
- Risk: Silent regressions in connectors, embedding handshake, and migrations affecting Peewee tables.
- Priority: High — embedding handshake and migration→Peewee compatibility tests.

## Dependencies at Risk

**LibreOffice (converter):**
- Risk: Heavy native dependency; offline image must bundle LibreOffice + fonts. Version drift between online/offline builds.
- Files: `converter/Dockerfile.offline`, `docker/Dockerfile.demo.offline`

**OpenSearch 3.5.0:**
- Risk: Major version; index mappings tied to `knowledge_` prefix. Upgrade requires reindex.

**RustFS (S3-compatible):**
- Risk: Less mature than MinIO; ensure root keys rotated in production.

## Missing Critical Features

**Schema-sync verification between Knex and Peewee:**
- Problem: No automated check that Peewee models reflect current Knex schema.
- Blocks: Safe upstream RAGFlow merges and refactors of shared tables.

**Constants drift CI check (TS ↔ Python):**
- Problem: No automation enforcing the cross-reference comments mandated by CLAUDE.md.

---

*Concerns audit: 2026-04-07*
