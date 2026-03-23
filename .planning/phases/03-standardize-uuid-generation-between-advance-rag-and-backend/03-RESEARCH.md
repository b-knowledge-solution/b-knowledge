# Phase 3: Standardize UUID Generation Between advance-rag and Backend - Research

**Researched:** 2026-03-23
**Domain:** UUID generation, cross-service data consistency, Python/Node.js interop
**Confidence:** HIGH

## Summary

The advance-rag Python worker and the Node.js backend use incompatible UUID generation strategies. Python uses `uuid.uuid1().hex` (time+MAC based, 32-char hex, no hyphens) while Node.js uses `uuid v4` (random, 36-char with hyphens). The backend already compensates for shared Peewee-managed tables by stripping hyphens from UUID4 (`randomUUID().replace(/-/g, '')`), so the existing data format (32-char hex) is correct. The core issue is the UUID **version** mismatch (UUID1 vs UUID4) and the security concern of UUID1 leaking the MAC address.

The recommended fix is to standardize advance-rag on UUID4, matching the backend. This is a single-function change (`get_uuid()` in `common/misc_utils.py`) plus fixing a few one-off UUID1 usages in `html_parser.py`. No data migration is needed because existing 32-char hex IDs are valid regardless of which UUID version generated them. No new dependencies are required.

**Primary recommendation:** Change `get_uuid()` from `uuid.uuid1().hex` to `uuid.uuid4().hex` in advance-rag. Do NOT adopt UUIDv7 -- it requires a third-party library on Python 3.11/3.12, adds dependency complexity, and the codebase does not need time-sortable IDs (PostgreSQL `created_at` timestamps handle ordering).

## Standard Stack

### Core

No new libraries needed. This phase modifies existing code only.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python `uuid` (stdlib) | 3.12 built-in | `uuid.uuid4().hex` for Python worker | Zero dependencies, already in stdlib |
| Node.js `crypto` (built-in) | Node 22+ | `crypto.randomUUID()` for BE interop | Already used in `rag-redis.service.ts` |
| `uuid` (npm) | 10.0.0 | `v4()` for BE-owned entities | Already installed, used throughout BE |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| UUID4 (stdlib) | UUIDv7 via `uuid_utils` (PyPI) | Adds Rust-compiled dependency; time-sortable but not needed since DB has timestamps. Only in Python stdlib from 3.14+ |
| UUID4 (stdlib) | UUIDv7 via `uuid7` (PyPI) | Pure Python, slower. Same unnecessary complexity |
| Keeping UUID1 | N/A | UUID1 leaks MAC address, is non-standard vs BE, creates debugging confusion |

**Why not UUIDv7:**
1. Python 3.12 (project runtime) does not have `uuid.uuid7()` -- that arrives in Python 3.14
2. Would require adding `uuid_utils>=0.14.0` (Rust-compiled) or `uuid7>=0.1.0` as a new dependency
3. The BE uses `gen_random_uuid()` in PostgreSQL (UUID4) and `uuid v4` in application code -- switching to v7 would require changes on BOTH sides
4. Time-sortable IDs provide no practical benefit here: all tables have `create_time`/`create_date` timestamp columns for ordering
5. Risk/reward ratio is poor for a change that touches every ID in the system

## Architecture Patterns

### Current UUID Flow (Before)

```
advance-rag (Python):
  get_uuid() -> uuid.uuid1().hex -> "550e8400e29b41d4a716446655440000" (32 chars, time+MAC)

be (Node.js):
  For BE-owned tables:  uuidv4() -> "550e8400-e29b-41d4-a716-446655440000" (36 chars, random)
  For Peewee tables:    randomUUID().replace(/-/g, '') -> "550e8400e29b41d4a716446655440000" (32 chars, random)
  DB defaults:          gen_random_uuid() -> UUID4
```

### Target UUID Flow (After)

```
advance-rag (Python):
  get_uuid() -> uuid.uuid4().hex -> "550e8400e29b41d4a716446655440000" (32 chars, random)

be (Node.js):
  [NO CHANGES NEEDED - already uses UUID4 everywhere]
```

### Files That Need Changes

**Primary change (1 file):**
```
advance-rag/common/misc_utils.py  -- get_uuid(): uuid.uuid1().hex -> uuid.uuid4().hex
```

**Secondary changes (1 file, 2 occurrences):**
```
advance-rag/deepdoc/parser/html_parser.py:220  -- uuid.uuid1() -> uuid.uuid4()
advance-rag/deepdoc/parser/html_parser.py:229  -- uuid.uuid1() -> uuid.uuid4()
```

**No changes needed (already correct):**
```
advance-rag/db/db_models.py:813        -- TenantLLM uses uuid.uuid4() already (Knex-managed table)
advance-rag/rag/utils/redis_conn.py:661 -- uuid.uuid4() for Redis lock tokens (ephemeral, correct)
advance-rag/rag/app/naive.py:557       -- uuid.uuid4().hex[:8] for image names (ephemeral, correct)
be/src/modules/rag/services/rag-redis.service.ts  -- Already uses randomUUID().replace(/-/g, '')
be/src/modules/rag/services/rag-document.service.ts -- Already uses crypto.randomUUID().replace(/-/g, '')
```

### Pattern: get_uuid() Change

```python
# BEFORE
def get_uuid():
    return uuid.uuid1().hex

# AFTER
def get_uuid():
    """Generate a new UUID4 hex string (random, 32 hex characters).

    Returns:
        A 32-character lowercase hex UUID string.
    """
    return uuid.uuid4().hex
```

### Pattern: html_parser.py Change

```python
# BEFORE
table_id = str(uuid.uuid1())     # "550e8400-e29b-41d4-a716-446655440000"
block_id = str(uuid.uuid1())

# AFTER
table_id = str(uuid.uuid4())     # "550e8400-e29b-41d4-a716-446655440000"
block_id = str(uuid.uuid4())
```

### Anti-Patterns to Avoid
- **Do NOT change the hex format (32-char, no hyphens) for Peewee tables.** All Peewee models use `CharField(max_length=32, primary_key=True)` and the entire codebase expects this format.
- **Do NOT change BE code.** The backend already uses UUID4 everywhere. No modifications needed.
- **Do NOT run a data migration.** Existing UUID1 hex strings are valid 32-char hex -- they just happen to encode time+MAC instead of random bytes. PostgreSQL does not care about UUID version in VARCHAR/TEXT columns.
- **Do NOT change Redis lock tokens** (`redis_conn.py` uuid4) or **image temp names** (`naive.py` uuid4) -- these are already UUID4 and ephemeral.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | Custom ID scheme | `uuid.uuid4().hex` (Python) / `crypto.randomUUID()` (Node.js) | Standard, no collision risk at this scale, stdlib |
| Time-sortable IDs | UUIDv7 wrapper | PostgreSQL `create_time` column | Already exists on every table, no new dependency needed |
| Cross-service ID compat | Format conversion layer | Consistent `uuid4().hex` on Python side | BE already compensates; fixing Python side eliminates the mismatch |

## Common Pitfalls

### Pitfall 1: Attempting Data Migration
**What goes wrong:** Thinking existing UUID1 hex strings need to be converted to UUID4 format.
**Why it happens:** Confusion between UUID version and UUID format. Both UUID1 and UUID4 produce valid hex strings.
**How to avoid:** No data migration. Existing IDs stay as-is. Only new IDs generated after the change will be UUID4.
**Warning signs:** Someone proposes an ALTER TABLE or UPDATE statement for existing IDs.

### Pitfall 2: Breaking OpenSearch Document IDs
**What goes wrong:** OpenSearch documents are indexed with the hex UUID as `_id`. Changing UUID generation does NOT affect existing indexed documents.
**Why it happens:** Fear that changing the generator invalidates existing references.
**How to avoid:** Understand that UUIDs are just identifiers -- changing the generation method only affects NEW records. All existing doc_id references in OpenSearch remain valid.
**Warning signs:** Plans to re-index OpenSearch data.

### Pitfall 3: Forgetting html_parser.py
**What goes wrong:** Only changing `get_uuid()` but missing the direct `uuid.uuid1()` calls in `deepdoc/parser/html_parser.py`.
**Why it happens:** These are the only 2 files that call `uuid.uuid1()` directly instead of going through `get_uuid()`.
**How to avoid:** Grep for all `uuid.uuid1` usages and update them too.
**Warning signs:** `uuid1` still appearing in grep results after the change.

### Pitfall 4: Changing TenantLLM Model Default
**What goes wrong:** Modifying `TenantLLM.id` default from `uuid.uuid4()` to match `get_uuid()` format.
**Why it happens:** Over-zealous standardization. TenantLLM maps to the Knex-managed `model_providers` table which uses 36-char UUID format.
**How to avoid:** Leave `TenantLLM.id = CharField(max_length=36, default=lambda: str(uuid.uuid4()))` exactly as-is. This table is Knex-managed with different column sizing.
**Warning signs:** max_length=36 being changed to 32 for TenantLLM.

### Pitfall 5: Touching BE Code Unnecessarily
**What goes wrong:** Modifying backend UUID generation when it is already correct.
**Why it happens:** Scope creep -- "while we're at it, let's also..."
**How to avoid:** The BE already uses UUID4 everywhere. The `randomUUID().replace(/-/g, '')` pattern for Peewee tables is correct and should remain.
**Warning signs:** Changes to `rag-redis.service.ts` or `rag-document.service.ts`.

## Code Examples

### Primary Change: get_uuid()

```python
# Source: advance-rag/common/misc_utils.py (line 39-45)
# CURRENT:
def get_uuid():
    return uuid.uuid1().hex

# CHANGE TO:
def get_uuid():
    """Generate a new UUID4 hex string (random, 32 hex characters).

    Standardized to UUID4 to match the Node.js backend's UUID generation.
    UUID4 uses cryptographically random bytes, avoiding UUID1's MAC address
    leakage and providing consistent behavior across Python and Node.js.

    Returns:
        A 32-character lowercase hex UUID string.
    """
    return uuid.uuid4().hex
```

### Secondary Change: html_parser.py

```python
# Source: advance-rag/deepdoc/parser/html_parser.py (lines 220, 229)
# CURRENT:
table_id = str(uuid.uuid1())
block_id = str(uuid.uuid1())

# CHANGE TO:
table_id = str(uuid.uuid4())
block_id = str(uuid.uuid4())
```

### Test Verification

```python
# Verify get_uuid() produces 32-char hex string
from common.misc_utils import get_uuid

uid = get_uuid()
assert len(uid) == 32
assert all(c in '0123456789abcdef' for c in uid)
# Verify it's UUID4 (version nibble = 4)
assert uid[12] == '4'  # Version nibble position in hex string
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| UUID1 (time+MAC) | UUID4 (random) | Industry standard since ~2010 | UUID1 deprecated in most new systems due to MAC leakage |
| UUID4 (random) | UUIDv7 (time-ordered random) | RFC 9562 (May 2024) | Only relevant when DB-level time ordering needed without timestamps |

**For this project:** UUID4 is the correct choice. UUIDv7 adds unnecessary complexity since all tables already have timestamp columns. The project uses Python 3.11+ (runtime 3.12) where uuid7 is NOT in stdlib (added in 3.14).

## Open Questions

1. **Table ownership documentation**
   - What we know: Peewee-managed tables use 32-char hex IDs; Knex-managed tables use 36-char UUID format
   - What's unclear: There is no single document listing which tables are Peewee-managed vs Knex-managed
   - Recommendation: Add a comment block in `db_models.py` and/or a doc section listing table ownership. This is a documentation task, not blocking for UUID standardization.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (advance-rag), vitest (be) |
| Config file | `advance-rag/pyproject.toml`, `be/vitest.config.ts` |
| Quick run command | `cd advance-rag && python -m pytest tests/ -x -q` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UUID-01 | get_uuid() returns 32-char UUID4 hex | unit | `cd advance-rag && python -m pytest tests/test_uuid_standardization.py -x` | Wave 0 |
| UUID-02 | html_parser uses uuid4 not uuid1 | unit | `cd advance-rag && python -m pytest tests/test_uuid_standardization.py -x` | Wave 0 |
| UUID-03 | Existing conftest mock still works | smoke | `cd advance-rag && python -m pytest tests/ -x -q` | Existing |

### Sampling Rate
- **Per task commit:** `cd advance-rag && python -m pytest tests/test_uuid_standardization.py -x`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `advance-rag/tests/test_uuid_standardization.py` -- covers UUID-01, UUID-02
- Update `advance-rag/tests/conftest.py` line 367 mock if needed (currently mocks `get_uuid` to return `"mock-uuid"` -- this remains valid regardless of uuid version)

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `advance-rag/common/misc_utils.py` -- confirmed `uuid.uuid1().hex`
- Direct code inspection of `advance-rag/db/db_models.py` -- confirmed CharField(max_length=32) on all Peewee models, TenantLLM uses uuid4 with max_length=36
- Direct code inspection of `be/src/modules/rag/services/rag-redis.service.ts` -- confirmed `randomUUID().replace(/-/g, '')`
- Direct code inspection of `be/src/modules/rag/services/rag-document.service.ts` -- confirmed `crypto.randomUUID().replace(/-/g, '')`
- [Python uuid module docs](https://docs.python.org/3/library/uuid.html) -- uuid7 only in Python 3.14+
- [uuid_utils PyPI](https://pypi.org/project/uuid_utils/) -- third-party UUIDv7 option (not recommended)

### Secondary (MEDIUM confidence)
- Python 3.12.3 confirmed via `python3 --version` on target machine
- uuid npm package version 10.0.0 confirmed via `npm ls uuid`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed, stdlib only
- Architecture: HIGH -- single function change, clear scope, code fully inspected
- Pitfalls: HIGH -- all edge cases identified through grep audit of both codebases

**Research date:** 2026-03-23
**Valid until:** 2026-06-23 (stable -- uuid stdlib is not changing)

## Project Constraints (from CLAUDE.md)

- All DB migrations through Knex (not Peewee migrators) -- no schema migration needed for this phase
- Google-style docstrings on every Python function (update docstring on `get_uuid()`)
- JSDoc on every exported TypeScript function (no BE changes needed)
- Inline comments above non-obvious code changes
- Mandatory `npm run build` verification if changes are extensive (not needed -- Python-only changes)
