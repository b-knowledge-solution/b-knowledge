---
name: b-knowledge-be
description: Backend development skill — enforces B-Knowledge BE architecture for new modules, routes, services, and models
---

# B-Knowledge Backend Development Skill

Use this skill when creating or modifying modules, routes, controllers, services, or models in the `be/` workspace.

## Stack

- Node.js 22+, Express 4, TypeScript strict, ESM (`.js` import extensions)
- Knex ORM + PostgreSQL, Redis for sessions/cache
- Zod for request validation
- Path alias: `@/*` → `be/src/*`
- Logging: Winston via `@/shared/services/logger.service.js`

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

---

## Import Rules

1. **Cross-module imports** — barrel files only: `import { someService } from '@/modules/<other>/index.js'`
2. **Never deep-import** across modules: `@/modules/chat/services/chat.service.js` is **forbidden** from another module
3. **Within same module** — direct paths are fine: `import { myService } from '../services/my.service.js'`
4. **Shared imports**: `@/shared/middleware/`, `@/shared/services/`, `@/shared/models/`, `@/shared/db/`, `@/shared/utils/`
5. **Always use `.js` extension** in import paths (ESM requirement)

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

Singleton export, uses Knex or ModelFactory:

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

Extend `BaseModel` from shared:

```ts
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import type { DomainItem } from '@/shared/models/types.js'

/**
 * Knex model for the domain_items table.
 * @description Inherits CRUD operations from BaseModel.
 */
export class DomainModel extends BaseModel<DomainItem> {
  protected tableName = 'domain_items'
  protected knex = db
}
```

Register in `shared/models/factory.ts` as a lazy singleton.

### Route Registration

After creating the module, register in `be/src/app/routes.ts`:

```ts
import domainRoutes from '@/modules/domain/routes/domain.routes.js'

// Inside registerRoutes():
apiRouter.use('/domain', domainRoutes)
```

### Database Migration

If a new table is needed, create in `be/src/shared/db/migrations/`:

```ts
// YYYYMMDD_create_domain_items.ts
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

---

## New Module Checklist

1. [ ] Create `be/src/modules/<domain>/` with correct layout (flat or sub-dir)
2. [ ] Create Zod schemas for all mutation endpoints
3. [ ] Create service class with singleton export
4. [ ] Create controller class with async methods
5. [ ] Create routes with `requireAuth` + `validate()` on mutations
6. [ ] Create `index.ts` barrel file
7. [ ] Register routes in `be/src/app/routes.ts`
8. [ ] If new DB table: create migration in `be/src/shared/db/migrations/`
9. [ ] If new model: extend `BaseModel`, register in `ModelFactory`
10. [ ] Add JSDoc headers to every function (`@param`, `@returns`, `@description`)
11. [ ] Add inline comments above significant logic lines
12. [ ] Use `.js` extensions in all imports
13. [ ] Verify with `npm run build` if changes are extensive

## Middleware Reference

### Authentication (`@/shared/middleware/auth.middleware.js`)
- `requireAuth` — session check, returns 401
- `requirePermission(permission)` — RBAC check, returns 403
- `requireRole(...roles)` — role-based check
- `requireOwnership(userIdParam)` — ownership check with admin bypass

### Validation (`@/shared/middleware/validate.middleware.js`)
- `validate(zodSchema)` — body-only validation (shorthand)
- `validate({ body, params, query })` — multi-target validation

## Key Files Reference

- `be/src/app/index.ts` — Express app bootstrap, middleware setup
- `be/src/app/routes.ts` — Central route registration
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
