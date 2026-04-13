// @ts-check
/**
 * @file Pure transform library for the permissions codemod (Phase 4 Plan 4.3).
 *
 * This module is intentionally side-effect free: it accepts a source string +
 * filename and returns the transformed source string. All disk I/O lives in
 * the CLI wrapper (`codemod-permissions.mjs`). The Vitest fixture suite drives
 * `transformSource` directly so the patterns are locked by tests.
 *
 * Conservative by design (per Phase 4 D-02): only mechanical 1:1 rewrites are
 * applied; ambiguous sites are left untouched and annotated with a
 * `// TODO(perm-codemod): review` marker for human follow-up.
 */

import { Project, SyntaxKind, QuoteKind, IndentationText } from 'ts-morph'

/**
 * @description Authoritative file → permission key mapping. Pinned at plan
 * time (Plan 4.3) and serves as the single source of truth — Plans 4.4 / 4.5
 * do NOT override these values. The keys here are matched against the input
 * filename via `endsWith` so the codemod works regardless of cwd.
 *
 * Semantics:
 *  - string value → rewrite the `isAdmin` const initializer to
 *    `useHasPermission(PERMISSION_KEYS.<value>)`
 *  - `null` value → site is admin-route gated upstream; do NOT rewrite and do
 *    NOT add a TODO. The redundant role check will be removed by hand later.
 *  - missing entry → leave const, prepend the "pick a key" TODO. This should
 *    not happen for any file in the RESEARCH inventory; a miss is a planning
 *    error worth surfacing.
 */
export const FILE_KEY_MAP = {
  // ── Datasets feature (RAG) ──
  'fe/src/features/datasets/components/DocumentTable.tsx': 'DATASETS_VIEW',
  'fe/src/features/datasets/components/DatasetCard.tsx': 'DATASETS_VIEW',
  'fe/src/features/datasets/components/ConnectorListPanel.tsx': 'DATASETS_VIEW',
  'fe/src/features/datasets/pages/DatasetDetailPage.tsx': 'DATASETS_VIEW',
  'fe/src/features/datasets/pages/DatasetsPage.tsx': 'DATASETS_VIEW',
  // ── Knowledge base feature ──
  'fe/src/features/knowledge-base/components/StandardTabRedesigned.tsx': 'KNOWLEDGE_BASE_EDIT',
  // ── Glossary feature ──
  'fe/src/features/glossary/pages/GlossaryPage.tsx': 'GLOSSARY_VIEW',
  'fe/src/features/glossary/components/KeywordManagementTab.tsx': 'GLOSSARY_EDIT',
  'fe/src/features/glossary/components/TaskManagementTab.tsx': 'GLOSSARY_EDIT',
  // ── System tools ──
  'fe/src/features/system/pages/SystemToolsPage.tsx': 'SYSTEM_TOOLS_VIEW',
  // ── Users / teams (display-only or admin-route gated; do nothing) ──
  'fe/src/components/ui/role-badge.tsx': null,
  'fe/src/features/users/components/RoleManagementTable.tsx': null,
  'fe/src/features/users/components/EditRoleDialog.tsx': null,
  'fe/src/features/teams/components/TeamMembersDialog.tsx': null,
}

/**
 * @description Skip-list patterns. Files whose path contains any of these
 * substrings (case-insensitive) are returned unchanged with no TODO marker.
 * These are out of codemod scope rather than "ambiguous".
 */
const SKIP_PATTERNS = [
  'features/teams/api/teamqueries',
  'features/knowledge-base/components/knowledgebasememberlist',
  'features/guideline/',
  'features/auth/',
  'constants/roles.ts',
]

const TODO_REVIEW = '// TODO(perm-codemod): review — replace with useHasPermission'

/**
 * @description Compute the leading whitespace (indent) of a node by walking
 * back from its start position to the previous newline. ts-morph's
 * `replaceWithText` does not preserve the original indentation, so we capture
 * it explicitly and re-prepend it on every line we emit.
 * @param {import('ts-morph').Node} node - The node whose indent we want.
 * @returns {string} The indent string (spaces/tabs).
 */
function getIndent(node) {
  const full = node.getSourceFile().getFullText()
  const start = node.getStart()
  let i = start - 1
  while (i >= 0 && full[i] !== '\n') i--
  return full.slice(i + 1, start)
}

/**
 * @description Prepend a single-line comment above a statement node while
 * preserving the statement's original indentation. Idempotency check is the
 * caller's responsibility.
 * @param {import('ts-morph').Node} stmt - The statement to annotate.
 * @param {string} comment - The full comment line (e.g. `// TODO(...)`).
 */
/**
 * @description Compute indent at an absolute character position by walking
 * backward to the previous newline. Operates on a source-text snapshot so it
 * is decoupled from the (mutable) ts-morph AST.
 * @param {string} text - The full source text.
 * @param {number} pos - Absolute character position of the target.
 * @returns {string} The leading indent string.
 */
function getIndentFromText(text, pos) {
  let i = pos - 1
  while (i >= 0 && text[i] !== '\n') i--
  return text.slice(i + 1, pos)
}
const TODO_PICK_KEY = '// TODO(perm-codemod): pick a PERMISSION_KEYS.<KEY> for this gate'
const TODO_MULTI_ROLE =
  '// TODO(perm-codemod): multi-role chain — manual migration required (split into useHasPermission calls per capability)'

/**
 * @description Check whether a filename matches the skip list.
 * @param {string} filename - The (possibly absolute) source file path.
 * @returns {boolean} True if the file should be skipped entirely.
 */
function isSkipped(filename) {
  // Normalize path separators so the check works on Windows + POSIX uniformly.
  const lower = filename.replace(/\\/g, '/').toLowerCase()
  return SKIP_PATTERNS.some((pat) => lower.includes(pat))
}

/**
 * @description Look up the permission-key mapping for a file by suffix match.
 * @param {string} filename - The source file path (relative or absolute).
 * @returns {{ found: boolean, key: string | null }} Match result. `found=false`
 * means the file is not in the inventory; `found=true, key=null` means the
 * file is intentionally a no-op (admin-route gated upstream).
 */
function lookupKey(filename) {
  const norm = filename.replace(/\\/g, '/')
  // Match by endsWith so cwd does not matter.
  for (const [path, key] of Object.entries(FILE_KEY_MAP)) {
    if (norm.endsWith(path)) {
      return { found: true, key }
    }
  }
  return { found: false, key: null }
}

/**
 * @description Decide whether a `BinaryExpression` matches the single-role
 * shape `user?.role === UserRole.X` (or string-literal form `'admin'`).
 * Multi-role OR-chains are explicitly NOT a match — see Pattern B comments.
 * @param {import('ts-morph').BinaryExpression} bin - The binary expression node.
 * @returns {boolean} True if this is a single-role equality comparison.
 */
function isSingleRoleEquality(bin) {
  // Operator must be strict equality.
  const op = bin.getOperatorToken().getText()
  if (op !== '===' && op !== '==') return false
  const left = bin.getLeft().getText().replace(/\s+/g, '')
  // Accept either `user?.role` or `user.role` on the left.
  if (left !== 'user?.role' && left !== 'user.role') return false
  const right = bin.getRight()
  // Right must be UserRole.<X> or a bare string literal — both single-role.
  if (right.getKind() === SyntaxKind.PropertyAccessExpression) {
    return right.getText().startsWith('UserRole.')
  }
  if (right.getKind() === SyntaxKind.StringLiteral) {
    return true
  }
  return false
}

/**
 * @description Pure source-to-source transform implementing the Plan 4.3
 * codemod. The function never touches disk — it operates on an in-memory
 * ts-morph project so it is fully deterministic and unit-testable.
 *
 * Patterns applied (in order):
 *   A) Strip `isAdmin` JSX attributes (the child component will gate itself).
 *   B) Rewrite `const isAdmin = user?.role === UserRole.X` (single-role only)
 *      into `const isAdmin = useHasPermission(PERMISSION_KEYS.<KEY>)` using
 *      `FILE_KEY_MAP`. Multi-role OR-chains are left unchanged with a TODO.
 *   C) Bare `user?.role === ...` boolean expressions outside an isAdmin const
 *      get a `// TODO(perm-codemod): review` marker.
 *   D) Consumer-side `isAdmin` prop elimination (Plan 4.3b). For files in
 *      `FILE_KEY_MAP` whose component receives `isAdmin: boolean` as a prop
 *      (Props interface/type alias + destructuring) we (1) drop the prop from
 *      the interface, (2) drop it from the destructuring pattern, (3) inject
 *      `const isAdmin = useHasPermission(PERMISSION_KEYS.<KEY>)` as the first
 *      statement of the function body. JSX usages are left untouched and
 *      transparently bind to the new local. Idempotent: re-running on a
 *      migrated file is a no-op.
 *   IMP) Insert `useHasPermission` + `PERMISSION_KEYS` imports if any rewrite
 *      introduced a reference to them. Idempotent — existing imports are not
 *      duplicated.
 *
 * @param {string} source - The original TypeScript / TSX source code.
 * @param {string} filename - The source filename (used for skip-list + key lookup).
 * @returns {string} The transformed source code (or original if no changes apply).
 */
export function transformSource(source, filename) {
  // Skip-list short-circuit. These files are out of codemod scope by policy.
  if (isSkipped(filename)) return source

  // Idempotency guard: if the file is already migrated AND has no banned
  // pattern, return as-is. We still run the full pass below because the lib
  // also handles partial migrations, but the import-insertion step is
  // explicitly dedupe-safe.

  const project = new Project({
    useInMemoryFileSystem: true,
    skipFileDependencyResolution: true,
    // Match repo style: single quotes, no semicolons.
    manipulationSettings: { quoteKind: QuoteKind.Single, indentationText: IndentationText.TwoSpaces },
  })
  // Suffix .tsx so ts-morph parses JSX even if the caller passes a .ts file.
  const file = project.createSourceFile(filename.replace(/\\/g, '/'), source, { overwrite: true })

  let needsHookImport = false
  let needsKeysImport = false
  let mutated = false
  /** @type {Array<{ pos: number, comment: string, marker: string }>} */
  const prepends = []

  // ── Pattern A: remove `isAdmin` JSX attributes ────────────────────────────
  // Snapshot first because removing nodes invalidates descendant iteration.
  const jsxAttrs = file
    .getDescendantsOfKind(SyntaxKind.JsxAttribute)
    .filter((attr) => attr.getNameNode().getText() === 'isAdmin')
  for (const attr of jsxAttrs) {
    attr.remove()
    mutated = true
  }

  // ── Pattern B: rewrite `const isAdmin = user?.role === UserRole.X` ────────
  const { key: mappedKey, found: fileFound } = lookupKey(filename)
  const varDecls = file
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .filter((d) => d.getName() === 'isAdmin')

  for (const decl of varDecls) {
    const init = decl.getInitializer()
    if (!init) continue
    // Already migrated? Idempotency: skip if initializer already calls useHasPermission.
    if (init.getText().includes('useHasPermission(')) continue
    if (init.getKind() !== SyntaxKind.BinaryExpression) continue
    const bin = /** @type {import('ts-morph').BinaryExpression} */ (init)
    const op = bin.getOperatorToken().getText()

    // Multi-role OR chain → leave unchanged + multi-role TODO (fixture 08).
    if (op === '||') {
      const stmt = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement)
      if (stmt) {
        const leading = stmt.getLeadingCommentRanges().map((r) => r.getText()).join('\n')
        if (!leading.includes('multi-role chain')) {
          prepends.push({ pos: stmt.getStart(), comment: TODO_MULTI_ROLE, marker: 'multi-role chain' })
        }
      }
      continue
    }

    // Single-role equality → rewrite (or TODO if not in inventory).
    if (!isSingleRoleEquality(bin)) continue

    if (fileFound && mappedKey === null) {
      // No-op file (admin-route gated upstream).
      continue
    }
    if (!fileFound) {
      // Not in inventory — annotate so a human picks the right key.
      const stmt = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement)
      if (stmt) {
        const leading = stmt.getLeadingCommentRanges().map((r) => r.getText()).join('\n')
        if (!leading.includes('pick a PERMISSION_KEYS')) {
          prepends.push({ pos: stmt.getStart(), comment: TODO_PICK_KEY, marker: 'pick a PERMISSION_KEYS' })
        }
      }
      continue
    }

    // Mechanical rewrite — replace the initializer.
    init.replaceWithText(`useHasPermission(PERMISSION_KEYS.${mappedKey})`)
    needsHookImport = true
    needsKeysImport = true
    mutated = true
  }

  // ── Pattern C: bare `user?.role === X` outside an isAdmin const ───────────
  // We mark only top-level statements that contain a role comparison and are
  // not `const isAdmin = ...` declarations (which Pattern B already handled).
  const bareBins = file.getDescendantsOfKind(SyntaxKind.BinaryExpression).filter((bin) => {
    if (!isSingleRoleEquality(bin)) return false
    // Skip if inside an isAdmin variable decl (Pattern B owns it).
    const parentVar = bin.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)
    if (parentVar && parentVar.getName() === 'isAdmin') return false
    return true
  })
  // Group by enclosing statement so we annotate once per statement.
  const annotatedStmts = new Set()
  for (const bin of bareBins) {
    const stmt = bin.getFirstAncestorByKind(SyntaxKind.VariableStatement) ||
      bin.getFirstAncestorByKind(SyntaxKind.ExpressionStatement) ||
      bin.getFirstAncestorByKind(SyntaxKind.ReturnStatement) ||
      bin.getFirstAncestorByKind(SyntaxKind.IfStatement)
    if (!stmt) continue
    const id = stmt.getStart()
    if (annotatedStmts.has(id)) continue
    const leading = stmt.getLeadingCommentRanges().map((r) => r.getText()).join('\n')
    if (leading.includes('TODO(perm-codemod): review')) {
      annotatedStmts.add(id)
      continue
    }
    prepends.push({ pos: stmt.getStart(), comment: TODO_REVIEW, marker: 'TODO(perm-codemod): review' })
    annotatedStmts.add(id)
  }

  // ── Pattern C-2: `switch (user?.role)` discriminant → annotate ────────────
  const switches = file.getDescendantsOfKind(SyntaxKind.SwitchStatement)
  for (const sw of switches) {
    const expr = sw.getExpression().getText().replace(/\s+/g, '')
    if (expr !== 'user?.role' && expr !== 'user.role') continue
    const leading = sw.getLeadingCommentRanges().map((r) => r.getText()).join('\n')
    if (leading.includes('TODO(perm-codemod): review')) continue
    prepends.push({ pos: sw.getStart(), comment: TODO_REVIEW, marker: 'TODO(perm-codemod): review' })
  }

  // ── Apply collected comment prepends in reverse position order ────────────
  // Reverse order keeps earlier positions valid while we mutate the buffer.
  // We use the file's current text snapshot to compute indent at each pos.
  if (prepends.length > 0) {
    const snapshot = file.getFullText()
    prepends.sort((a, b) => b.pos - a.pos)
    for (const { pos, comment } of prepends) {
      const indent = getIndentFromText(snapshot, pos)
      file.insertText(pos, `${comment}\n${indent}`)
      mutated = true
    }
  }

  // ── Pattern D: consumer-side `isAdmin` prop elimination ──────────────────
  // Fires only if (a) the file is in FILE_KEY_MAP with a non-null key and
  // (b) a component declared in the file has `isAdmin: boolean` in its Props
  // type AND destructures `isAdmin` from its parameter. We then drop the
  // prop from the interface, drop it from the destructure, and inject a
  // local `const isAdmin = useHasPermission(PERMISSION_KEYS.<KEY>)` as the
  // first statement of the function body. JSX usages remain valid since
  // they bind to the new local. See Plan 4.3b for the design rationale.
  if (fileFound && mappedKey !== null) {
    /**
     * @description Find the props parameter ObjectBindingPattern (with an
     * `isAdmin` element) for any function/arrow component in this file. We
     * walk all function-like declarations and inspect parameter[0].
     * @returns {Array<{ paramBinding: import('ts-morph').ObjectBindingPattern, body: import('ts-morph').Block, typeName: string | null }>}
     */
    function findCandidateComponents() {
      /** @type {Array<{ paramBinding: import('ts-morph').ObjectBindingPattern, body: import('ts-morph').Block, typeName: string | null }>} */
      const out = []
      const fnLikeKinds = [
        SyntaxKind.FunctionDeclaration,
        SyntaxKind.ArrowFunction,
        SyntaxKind.FunctionExpression,
      ]
      for (const kind of fnLikeKinds) {
        for (const fn of file.getDescendantsOfKind(kind)) {
          const params = /** @type {any} */ (fn).getParameters?.()
          if (!params || params.length === 0) continue
          const param0 = params[0]
          const nameNode = param0.getNameNode()
          if (nameNode.getKind() !== SyntaxKind.ObjectBindingPattern) continue
          const binding = /** @type {import('ts-morph').ObjectBindingPattern} */ (nameNode)
          const hasIsAdmin = binding.getElements().some((el) => el.getName() === 'isAdmin')
          if (!hasIsAdmin) continue
          const body = /** @type {any} */ (fn).getBody?.()
          if (!body || body.getKind() !== SyntaxKind.Block) continue
          // Capture the type-annotation name (Props interface) if any.
          let typeName = null
          const typeNode = param0.getTypeNode()
          if (typeNode) {
            const txt = typeNode.getText()
            // Strip generic args, take the bare identifier.
            const m = txt.match(/^([A-Za-z_$][\w$]*)/)
            if (m) typeName = m[1]
          }
          out.push({ paramBinding: binding, body, typeName })
        }
      }
      return out
    }

    const candidates = findCandidateComponents()
    if (candidates.length > 0) {
      // Idempotency check — first body already starts with the migrated const.
      const firstBody = candidates[0].body
      const firstStmt = firstBody.getStatements()[0]
      const alreadyMigrated =
        firstStmt && firstStmt.getText().includes('useHasPermission(PERMISSION_KEYS.')
      if (!alreadyMigrated) {
        // D.1 — Strip `isAdmin` from any matching Props interface/type alias.
        // We accept either an InterfaceDeclaration or a TypeAliasDeclaration
        // whose body is a TypeLiteralNode. Match by type name (when known)
        // or fall back to "name endsWith Props" heuristic.
        const typeNames = new Set(candidates.map((c) => c.typeName).filter(Boolean))
        for (const iface of file.getInterfaces()) {
          if (typeNames.size > 0 && !typeNames.has(iface.getName())) continue
          const prop = iface.getProperty('isAdmin')
          if (prop) {
            prop.remove()
            mutated = true
          }
        }
        for (const alias of file.getTypeAliases()) {
          if (typeNames.size > 0 && !typeNames.has(alias.getName())) continue
          const tn = alias.getTypeNode()
          if (!tn || tn.getKind() !== SyntaxKind.TypeLiteral) continue
          const lit = /** @type {import('ts-morph').TypeLiteralNode} */ (tn)
          const member = lit.getProperty('isAdmin')
          if (member) {
            member.remove()
            mutated = true
          }
        }

        // D.3 — Inject local const into the FIRST candidate's body. We do
        // this BEFORE D.2 because rebuilding the destructuring pattern via
        // replaceWithText forgets descendant nodes — and the body is fine to
        // mutate independently (it lives in a sibling subtree).
        firstBody.insertStatements(0, `const isAdmin = useHasPermission(PERMISSION_KEYS.${mappedKey})`)
        if (candidates.length > 1) {
          firstBody.insertStatements(
            0,
            `// TODO(perm-codemod): multiple isAdmin consumers in one file — verify each matches PERMISSION_KEYS.${mappedKey}`,
          )
        }

        // D.2 — Remove `isAdmin` from each candidate's destructuring pattern.
        // BindingElement has no `.remove()` in ts-morph, so rebuild the
        // ObjectBindingPattern text with the `isAdmin` element filtered out.
        // Done LAST so any prior ancestor mutations don't forget these nodes.
        for (const { paramBinding } of candidates) {
          // Re-fetch elements: prior body insertions may have updated positions
          // but the binding pattern node itself is still valid.
          if (paramBinding.wasForgotten()) continue
          const elements = paramBinding.getElements()
          const remaining = elements
            .filter((e) => e.getName() !== 'isAdmin')
            .map((e) => e.getText())
          if (remaining.length !== elements.length) {
            paramBinding.replaceWithText(`{ ${remaining.join(', ')} }`)
            mutated = true
          }
        }
        needsHookImport = true
        needsKeysImport = true
        mutated = true
      }
    }
  }

  // ── Imports: ensure useHasPermission + PERMISSION_KEYS are present ───────
  if (needsHookImport) {
    const existing = file.getImportDeclaration((d) => d.getModuleSpecifierValue() === '@/lib/permissions')
    if (existing) {
      const named = existing.getNamedImports().map((n) => n.getName())
      if (!named.includes('useHasPermission')) {
        existing.addNamedImport('useHasPermission')
      }
    } else {
      file.addImportDeclaration({
        moduleSpecifier: '@/lib/permissions',
        namedImports: ['useHasPermission'],
      })
    }
  }
  if (needsKeysImport) {
    const existing = file.getImportDeclaration(
      (d) => d.getModuleSpecifierValue() === '@/constants/permission-keys',
    )
    if (existing) {
      const named = existing.getNamedImports().map((n) => n.getName())
      if (!named.includes('PERMISSION_KEYS')) {
        existing.addNamedImport('PERMISSION_KEYS')
      }
    } else {
      file.addImportDeclaration({
        moduleSpecifier: '@/constants/permission-keys',
        namedImports: ['PERMISSION_KEYS'],
      })
    }
  }

  if (!mutated) return source
  // ts-morph emits new import declarations with trailing semicolons regardless
  // of QuoteKind. The repo style is no-semicolons, so strip the trailing `;`
  // on any import line that we (or ts-morph) inserted.
  return file
    .getFullText()
    .replace(/^(import\s.+from\s+'[^']+');$/gm, '$1')
}
