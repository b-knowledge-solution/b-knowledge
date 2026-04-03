---
name: be-expressjs
description: Backend development skill — enforces B-Knowledge BE architecture for new modules, routes, services, and models. Use this whenever working in be/, creating Express routes, adding API endpoints, writing Knex models, or modifying backend modules.
---

# B-Knowledge Backend Development Skill

Use this skill when creating or modifying modules, routes, controllers, services, or models in the `be/` workspace.

## Stack

- Node.js 22+, Express 4, TypeScript strict, ESM (`.js` import extensions)
- Knex ORM + PostgreSQL, Redis for sessions/cache
- Zod for request validation
- Socket.IO for real-time events
- Path alias: `@/*` → `be/src/*`
- Logging: Winston via `@/shared/services/logger.service.js`
- Config: Always use `config` object from `@/shared/config/index.js` — never `process.env` directly

## Module Layout Decision

Choose layout based on file count:

### Sub-directory layout (5+ files)

```
modules/<domain>/
├── routes/
│   └── <domain>.routes.ts
├── controllers/
│   └── <domain>.controller.ts
├── services/
│   └── <domain>.service.ts
├── models/
│   └── <domain>.model.ts
├── schemas/
│   └── <domain>.schemas.ts
└── index.ts                    # Barrel export
```

### Flat layout (4 or fewer files)

```
modules/<domain>/
├── <domain>.controller.ts
├── <domain>.routes.ts
├── <domain>.service.ts
└── index.ts                    # Barrel export
```

**Flat modules:** `auth`, `dashboard`, `preview`, `system-tools`, `user-history`

---

## Import Rules

1. **Cross-module imports** — barrel files only: `import { someService } from '@/modules/<other>/index.js'`
2. **Never deep-import** across modules: `@/modules/chat/services/chat.service.js` is **forbidden** from another module
3. **Within same module** — direct paths are fine: `import { myService } from '../services/my.service.js'`
4. **Shared imports**: `@/shared/middleware/`, `@/shared/services/`, `@/shared/models/`, `@/shared/db/`, `@/shared/utils/`
5. **Always use `.js` extension** in import paths (ESM requirement)
6. **Config access**: `import { config } from '@/shared/config/index.js'` — never `process.env.SOME_VAR`

---

## Patterns & Code Examples

### Barrel File (`index.ts`)

```ts
// Flat module
export { default as domainRoutes } from './domain.routes.js'
export { domainService } from './domain.service.js'

// Sub-directory module
export { default as domainRoutes } from './routes/domain.routes.js'
export { domainService } from './services/domain.service.js'
```

### Zod Schemas (`schemas/<domain>.schemas.ts`)

All mutations (POST/PUT/DELETE) require Zod validation:

```ts
import { z } from 'zod'

/**
 * UUID parameter validation.
 * @description Validates route params containing a UUID id.
 */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
})

/**
 * Create domain item schema.
 * @description Validates the request body for creating a domain item.
 */
export const createDomainSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(1000).optional(),
  is_active: z.boolean().optional(),
})

/**
 * Update domain item schema.
 * @description All fields optional for partial updates.
 */
export const updateDomainSchema = createDomainSchema.partial()
```

### Routes (`routes/<domain>.routes.ts`)

- `requireAuth` on all authenticated routes
- `validate()` on all POST/PUT/DELETE routes
- JSDoc every route with `@route`, `@description`, `@access`

```ts
import { Router } from 'express'
import { DomainController } from '../controllers/domain.controller.js'
import { requireAuth, requirePermission } from '@/shared/middleware/auth.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import {
  createDomainSchema,
  updateDomainSchema,
  uuidParamSchema,
} from '../schemas/domain.schemas.js'

const router = Router()
const controller = new DomainController()

/**
 * @route GET /api/domain
 * @description List all domain items for the authenticated user.
 * @access Private
 */
router.get('/', requireAuth, controller.list.bind(controller))

/**
 * @route POST /api/domain
 * @description Create a new domain item.
 * @access Private
 */
router.post(
  '/',
  requireAuth,
  validate(createDomainSchema),
  controller.create.bind(controller)
)

/**
 * @route PUT /api/domain/:id
 * @description Update an existing domain item.
 * @access Private
 */
router.put(
  '/:id',
  requireAuth,
  validate({ body: updateDomainSchema, params: uuidParamSchema }),
  controller.update.bind(controller)
)

/**
 * @route DELETE /api/domain/:id
 * @description Delete a domain item by ID.
 * @access Private
 */
router.delete(
  '/:id',
  requireAuth,
  validate({ params: uuidParamSchema }),
  controller.delete.bind(controller)
)

export default router
```

### Controller (`controllers/<domain>.controller.ts`)

Class-based, async methods, delegates to service:

```ts
import { Request, Response } from 'express'
import { log } from '@/shared/services/logger.service.js'
import { domainService } from '../services/domain.service.js'

/**
 * Controller for domain HTTP endpoints.
 * @description Handles request/response, delegates business logic to DomainService.
 */
export class DomainController {
  /**
   * List all items for the authenticated user.
   * @param req - Express request with user session
   * @param res - Express response
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      // Extract authenticated user ID from session
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Delegate to service layer
      const items = await domainService.list(userId)
      res.json(items)
    } catch (error) {
      log.error('Error listing domain items', error as Record<string, unknown>)
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * Create a new item.
   * @param req - Express request with validated body
   * @param res - Express response
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Body is already validated by Zod middleware
      const item = await domainService.create(req.body, userId)
      res.status(201).json(item)
    } catch (error) {
      log.error('Error creating domain item', error as Record<string, unknown>)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
```

### Service (`services/<domain>.service.ts`)

Singleton export, uses ModelFactory:

```ts
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * Business logic for domain operations.
 * @description Manages domain items with CRUD operations.
 */
class DomainService {
  /**
   * List items for a user.
   * @param userId - Authenticated user's ID
   * @returns Array of domain items
   */
  async list(userId: string) {
    return ModelFactory.domain.findAll({ created_by: userId }, {
      orderBy: { column: 'created_at', direction: 'desc' },
    })
  }

  /**
   * Create a new item.
   * @param data - Validated create payload
   * @param userId - Creator's user ID
   * @returns Created item
   */
  async create(data: { name: string; description?: string }, userId: string) {
    return ModelFactory.domain.create({
      ...data,
      created_by: userId,
    })
  }

  /**
   * Delete an item by ID.
   * @param id - Item UUID
   */
  async delete(id: string) {
    await ModelFactory.domain.delete(id)
  }
}

/** Singleton instance of DomainService */
export const domainService = new DomainService()
```

### Model (`models/<domain>.model.ts`)

Extend `BaseModel` from shared. **ONLY models may access the database.**

```ts
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import type { DomainItem } from '@/shared/models/types.js'

/**
 * @description Knex model for the domain_items table.
 * Inherits CRUD from BaseModel; add domain-specific query methods here.
 */
export class DomainModel extends BaseModel<DomainItem> {
  protected tableName = 'domain_items'
  protected knex = db

  /**
   * @description Find items by creator with pagination
   * @param {string} userId - Creator's UUID
   * @param {number} limit - Page size
   * @param {number} offset - Records to skip
   * @param {string} [search] - Optional search term
   * @returns {Promise<{ data: DomainItem[]; total: number }>} Paginated results
   */
  async findByCreatorPaginated(
    userId: string, limit: number, offset: number, search?: string
  ): Promise<{ data: DomainItem[]; total: number }> {
    // Base query scoped to creator
    let query = this.knex(this.tableName).where('created_by', userId)

    // Apply optional search filter
    if (search) {
      query = query.andWhere(function () {
        this.whereILike('name', `%${search}%`)
          .orWhereILike('description', `%${search}%`)
      })
    }

    // Run count and data queries in parallel
    const [countResult, data] = await Promise.all([
      query.clone().count('* as cnt').first(),
      query.clone().orderBy('created_at', 'desc').limit(limit).offset(offset),
    ])

    return { data, total: Number((countResult as any)?.cnt ?? 0) }
  }

  /**
   * @description Batch find items by IDs
   * @param {string[]} ids - Array of UUIDs
   * @returns {Promise<DomainItem[]>} Matching items
   */
  async findByIds(ids: string[]): Promise<DomainItem[]> {
    if (ids.length === 0) return []
    return this.knex(this.tableName).whereIn('id', ids)
  }

  /**
   * @description Atomically increment a counter column
   * @param {string} id - Record UUID
   * @param {string} column - Column to increment
   * @param {number} amount - Amount to increment by
   * @returns {Promise<void>}
   */
  async incrementColumn(id: string, column: string, amount: number): Promise<void> {
    await this.knex(this.tableName).where({ id }).increment(column, amount)
  }

  /**
   * @description Transactional multi-step operation example
   * @param {string} id - Item UUID
   * @param {Record<string, unknown>} data - Update data
   * @returns {Promise<DomainItem>} Updated item
   */
  async updateWithAudit(id: string, data: Record<string, unknown>): Promise<DomainItem> {
    return this.knex.transaction(async (trx) => {
      const [updated] = await trx(this.tableName)
        .where({ id })
        .update(data)
        .returning('*')

      await trx('audit_logs').insert({
        resource_id: id,
        action: 'update',
        details: JSON.stringify(data),
      })

      return updated
    })
  }
}
```

Register in `shared/models/factory.ts` as a lazy singleton getter.

---

## Layering Rules (STRICT — Controller → Service → Model)

The backend enforces a strict 3-layer architecture. Each layer has clear responsibilities and boundaries. **This is the most critical architectural rule.**

### Controller Layer — HTTP only, calls services ONLY

Controllers must **NEVER**:
```ts
// ❌ NEVER import ModelFactory or any model in a controller:
import { ModelFactory } from '@/shared/models/factory.js'

// ❌ NEVER call ModelFactory.* in a controller:
const user = await ModelFactory.user.findById(id)
const app = await ModelFactory.searchApp.findById(appId)
const templates = await ModelFactory.agentTemplate.findByTenant(tenantId)

// ❌ NEVER import db in a controller:
import { db } from '@/shared/db/knex.js'
```

Controllers must **ONLY** call services:
```ts
// ✅ CORRECT — Controller calls service:
const user = await userService.getUserById(id)
const app = await searchService.getSearchApp(appId)
const templates = await agentService.listTemplates(tenantId)
const teamIds = await chatAssistantService.getUserTeamIds(userId)
```

**When a service lacks the needed method:** Add a new method to the service class that wraps the model call — NEVER import ModelFactory in the controller.

### Service Layer — Business logic, calls ModelFactory ONLY

Services must **NEVER**:
```ts
// ❌ NEVER import db in a service:
import { db } from '@/shared/db/knex.js'

// ❌ NEVER call db() directly:
const result = await db('users').where({ email }).first()

// ❌ NEVER use db.raw():
await db.raw('SELECT 1')

// ❌ NEVER use db.transaction() outside a model:
await db.transaction(async (trx) => { ... })

// ❌ NEVER use getKnex() to build inline queries:
const rows = await ModelFactory.user.getKnex().where({ role: 'admin' })
```

Services call ModelFactory:
```ts
// ✅ In service — delegate to model:
const user = await ModelFactory.user.findByEmail(email)
const stats = await ModelFactory.dashboard.getTopUsers(startDate, endDate)
await ModelFactory.canvasVersion.releaseVersion(canvasId, versionId, tenantId)
```

### Model Layer — All DB access lives here

```ts
// ✅ In model — all DB access lives here:
async findByEmail(email: string): Promise<User | undefined> {
  return this.knex(this.tableName).where({ email }).first()
}
```

**When the model lacks a method:** Add a new method to the model class. Never work around it.

### Model Query Best Practices:

| Practice | Example | Why |
|----------|---------|-----|
| Batch lookups | `whereIn('id', ids)` | Avoid N+1 round-trips |
| Select specific columns | `.select('id', 'name', 'email')` | Skip large JSONB/text columns |
| Pagination pattern | Return `{ data, total }` | Consistent list API |
| Index-aware WHERE | Filter on indexed columns | Prevent full table scans |
| Transactions in models | `this.knex.transaction()` | Keep atomic ops in data layer |
| Cross-table analytics | Dedicated model class | `DashboardModel`, `AdminHistoryModel` |
| Distinct + whereIn | For permission lookups | Single query, not N+1 |
| Parallel queries | `Promise.all([query1, query2])` | Reduce latency for independent queries |

### Anti-patterns to avoid:

```ts
// ❌ N+1 query — fetching in a loop:
for (const id of ids) {
  const item = await ModelFactory.item.findById(id) // BAD: N queries
}

// ✅ Batch query — single round-trip:
const items = await ModelFactory.item.findByIds(ids) // GOOD: 1 query

// ❌ SELECT * on large tables:
const items = await ModelFactory.item.findAll() // BAD: transfers all columns

// ✅ Select only needed columns:
const items = await ModelFactory.item.findListColumns(filters) // GOOD: lightweight

// ❌ Inline query building in service:
const q = ModelFactory.item.getKnex().where(...).join(...) // BAD: bypasses model

// ✅ Encapsulated in model method:
const items = await ModelFactory.item.findWithJoinedDetails(filters) // GOOD: reusable
```

### Route Registration

After creating the module, register in `be/src/app/routes.ts`:

```ts
import domainRoutes from '@/modules/domain/routes/domain.routes.js'

// Inside setupApiRoutes():
apiRouter.use('/domain', domainRoutes)
```

### Database Migration

If a new table is needed, run `npm run db:migrate:make <name>` then edit the generated file:

```ts
// 20260315120000_create_domain_items.ts
import { Knex } from 'knex'

/**
 * Create the domain_items table.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('domain_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('name', 255).notNullable()
    table.text('description').nullable()
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamps(true, true)
  })
}

/**
 * Drop the domain_items table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('domain_items')
}
```

### Socket.IO Events (if real-time needed)

Emit events from service layer via the socket service:

```ts
import { socketService } from '@/shared/services/socket.service.js'

// After a mutation that frontend should react to:
socketService.emitToUser(userId, 'domain:updated', { id: item.id })
```

Frontend uses `useSocketEvent()` or `useSocketQueryInvalidation()` to react.

---

## New Module Checklist

1. [ ] Create `be/src/modules/<domain>/` with correct layout (flat or sub-dir)
2. [ ] Create Zod schemas for all mutation endpoints
3. [ ] Create model class extending `BaseModel`, register in `ModelFactory`
4. [ ] **All DB queries in model methods only** — never in services/controllers
5. [ ] Create service class with singleton export — uses `ModelFactory` for all DB access
6. [ ] Create controller class with async methods — **delegates to service ONLY, never calls ModelFactory**
7. [ ] Create routes with `requireAuth` + `validate()` on mutations
8. [ ] Create `index.ts` barrel file
9. [ ] Register routes in `be/src/app/routes.ts`
10. [ ] If new DB table: create migration via `npm run db:migrate:make <name>`
11. [ ] Add JSDoc headers to every function (`@param`, `@returns`, `@description`)
12. [ ] Add inline comments above significant logic lines
13. [ ] Use `.js` extensions in all imports
14. [ ] Use `config` object for env access, never `process.env`
15. [ ] **Verify no `ModelFactory` imports in controllers**
16. [ ] **Verify no `db` imports or `.getKnex()` calls in services/controllers**
17. [ ] Verify with `npm run build` if changes are extensive

## Middleware Reference

### Authentication (`@/shared/middleware/auth.middleware.js`)
- `requireAuth` — session check, returns 401
- `requirePermission(permission)` — RBAC check, returns 403
- `requireRole(...roles)` — role-based check
- `requireOwnership(userIdParam)` — ownership check with admin bypass

### Validation (`@/shared/middleware/validate.middleware.js`)
- `validate(zodSchema)` — body-only validation (shorthand)
- `validate({ body, params, query })` — multi-target validation
- Mutates `req.body` with parsed/coerced values
- Returns 400 with structured error details on failure

## No Hardcoded String Literals (Mandatory)

**NEVER** use bare string literals in comparisons for domain states, statuses, factory names, Redis/Valkey keys, or sentinel values. Always import from `shared/constants/`. See root `CLAUDE.md` for full rules.

## Key Files Reference

- `be/src/app/index.ts` — Express app bootstrap, middleware setup
- `be/src/app/routes.ts` — Central route registration
- `be/src/shared/config/index.ts` — Environment config (`config` object)
- `be/src/shared/middleware/auth.middleware.ts` — Auth middleware
- `be/src/shared/middleware/validate.middleware.ts` — Zod validation
- `be/src/shared/models/base.model.ts` — BaseModel abstract class
- `be/src/shared/models/factory.ts` — ModelFactory (lazy singletons)
- `be/src/shared/models/types.ts` — Global TypeScript type definitions
- `be/src/shared/db/knex.ts` — Knex singleton
- `be/src/shared/db/migrations/` — Database migrations
- `be/src/shared/services/logger.service.ts` — Winston logger
- `be/src/shared/services/redis.service.ts` — Redis client
- `be/src/shared/services/socket.service.ts` — Socket.IO events
