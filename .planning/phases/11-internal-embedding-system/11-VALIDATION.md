---
phase: 11
slug: internal-embedding-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (advance-rag), vitest (fe), jest (be) |
| **Config file** | `advance-rag/pyproject.toml`, `fe/vitest.config.ts`, `be/jest.config.ts` |
| **Quick run command** | `cd advance-rag && python -m pytest tests/ -x -q` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd advance-rag && python -m pytest tests/ -x -q`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| *Populated during planning* | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `advance-rag/tests/test_sentence_transformers_embed.py` — unit tests for SentenceTransformersEmbed class
- [ ] `advance-rag/tests/test_embedding_worker.py` — Valkey Stream consumer group worker tests
- [ ] `be/tests/llm-provider/system-provider.test.ts` — auto-seed startup logic tests

*Existing pytest/vitest/jest infrastructure covers framework needs — no new framework install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Model download from HuggingFace Hub | SC-1 | Requires network access + HF Hub | Set LOCAL_EMBEDDING_ENABLE=true, LOCAL_EMBEDDING_MODEL=BAAI/bge-m3, start worker, verify model downloads |
| LLM Config page System badge | SC-3 | Visual UI verification | Open admin LLM Config page, verify System badge appears, edit/delete disabled |
| Re-embed warning banner | SC-4 | Visual UI + dataset state | Change dataset embedding model, verify warning banner appears with correct chunk count |
| Docker volume persistence | SC-1 | Requires Docker restart cycle | Start with volume, stop, restart, verify model loads from cache without re-download |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
