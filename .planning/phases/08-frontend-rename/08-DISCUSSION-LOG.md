# Phase 8: Frontend Rename - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 08-frontend-rename
**Areas discussed:** URL & route naming, UI label & i18n, File & component naming, TanStack Query keys

---

## URL & Route Naming

### URL Path

| Option | Description | Selected |
|--------|-------------|----------|
| /data-studio/knowledge-base | Singular, consistent with BE route | ✓ |
| /data-studio/knowledge-bases | Plural, more natural for list pages | |
| /data-studio/kb | Short abbreviation | |

**User's choice:** /data-studio/knowledge-base (singular)

### Route Parameter

| Option | Description | Selected |
|--------|-------------|----------|
| :knowledgeBaseId | Full, explicit | ✓ |
| :kbId | Short | |
| :id | Generic | |

**User's choice:** :knowledgeBaseId

---

## UI Label & i18n

### Display Label

| Option | Description | Selected |
|--------|-------------|----------|
| Knowledge Base | Full label everywhere | ✓ |
| KB in nav, full elsewhere | Abbreviated in sidebar | |
| Knowledge Base + KB abbrev | Mixed usage | |

**User's choice:** Knowledge Base (full everywhere)

### i18n Key Naming

| Option | Description | Selected |
|--------|-------------|----------|
| Rename keys to knowledgeBase.* | Clean, full consistency | ✓ |
| Rename keys to kb.* | Short | |
| You decide | Claude picks | |

**User's choice:** knowledgeBase.* namespace

---

## File & Component Naming

### Feature Directory

| Option | Description | Selected |
|--------|-------------|----------|
| features/knowledge-base/ | Singular, matches BE module | ✓ |
| features/kb/ | Short | |

**User's choice:** features/knowledge-base/

### Component Naming Style

| Option | Description | Selected |
|--------|-------------|----------|
| KnowledgeBaseListPage.tsx | Full name, verbose but explicit | ✓ |
| KBListPage.tsx | Abbreviated, shorter | |
| You decide | Claude picks | |

**User's choice:** Full KnowledgeBase prefix

---

## TanStack Query Keys

### Query Key Namespace

| Option | Description | Selected |
|--------|-------------|----------|
| ['knowledge-base', ...] | Kebab-case, matches URL | ✓ |
| ['knowledgeBase', ...] | CamelCase, matches TS conventions | |
| You decide | Claude picks | |

**User's choice:** ['knowledge-base', ...] (kebab-case)

---

## Claude's Discretion

- File rename ordering within feature directory
- Handling of ragflowApi.ts
- Deletion of dead code (CategoryFilterTabs.tsx)
- Component rename mapping for non-"Project"-prefixed components
- Test file update strategy

## Deferred Ideas

None — discussion stayed within phase scope.
