# B-Knowledge Project Instructions

This file provides context, build instructions, and coding standards for the B-Knowledge project (RAGFlow Simple UI).

## 1. Project Overview

B-Knowledge is an open-source UI to centralize and manage AI Search, Chat, and Knowledge Base. The project follows an **NX-style modular monorepo** architecture using npm workspaces.

- **Backend**: Node.js 22+ (ExpressJS)
- **Frontend**: TypeScript, React 19, Vite
- **Monorepo**: npm workspaces with `be/` and `fe/` packages
- **Worker**: Python-based advance-rag executor

## 2. Monorepo Structure

```
root/
├── package.json              # Root workspace config (npm workspaces)
├── be/                       # Backend workspace (Express API)
├── fe/                       # Frontend workspace (React + Vite)
├── advance-rag/              # Python worker for RAG processing
├── docker/                   # Docker configs and compose files
├── docs/                     # Project documentation
├── scripts/                  # Root-level operational scripts
└── patches/                  # npm patch files
```

## 3. Backend Architecture (`be/`)

The backend follows a **domain-driven modular architecture** inspired by NX library boundaries. Each module is self-contained with its own controller, routes, service, and barrel export.

```
be/src/
├── app/                      # Application bootstrap
│   ├── index.ts              # Express app initialization & middleware setup
│   └── routes.ts             # Central route registration (imports all module routes)
│
├── modules/                  # Domain modules (each is a self-contained unit)
│   ├── admin/                # Admin management
│   ├── audit/                # Audit logging
│   ├── auth/                 # Authentication & authorization
│   ├── broadcast/            # Broadcast / notification
│   ├── chat/                 # Chat sessions & messages
│   ├── dashboard/            # Dashboard analytics
│   ├── external/             # External service integrations (RAGFlow, Langfuse, MinIO)
│   ├── glossary/             # Glossary / terminology management
│   ├── knowledge-base/       # Knowledge base CRUD
│   ├── llm-provider/         # LLM / AI model provider config
│   ├── preview/              # Document preview
│   ├── rag/                  # RAG pipeline orchestration
│   ├── system-tools/         # System tooling & utilities
│   ├── teams/                # Team management
│   ├── user-history/         # User history tracking
│   └── users/                # User management
│
├── shared/                   # Cross-cutting concerns (shared libraries)
│   ├── config/               # Environment config & secrets
│   ├── db/                   # Database providers, knex config & migrations
│   ├── middleware/            # Express middleware (auth, validation, logging, error handling)
│   ├── models/               # Shared data models & factory interfaces
│   ├── services/             # Shared services (queue, cache, external clients)
│   ├── types/                # Global TypeScript definitions
│   └── utils/                # General utility functions
│
└── scripts/                  # One-time operational scripts
```

### BE Module Internal Convention

Modules with ≥5 files use **sub-directory** layout:

```
modules/<domain>/
├── routes/                   # Express route definitions
│   └── <domain>.routes.ts
├── controllers/              # Request handlers (call services)
│   └── <domain>.controller.ts
├── services/                 # Business logic
│   └── <domain>.service.ts
├── models/                   # Domain-specific Knex models
│   └── <domain>.model.ts
├── schemas/                  # Zod validation schemas
│   └── <domain>.schemas.ts
└── index.ts                  # Barrel export (public API)
```

Small modules (≤4 files) keep **flat** layout:

```
modules/<domain>/
├── <domain>.controller.ts
├── <domain>.routes.ts
├── <domain>.service.ts
└── index.ts
```

**Flat modules**: `auth`, `dashboard`, `preview`, `system-tools`, `user-history`

## 4. Frontend Architecture (`fe/`)

The frontend follows a **feature-driven modular architecture** with clear separation between shared UI, domain features, and infrastructure.

```
fe/src/
├── app/                      # Application shell
│   ├── App.tsx               # Root component, router (uses Providers wrapper)
│   ├── Providers.tsx         # Composable provider wrapper (all context providers)
│   ├── routeConfig.ts        # Centralized route metadata (titles, feature IDs, layout)
│   └── contexts/             # React contexts (theme, auth, etc.)
│
├── features/                 # Domain feature modules (each is self-contained)
│   ├── ai/                   # AI chat & assistant
│   ├── audit/                # Audit log viewer
│   ├── auth/                 # Login, register, auth flows
│   ├── broadcast/            # Broadcast management
│   ├── dashboard/            # Dashboard & analytics
│   ├── datasets/             # Dataset management
│   ├── glossary/             # Glossary management
│   ├── guideline/            # Guidelines & documentation
│   ├── histories/            # Browsing history
│   ├── history/              # Chat history
│   ├── knowledge-base/       # Knowledge base UI
│   ├── system/               # System settings
│   ├── teams/                # Team management
│   └── users/                # User management
│
├── components/               # Shared UI components (design system)
│   ├── Dialog.tsx
│   ├── ConfirmDialog.tsx
│   ├── Select.tsx
│   ├── Checkbox.tsx
│   ├── RadioGroup.tsx
│   ├── MarkdownRenderer.tsx
│   ├── DocumentPreviewer/
│   ├── FilePreview/
│   └── ...
│
├── hooks/                    # Global reusable hooks
├── layouts/                  # Page shell wrappers
│   ├── MainLayout.tsx        # Shell composition (Sidebar + Header + Outlet)
│   ├── Sidebar.tsx           # Sidebar navigation (role-based, collapsible)
│   └── Header.tsx            # Page header (title from routeConfig, actions, source selectors)
├── lib/                      # Third-party library config (API client, socket)
├── i18n/                     # Internationalization (en, vi, ja)
├── utils/                    # Pure utility functions
├── main.tsx                  # Vite entry point
└── config.ts                 # Runtime configuration
```

### FE Feature Internal Convention

Each feature under `features/` MUST follow this pattern:

```
features/<domain>/
├── api/                      # API calls (TanStack Query hooks or raw api calls)
├── components/               # Feature-specific UI components
├── hooks/                    # Feature-specific hooks
├── pages/                    # Route-level page components
├── types/                    # Feature-specific TypeScript types
└── index.ts                  # Barrel export (public API)
```

### FE Rules for New Features

- **New page**: Always add route metadata to `app/routeConfig.ts` (title, guideline ID, layout flags)
- **New provider**: Add it to `app/Providers.tsx` — never nest in App.tsx or other components
- **New sidebar nav**: Add it to `layouts/Sidebar.tsx` with proper role checks
- **Layout/header changes**: Modify `layouts/Header.tsx` or `layouts/Sidebar.tsx` — never modify `MainLayout.tsx` directly unless changing the shell composition
- **React Compiler**: The project uses `babel-plugin-react-compiler` — avoid manual `React.memo`, `useMemo`, `useCallback` unless profiling shows a specific need

## 5. Build & Dev Instructions

```bash
# Install all workspace dependencies
npm install

# Run all services (BE + FE + Worker)
npm run dev

# Run individual workspaces
npm run dev:be              # Backend only
npm run dev:fe              # Frontend only

# Build all workspaces
npm run build

# Production build
npm run build:prod

# Lint all workspaces
npm run lint

# Test all workspaces
npm run test
```

## 6. Coding Standards & Guidelines

### 6.1 General

- TypeScript strict mode
- Single quotes, no semicolons
- Use functional patterns where possible
- Add JSDoc headers to every function/class with `@param`, `@returns`, `@description`
- Add inline comments above every significant line of logic or control flow
- If changes are extensive, run `npm run build` to verify

### 6.2 NX-Style Module Boundary Rules

- **No cross-module imports**: Modules under `modules/` (BE) or `features/` (FE) must NOT import from each other directly. Use `shared/` services or event-driven patterns instead.
- **Barrel file exports**: Every module MUST have an `index.ts` that serves as its public API. External consumers import only from the barrel file.
- **No deep imports**: Never reach into `modules/<domain>/internal-file.ts` — always go through `modules/<domain>/index.ts`.
- **Shared libraries**: Cross-cutting code lives in `shared/` (BE) or `components/`, `hooks/`, `lib/`, `utils/` (FE).

### 6.3 Frontend Rules

- When adding a new page, implement locales for all HTML strings in `en`, `vi`, `ja`
- Always check and add theme support (dark and light) for new UI controls or pages
- The "Public API" Rule (Barrel Files): Avoid deep imports into feature internals
- Component Colocation: Keep files as close to their usage as possible
- UI Layer: Uses `ref` as a prop directly
- Feature Layer: Implements `useActionState` and `useFormStatus`
- Service Layer: Optimized for the `use` hook and Server Actions

### 6.4 Backend Rules

- Node.js 22+ (ExpressJS)
- Implement **Factory Pattern** for all data schemas and interfaces in `shared/models/`
- Implement **Singleton Pattern** for all global services and utils
- New modules with ≥5 files must use the **sub-directory** layout (`routes/`, `controllers/`, `services/`, `models/`, `schemas/`, `index.ts`)
- Small modules (≤4 files) may use the **flat** layout (`<domain>.controller.ts`, `<domain>.routes.ts`, `<domain>.service.ts`, `index.ts`)
- All mutation routes (`POST`/`PUT`/`DELETE`) must use **Zod validation** via `validate()` middleware from `shared/middleware/validate.middleware.ts`
- **Cross-module imports** must go through barrel files (`@/modules/<domain>/index.js`), never deep imports
- **Same-module imports** may use direct paths within sub-directories (`./services/`, `./models/`, etc.)
- If changes impact the database, create a migration file in `be/src/shared/db/migrations/` named `yyyymmddhhmmss_<name>.ts` (e.g. `20260311130900_create_items.ts`). Use `npm run db:migrate:make <name>` to auto-generate the timestamp prefix.
- Always use Knex ORM for model files in `be/src/shared/models/`; raw SQL only when Knex ORM cannot support the query
