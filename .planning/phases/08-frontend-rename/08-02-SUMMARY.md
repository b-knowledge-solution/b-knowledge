---
phase: 08-frontend-rename
plan: 02
subsystem: ui
tags: [react, typescript, i18n, rename, knowledge-base, localization]

# Dependency graph
requires:
  - phase: 08-frontend-rename
    plan: 01
    provides: Renamed FE feature directory, types, API layer, query keys, routes, and navigation
provides:
  - All i18n keys renamed from projectManagement/projects to knowledgeBase namespace
  - English, Vietnamese, Japanese display values updated for Knowledge Base terminology
  - Cross-feature references in chat, search, and agent features updated
  - KnowledgeBasePicker component updated from projects to knowledgeBases prop
affects: [fe-build, cross-feature-consistency, agent-feature]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "knowledgeBase i18n namespace for all Knowledge Base UI strings"
    - "knowledgeBases prop naming convention for cross-feature KB picker"

key-files:
  created: []
  modified:
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json
    - fe/src/features/chat/pages/ChatAssistantManagementPage.tsx
    - fe/src/features/chat/components/ChatAssistantConfig.tsx
    - fe/src/features/search/pages/SearchAppManagementPage.tsx
    - fe/src/features/search/components/SearchAppConfig.tsx
    - fe/src/features/agents/api/agentApi.ts
    - fe/src/features/agents/types/agent.types.ts
    - fe/src/components/knowledge-base-picker/KnowledgeBasePicker.tsx

key-decisions:
  - "Used 'Co so tri thuc' for Knowledge Base in Vietnamese locale"
  - "Used katakana 'narejjibesu' for Knowledge Base in Japanese locale"
  - "Preserved external service project terminology in connector fields (Jira, Bitbucket, Asana)"
  - "System module converterApi projectId left as-is (different feature module, out of scope)"

patterns-established:
  - "knowledgeBase.* i18n namespace replaces both projectManagement.* and projects.* namespaces"
  - "KnowledgeBaseItem type uses 'knowledgeBase' instead of 'project' for type discriminator"

requirements-completed: [REN-01]

# Metrics
duration: 11min
completed: 2026-04-02
---

# Phase 08 Plan 02: i18n and Cross-Feature Rename Summary

**Renamed all i18n keys from projectManagement/projects to knowledgeBase namespace across 3 locales and updated cross-feature references in chat, search, and agent features**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-02T09:42:36Z
- **Completed:** 2026-04-02T09:54:08Z
- **Tasks:** 2
- **Files modified:** 51

## Accomplishments
- Renamed projectManagement top-level i18n key to knowledgeBase in en.json, vi.json, ja.json
- Merged projects secondary namespace into knowledgeBase namespace in all 3 locales
- Updated English display values from "Project" to "Knowledge Base" throughout
- Updated Vietnamese display values to "Co so tri thuc" equivalent
- Updated Japanese display values to katakana equivalent
- Updated all t() call sites across 45+ component files (including template literals and string literal label keys)
- Renamed rawProjects/projectItems to rawKnowledgeBases/knowledgeBaseItems in chat and search admin pages
- Updated KnowledgeBasePicker component props from projects to knowledgeBases
- Renamed project_id to knowledge_base_id in Agent interface, CreateAgentDto, and agentApi
- Preserved connector-related external service "project" terminology (Jira, Bitbucket, Asana)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename i18n keys and update all t() call sites** - `ae49c8f` (feat)
2. **Task 2: Update cross-feature references in chat, search, and agents** - `697bed2` (feat)
3. **Fix: Template literal and string literal i18n keys missed in initial rename** - `014c83d` (fix, deviation Rule 1)

## Files Created/Modified
- `fe/src/i18n/locales/en.json` - knowledgeBase namespace, English display values updated
- `fe/src/i18n/locales/vi.json` - knowledgeBase namespace, Vietnamese display values updated
- `fe/src/i18n/locales/ja.json` - knowledgeBase namespace, Japanese display values updated
- `fe/src/features/chat/pages/ChatAssistantManagementPage.tsx` - rawKnowledgeBases, knowledgeBaseItems
- `fe/src/features/chat/components/ChatAssistantConfig.tsx` - knowledgeBases prop
- `fe/src/features/search/pages/SearchAppManagementPage.tsx` - rawKnowledgeBases, knowledgeBaseItems
- `fe/src/features/search/components/SearchAppConfig.tsx` - knowledgeBases prop
- `fe/src/features/agents/api/agentApi.ts` - knowledge_base_id parameter
- `fe/src/features/agents/types/agent.types.ts` - knowledge_base_id field
- `fe/src/components/knowledge-base-picker/KnowledgeBasePicker.tsx` - knowledgeBases prop, knowledgeBase type
- 38 knowledge-base feature component files - t() calls updated

## Decisions Made
- Used "Co so tri thuc" for Knowledge Base in Vietnamese locale (standard Vietnamese translation)
- Used katakana for Knowledge Base in Japanese locale (consistent with existing loan word usage)
- Preserved external service project terminology in connector fields
- System module converterApi projectId left as-is (different feature module, out of scope for this plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed template literal and string literal i18n keys missed in initial rename**
- **Found during:** Task 1 verification
- **Issue:** Template literal t() calls (backtick syntax) and string literal labelKey props were not matched by the initial sed regex
- **Fix:** Applied additional sed passes and manual fix for remaining backtick template literals
- **Files modified:** BuiltInParserFields.tsx, DocumentsTab.tsx, DocumentsTabRedesigned.tsx, EntityPermissionModal.tsx, SettingsTab.tsx, SyncConnectionFields.tsx, SyncSchedulePanel.tsx
- **Commit:** 014c83d

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix ensures complete i18n rename. No scope creep.

## Known Stubs

None - all i18n keys are wired to their locale values.

## Issues Encountered
- Pre-existing TypeScript errors in unrelated features (ProviderFormDialog.tsx, ChatMessageList.tsx, UploadFilesModal.tsx) prevent clean `npm run build -w fe`. These errors exist on the branch prior to this plan and are out of scope.
- System module's converterApi.ts still uses `/api/projects/` endpoint URL and `projectId` parameter. Out of scope (different feature module).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All i18n keys use knowledgeBase namespace across 3 locales
- All cross-feature references updated
- Ready for Plan 03 (remaining cleanup if any)
- Pre-existing build errors should be fixed independently

---
*Phase: 08-frontend-rename*
*Completed: 2026-04-02*

## Self-Check: PASSED
- All key files verified present
- All 3 task commits verified in git log
