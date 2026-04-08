/**
 * @description Exports the in-memory BE permission registry to a JSON snapshot
 * consumed by the FE generator (`fe/scripts/generate-permission-keys.mjs`).
 *
 * Run via the root script: `npm run permissions:export-catalog`
 *
 * The script imports the permissions barrel (`@/shared/permissions/index.ts`),
 * which eagerly imports every `<feature>.permissions.ts` file. Those modules
 * register themselves into the process-wide `ALL_PERMISSIONS` array as a side
 * effect, so by the time `getAllPermissions()` returns we have the full catalog.
 *
 * Output shape:
 *   { generatedAt: ISO-string, permissions: [{ key, feature, action, subject, label, description? }] }
 *
 * NOTE: this file is `.mjs` but is executed via `tsx` so the imported `.ts`
 * sources resolve through the BE tsconfig paths (`@/*` → `./src/*`). We must
 * therefore run it with cwd=`be/` so tsx picks up `be/tsconfig.json`.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve workspace anchors so the script works regardless of caller cwd.
const scriptDir = dirname(fileURLToPath(import.meta.url))
const beRoot = resolve(scriptDir, '..')
const repoRoot = resolve(beRoot, '..')
const outputPath = resolve(repoRoot, 'fe/src/generated/permissions-catalog.json')

// Dynamic import so tsx's ESM loader can resolve the TS sources at runtime.
// The barrel triggers all 22 module-level `definePermissions` side effects.
const { getAllPermissions } = await import('@/shared/permissions/index.js')

const all = getAllPermissions()

// ── Validation ─────────────────────────────────────────────────────
// Fail loudly here so a broken registry can never silently ship a bad snapshot.

// Guard 1: empty catalog almost certainly means a barrel import path regressed.
if (!Array.isArray(all) || all.length === 0) {
  console.error('export-permissions-catalog: registry is empty — barrel imports likely failed')
  process.exit(1)
}

// Guard 2: duplicate keys must never happen — registry already throws on collision,
// but we re-check here in case the registry's invariant changes in the future.
const seen = new Set()
for (const p of all) {
  if (seen.has(p.key)) {
    console.error(`export-permissions-catalog: duplicate key detected: ${p.key}`)
    process.exit(2)
  }
  seen.add(p.key)
}

// Guard 3: every key must match the canonical `[a-z0-9._-]` shape so the FE
// generator's SCREAMING_SNAKE normalization stays unambiguous.
const KEY_CHAR_PATTERN = /^[a-z0-9._-]+$/
for (const p of all) {
  if (!KEY_CHAR_PATTERN.test(p.key)) {
    console.error(`export-permissions-catalog: invalid key shape: ${p.key}`)
    process.exit(3)
  }
}

// ── Deterministic sort ─────────────────────────────────────────────
// Sort by key so successive snapshots produce minimal git diffs even when
// modules are loaded in a different order.
const sorted = [...all].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

// ── Compose output ────────────────────────────────────────────────
const snapshot = {
  generatedAt: new Date().toISOString(),
  permissions: sorted.map((p) => ({
    key: p.key,
    feature: p.feature,
    action: p.action,
    subject: p.subject,
    label: p.label,
    ...(p.description !== undefined ? { description: p.description } : {}),
  })),
}

// Ensure target directory exists (fe/src/generated/ may not yet be tracked).
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')

console.log(`Wrote ${snapshot.permissions.length} permission keys to fe/src/generated/permissions-catalog.json`)
