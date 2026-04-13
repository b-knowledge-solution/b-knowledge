# Phase 6: Legacy Cleanup + OpenSearch Integration — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `6-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 06-legacy-cleanup-opensearch-integration
**Areas discussed:** Legacy alias scope + regression guard, P6.5 repurposing, OpenSearch grant filter semantics, P6.1 migration safety

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Legacy alias scope + regression guard | Scope of BE cleanup + regression prevention | ✓ |
| P6.5 — what does it even mean now? | Stale dual-write language in ROADMAP | ✓ |
| OpenSearch grant filter semantics | Zero-grant / DocCat / composition / expires_at | ✓ |
| P6.1 migration safety | Idempotency, default flip, rollback | ✓ |

**User's choice:** All four selected.
**Notes:** User wanted to drill into every identified gray area.

---

## Area 1 — Legacy Alias Scope + Regression Guard

### Q1.1: How exhaustive should P6.2's code alias removal be?

| Option | Description | Selected |
|--------|-------------|----------|
| Exhaustive — every BE site (Recommended) | Fix all 7+ sites, not just the 3 in ROADMAP. Roadmap's verification grep demands zero matches. | ✓ |
| Roadmap list only | Fix only the 3 ROADMAP-named sites. Verification grep will fail. | |
| Exhaustive + audit UserRole usage overall | Fix all sites AND audit whether ADMIN || SUPERADMIN checks should become permission checks. Could balloon the phase. | |

**User's choice:** Exhaustive — every BE site.
**Notes:** The grep finding (7+ sites, not 3) made this obvious. Exhaustive is the only option that passes the roadmap's own verification.

### Q1.2: What about DB seeds and the initial_schema column default?

| Option | Description | Selected |
|--------|-------------|----------|
| Update seeds + flip default in P6.1 (Recommended) | One atomic migration does UPDATE + ALTER DEFAULT + seed update. | ✓ |
| Seeds in P6.2, column default in P6.1 | Split by plan boundary for cleaner git history. | |
| Leave seeds alone | Seeds are dev-only, cosmetic. | |

**User's choice:** Update seeds + flip default in P6.1.
**Notes:** Atomicity preferred over plan-boundary cleanliness.

### Q1.3: Regression guard?

| Option | Description | Selected |
|--------|-------------|----------|
| CI grep check (Recommended) | `grep -rn "'superadmin'\|'member'"` wired into lint. Language-agnostic. | ✓ |
| ESLint no-restricted-syntax (BE only) | TypeScript rule with TeamRole allowlist. Misses Python/SQL. | |
| Both ESLint + CI grep | Belt-and-suspenders. | |
| Nothing — trust review | Phase 4's ESLint rule + code review is enough. | |

**User's choice:** CI grep check.
**Notes:** Simpler, catches more languages, no duplication with Phase 4's ESLint rule.

---

## Area 2 — P6.5 Repurposing

### Q2.1: What should happen to P6.5?

| Option | Description | Selected |
|--------|-------------|----------|
| Repurpose to address R-9 ADMIN_ROLES shim (Recommended) | Audit + document every ADMIN_ROLES usage. | ✓ |
| Delete P6.5 entirely | Shrink Phase 6 to 4 plans, update ROADMAP. | |
| Keep as final grep audit + roadmap cleanup | Low-value housekeeping plan. | |
| Something else | User-provided alternative. | |

**User's choice:** Repurpose to R-9.

### Q2.2: How aggressive for R-9?

| Option | Description | Selected |
|--------|-------------|----------|
| Document-only (Recommended) | One-line comment per site + ADR-style note. No code rewrites. | ✓ |
| Convert what's cheap, document the rest | Partial migration where trivial. | |
| Full migration — delete ADMIN_ROLES | Blows phase scope; R-9 was deferred for a reason. | |

**User's choice:** Document-only.
**Notes:** Respects the original deferral rationale. R-9 stays deferred; P6.5 only makes the deferral visible and intentional.

---

## Area 3 — OpenSearch Grant Filter Semantics

### Q3.1: Zero-grant user behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Role-default only — identical to today (Recommended) | No grant clause emitted. | ✓ |
| Role-default AND restrictive clause | Zero-grant users see nothing. Too aggressive. | |
| Role-default for admins, empty for non-admins | Complex, contradicts parity acceptance test. | |

**User's choice:** Role-default only.

### Q3.2: KB grants vs DocumentCategory grants?

| Option | Description | Selected |
|--------|-------------|----------|
| Both, resolved to a flat dataset_id set (Recommended) | Union into one `terms` clause. | ✓ |
| KB grants only — defer category resolution | Creates UI-vs-search gap. | |
| Two separate filter clauses | Requires chunk schema changes (out of scope). | |

**User's choice:** Both flat set.

### Q3.3: Filter composition?

| Option | Description | Selected |
|--------|-------------|----------|
| Tenant AND (role-base OR grants) (Recommended) | Grants expand within tenant. | ✓ |
| Tenant AND role-base AND grants | Too restrictive; contradicts Phase 1 model. | |
| Grants replace role-base when present | Breaks existing users. | |

**User's choice:** Tenant AND (role-base OR grants).

### Q3.4: expires_at enforcement?

| Option | Description | Selected |
|--------|-------------|----------|
| Filter out expired grants in P6.3 (Recommended) | `WHERE expires_at IS NULL OR expires_at > NOW()`. | ✓ |
| Defer entirely to Phase 7 SH2 | Leaves security gap. | |
| Defer but warn-log | Visibility without enforcement. | |

**User's choice:** Filter out expired in P6.3.
**Notes:** Side effect — Phase 7 SH2 scope shrinks to UI-only.

---

## Area 4 — P6.1 Migration Safety

### Q4.1: Idempotency and unknown role values?

| Option | Description | Selected |
|--------|-------------|----------|
| Idempotent UPDATE + abort on unknown roles (Recommended) | Pre-check SELECT; abort with listing if any unexpected values. | ✓ |
| Idempotent UPDATE, warn on unknown | Continue despite bad roles. | |
| Idempotent UPDATE, coerce unknown to 'user' | Silent demotion — dangerous. | |

**User's choice:** Abort on unknown.

### Q4.2: Default flip timing?

| Option | Description | Selected |
|--------|-------------|----------|
| Same migration (Recommended) | Atomic: pre-check + UPDATEs + ALTER DEFAULT. | ✓ |
| Two migrations: UPDATE first, DEFAULT second | Operational separation. | |

**User's choice:** Same migration.

### Q4.3: Rollback path?

| Option | Description | Selected |
|--------|-------------|----------|
| Down migration restores the default only (Recommended) | Don't reverse data; use V2 flag for behavior rollback. | ✓ |
| Full down migration with backup column | Bloats schema. | |
| No down migration — mark irreversible | Blocks dev rollback experiments. | |

**User's choice:** Restore default only.

---

## Claude's Discretion (left to planner/executor)

- Exact naming of CI grep script and npm entry
- P6.4 test harness choice (real OS / mocked / seeded fixture)
- Whether P6.3's grant walk SQL lives in ability service or a new model method
- Whether P6.5 comment insertion is automated via codemod or manual
- Commit granularity within P6.2

## Deferred Ideas

- Phase 7 SH2 scope reduction (expires_at UI only)
- ROADMAP refresh (P6.2 file list, P6.5 stale reference)
- STATE.md refresh
- R-9 ADMIN_ROLES full migration → milestone 2
- Strategy B (chunk-level scoping) → future milestone
- Phase 7 SH1 catalog version hash / hot-reload
