#!/usr/bin/env node
// @ts-check
/**
 * @file CLI wrapper for the permissions codemod (Phase 4 Plan 4.3).
 *
 * Reads files matching `--files <glob>` (default: `fe/src/**\/*.{ts,tsx}`),
 * pipes each through the pure `transformSource` lib, and either prints a
 * dry-run diff (`--dry-run`) or writes the result back to disk.
 *
 * Hard-coded exclusions (NEVER processed even if user passes `--files`):
 *   - *.json, *.md, *.css
 *   - node_modules/, dist/
 *   - fe/src/generated/ (auto-generated catalog files)
 *
 * Plans 4.4 and 4.5 are the only callers expected to run this against the
 * real tree. Plan 4.3 only proves the CLI loads via a no-op `--dry-run`.
 *
 * Usage:
 *   node fe/scripts/codemod-permissions.mjs --dry-run --files 'fe/src/features/datasets/**\/*.tsx'
 *   node fe/scripts/codemod-permissions.mjs --files 'fe/src/features/glossary/**\/*.tsx'
 */

import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { transformSource } from './codemod-permissions.lib.mjs'

/**
 * @description Hard-coded exclusion substrings. Files whose normalized path
 * contains any of these are skipped unconditionally — this is a safety guard
 * so the codemod cannot accidentally rewrite generated/build/vendor code.
 */
const HARD_EXCLUDES = [
  'node_modules/',
  '/dist/',
  'fe/src/generated/',
]

/** @description File extensions the codemod will ever touch. */
const ALLOWED_EXTENSIONS = ['.ts', '.tsx']

/**
 * @description Recursively walk a directory and yield all matching source files.
 * @param {string} root - Absolute path to walk.
 * @returns {string[]} Absolute paths to .ts/.tsx files (post-exclusion).
 */
function walk(root) {
  /** @type {string[]} */
  const out = []
  // Guard against non-existent paths so the CLI fails gracefully.
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(root, entry.name)
    const norm = full.replace(/\\/g, '/')
    // Apply hard exclusions before recursing — never descend into excluded dirs.
    if (HARD_EXCLUDES.some((ex) => norm.includes(ex))) continue
    if (entry.isDirectory()) {
      out.push(...walk(full))
      continue
    }
    if (!ALLOWED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue
    out.push(full)
  }
  return out
}

/**
 * @description Resolve the user's `--files` argument into a list of absolute
 * file paths. Supports a single concrete file path or a directory; basic glob
 * suffixes (`/**\/*.{ts,tsx}`) are stripped to a base directory then walked.
 * @param {string} pattern - The user-supplied `--files` value.
 * @returns {string[]} Absolute file paths to process.
 */
function resolveFiles(pattern) {
  // Strip the trailing glob portion (everything from the first `*`) so we get
  // a stable base directory to walk. This is intentionally simple — fancy
  // glob features are out of scope for the codemod's safety model.
  const baseRaw = pattern.includes('*') ? pattern.slice(0, pattern.indexOf('*')) : pattern
  const base = resolve(process.cwd(), baseRaw.replace(/\/$/, ''))
  let stat
  try {
    stat = statSync(base)
  } catch {
    return []
  }
  if (stat.isFile()) {
    // Single-file mode — still validate the extension.
    if (!ALLOWED_EXTENSIONS.some((ext) => base.endsWith(ext))) return []
    const norm = base.replace(/\\/g, '/')
    if (HARD_EXCLUDES.some((ex) => norm.includes(ex))) return []
    return [base]
  }
  return walk(base)
}

/**
 * @description Parse argv into a flag bag. Tiny hand-rolled parser since the
 * surface area is three flags and we want zero runtime deps.
 * @param {string[]} argv - The raw argv slice (without node + script).
 * @returns {{ dryRun: boolean, files: string, verbose: boolean }} Parsed flags.
 */
function parseArgs(argv) {
  let dryRun = false
  let verbose = false
  let files = 'fe/src/**/*.{ts,tsx}'
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--verbose') verbose = true
    else if (arg === '--files') {
      // Consume next argv as the value.
      files = argv[++i] ?? files
    }
  }
  return { dryRun, files, verbose }
}

/**
 * @description Print a minimal BEFORE/AFTER diff. Avoids pulling in a diff lib
 * because we want zero deps and the dry-run output is for human review only.
 * @param {string} file - The relative file path.
 * @param {string} before - Original source.
 * @param {string} after - Transformed source.
 */
function printDiff(file, before, after) {
  process.stdout.write(`\n--- ${file} (BEFORE)\n${before}\n`)
  process.stdout.write(`+++ ${file} (AFTER)\n${after}\n`)
}

/**
 * @description CLI entry point. Walks the resolved file list, runs the
 * transform, and either prints diffs or writes results based on `--dry-run`.
 * @returns {void}
 */
function main() {
  const { dryRun, files, verbose } = parseArgs(process.argv.slice(2))
  const targets = resolveFiles(files)

  let processed = 0
  let modified = 0
  let skipped = 0

  for (const filepath of targets) {
    processed++
    const rel = relative(process.cwd(), filepath)
    const source = readFileSync(filepath, 'utf8')
    const result = transformSource(source, rel)
    if (result === source) {
      // No change — either file was untouched, idempotent, or skip-listed.
      if (verbose) process.stdout.write(`no-op: ${rel}\n`)
      skipped++
      continue
    }
    modified++
    if (dryRun) {
      printDiff(rel, source, result)
    } else {
      writeFileSync(filepath, result, 'utf8')
      if (verbose) process.stdout.write(`wrote: ${rel}\n`)
    }
  }

  process.stdout.write(
    `\nProcessed ${processed} files, modified ${modified} files (${skipped} no-op)${dryRun ? ' [DRY RUN]' : ''}\n`,
  )
}

try {
  main()
} catch (err) {
  process.stderr.write(`codemod-permissions failed: ${(err && /** @type {Error} */ (err).message) || err}\n`)
  process.exit(1)
}
