# RAGFlow vs B-Knowledge: Chat & Search Settings Comparison

> Generated: 2026-03-17

---

## 1. CHAT SETTINGS COMPARISON

### 1.1 Basic Information

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Name | `name` (max 255) | `name` (max 128) | **Implemented** |
| Description | `description` (text) | `description` (text) | **Implemented** |
| Icon/Avatar | `icon` (base64 upload) | `icon` (max 256, string) | **Partial** — no upload UI in b-knowledge |
| Language | `language` ("Chinese"/"English") | N/A | **Not implemented** |
| Status (valid/invalid) | `status` ('0'/'1') | N/A | **Not implemented** |

### 1.2 Knowledge Base Configuration

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| KB selection | `kb_ids` (array) | `kb_ids` (array, required >=1) | **Implemented** |
| Reference indices | `do_refer` ('0'/'1') | N/A | **Not implemented** |

### 1.3 LLM Provider

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| LLM Model ID | `llm_id` (128 chars) | `llm_id` (128 chars) | **Implemented** |

### 1.4 LLM Sampling Parameters

| Setting | RAGFlow Default | B-Knowledge | Status |
|---------|----------------|-------------|--------|
| Temperature | 0.1 (with enabled toggle) | Schema: 0–2, UI slider 0.1 step | **Implemented** (UI shown) |
| Top P | 0.3 (with enabled toggle) | Schema only, no UI | **Schema only** |
| Frequency Penalty | 0.7 (with enabled toggle) | Schema only, no UI | **Schema only** |
| Presence Penalty | 0.4 (with enabled toggle) | Schema only, no UI | **Schema only** |
| Max Tokens | 512 (with enabled toggle) | Schema: 1–128000, no UI | **Schema only** |
| Parameter preset selector | "Precise/Balance/Creative" presets | N/A | **Not implemented** |
| Per-parameter enabled toggles | Yes (temperatureEnabled, etc.) | N/A | **Not implemented** |

### 1.5 Prompt Configuration

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| System prompt | `prompt_config.system` | `prompt_config.system` | **Implemented** |
| Welcome/Prologue | `prompt_config.prologue` | `prompt_config.prologue` | **Implemented** |
| Empty response message | `prompt_config.empty_response` | Schema only, no UI | **Schema only** |
| Prompt type (simple/advanced) | `prompt_type` | N/A | **Not implemented** |

### 1.6 Retrieval (RAG) Parameters

| Setting | RAGFlow Default | B-Knowledge | Status |
|---------|----------------|-------------|--------|
| Top N (chunks to use) | 6 (max 30) | UI slider 1–10, default 3 | **Implemented** (different range) |
| Top K (keywords) | 1024 (max 2048) | UI slider 1–20, default 5 | **Implemented** (different semantics — RAGFlow uses for reranker input, b-knowledge for keyword count) |
| Similarity Threshold | 0.2 | Schema: 0–1, no UI | **Schema only** |
| Vector Similarity Weight | 0.3 | Schema: 0–1, no UI | **Schema only** |

### 1.7 Feature Flags

| Setting | RAGFlow Default | B-Knowledge | Status |
|---------|----------------|-------------|--------|
| Quote/Citation | `quote: true` | Schema only | **Schema only** |
| Keyword extraction | `keyword: false` | Schema only | **Schema only** |
| TTS (text-to-speech) | `tts: false` | N/A | **Not implemented** |
| Refine multiturn | `refine_multiturn: true` | Schema only | **Schema only** |
| Knowledge Graph | `use_kg: false` | Schema only | **Schema only** |
| Reasoning/Deep thinking | `reasoning: false` | Schema only (runtime toggle in ChatInput) | **Partial** — runtime only |
| TOC Enhance | `toc_enhance: false` | Schema only | **Schema only** |
| Cross-language | `cross_languages: []` (8 languages) | Schema only (string) | **Schema only** |
| Web search (Tavily) | `tavily_api_key` | Schema only | **Schema only** |

### 1.8 Reranking

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Rerank model ID | `rerank_id` (with dropdown) | Schema only, no UI | **Schema only** |
| Top K for reranker | `top_k` (0–2048) | N/A (top_k used differently) | **Not implemented** |

### 1.9 Metadata Filtering

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Filter method | disabled/auto/semi_auto/manual | Schema: and/or logic + conditions | **Schema only** (no UI in b-knowledge; RAGFlow has UI) |
| Manual conditions | key/op/value array | name/comparison_operator/value array | **Schema only** |
| Semi-auto detection | Supported | N/A | **Not implemented** |

### 1.10 Custom Variables / Parameters

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Prompt variables | `parameters: [{key, optional}]` | `variables: [{key, description, optional, default_value}]` (max 20) | **Enhanced** in b-knowledge (added description + default_value) |

### 1.11 Access Control

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Public toggle | N/A (tenant-based) | `is_public` toggle | **B-knowledge only** |
| RBAC (user/team) | N/A | `chat_assistant_access` table | **B-knowledge only** |

### 1.12 Runtime (Per-Message) Options

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Deep thinking toggle | Runtime button | Runtime button in ChatInput | **Implemented** |
| Internet search toggle | Runtime button | Runtime button in ChatInput | **Implemented** |
| File attachments | Yes (images, PDF) | Yes (JPEG, PNG, GIF, WebP, PDF, max 5) | **Implemented** |
| Per-message variable values | N/A | Supported via API | **B-knowledge only** |
| Per-message LLM override | N/A | Supported via API | **B-knowledge only** |

---

## 2. SEARCH SETTINGS COMPARISON

### 2.1 Basic Information

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Name | `name` (128 chars) | `name` (required) | **Implemented** |
| Avatar | Base64 image upload | N/A | **Not implemented** |
| Description | Textarea with default text | `description` (text input) | **Implemented** |

### 2.2 Dataset Selection

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Dataset IDs | `kb_ids` (max 10, with embedding model check) | `dataset_ids` (required, multi-select) | **Implemented** |
| Embedding model validation | Disables mismatched datasets | N/A | **Not implemented** |

### 2.3 Retrieval Parameters

| Setting | RAGFlow Default | B-Knowledge | Status |
|---------|----------------|-------------|--------|
| Similarity Threshold | 0.2 (slider 0–1) | 0.2 (slider 0–1, step 0.05) | **Implemented** |
| Vector Similarity Weight | 0.3 (slider 0–1) | 0.7 (slider 0–1, step 0.05) | **Implemented** (different default) |
| Top K | 1024 (for reranker, 0–2048) | 5 (1–50, step 1) | **Implemented** (different semantics — RAGFlow is reranker input, b-knowledge is result count) |
| Search Method | N/A (implicit via weight) | `search_method` (hybrid/semantic/fulltext) | **B-knowledge only** |

### 2.4 Reranking

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Use Rerank toggle | Yes (with model dropdown) | N/A (just `rerank_id` string) | **Partial** — no dropdown in b-knowledge |
| Rerank model | Dropdown from LLM providers | `rerank_id` (text, max 128) | **Partial** |
| Top K (reranker input) | 0–2048, default 1024 | N/A | **Not implemented** |

### 2.5 AI Summary / LLM Configuration

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Enable summary toggle | `summary: false` | `enable_summary: true` | **Implemented** (different default) |
| LLM model | Dropdown (conditional) | `llm_id` text input (conditional) | **Implemented** |
| Temperature | 0–2, step 0.01, toggle-enabled | 0–2, step 0.1 | **Implemented** |
| Top P | 0–1, step 0.01, toggle-enabled | Schema only, no UI | **Schema only** |
| Max Tokens | Toggle-enabled | Schema only, no UI | **Schema only** |
| Frequency Penalty | Toggle-enabled | N/A | **Not implemented** |
| Presence Penalty | Toggle-enabled | N/A | **Not implemented** |

### 2.6 Feature Toggles

| Setting | RAGFlow Default | B-Knowledge | Status |
|---------|----------------|-------------|--------|
| Web Search | `web_search: false` (commented out in UI) | `web_search` toggle + `tavily_api_key` | **Implemented** (b-knowledge has it active, RAGFlow commented out) |
| Related Questions | `related_search: false` | `enable_related_questions: true` | **Implemented** (different default) |
| Query Mindmap | `query_mindmap: false` | `enable_mindmap: true` | **Implemented** (different default) |
| Keyword extraction | `keyword: false` | `keyword` toggle | **Implemented** |
| Knowledge Graph | N/A in search | `use_kg` toggle | **B-knowledge only** |
| Highlight | `highlight: false` | `highlight: true` | **Implemented** (different default) |
| Cross-language | `cross_languages: []` | `cross_languages` (language pills, 8 languages) | **Implemented** |

### 2.7 Metadata Filtering

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Filter method | manual/semi_auto/disabled | Schema only (and/or logic + conditions) | **Schema only** in b-knowledge (RAGFlow has full UI) |
| Manual conditions | Full UI (key/op/value) | No UI | **Not implemented** in UI |
| Semi-auto | Supported with UI | N/A | **Not implemented** |

### 2.8 Runtime Search Filters (User-Facing)

| Setting | RAGFlow | B-Knowledge | Status |
|---------|---------|-------------|--------|
| Filter by datasets | N/A | Checkbox multi-select | **B-knowledge only** |
| Filter by file type | N/A | Toggle badges (pdf, docx, etc.) | **B-knowledge only** |
| Override search method | N/A | Radio buttons | **B-knowledge only** |
| Override similarity | N/A | Slider | **B-knowledge only** |
| Override top K | N/A | Slider (1–100) | **B-knowledge only** |
| Override vector weight | N/A | Slider (hybrid only) | **B-knowledge only** |

---

## 3. SUMMARY OF GAPS

### 3.1 Features in RAGFlow but NOT in B-Knowledge UI

| Feature | Category | Priority |
|---------|----------|----------|
| Avatar/Icon upload (chat + search) | UI | Low |
| Language selector | Chat | Low |
| Parameter presets (Precise/Balance/Creative) | Chat LLM | Medium |
| Per-parameter enabled toggles | Chat/Search LLM | Medium |
| Top P, Freq Penalty, Presence Penalty UI | Chat | Medium |
| Max Tokens UI | Chat | Medium |
| Empty response message UI | Chat | Medium |
| Quote/Citation toggle | Chat | High |
| Keyword extraction toggle | Chat | Medium |
| Refine multiturn toggle | Chat | High |
| TOC Enhance toggle | Chat | Low |
| Knowledge Graph toggle | Chat | Low |
| Rerank model dropdown/selection | Chat + Search | High |
| Similarity threshold slider | Chat | High |
| Vector similarity weight slider | Chat | High |
| Metadata filter UI | Chat + Search | Medium |
| TTS toggle | Chat | Low |
| Reranker Top K (0–2048) | Search | Medium |
| Embedding model validation for datasets | Search | Medium |

### 3.2 Features in B-Knowledge but NOT in RAGFlow

| Feature | Category |
|---------|----------|
| Public/Private toggle with RBAC | Chat + Search |
| User/Team access management | Chat |
| Variable description + default_value | Chat |
| Search method selector (hybrid/semantic/fulltext) | Search |
| Runtime search filters (dataset, file type, method, threshold overrides) | Search |
| Per-message LLM override | Chat API |
| Per-message variable values | Chat API |

### 3.3 Schema-Exists-But-No-UI (Backend ready, needs FE work)

These fields exist in b-knowledge's Zod schemas but have no UI controls yet:

**Chat:**
- `top_p`, `frequency_penalty`, `presence_penalty`, `max_tokens`
- `similarity_threshold`, `vector_similarity_weight`
- `keyword`, `quote`, `refine_multiturn`, `cross_languages`, `toc_enhance`, `use_kg`
- `rerank_id`, `empty_response`, `reasoning` config
- `metadata_filter`

**Search:**
- `top_p`, `max_tokens` (LLM settings)
- `metadata_filter`

---

## 4. KEY FILE REFERENCES

### RAGFlow

| Component | Path |
|-----------|------|
| Chat DB model | `ragflow/api/db/db_models.py` (Dialog class, lines 962–996) |
| Chat API | `ragflow/api/apps/dialog_app.py` |
| Chat SDK | `ragflow/api/apps/sdk/chat.py` |
| Chat settings UI | `ragflow/web/src/pages/next-chats/chat/app-settings/` |
| Chat form schema | `ragflow/web/src/pages/next-chats/chat/app-settings/use-chat-setting-schema.tsx` |
| Search DB model | `ragflow/api/db/db_models.py` (Search class) |
| Search API | `ragflow/api/apps/search_app.py` |
| Search settings UI | `ragflow/web/src/pages/next-search/search-setting.tsx` |

### B-Knowledge

| Component | Path |
|-----------|------|
| Chat BE schema | `be/src/modules/chat/schemas/chat-assistant.schemas.ts` |
| Chat BE service | `be/src/modules/chat/services/chat-assistant.service.ts` |
| Chat BE routes | `be/src/modules/chat/routes/chat-assistant.routes.ts` |
| Chat FE config | `fe/src/features/chat/components/ChatAssistantConfig.tsx` |
| Chat FE variables | `fe/src/features/chat/components/ChatVariableForm.tsx` |
| Chat FE input | `fe/src/features/chat/components/ChatInput.tsx` |
| Chat FE types | `fe/src/features/chat/types/chat.types.ts` |
| Chat FE API | `fe/src/features/chat/api/chatApi.ts` |
| Search BE schema | `be/src/modules/search/schemas/search.schemas.ts` |
| Search BE service | `be/src/modules/search/services/search.service.ts` |
| Search FE config | `fe/src/features/search/components/SearchAppConfig.tsx` |
| Search FE filters | `fe/src/features/search/components/SearchFilters.tsx` |
| Search FE types | `fe/src/features/search/types/search.types.ts` |
| DB migration | `be/src/shared/db/migrations/20260312000000_initial_schema.ts` |
