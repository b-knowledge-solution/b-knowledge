# Patching Notes — B-Knowledge ↔ RAGFlow Naming Divergences

> **Purpose**: Complete mapping of every old (RAGFlow-native) name → new (B-Knowledge) name.
> Use this document when merging upstream RAGFlow changes into B-Knowledge.
>
> **Last updated**: 2026-03-16

---

## 1. Dialog → Chat Assistant

RAGFlow uses **"dialog"** for its conversational AI configurations.
B-Knowledge renames this to **"chat assistant"** across the full stack.

### 1.1 Database Tables & Columns

| RAGFlow / Old | B-Knowledge / New | Notes |
|---|---|---|
| `chat_dialogs` | `chat_assistants` | Main table |
| `chat_dialog_access` | `chat_assistant_access` | RBAC junction |
| `chat_dialog_access.dialog_id` | `chat_assistant_access.assistant_id` | FK column |
| `chat_embed_tokens.dialog_id` | `chat_embed_tokens.assistant_id` | Embed token FK |

### 1.2 Backend API Routes

| Old Path | New Path |
|---|---|
| `POST /api/chat/dialogs` | `POST /api/chat/assistants` |
| `GET /api/chat/dialogs` | `GET /api/chat/assistants` |
| `GET /api/chat/dialogs/:id` | `GET /api/chat/assistants/:id` |
| `PUT /api/chat/dialogs/:id` | `PUT /api/chat/assistants/:id` |
| `DELETE /api/chat/dialogs/:id` | `DELETE /api/chat/assistants/:id` |
| `GET /api/chat/dialogs/:id/conversations` | `GET /api/chat/assistants/:id/conversations` |
| `GET /api/chat/dialogs/:id/access` | `GET /api/chat/assistants/:id/access` |
| `PUT /api/chat/dialogs/:id/access` | `PUT /api/chat/assistants/:id/access` |

### 1.3 Backend Files (renamed)

| Old File | New File |
|---|---|
| `be/src/modules/chat/models/chat-dialog.model.ts` | `chat-assistant.model.ts` |
| `be/src/modules/chat/models/chat-dialog-access.model.ts` | `chat-assistant-access.model.ts` |
| `be/src/modules/chat/services/chat-dialog.service.ts` | `chat-assistant.service.ts` |
| `be/src/modules/chat/controllers/chat-dialog.controller.ts` | `chat-assistant.controller.ts` |
| `be/src/modules/chat/routes/chat-dialog.routes.ts` | `chat-assistant.routes.ts` |
| `be/src/modules/chat/schemas/chat-dialog.schemas.ts` | `chat-assistant.schemas.ts` |

### 1.4 Backend Code Identifiers

| Old Identifier | New Identifier | Location |
|---|---|---|
| `ChatDialogController` | `ChatAssistantController` | Controller class |
| `chatDialogService` | `chatAssistantService` | Service singleton |
| `ChatDialogModel` | `ChatAssistantModel` | Knex model |
| `ChatDialogAccessModel` | `ChatAssistantAccessModel` | Knex model |
| `chatDialogSchemas` | `chatAssistantSchemas` | Zod schemas |
| `chatDialogRoutes` | `chatAssistantRoutes` | Router export |
| `ModelFactory.chatDialog` | `ModelFactory.chatAssistant` | Factory accessor |
| `ModelFactory.chatDialogAccess` | `ModelFactory.chatAssistantAccess` | Factory accessor |

### 1.5 Backend Shared Types (`be/src/shared/models/types.ts`)

| Old | New |
|---|---|
| `ChatDialog` | `ChatAssistant` |
| `CreateDialogPayload` | `CreateAssistantPayload` |
| `ChatDialogAccessEntry` | `ChatAssistantAccessEntry` |

### 1.6 Backend Services with Raw SQL / Table Names

| File | Old Reference | New Reference |
|---|---|---|
| `rag.service.ts` | `db('chat_dialogs')` | `db('chat_assistants')` |
| `chat-conversation.service.ts` | `ModelFactory.chatDialog.*` | `ModelFactory.chatAssistant.*` |
| `chat-embed.controller.ts` | `ModelFactory.chatDialog.*` | `ModelFactory.chatAssistant.*` |

### 1.7 Frontend Types (`fe/src/features/chat/types/chat.types.ts`)

| Old | New |
|---|---|
| `ChatDialog` | `ChatAssistant` |
| `CreateDialogPayload` | `CreateAssistantPayload` |
| `ChatDialogAccessEntry` | `ChatAssistantAccessEntry` |

### 1.8 Frontend API Methods (`fe/src/features/chat/api/chatApi.ts`)

| Old Method | New Method | URL Change |
|---|---|---|
| `listDialogs()` | `listAssistants()` | `/dialogs` → `/assistants` |
| `getDialog()` | `getAssistant()` | `/dialogs/:id` → `/assistants/:id` |
| `createDialog()` | `createAssistant()` | Same |
| `updateDialog()` | `updateAssistant()` | Same |
| `deleteDialog()` | `deleteAssistant()` | Same |
| `getDialogAccess()` | `getAssistantAccess()` | Same |
| `setDialogAccess()` | `setAssistantAccess()` | Same |

### 1.9 Frontend Query Hooks (`fe/src/features/chat/api/chatQueries.ts`)

| Old Hook | New Hook |
|---|---|
| `useChatDialogs()` | `useChatAssistants()` |
| `useChatDialogsAdmin()` | `useChatAssistantsAdmin()` |

Return value changes:
- `dialogs` → `assistants`
- `activeDialog` → `activeAssistant`
- `activeDialogId` → `activeAssistantId`

### 1.10 Frontend Components & Pages (file renames)

| Old File | New File |
|---|---|
| `ChatDialogConfig.tsx` | `ChatAssistantConfig.tsx` |
| `ChatDialogAccessDialog.tsx` | `ChatAssistantAccessDialog.tsx` |
| `ChatDialogManagementPage.tsx` | `ChatAssistantManagementPage.tsx` |

### 1.11 Frontend Route Paths

| Old Path | New Path | Files |
|---|---|---|
| `/data-studio/chat-dialogs` | `/data-studio/chat-assistants` | `App.tsx`, `routeConfig.ts`, `sidebarNav.ts` |

### 1.12 i18n Keys (`chatAdmin` namespace — en/vi/ja)

| Old Key | New Key |
|---|---|
| `chatAdmin.createDialog` | `chatAdmin.createAssistant` |
| `chatAdmin.editDialog` | `chatAdmin.editAssistant` |
| `chatAdmin.deleteDialog` | `chatAdmin.deleteAssistant` |
| `chatAdmin.noDialogs` | `chatAdmin.noAssistants` |

Display text also updated (e.g. "dialog" → "assistant" / "hội thoại" → "trợ lý" / "ダイアログ" → "アシスタント").

---

## 2. image2text → Vision Flag

RAGFlow treats **image2text** as a separate `model_type`. B-Knowledge replaces this
with a **`vision` boolean** on chat-type models.

### 2.1 Database

| Change | Details |
|---|---|
| New column | `model_providers.vision` (`boolean`, default `false`) |
| Removed rows | All `model_type = 'image2text'` rows deleted |
| Unique constraint | Old: `UNIQUE(factory_name, model_type, model_name)` |
| | New: `UNIQUE(factory_name, model_name) WHERE status = 'active'` (partial) |

### 2.2 Backend Types (`be/src/shared/models/types.ts`)

| Old | New |
|---|---|
| `model_type: 'image2text'` (enum value) | Removed — use `model_type: 'chat'` + `vision: true` |
| — | `ModelProvider.vision?: boolean` (new field) |
| — | `FactoryModel.vision?: boolean` (new field) |

### 2.3 Frontend i18n (`modelTypes` namespace)

| Old Key | New Key | All 3 Locales |
|---|---|---|
| `modelTypes.image2text` | `modelTypes.vision` | `"VLM"` |

### 2.4 Python Worker (`advance-rag/`)

> [!IMPORTANT]
> The Python worker (`advance-rag/`) still uses `image2text` internally in some
> RAGFlow-inherited code paths. The `tenant_model_service.py` has been updated to
> resolve vision-capable models via the `vision` flag, but `generator.py` and
> `constants.py` retain `image2text` references. These should be addressed when
> merging future RAGFlow updates.

| File | Status |
|---|---|
| `db/joint_services/tenant_model_service.py` | ✅ Updated — queries `vision = true` |
| `rag/prompts/generator.py` | ⚠️ Still uses `image2text` type check |
| `common/settings.py` | ⚠️ Still parses `image2text_model` config |
| `common/constants.py` | ⚠️ Still defines `IMAGE2TEXT` enum |

---

## 3. Users — Password Hash

B-Knowledge adds local authentication alongside Azure AD.

### 3.1 Database

| Change | Details |
|---|---|
| New column | `users.password_hash` (`text`, nullable) |

### 3.2 Backend

| New Item | Location |
|---|---|
| `password_hash` field | `User` type in `types.ts` |
| bcrypt hashing logic | `auth.service.ts` |
| Local login endpoint | `POST /api/auth/login` |

---

## 4. New Tables (not in RAGFlow)

These tables are B-Knowledge additions with no RAGFlow equivalent:

| Table | Purpose |
|---|---|
| `chat_embed_tokens` | API tokens for external chat widget access |
| `search_embed_tokens` | API tokens for external search widget access |
| `chat_files` | File attachments uploaded during chat conversations |
| `chat_assistant_access` | RBAC access control per assistant |
| `search_app_access` | RBAC access control per search app |

---

## 5. Merge Checklist

When merging RAGFlow upstream changes:

- [ ] Search for `dialog` in new code → rename to `assistant`
- [ ] Search for `chat_dialogs` table references → use `chat_assistants`
- [ ] Search for `image2text` model type → use `vision: true` on chat models
- [ ] Check for new `model_type` enum values → update partial unique index if needed
- [ ] Verify Python worker `image2text` references still work with `vision` flag
- [ ] Update i18n keys if RAGFlow adds new UI strings with "dialog"
- [ ] Ensure `password_hash` column isn't overwritten by RAGFlow user schema changes
