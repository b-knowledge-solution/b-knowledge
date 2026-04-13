/**
 * @file Vitest fixture-driven test suite for the permissions codemod.
 *
 * Each subdirectory under `fixtures/` is one test case containing:
 *  - `input.tsx` (or `.ts`) — source fed to `transformSource`
 *  - `expected.tsx` (or `.ts`) — expected output
 *  - `filename.txt` (optional) — filename to pass to the codemod so the
 *    skip-list and `FILE_KEY_MAP` lookup behave realistically. Defaults to
 *    `fe/src/features/datasets/components/<input-file>` if absent.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error — .mjs has no .d.ts
import { transformSource } from '../codemod-permissions.lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = join(__dirname, 'fixtures')

describe('codemod-permissions', () => {
  // Iterate every fixture directory and assert transform output equals expected.
  for (const fixture of readdirSync(FIXTURES_DIR)) {
    if (!statSync(join(FIXTURES_DIR, fixture)).isDirectory()) continue
    it(`${fixture} matches expected output`, () => {
      const dir = join(FIXTURES_DIR, fixture)
      const inputFile = readdirSync(dir).find((f) => f.startsWith('input.'))
      const expectedFile = readdirSync(dir).find((f) => f.startsWith('expected.'))
      if (!inputFile || !expectedFile) {
        throw new Error(`Fixture ${fixture} missing input or expected file`)
      }
      const input = readFileSync(join(dir, inputFile), 'utf8')
      const expected = readFileSync(join(dir, expectedFile), 'utf8')
      // Per-fixture filename override (when the codemod path-matching matters).
      const filenameOverride = existsSync(join(dir, 'filename.txt'))
        ? readFileSync(join(dir, 'filename.txt'), 'utf8').trim()
        : `fe/src/features/datasets/components/${inputFile}`
      const actual = transformSource(input, filenameOverride)
      expect(actual.trim()).toBe(expected.trim())
    })
  }
})
