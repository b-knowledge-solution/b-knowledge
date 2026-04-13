#!/usr/bin/env bash
# Phase 6 legacy role alias guardrail - prevents regression of Phase 6 cleanup.
# Exits non-zero if any forbidden legacy alias surfaces in source trees.
#
# Scope:
#   - Checks be/src, fe/src, advance-rag for `UserRole.SUPERADMIN`,
#     `UserRole.MEMBER`, and bare role-literal 'superadmin' / "superadmin".
#   - Does NOT flag `TeamRole.MEMBER` or `user_teams` role literals (they are
#     a different domain and explicitly preserved per Phase 6 D-04).
#
# See .planning/phase-06-legacy-cleanup-opensearch-integration/6-CONTEXT.md D-05.
set -euo pipefail

fail=0

echo "[check-legacy-roles] scanning for UserRole.SUPERADMIN / UserRole.MEMBER identifiers ..."
# Identifier-based grep - no false positives on TeamRole.MEMBER (distinct identifier).
# Capture to variable with `|| true` to defuse `set -euo pipefail` when grep finds
# nothing (empty match = success for our semantic, but grep exit 1 would kill the script).
id_matches=$(grep -rn --include="*.ts" --include="*.tsx" \
     -e "UserRole\.SUPERADMIN" \
     -e "UserRole\.MEMBER" \
     be/src be/tests fe/src 2>/dev/null || true)
if [[ -n "$id_matches" ]]; then
  echo "[check-legacy-roles] FAIL: legacy UserRole identifier found:"
  echo "$id_matches"
  fail=1
fi

echo "[check-legacy-roles] scanning for bare 'superadmin' literal ..."
# Bare literal scan. No hyphen = legacy. Allowlist:
#   - be/src/shared/db/migrations/*phase06_legacy_role_cleanup* - the migration
#     itself references the literal in its UPDATE/pre-check
#   - be/tests/permissions/legacy-role-cleanup.test.ts - the test seeds the legacy value
#
# Pipefail defusion: `grep -v` returns 1 when all lines are filtered (valid success
# case for us) which would kill `set -euo pipefail`. We capture into a variable with
# `|| true` so both stages can legitimately find nothing.
lit_matches=$(grep -rn --include="*.ts" --include="*.tsx" --include="*.py" \
     -e "['\"]superadmin['\"]" \
     be/src be/tests fe/src advance-rag 2>/dev/null \
     | grep -v "phase06_legacy_role_cleanup" \
     | grep -v "legacy-role-cleanup.test.ts" \
     | grep -v "be/src/shared/constants/roles.ts" || true)
if [[ -n "$lit_matches" ]]; then
  echo "[check-legacy-roles] FAIL: bare 'superadmin' literal found outside allowlist:"
  echo "$lit_matches"
  fail=1
fi

# NOTE: We deliberately do NOT scan for the bare literal `'member'` -
# TeamRole.MEMBER is valid and widely used in team-membership contexts.
# The `UserRole.MEMBER` identifier grep above is sufficient guardrail for
# the legacy UserRole value on the code side; DB-side is covered by the
# phase06_legacy_role_cleanup migration.

if [[ $fail -eq 0 ]]; then
  echo "[check-legacy-roles] OK - no legacy role aliases found"
  exit 0
else
  echo "[check-legacy-roles] FAILED - see matches above"
  exit 1
fi
