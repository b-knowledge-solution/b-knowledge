---
phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge
plan: 10
subsystem: agents
tags: [embed-widget, abac, sse, operator-forms, react, express]

requires:
  - phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge
    provides: "Agent canvas with ReactFlow, operator palette, executor service, and SSE streaming (Plans 03, 05)"
provides:
  - "Agent embed widget with token authentication and SSE streaming"
  - "ABAC policy enforcement on all agent routes via requireAbility middleware"
  - "5 core operator config forms: Generate, Retrieval, Begin, Switch, Code"
  - "FORM_MAP dispatch pattern in NodeConfigPanel for extensible operator forms"
affects: [agent-testing, agent-deployment, embed-widgets]

tech-stack:
  added: []
  patterns: [embed-token-auth-for-agents, form-map-dispatch, node-form-props-interface]

key-files:
  created:
    - be/src/modules/agents/services/agent-embed.service.ts
    - be/src/modules/agents/controllers/agent-embed.controller.ts
    - be/src/modules/agents/routes/agent-embed.routes.ts
    - fe/src/features/agent-widget/components/AgentWidgetButton.tsx
    - fe/src/features/agent-widget/api/agentWidgetApi.ts
    - fe/src/features/agent-widget/index.ts
    - fe/src/features/agents/components/canvas/forms/GenerateForm.tsx
    - fe/src/features/agents/components/canvas/forms/RetrievalForm.tsx
    - fe/src/features/agents/components/canvas/forms/BeginForm.tsx
    - fe/src/features/agents/components/canvas/forms/SwitchForm.tsx
    - fe/src/features/agents/components/canvas/forms/CodeForm.tsx
    - fe/src/features/agents/components/canvas/forms/types.ts
  modified:
    - be/src/app/routes.ts
    - be/src/modules/agents/routes/agent.routes.ts
    - be/src/modules/agents/index.ts
    - fe/src/features/agents/components/canvas/NodeConfigPanel.tsx

key-decisions:
  - "Embed routes use token-in-URL pattern (matching chat/search embed) rather than external-auth Bearer middleware"
  - "ABAC requireAbility middleware added to all agent CRUD, action, and execution routes"
  - "FORM_MAP uses Partial<Record<OperatorType, Component>> so unmapped operators fall through to JSON editor"
  - "Type-specific forms call onUpdate on every field change (no explicit Apply button needed)"

patterns-established:
  - "NodeFormProps interface: { nodeId, config, onUpdate } shared by all operator forms"
  - "FORM_MAP dispatch in NodeConfigPanel: maps OperatorType to React component, falls back to generic editor"
  - "Agent embed token reuses shared EmbedTokenService with agent_embed_tokens table"

requirements-completed: [AGENT-EMBED-ABAC-FORMS]

duration: 9min
completed: 2026-03-22
---

# Phase 01 Plan 10: Agent Embed Widget, ABAC, and Core Forms Summary

**Embeddable agent widget with token auth + SSE streaming, ABAC on all agent routes, and 5 type-specific operator config forms (Generate, Retrieval, Begin, Switch, Code)**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-22T17:36:12Z
- **Completed:** 2026-03-22T17:45:14Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Agent embed widget with floating chat panel, SSE stream consumption, and token-based auth
- ABAC requireAbility middleware enforced on all agent CRUD, action, and execution routes
- 5 core operator forms with full interactive controls (sliders, selects, dynamic lists)
- FORM_MAP dispatch pattern established for extensible operator form system

## Task Commits

Each task was committed atomically:

1. **Task 1: Agent embed service, routes, and widget** - `04db352` (feat)
2. **Task 2: 5 core operator configuration forms** - `c9cfca5` (feat)

## Files Created/Modified
- `be/src/modules/agents/services/agent-embed.service.ts` - Token generation, SSE streaming, config retrieval
- `be/src/modules/agents/controllers/agent-embed.controller.ts` - HTTP handlers for embed endpoints
- `be/src/modules/agents/routes/agent-embed.routes.ts` - Public embed routes with token-in-URL auth
- `be/src/app/routes.ts` - Embed routes registered before authenticated agent routes
- `be/src/modules/agents/routes/agent.routes.ts` - ABAC requireAbility on all routes
- `fe/src/features/agent-widget/components/AgentWidgetButton.tsx` - Self-contained embed widget
- `fe/src/features/agent-widget/api/agentWidgetApi.ts` - Widget API with token auth
- `fe/src/features/agent-widget/index.ts` - Barrel export
- `fe/src/features/agents/components/canvas/forms/GenerateForm.tsx` - LLM config with sliders
- `fe/src/features/agents/components/canvas/forms/RetrievalForm.tsx` - RAG retrieval config
- `fe/src/features/agents/components/canvas/forms/BeginForm.tsx` - Start node with variables
- `fe/src/features/agents/components/canvas/forms/SwitchForm.tsx` - Conditional branches
- `fe/src/features/agents/components/canvas/forms/CodeForm.tsx` - Code editor with language select
- `fe/src/features/agents/components/canvas/forms/types.ts` - Shared NodeFormProps interface
- `fe/src/features/agents/components/canvas/NodeConfigPanel.tsx` - FORM_MAP dispatch + fallback

## Decisions Made
- Embed routes use token-in-URL pattern (matching chat/search embed) rather than external-auth Bearer middleware
- ABAC requireAbility middleware added to all agent routes (read for GET, manage for mutations)
- FORM_MAP uses Partial<Record<OperatorType, Component>> so unmapped operators fall through to JSON editor
- Type-specific forms propagate updates on every field change (no explicit Apply button like JSON editor)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added explicit type annotations for strict TypeScript**
- **Found during:** Task 2 (operator forms)
- **Issue:** FE tsconfig uses noImplicitAny and exactOptionalPropertyTypes; callback params in Select/Slider/Switch needed explicit types
- **Fix:** Added `: string`, `: number[]`, `: boolean` type annotations to all onValueChange/onCheckedChange callbacks
- **Files modified:** All 5 form files
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** c9cfca5 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type annotation fix required by strict TS config. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 10 plans in Phase 01 complete
- Agent feature fully migrated: models, canvas, executor, SSE, debug, MCP, sandbox, webhook, templates, embed, ABAC, forms
- Ready for testing and integration validation

---
*Phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge*
*Completed: 2026-03-22*
