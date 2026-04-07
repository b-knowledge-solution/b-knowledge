# Migration Plan

**Researched:** 2026-04-07
**Confidence:** HIGH for steps a-c; MEDIUM for step d (depends on R6 design choices)

Concrete data migration steps for R10. Every step must be a Knex migration in `be/src/shared/db/migrations/YYYYMMDDhhmmss_*.ts`.

## (a) Seed `permissions` table from the new registry

**Approach:** Boot-time sync, not a migration. The migration only creates the empty `permissions` table; the upsert happens in the application boot path.

```ts
// be/src/shared/permissions/registry.ts (R1)
export const PERMISSION_REGISTRY = [
  { key: 'users.view', label: 'View users', module: 'users' },
  { key: 'users.create', label: 'Create users', module: 'users' },
  // ... ~120 entries from PERMISSION_INVENTORY.md
] as const
```

```ts
// be/src/app/index.ts (boot sequence, after migrations run)
await syncPermissionRegistry(PERMISSION_REGISTRY)
// Internally: upsert by key, soft-delete keys not in registry (or just leave for audit)
```

**Why boot sync, not migration:**
- The registry IS the source of truth (R1) — making developers write a migration every time they add a permission would defeat the entire goal of "one-line registry change."
- Sync is idempotent: safe to run on every boot.
- Removed permissions don't immediately delete `role_permissions` rows — they're flagged `is_deprecated=true` so admins can audit.

## (b) Seed `role_permissions` from current `ROLE_PERMISSIONS`

**Approach:** ONE-TIME data migration that runs after the empty `role_permissions` table is created.

Source: `be/src/shared/config/rbac.ts:113-164` (the `ROLE_PERMISSIONS` constant).

Mapping table from `PERMISSION_INVENTORY.md` "Day-One Seed" section. Concretely:

```ts
// 20260408120000_seed_role_permissions.ts
export async function up(knex: Knex) {
  const LEGACY_TO_NEW: Record<string, string[]> = {
    'manage_users':           ['users.view','users.create','users.edit','users.delete','users.view_ip','users.view_sessions','users.assign_role','users.assign_perms','teams.view','teams.create','teams.edit','teams.delete','teams.members','teams.permissions'],
    'manage_system':          ['broadcast.view','broadcast.create','broadcast.edit','broadcast.delete','system.view','system.parsing_config','system_tools.run'],
    'manage_knowledge_base':  ['knowledge_base.view','knowledge_base.create','knowledge_base.edit','knowledge_base.delete','knowledge_base.share','knowledge_base.chats','knowledge_base.searches','knowledge_base.sync','document_categories.view','document_categories.create','document_categories.edit','document_categories.delete','document_categories.import','sync_connectors.view','sync_connectors.create','sync_connectors.edit','sync_connectors.delete','sync_connectors.run'],
    'manage_datasets':        ['datasets.view','datasets.create','datasets.edit','datasets.delete','datasets.share','datasets.reindex','datasets.advanced','documents.view','documents.create','documents.edit','documents.delete','documents.parse','documents.bulk','documents.enrich','chunks.create','chunks.edit','chunks.delete'],
    'manage_storage':         ['storage.read','storage.write','storage.delete'],
    'manage_model_providers': ['llm_providers.view','llm_providers.create','llm_providers.edit','llm_providers.delete','llm_providers.test'],
    'view_chat':              ['chat.view'],
    'view_search':            ['search.view','preview.view'],
    'view_history':           ['user_history.view'],
    'view_analytics':         ['dashboard.view'],
    'view_system_tools':      ['system_tools.view'],
    'storage:read':           ['storage.read'],
    'storage:write':          ['storage.write'],
    'storage:delete':         ['storage.delete'],
  }

  const ROLE_PERMISSIONS = {
    'super-admin': [/* all 13 keys */],
    'admin':       [/* same as super-admin */],
    'leader':      ['view_chat','view_search','view_history','manage_users','manage_datasets','view_analytics','view_system_tools'],
    'user':        ['view_chat','view_search','view_history'],
  }

  const rows: Array<{ role: string; permission_key: string }> = []
  for (const [role, legacyKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const newKeys = new Set(legacyKeys.flatMap(k => LEGACY_TO_NEW[k] ?? []))
    for (const key of newKeys) rows.push({ role, permission_key: key })
  }

  await knex('role_permissions').insert(rows).onConflict(['role','permission_key']).ignore()
}
```

**Day-one parity guarantee:** because every legacy permission expands to its full set of new keys, every user retains exactly the operations they had before the migration.

## (c) Handle legacy `superadmin` / `member` aliases

### Inventory of legacy alias references (grep results)

| File | Line | Reference |
|---|---|---|
| `be/src/shared/constants/roles.ts` | 9 | `SUPERADMIN: 'superadmin'` (definition) |
| `be/src/shared/constants/roles.ts` | 12 | `MEMBER: 'member'` (definition) |
| `be/src/shared/constants/roles.ts` | 21 | `MEMBER: 'member'` (TeamRole — keep this one!) |
| `be/src/modules/knowledge-base/services/knowledge-base.service.ts` | 29 | `user.role === UserRole.SUPERADMIN` |
| `be/src/modules/sync/controllers/sync.controller.ts` | 71 | `user.role === UserRole.SUPERADMIN` |
| `be/src/shared/db/migrations/20260312000000_initial_schema.ts` | 93 | `table.text('role').notNullable().defaultTo('member')` (users.role default!) |
| `be/src/shared/db/seeds/00_sample_users.ts` | 295 | `role: 'member'` |
| `be/tests/projects/projects.service.test.ts` | 205, 209 | `role: 'superadmin'` |
| `be/tests/chat/chat-dialog.service.test.ts` | 139, 143, 345, 346 | `role: 'superadmin'` |
| `be/tests/search/search.service.comprehensive.test.ts` | 306, 310 | `role: 'superadmin'` |
| `be/tests/teams/team.service.test.ts` | 136, 169, 170, 193 | `role: 'member'` (these are TeamRole — keep) |

### Migration steps

1. **Knex migration** to normalize existing user rows:
   ```ts
   await knex('users').where({ role: 'superadmin' }).update({ role: 'super-admin' })
   await knex('users').where({ role: 'member' }).update({ role: 'user' })
   await knex.schema.alterTable('users', t => {
     t.text('role').notNullable().defaultTo('user').alter()  // change default from 'member' → 'user'
   })
   ```
2. **Code cleanup** (one PR, multi-file):
   - Delete `UserRole.SUPERADMIN` and `UserRole.MEMBER` from `be/src/shared/constants/roles.ts`
   - Replace `UserRole.SUPERADMIN` references with `UserRole.SUPER_ADMIN` in `knowledge-base.service.ts:29` and `sync.controller.ts:71`
   - Update tests in `be/tests/{projects,chat,search}/` to use `'super-admin'`
   - Leave `TeamRole.MEMBER` alone — it's a separate enum for team membership, not user roles
3. **Type-level enforcement**: TypeScript compile errors on remaining `superadmin`/`member` user-role references will surface anything missed.

## (d) Handle existing KB share / team-membership data

### Existing tables

| Table | Source | Lineage |
|---|---|---|
| `knowledge_base_entity_permissions` (was `project_entity_permissions`) | `initial_schema.ts:1236`, `rename_projects_to_knowledge_base.ts` | The proto-`resource_grants`. Migrate INTO new table. |
| `knowledge_base_members` | Routes L145-147 in `knowledge-base.routes.ts`; service-layer member CRUD | Distinct concept: principal-on-KB grant. |
| `knowledge_base_permissions` (project-level grants) | Implied by `initial_schema.ts:1095-1103` (`project_id, grantee_type, grantee_id`) | Also a resource_grants candidate. |
| `team_members` | `team.service.ts:317` | TeamRole, not UserRole. Used for grantee_type='team'. KEEP as-is. |

### Decision: migrate `knowledge_base_entity_permissions` and `knowledge_base_permissions` INTO `resource_grants`. Keep `knowledge_base_members` and `team_members` separate.

**Rationale:**
- `entity_permissions` and `kb_permissions` are explicitly resource grants (per-entity, per-grantee).
- `kb_members` is closer to a **role assignment within a KB** (member, leader). These map better to `team_members` than to `resource_grants`. Keeping them separate avoids losing the membership semantic.
- `team_members` is the principal definition that grant rows reference via `grantee_type='team'`. It should never be flattened into `resource_grants`.

### Migration script (sketch)

```ts
// 20260408130000_migrate_entity_permissions_to_resource_grants.ts
export async function up(knex: Knex) {
  // Map permission_level → actions[]
  const LEVEL_TO_ACTIONS: Record<string,string[]> = {
    'none':   [],
    'view':   ['view'],
    'create': ['view','create'],
    'edit':   ['view','create','edit'],
    'delete': ['view','create','edit','delete'],
  }
  const ENTITY_TO_RESOURCE: Record<string,string> = {
    'category': 'DocumentCategory',
    'chat':     'ChatAssistant',
    'search':   'SearchApp',
  }

  // Pull entity permissions joined with parent KB for tenant_id
  const rows = await knex('knowledge_base_entity_permissions as p')
    .join('knowledge_bases as kb','kb.id','p.knowledge_base_id')
    .select('p.*','kb.tenant_id')

  const grants = rows.flatMap(r => {
    const actions = LEVEL_TO_ACTIONS[r.permission_level]
    if (!actions || actions.length === 0) return []
    return [{
      tenant_id: r.tenant_id,
      resource_type: ENTITY_TO_RESOURCE[r.entity_type],
      resource_id: r.entity_id,
      grantee_type: r.grantee_type,
      grantee_id: r.grantee_id,
      actions,
      created_by: r.created_by,
      created_at: r.created_at,
    }]
  })

  if (grants.length) {
    await knex('resource_grants').insert(grants)
      .onConflict(['tenant_id','resource_type','resource_id','grantee_type','grantee_id']).ignore()
  }

  // Then migrate kb-level grants from knowledge_base_permissions table
  // (similar pattern with resource_type='KnowledgeBase')
}

// down(): truncate the rows we inserted (track via a marker column or a one-time tag)
```

**Backward-compat shim:** During the rollout window, leave `knowledge_base_entity_permissions` populated in parallel with writes going to both tables. Drop the old table only in the next milestone after R3 is fully proven in production.

## Sequencing summary

1. Migration: create `permissions`, `role_permissions`, `user_permission_overrides`, `resource_grants` tables (empty)
2. Boot sync: upsert `permissions` from registry (R1 + R2)
3. Migration: seed `role_permissions` from `LEGACY_TO_NEW` mapping
4. Migration: normalize `users.role` legacy aliases + change column default
5. Migration: backfill `resource_grants` from `knowledge_base_entity_permissions` and `knowledge_base_permissions`
6. Code change: switch `requirePermission` and `requireAbility` to read from DB (R3)
7. Code change: deprecate `rbac.ts` to a generated shim that just reads from `role_permissions` (R3)
8. Code change: kill legacy alias references (R10)
9. Test run: verify every existing user retains their pre-migration permission set

Step 6 is the moment where the cutover happens. Everything before it is non-breaking.
