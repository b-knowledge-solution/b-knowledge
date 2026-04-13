/**
 * @fileoverview Phase 3 route-sweep coverage gate.
 *
 * Programmatic walker that asserts every mutating Express route
 * (POST/PUT/PATCH/DELETE) under `be/src/modules/<domain>/routes/*.routes.ts`
 * either:
 *   1. Has a `requirePermission(...)` middleware in its chain, OR
 *   2. Has a `requireAbility(...)` middleware in its chain, OR
 *   3. Is explicitly opted-out via `markPublicRoute()`.
 *
 * Additionally, when a route uses `requireAbility(action, subject, idParam)`
 * with a string-literal `idParam`, the walker asserts `idParam` matches one
 * of the `:param` tokens in the route's path string. This catches typos like
 * `requireAbility('edit','User','userId')` on `/users/:id` (which would
 * silently bypass row-scoped checks at runtime as `req.params.userId` is
 * undefined).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * REPORT-ONLY MODE (Wave 0)
 * ────────────────────────────────────────────────────────────────────────────
 * `ALLOW_OFFENDERS = true` makes this test fail-soft: the walker still runs,
 * still parses every route file, still produces the offender report (printed
 * to console with per-module counts), but does NOT fail the test run.
 *
 * This is intentional. Phase 3 Wave 0 introduces the safety net while every
 * legacy route is still un-gated; the report gives Wave 3 a quantitative
 * baseline to work down. The last task of Wave 3 (P3.5a) flips
 * `ALLOW_OFFENDERS` to `false`, turning this gate from informational into
 * enforcing.
 *
 * The test does NOT use `it.skip` — the walker MUST run on every CI invocation
 * during Phase 3 so the offender count is visible in build logs.
 */

import { describe, it, expect } from 'vitest'
import { Project, SyntaxKind, type CallExpression, type Node } from 'ts-morph'
import { readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// ──────────────────────────────────────────────────────────────────────────
// Configuration constants
// ──────────────────────────────────────────────────────────────────────────

/**
 * When true, offenders are reported but the test passes. Flip to false at the
 * end of Phase 3 Wave 3 (plan P3.5a) to turn this into an enforcing gate.
 */
const ALLOW_OFFENDERS = false

/** Express route methods that mutate state and therefore require gating. */
const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

/** Middleware function names that satisfy the gate requirement. */
const GATE_FUNCTION_NAMES = new Set([
  'requirePermission',
  'requireAbility',
  'markPublicRoute',
])

/** Repository-relative root containing module route files. */
const MODULES_ROOT = resolve(__dirname, '../../src/modules')
const REPO_BE_ROOT = resolve(__dirname, '../..')

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

interface RouteRecord {
  file: string
  line: number
  method: string
  path: string
  module: string
  middlewareNames: string[]
}

interface MissingGateOffender {
  type: 'missing-gate'
  file: string
  line: number
  method: string
  path: string
  module: string
}

interface BadParamOffender {
  type: 'bad-param-name'
  file: string
  line: number
  method: string
  path: string
  module: string
  idParam: string
  pathTokens: string[]
}

type Offender = MissingGateOffender | BadParamOffender

// ──────────────────────────────────────────────────────────────────────────
// File discovery
// ──────────────────────────────────────────────────────────────────────────

/**
 * @description Recursively walks `dir` and returns absolute paths of every
 * file matching the predicate. Used in lieu of `fast-glob` to keep the test's
 * dependency footprint minimal.
 *
 * @param {string} dir - Directory to walk.
 * @param {(path: string) => boolean} predicate - File filter.
 * @returns {string[]} Absolute file paths matching the predicate.
 */
function walk(dir: string, predicate: (path: string) => boolean): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    let stats
    try {
      stats = statSync(full)
    } catch {
      continue
    }
    if (stats.isDirectory()) {
      out.push(...walk(full, predicate))
    } else if (predicate(full)) {
      out.push(full)
    }
  }
  return out
}

/**
 * @description Discovers every `*.routes.ts` file under
 * `be/src/modules/<domain>/[routes/]`. Both nested-route-folder layouts and
 * flat module layouts are supported (per `be/CLAUDE.md` module rules).
 *
 * @returns {string[]} Absolute paths of all module route files.
 */
function findRouteFiles(): string[] {
  return walk(MODULES_ROOT, (p) => p.endsWith('.routes.ts'))
}

// ──────────────────────────────────────────────────────────────────────────
// AST helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * @description Returns the leaf identifier name of a possibly-namespaced call
 * expression, e.g. `requirePermission` for `requirePermission(...)`,
 * `requirePermission` for `mw.requirePermission(...)`, and `bind` for
 * `controller.foo.bind(controller)`.
 *
 * @param {CallExpression} call - The call expression node.
 * @returns {string | null} The leaf function name, or null if not resolvable.
 */
function getCallLeafName(call: CallExpression): string | null {
  const expr = call.getExpression()
  if (expr.getKind() === SyntaxKind.Identifier) {
    return expr.getText()
  }
  if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
    // For `a.b.c(...)` we want `c`.
    const text = expr.getText()
    const dot = text.lastIndexOf('.')
    return dot >= 0 ? text.slice(dot + 1) : text
  }
  return null
}

/**
 * @description Recursively collects every callable middleware reference name
 * inside a single route-registration argument node. Handles bare identifiers
 * (`requireAuth`), call expressions (`requirePermission('users.read')`),
 * arrow/function expressions, array literals (e.g. `[mwA, mwB]`), and
 * `.bind()` chains (the controller pattern used throughout the codebase).
 *
 * The walker only needs to recognize NAMES — it does not need to resolve
 * imports. The gate function names (`requirePermission`, `requireAbility`,
 * `markPublicRoute`) are project-globally unique by convention.
 *
 * @param {Node} node - A middleware argument from a route registration.
 * @param {string[]} sink - Output array of collected names.
 */
function collectMiddlewareNames(node: Node, sink: string[]): void {
  // Direct identifier reference, e.g. `requireAuth`
  if (node.getKind() === SyntaxKind.Identifier) {
    sink.push(node.getText())
    return
  }
  // Call expression, e.g. `requirePermission('users.read')` or `controller.foo.bind(controller)`
  if (node.getKind() === SyntaxKind.CallExpression) {
    const call = node as CallExpression
    const leaf = getCallLeafName(call)
    if (leaf) sink.push(leaf)
    return
  }
  // Array literal of middlewares: forEach element
  if (node.getKind() === SyntaxKind.ArrayLiteralExpression) {
    node.forEachChild((child) => collectMiddlewareNames(child, sink))
    return
  }
  // Property access without a call (rare): e.g. `mw.requireAuth`
  if (node.getKind() === SyntaxKind.PropertyAccessExpression) {
    const text = node.getText()
    const dot = text.lastIndexOf('.')
    sink.push(dot >= 0 ? text.slice(dot + 1) : text)
    return
  }
  // Arrow / function expressions are anonymous gates — record a sentinel so
  // they're visible in the report but do NOT count as a gate.
  if (
    node.getKind() === SyntaxKind.ArrowFunction ||
    node.getKind() === SyntaxKind.FunctionExpression
  ) {
    sink.push('<inline-fn>')
    return
  }
}

/**
 * @description Extracts `:param` token names from an Express route path.
 * E.g. `/users/:id/sessions/:sessionId` → `['id', 'sessionId']`.
 *
 * @param {string} routePath - The route's path literal.
 * @returns {string[]} Param token names (without the leading colon).
 */
function extractPathParams(routePath: string): string[] {
  const matches = routePath.match(/:([A-Za-z_][A-Za-z0-9_]*)/g) ?? []
  return matches.map((m) => m.slice(1))
}

// ──────────────────────────────────────────────────────────────────────────
// Walker
// ──────────────────────────────────────────────────────────────────────────

/**
 * @description Parses a single route file and returns every mutating route
 * registration along with its discovered middleware names.
 *
 * @param {Project} project - Shared ts-morph project (for source caching).
 * @param {string} filePath - Absolute path to the route file.
 * @returns {RouteRecord[]} All mutating routes found in the file.
 */
function parseRouteFile(project: Project, filePath: string): RouteRecord[] {
  const sf = project.addSourceFileAtPath(filePath)
  const rel = relative(REPO_BE_ROOT, filePath)
  // Module name is the second segment of `src/modules/<module>/...`
  const segments = rel.split(/[\\/]/)
  const moduleIdx = segments.indexOf('modules')
  const moduleName = moduleIdx >= 0 ? (segments[moduleIdx + 1] ?? 'unknown') : 'unknown'

  const records: RouteRecord[] = []

  // Find every CallExpression of the form `<router>.<method>(...)`
  sf.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.CallExpression) return
    const call = node as CallExpression
    const expr = call.getExpression()
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) return

    // The leaf method name (e.g. 'post') and the receiver (e.g. 'router').
    const text = expr.getText()
    const dot = text.lastIndexOf('.')
    if (dot < 0) return
    const method = text.slice(dot + 1).toLowerCase()
    if (!MUTATING_METHODS.has(method)) return

    const args = call.getArguments()
    if (args.length < 2) return

    // First arg must be a string literal route path; otherwise we can't
    // analyze it (skip dynamic paths — extremely rare in this codebase).
    const firstArg = args[0]
    if (!firstArg) return
    if (
      firstArg.getKind() !== SyntaxKind.StringLiteral &&
      firstArg.getKind() !== SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
      return
    }
    const routePath = firstArg.getText().slice(1, -1) // strip quotes

    // All subsequent args are middlewares + final handler. Collect names.
    const middlewareNames: string[] = []
    for (let i = 1; i < args.length; i++) {
      const arg = args[i]
      if (arg) collectMiddlewareNames(arg, middlewareNames)
    }

    records.push({
      file: rel,
      line: call.getStartLineNumber(),
      method,
      path: routePath,
      module: moduleName,
      middlewareNames,
    })
  })

  return records
}

/**
 * @description Examines a route record and returns offenders, if any.
 * A route is reported when it lacks any gate middleware OR when its
 * `requireAbility(...)` idParam fails the path-token correctness check.
 *
 * Param-name correctness is only enforced when the route's own path string
 * contains at least one `:token`. Sub-routes mounted on a parent router whose
 * `:id` lives in the parent path will pass through (we cannot resolve mount
 * points statically without whole-program analysis).
 *
 * @param {RouteRecord} record - Parsed route record.
 * @param {Project} project - Shared ts-morph project for re-parsing args.
 * @returns {Offender[]} Zero or more offenders for this route.
 */
function evaluateRoute(record: RouteRecord, project: Project): Offender[] {
  const offenders: Offender[] = []

  // Gate-presence check
  const hasGate = record.middlewareNames.some((name) => GATE_FUNCTION_NAMES.has(name))
  if (!hasGate) {
    offenders.push({
      type: 'missing-gate',
      file: record.file,
      line: record.line,
      method: record.method,
      path: record.path,
      module: record.module,
    })
  }

  // Param-name correctness check (only if route has its own :params)
  const pathTokens = extractPathParams(record.path)
  if (pathTokens.length === 0) return offenders

  // Re-parse the file to find requireAbility calls with literal third arg
  // on the same line as our route registration.
  const sf = project.getSourceFile(join(REPO_BE_ROOT, record.file))
  if (!sf) return offenders

  sf.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.CallExpression) return
    const call = node as CallExpression
    if (call.getStartLineNumber() !== record.line) return
    const leaf = getCallLeafName(call)
    if (leaf !== 'requireAbility') return

    const args = call.getArguments()
    if (args.length < 3) return
    const thirdArg = args[2]
    if (!thirdArg) return
    if (
      thirdArg.getKind() !== SyntaxKind.StringLiteral &&
      thirdArg.getKind() !== SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
      return
    }
    const idParam = thirdArg.getText().slice(1, -1)
    if (!pathTokens.includes(idParam)) {
      offenders.push({
        type: 'bad-param-name',
        file: record.file,
        line: record.line,
        method: record.method,
        path: record.path,
        module: record.module,
        idParam,
        pathTokens,
      })
    }
  })

  return offenders
}

// ──────────────────────────────────────────────────────────────────────────
// Test
// ──────────────────────────────────────────────────────────────────────────

describe('Route sweep coverage gate (Phase 3)', () => {
  it(
    `every mutating route has requirePermission/requireAbility/markPublicRoute (ALLOW_OFFENDERS=${ALLOW_OFFENDERS})`,
    () => {
      const project = new Project({
        // Don't pull in the full tsconfig — we only need lightweight parsing.
        skipAddingFilesFromTsConfig: true,
        skipFileDependencyResolution: true,
        compilerOptions: { allowJs: false },
      })

      const files = findRouteFiles()
      expect(files.length).toBeGreaterThan(0)

      const allRecords: RouteRecord[] = []
      for (const file of files) {
        allRecords.push(...parseRouteFile(project, file))
      }

      const offenders: Offender[] = []
      for (const rec of allRecords) {
        offenders.push(...evaluateRoute(rec, project))
      }

      // ── Build per-module offender count for the report ────────────────
      const perModuleMissing = new Map<string, number>()
      const perModuleBadParam = new Map<string, number>()
      for (const off of offenders) {
        const target = off.type === 'missing-gate' ? perModuleMissing : perModuleBadParam
        target.set(off.module, (target.get(off.module) ?? 0) + 1)
      }

      const missingCount = offenders.filter((o) => o.type === 'missing-gate').length
      const badParamCount = offenders.filter((o) => o.type === 'bad-param-name').length

      // ── Print report regardless of pass/fail ──────────────────────────
      const lines: string[] = []
      lines.push('')
      lines.push('═══════════════════════════════════════════════════════════════════')
      lines.push('  Phase 3 Route Sweep Coverage Report')
      lines.push('═══════════════════════════════════════════════════════════════════')
      lines.push(`  Route files scanned     : ${files.length}`)
      lines.push(`  Mutating routes found   : ${allRecords.length}`)
      lines.push(`  Missing-gate offenders  : ${missingCount}`)
      lines.push(`  Bad-param offenders     : ${badParamCount}`)
      lines.push(`  ALLOW_OFFENDERS         : ${ALLOW_OFFENDERS}`)
      lines.push('───────────────────────────────────────────────────────────────────')
      lines.push('  Per-module offender counts (missing-gate / bad-param):')
      const allModules = new Set<string>([
        ...perModuleMissing.keys(),
        ...perModuleBadParam.keys(),
      ])
      const sortedModules = [...allModules].sort()
      if (sortedModules.length === 0) {
        lines.push('    (none — all routes gated)')
      } else {
        for (const mod of sortedModules) {
          const m = perModuleMissing.get(mod) ?? 0
          const b = perModuleBadParam.get(mod) ?? 0
          lines.push(`    ${mod.padEnd(24)} ${String(m).padStart(4)}  /  ${String(b).padStart(4)}`)
        }
      }
      lines.push('───────────────────────────────────────────────────────────────────')
      if (offenders.length > 0) {
        lines.push('  Offender details:')
        for (const off of offenders) {
          if (off.type === 'missing-gate') {
            lines.push(
              `    [missing-gate] ${off.file}:${off.line}  ${off.method.toUpperCase()} ${off.path}`,
            )
          } else {
            lines.push(
              `    [bad-param]    ${off.file}:${off.line}  ${off.method.toUpperCase()} ${off.path}  ` +
                `idParam='${off.idParam}' not in [${off.pathTokens.join(',')}]`,
            )
          }
        }
      }
      lines.push('═══════════════════════════════════════════════════════════════════')
      // eslint-disable-next-line no-console
      console.log(lines.join('\n'))

      // ── Enforcement decision ──────────────────────────────────────────
      if (ALLOW_OFFENDERS) {
        // Fail-soft: assert the walker actually ran on a non-empty corpus.
        expect(allRecords.length).toBeGreaterThan(0)
        return
      }

      // Enforcing mode (post-Wave 3): zero offenders required.
      expect(offenders).toEqual([])
    },
    60_000,
  )
})
