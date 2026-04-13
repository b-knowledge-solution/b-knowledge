/**
 * @description Generates `fe/src/constants/permission-keys.ts` from the BE
 * snapshot at `fe/src/generated/permissions-catalog.json`.
 *
 * Wired into `prebuild`/`predev`/`pretest` so the const file is always
 * up-to-date with the committed snapshot. Regenerate manually with
 * `npm run permissions:generate-keys`.
 *
 * Output is a SCREAMING_SNAKE map (`PERMISSION_KEYS`) plus a `PermissionKey`
 * union type. Codemod and `useHasPermission` consumers import from
 * `@/constants/permission-keys`.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const feRoot = resolve(scriptDir, '..')
const inputPath = resolve(feRoot, 'src/generated/permissions-catalog.json')
const outputPath = resolve(feRoot, 'src/constants/permission-keys.ts')

// Match the BE exporter's allowed character set so the two scripts agree
// on what counts as a valid key.
const KEY_CHAR_PATTERN = /^[a-z0-9._-]+$/

const raw = readFileSync(inputPath, 'utf8')
const snapshot = JSON.parse(raw)

if (!Array.isArray(snapshot.permissions) || snapshot.permissions.length === 0) {
  console.error('generate-permission-keys: snapshot has no permissions')
  process.exit(1)
}

/**
 * @description Normalizes a `feature.action` key into a SCREAMING_SNAKE
 * TypeScript identifier. Replaces `.` and `-` with `_`, then uppercases.
 * Example: `knowledge_base.share` → `KNOWLEDGE_BASE_SHARE`.
 *
 * @param {string} key - Raw catalog key from the BE snapshot.
 * @returns {string} Normalized SCREAMING_SNAKE constant name.
 */
function toConstName(key) {
  // The replace handles both dots (separator) and hyphens (legacy slug form);
  // toUpperCase produces the screaming-snake casing the codebase uses for constants.
  return key.replace(/[.\-]/g, '_').toUpperCase()
}

const entries = []
const seenConstNames = new Set()

for (const p of snapshot.permissions) {
  // Validate source key shape — same regex as BE exporter (defense in depth).
  if (!KEY_CHAR_PATTERN.test(p.key)) {
    console.error(`generate-permission-keys: invalid source key: ${p.key}`)
    process.exit(2)
  }

  const constName = toConstName(p.key)

  // Hard-fail on collisions: if two distinct catalog keys normalize to the
  // same identifier the generated file would silently lose one of them.
  if (seenConstNames.has(constName)) {
    console.error(`generate-permission-keys: duplicate constant name "${constName}" — collision after normalization`)
    process.exit(3)
  }
  seenConstNames.add(constName)

  entries.push({ constName, key: p.key })
}

// Sort by constant name for stable diffs across regenerations.
entries.sort((a, b) => (a.constName < b.constName ? -1 : a.constName > b.constName ? 1 : 0))

const body = entries.map((e) => `  ${e.constName}: '${e.key}',`).join('\n')

const fileContents = `// AUTO-GENERATED — DO NOT EDIT BY HAND.
// Source: fe/src/generated/permissions-catalog.json
// Regenerate: npm run permissions:generate-keys (or just rebuild)

/**
 * @description Type-safe map of every permission key registered in the BE catalog.
 * Use with useHasPermission(PERMISSION_KEYS.X) — never bare strings (per root CLAUDE.md).
 */
export const PERMISSION_KEYS = {
${body}
} as const

/** @description Union type of all valid permission keys from the catalog snapshot. */
export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS]
`

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, fileContents, 'utf8')

console.log(`Generated ${entries.length} permission keys → fe/src/constants/permission-keys.ts`)
