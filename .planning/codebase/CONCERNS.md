# Technical Concerns

## High Priority

### No Python Tests
- **advance-rag** has 108 dependencies, 15 parsers, complex ML pipeline — zero test coverage
- **converter** has critical file conversion logic — zero test coverage
- Risk: Regressions in document parsing or conversion go undetected
- Impact: Core RAG pipeline quality and reliability

### RAGFlow Derivation Complexity
- `advance-rag/` is extracted from RAGFlow with modifications
- Follows RAGFlow conventions (not the Node.js BE conventions)
- Two separate ORMs for the same database: Knex (BE) + Peewee (RAG Worker)
- Risk: Schema drift between the two ORM layers
- Some files are very large (`rag/app/resume.py` = 115KB, `rag/app/naive.py` = 47KB)

### Shared Database Without Schema Coordination
- Backend manages migrations via Knex
- RAG Worker uses Peewee models that must match the Knex schema
- No automated validation that Peewee models stay in sync with Knex migrations
- Risk: Migration changes in BE break RAG Worker silently

---

## Medium Priority

### Heavy Python Dependencies
- 108 packages in `advance-rag/pyproject.toml`
- No lock file for Python dependencies (no `requirements.lock` or `poetry.lock`)
- Build times are slow
- Risk: Non-deterministic builds, dependency conflicts

### System Dependencies
- RAG Worker requires: `poppler-utils`, `tesseract-ocr`, JRE (Tika)
- Converter requires: LibreOffice (`libreoffice-calc`, `libreoffice-writer`, `libreoffice-impress`), `python3-uno`
- These are not installable via pip/npm — Docker-only for reliable deployment
- Risk: Dev environment setup friction on non-Linux systems

### Large Model Factory File
- `be/src/shared/models/factory.ts` = 24KB
- Centralized singleton that registers all models
- Adding new models requires modifying this file
- Risk: Merge conflicts when multiple features add models

### Large Types File
- `be/src/shared/models/types.ts` = 44KB
- All model type definitions in a single file
- Risk: Cognitive load, merge conflicts

---

## Low Priority

### Missing Python Lock File
- Both Python workspaces use `pyproject.toml` without a lock file
- Builds may not be reproducible across environments
- Consider adding `pip-tools` (`requirements.txt` from `pip-compile`) or `uv.lock`

### LibreOffice UNO Bridge
- Excel conversion uses `python3-uno` (system Python linked to LibreOffice)
- Only works with specific system Python, not virtualenvs
- Dev testing on macOS requires Docker

### Converter Schedule Window
- Converter respects configurable time windows (e.g., 10PM-5AM)
- Jobs queue but don't process outside the window unless manually triggered
- Could confuse developers expecting immediate processing

### Feature Flag Proliferation
- Frontend uses `VITE_ENABLE_*` flags for feature toggling
- No centralized feature flag management — just env vars
- Could benefit from a more structured approach as features grow

---

## Security Considerations

### Default Credentials in Docker
- `docker-compose-base.yml` uses default passwords (e.g., `change_me_in_production`)
- Production checklist in CLAUDE.md mentions changing them
- Risk: Forgotten password changes in deployment

### Session Configuration
- Development uses in-memory session store (not Redis)
- Default 7-day session TTL
- Production requires `SESSION_SECRET` to be set

### File Upload Validation
- Magic byte validation + extension blocklist (60+ dangerous types)
- Implemented in `be/src/shared/services/file-validation.service.ts`
- Good security posture

### HTTPS Fallback
- If SSL cert files are missing, server silently falls back to HTTP
- No warning to operators about insecure mode
