# Open Questions for Requirements Step

**Researched:** 2026-04-07

These need a human decision before the roadmap can be finalized. Each question lists the options, the tradeoff, and a recommendation.

## Q1. Does `manage` collapse `view+create+edit+delete`, or stay separate?

**Context:** CASL natively supports `'manage'` as a wildcard action that subsumes all CRUD. The existing `ability.service.ts` uses `'manage'` for admin/leader on most subjects (lines 117-140). Meanwhile the new registry proposes split keys like `users.view`, `users.create`, `users.edit`, `users.delete`.

**Options:**
- **A. Collapse:** `manage` is the only "admin" action; granting it in `role_permissions` implies all four sub-actions. Simpler audit, simpler UI ("checkbox: Manage Users").
- **B. Separate:** `manage` is its own permission key (e.g. `users.manage`) that doesn't imply the others. Admins must explicitly grant each action. Maximally flexible but verbose.
- **C. Hybrid (recommended):** `manage` is a CASL action that the ability builder treats as `view + create + edit + delete`, but in `role_permissions` and `user_permission_overrides` we store the four sub-keys explicitly. The registry exposes both `users.view` (for fine-grained gating) and a synthetic `users.*` (for "all of the above" UI).

**Recommendation:** **C**. Storing the sub-keys explicitly makes audit ("who has edit on users?") trivial and avoids special-case logic in the override layer. The UI can offer "Grant all" as syntactic sugar that expands to the four rows.

## Q2. Do grants on a parent KB cascade to its categories, or are they independent?

**Context:** Today, a user with `requireAbility('manage','KnowledgeBase')` can manage every category inside it (the routes in `knowledge-base.routes.ts:79-107` only check the KB-level ability). But the new `resource_grants` model proposes separate `resource_type='KnowledgeBase'` and `resource_type='DocumentCategory'` grants.

**Options:**
- **A. Cascade:** A KB grant implies an equivalent grant on every category (and version) inside that KB. Category grants are an **additive** layer for sharing categories beyond what the KB grants would allow.
- **B. Independent:** Category grants and KB grants are unrelated. A user with `view` on the KB but no category grant sees the KB metadata but no categories.
- **C. Cascade-with-deny:** Cascade by default, but a category-level **deny** grant can revoke a sub-category from someone with KB access.

**Recommendation:** **A** for this milestone. Independent grants are confusing and don't match user mental model ("if I can read the whole KB, I can read the parts of it"). C is correct long-term but not necessary now. Document the choice clearly in Admin UI.

**Implication for ability builder:** When loading grants for a user, expand each `KnowledgeBase` grant into `(grant on KB) + (synthetic grant on every Category in that KB)` at query time, or compute grant-coverage in two passes during the OpenSearch filter build. Either approach is fine — pick at implementation time.

## Q3. Is the `role` grantee_type allowed in `resource_grants`?

**Context:** `knowledge_base_entity_permissions` only supports `grantee_type ∈ ('user','team')`. The new design could extend to `'role'` ("all leaders can read this category"), but that overlaps with `role_permissions`.

**Options:**
- **A. Yes:** Three grantee types: user, team, role. Role grants are `(role + resource_id)` pairs that act as "everyone with this role gets these actions on this specific resource."
- **B. No:** Two types only (user, team). Role-level access goes through `role_permissions` (which is resource-agnostic).

**Recommendation:** **A**. Real workflows want "all leaders can edit the SOP-2026 category" without listing every leader. The cost is one extra column value and one extra branch in the query. Worth it.

## Q4. Should `user_permission_overrides` allow both grants AND denials?

**Context:** Per-user overrides could be allow-only ("user X gets bonus permission Y") or two-way ("user X is denied permission Y even though their role grants it").

**Options:**
- **A. Allow-only:** Simpler. Denials require demoting the user to a different role.
- **B. Two-way:** Schema has an `effect: 'allow' | 'deny'` column. Aligns with the existing `AbacPolicyRule` pattern in `ability.service.ts:55-68`.

**Recommendation:** **B**. The whole point of overrides (per the PROJECT.md goal "exceptions to role defaults without inventing new roles") is to handle edge cases — and edge cases are often "this person specifically should NOT have X." Implementation cost is one column; ability builder handles `deny` after `allow` to enforce precedence.

## Q5. Is `expires_at` on grants in scope or stretch?

**Context:** PROJECT.md "Out of Scope" lists "Time-bounded grants UI" as a stretch goal but says the schema supports `expires_at`. The schema decision still has to be made now.

**Recommendation:** Add `expires_at TIMESTAMPTZ NULL` to `resource_grants` and `user_permission_overrides` as part of R2. Don't build the admin UI in this milestone, but the column existing means a future migration isn't needed and the ability builder can already filter by `WHERE expires_at IS NULL OR expires_at > NOW()`.

## Q6. How do we handle `requireOwnership` admin bypass post-migration?

**Context:** R-9 in `RISKS.md`. Today, `auth.middleware.ts:274,328` uses `ADMIN_ROLES.includes(...)` for the IDOR-prevention bypass. After migration, what's the analog?

**Options:**
- **A. Hardcode:** Keep `ADMIN_ROLES` as a constant in the shim. Bypass behavior unchanged.
- **B. New permission key:** Introduce `system.bypass_ownership` and check via `hasPermission`. Cleaner but means an admin could be stripped of bypass while keeping admin role (probably never desired).
- **C. Defer:** Out of scope for this milestone.

**Recommendation:** **C** + **A** as the bridge. Document as a known issue and revisit in the next milestone.

## Q7. Do public/embed routes need permission gating, or just rate limiting?

**Context:** `agent-embed.routes.ts`, `chat-embed.routes.ts`, `search-embed.routes.ts`, `chat-openai.routes.ts`, `search-openai.routes.ts`, `external-api.routes.ts`, `agent-webhook.routes.ts`, `llm-provider-public.routes.ts` — none have session-based auth middleware.

**Options:**
- **A. Out of scope:** These use API key / embed token auth, separate from session permissions. Don't touch them in R4.
- **B. In scope but separate keys:** Define `<feature>.embed` and `<feature>.api` permissions that are checked against the API key's owning user's permission set.

**Recommendation:** **B**, but only for the API key path (`api-key.routes.ts`). Public embed tokens are intentionally pre-shared and don't carry user identity. R4 should explicitly state which routes are out of scope.

## Q8. Where does `super-admin` cross-tenant manage live?

**Context:** PROJECT.md says "Tenant model: All permissions stay tenant-scoped." But `ability.service.ts:104` short-circuits super-admin to `can('manage', 'all')` with NO tenant condition. That means super-admin can read across tenants today.

**Question:** Is this intentional? Should the new system preserve it or lock super-admin to a single tenant too?

**Recommendation:** Preserve current behavior (super-admin bypasses tenant check) BUT document it explicitly in the registry as "the only role that violates tenant isolation, used only for platform support." Add an audit log entry every time a super-admin acts on a tenant they're not "in."

## Q9. Permission catalog endpoint shape

**Context:** R7 says `GET /api/permissions/catalog` returns all known permission keys. Should it also return the role assignments (i.e. the full `role_permissions` table) or just the catalog?

**Options:**
- **A. Catalog only:** Just `[{ key, label, module }]`. Role-permissions queried separately.
- **B. Catalog + role defaults:** `{ permissions: [...], role_defaults: { admin: [...], leader: [...] } }`. Saves a round-trip on the admin matrix view.

**Recommendation:** **B**. The admin UI needs both. One endpoint, one render.
