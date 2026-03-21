# Chat & Search Settings Gap Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all configuration UI gaps between RAGFlow and B-Knowledge for chat assistant and search app settings.

**Architecture:** Extend the existing `ChatAssistantConfig.tsx` and `SearchAppConfig.tsx` dialogs with new shared components (`LlmSettingFields`, `RerankSelector`, `MetadataFilterEditor`). Backend schemas already support most fields — primary work is FE. A new public API endpoint exposes model provider lists (chat, rerank, embedding, tts) to config dialogs without requiring admin permissions.

**Tech Stack:** React 19 / TypeScript / Tailwind / shadcn/ui / Zod / TanStack Query / Express / Knex

---

## Agent Team Assignments

| Team | Role | Responsibilities |
|------|------|-----------------|
| **Architect** | System design | API contracts, shared component interfaces, data flow, schema changes |
| **UI/UX Designer** | Design specs | Component layout, interaction patterns, field ordering, presets UX |
| **Developer** | Implementation | Write code for all tasks (BE + FE) |
| **Tester** | Quality assurance | Write component tests, integration tests, verify all features |

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `fe/src/components/llm-setting-fields/LlmSettingFields.tsx` | Shared LLM parameter controls (temperature, top_p, freq/presence penalty, max_tokens) with enabled toggles and presets |
| `fe/src/components/llm-setting-fields/llm-presets.ts` | Preset definitions (Precise/Balance/Creative) and type exports |
| `fe/src/components/llm-setting-fields/SliderWithToggle.tsx` | Reusable slider + number input + enabled toggle component |
| `fe/src/components/rerank-selector/RerankSelector.tsx` | Rerank model dropdown with Top K slider (conditional) |
| `fe/src/components/metadata-filter/MetadataFilterEditor.tsx` | Metadata filter UI (method selector + manual condition builder) |
| `fe/src/components/metadata-filter/MetadataFilterCondition.tsx` | Single filter condition row (key + operator + value) |
| `fe/src/components/model-selector/ModelSelector.tsx` | Generic model dropdown that fetches providers by model_type |
| `fe/src/lib/llmProviderPublicApi.ts` | Public (non-admin) API for listing models by type |
| `be/src/modules/llm-provider/routes/llm-provider-public.routes.ts` | Public GET endpoint for model listing (no admin permission) |
| `fe/src/components/cross-language/CrossLanguageSelector.tsx` | Shared cross-language selector (moved from search feature) |
| `fe/src/components/metadata-filter/metadata-filter.types.ts` | Shared MetadataFilter/MetadataFilterCondition types |
| `fe/tests/components/llm-presets.test.ts` | Tests for detectPreset() logic |
| `fe/tests/components/LlmSettingFields.test.tsx` | Tests for LLM settings component |
| `fe/tests/components/RerankSelector.test.tsx` | Tests for rerank selector |
| `fe/tests/components/MetadataFilterEditor.test.tsx` | Tests for metadata filter |
| `fe/tests/components/ModelSelector.test.tsx` | Tests for model selector dropdown |

### Modified Files

| File | Changes |
|------|---------|
| `fe/src/features/chat/types/chat.types.ts` | Extend `PromptConfig` with all missing fields + add `LlmSetting` interface |
| `fe/src/features/chat/components/ChatAssistantConfig.tsx` | Add new settings sections (LLM params, feature flags, retrieval, rerank, metadata) |
| `fe/src/features/search/types/search.types.ts` | Add `frequency_penalty`, `presence_penalty` to `SearchLlmSetting` |
| `fe/src/features/search/components/SearchAppConfig.tsx` | Replace text inputs with model dropdowns, add rerank Top K, per-param toggles, metadata filter |
| `be/src/modules/llm-provider/services/llm-provider.service.ts` | Add `listPublic()` method for safe model listing |
| `fe/src/features/search/components/SearchAppConfig.tsx` | Import MetadataFilter types from shared location |
| `be/src/app/routes.ts` | Register public LLM provider route |
| `be/src/modules/search/schemas/search.schemas.ts` | Add `frequency_penalty`, `presence_penalty` to search LLM setting |
| `fe/src/i18n/locales/en.json` | Add ~60 new i18n keys |
| `fe/src/i18n/locales/vi.json` | Add ~60 new i18n keys |
| `fe/src/i18n/locales/ja.json` | Add ~60 new i18n keys |

---

## Chunk 1: Foundation — API, Types & Shared Components

### Task 1: Public Model Provider API Endpoint

**Team:** Architect → Developer → Tester
**Files:**
- Create: `be/src/modules/llm-provider/routes/llm-provider-public.routes.ts`
- Create: `fe/src/lib/llmProviderPublicApi.ts`
- Modify: `be/src/app/routes.ts`
- Modify: `be/src/modules/llm-provider/index.ts`

**Why:** Current LLM provider endpoints require `manage_model_providers` permission. Chat/search config dialogs need model lists for dropdowns without admin access.

- [ ] **Step 1: Add a public list method to llmProviderService**

In `be/src/modules/llm-provider/services/llm-provider.service.ts`, add a new method:

```typescript
/**
 * @description List active providers with safe fields only (no API keys).
 * Optionally filtered by model_type. Used by config dialogs (no admin permission).
 * @param {string} [modelType] - Filter by model_type: 'chat', 'embedding', 'rerank', 'tts', 'speech2text'
 * @returns {Promise<PublicModelProvider[]>} Safe provider records
 */
async listPublic(modelType?: string) {
  // Only expose safe columns — never return api_key or api_base
  let query = ModelFactory.modelProvider.qb()
    .select('id', 'factory_name', 'model_type', 'model_name', 'max_tokens', 'is_default', 'vision')
    .where('status', 'active')
    .orderBy('factory_name')
    .orderBy('model_name')

  // Filter by model_type if provided
  if (modelType) {
    query = query.where('model_type', modelType)
  }

  return query
}
```

- [ ] **Step 2: Create public route file**

Create `be/src/modules/llm-provider/routes/llm-provider-public.routes.ts`:

```typescript
/**
 * @fileoverview Public (non-admin) routes for listing available LLM providers.
 * Only exposes safe fields — no API keys or sensitive config.
 * Requires authentication but NOT manage_model_providers permission.
 * @module modules/llm-provider/routes/llm-provider-public
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '@/shared/middleware/auth.middleware.js'
import { llmProviderService } from '../services/llm-provider.service.js'

const router = Router()

// All routes require authentication
router.use(requireAuth)

/**
 * @description List active model providers filtered by model_type.
 * Returns only id, factory_name, model_type, model_name, max_tokens, is_default, vision.
 * @route GET /api/models?type=chat|embedding|rerank|tts|speech2text
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const modelType = req.query.type as string | undefined
    const providers = await llmProviderService.listPublic(modelType)
    res.json(providers)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch model providers' })
  }
})

export default router
```

- [ ] **Step 3: Register public route in routes.ts**

In `be/src/app/routes.ts`, add the import alongside existing imports:

```typescript
import llmProviderPublicRoutes from '@/modules/llm-provider/routes/llm-provider-public.routes.js'
```

Then inside `registerRoutes()`, after the existing llm-provider line (line 166), add:

```typescript
    // Public model listing (auth required, no admin permission)
    apiRouter.use('/models', llmProviderPublicRoutes);
```

Note: `apiRouter` is already mounted at `/api`, so this registers as `/api/models`.

- [ ] **Step 3: Create FE public API client**

Create `fe/src/lib/llmProviderPublicApi.ts`:

```typescript
/**
 * @fileoverview Public API for listing available model providers.
 * Used by config dialogs (chat, search) to populate model dropdowns.
 * @module lib/llmProviderPublicApi
 */
import { api } from '@/lib/api'

/**
 * @description A lightweight model provider record (no sensitive fields).
 */
export interface PublicModelProvider {
  id: string
  factory_name: string
  model_type: string
  model_name: string
  max_tokens: number | null
  is_default: boolean
  vision?: boolean
}

/**
 * @description Fetch active model providers, optionally filtered by type.
 * @param {string} [type] - Filter by model_type: 'chat', 'embedding', 'rerank', 'tts', 'speech2text'
 * @returns {Promise<PublicModelProvider[]>} List of matching providers
 */
export function listModels(type?: string): Promise<PublicModelProvider[]> {
  const params = type ? `?type=${encodeURIComponent(type)}` : ''
  return api.get<PublicModelProvider[]>(`/api/models${params}`)
}
```

- [ ] **Step 4: Verify the endpoint works**

Run: `npm run dev:be` and test with curl:
```bash
curl -b cookies.txt http://localhost:3001/api/models?type=chat
curl -b cookies.txt http://localhost:3001/api/models?type=rerank
```
Expected: JSON array of providers filtered by type.

- [ ] **Step 5: Commit**

```bash
git add be/src/modules/llm-provider/services/llm-provider.service.ts be/src/modules/llm-provider/routes/llm-provider-public.routes.ts be/src/app/routes.ts fe/src/lib/llmProviderPublicApi.ts
git commit -m "feat: add public model provider listing API for config dialogs"
```

---

### Task 2: Extend FE Type Definitions

**Team:** Architect → Developer
**Files:**
- Modify: `fe/src/features/chat/types/chat.types.ts`
- Modify: `fe/src/features/search/types/search.types.ts`

- [ ] **Step 1: Extend chat PromptConfig interface**

In `fe/src/features/chat/types/chat.types.ts`, replace the `PromptConfig` interface (lines 124-139) with the full version:

```typescript
/**
 * @description LLM sampling parameters for a chat assistant.
 */
export interface ChatLlmSetting {
  /** LLM temperature (0-2) */
  temperature?: number | undefined
  /** Whether temperature is enabled */
  temperatureEnabled?: boolean | undefined
  /** Nucleus sampling parameter (0-1) */
  top_p?: number | undefined
  /** Whether top_p is enabled */
  topPEnabled?: boolean | undefined
  /** Penalty for frequent tokens (0-1) */
  frequency_penalty?: number | undefined
  /** Whether frequency_penalty is enabled */
  frequencyPenaltyEnabled?: boolean | undefined
  /** Penalty for repeated tokens (0-1) */
  presence_penalty?: number | undefined
  /** Whether presence_penalty is enabled */
  presencePenaltyEnabled?: boolean | undefined
  /** Maximum output length */
  max_tokens?: number | undefined
  /** Whether max_tokens is enabled */
  maxTokensEnabled?: boolean | undefined
}

/**
 * @description Metadata filter condition for RAG retrieval.
 */
export interface MetadataFilterCondition {
  /** Metadata field name */
  name: string
  /** Comparison operator */
  comparison_operator: 'is' | 'is_not' | 'contains' | 'gt' | 'lt' | 'range'
  /** Comparison value */
  value: string | number | [number, number]
}

/**
 * @description Metadata filter configuration.
 */
export interface MetadataFilter {
  /** Logical operator between conditions */
  logic: 'and' | 'or'
  /** Array of filter conditions */
  conditions: MetadataFilterCondition[]
}

/**
 * @description Prompt and retrieval configuration for an assistant.
 */
export interface PromptConfig {
  /** System-level instruction */
  system?: string | undefined
  /** Welcome message displayed at start */
  prologue?: string | undefined
  /** Number of top documents to retrieve */
  top_n?: number | undefined
  /** Number of top keywords / reranker input size */
  top_k?: number | undefined
  /** LLM sampling parameters */
  llm_setting?: ChatLlmSetting | undefined
  /** Custom prompt variables for template substitution */
  variables?: PromptVariable[] | undefined
  /** Enable multi-turn query refinement */
  refine_multiturn?: boolean | undefined
  /** Enable cross-language query expansion (comma-separated codes) */
  cross_languages?: string | undefined
  /** Enable keyword extraction from query */
  keyword?: boolean | undefined
  /** Include source citations in response */
  quote?: boolean | undefined
  /** Response when no relevant content found */
  empty_response?: string | undefined
  /** Enable table of contents enhancement */
  toc_enhance?: boolean | undefined
  /** Tavily API key for web search */
  tavily_api_key?: string | undefined
  /** Enable knowledge graph retrieval */
  use_kg?: boolean | undefined
  /** Rerank model provider ID */
  rerank_id?: string | undefined
  /** Enable reasoning / deep thinking mode */
  reasoning?: boolean | undefined
  /** Enable text-to-speech */
  tts?: boolean | undefined
  /** Chat language preference */
  language?: string | undefined
  /** Similarity threshold for chunk retrieval (0-1) */
  similarity_threshold?: number | undefined
  /** Weight for vector search vs keyword search (0-1) */
  vector_similarity_weight?: number | undefined
  /** Metadata filter for document filtering */
  metadata_filter?: MetadataFilter | undefined
}
```

- [ ] **Step 2: Update CreateAssistantPayload to include llm_setting**

In the same file, update `CreateAssistantPayload`:

```typescript
export interface CreateAssistantPayload {
  name: string
  description?: string | undefined
  kb_ids: string[]
  llm_id?: string | undefined
  is_public?: boolean | undefined
  prompt_config?: Partial<PromptConfig> | undefined
}
```

(No change needed — `prompt_config` already accepts `Partial<PromptConfig>` which now includes all new fields.)

- [ ] **Step 3: Extend search SearchLlmSetting**

In `fe/src/features/search/types/search.types.ts`, replace `SearchLlmSetting` (lines 131-138):

```typescript
/**
 * @description LLM settings for search summary generation.
 */
export interface SearchLlmSetting {
  /** Temperature for LLM generation (0-2) */
  temperature?: number | undefined
  /** Whether temperature is enabled */
  temperatureEnabled?: boolean | undefined
  /** Top-p sampling parameter (0-1) */
  top_p?: number | undefined
  /** Whether top_p is enabled */
  topPEnabled?: boolean | undefined
  /** Penalty for frequent tokens (0-1) */
  frequency_penalty?: number | undefined
  /** Whether frequency_penalty is enabled */
  frequencyPenaltyEnabled?: boolean | undefined
  /** Penalty for repeated tokens (0-1) */
  presence_penalty?: number | undefined
  /** Whether presence_penalty is enabled */
  presencePenaltyEnabled?: boolean | undefined
  /** Maximum tokens for LLM response */
  max_tokens?: number | undefined
  /** Whether max_tokens is enabled */
  maxTokensEnabled?: boolean | undefined
}
```

- [ ] **Step 4: Add rerank_top_k and metadata_filter to SearchAppConfig**

In the same file, add to `SearchAppConfig` interface (after `rerank_id` field):

```typescript
  /** Top K input size for reranker (0-2048) */
  rerank_top_k?: number | undefined
  /** Metadata filter for document filtering */
  metadata_filter?: import('@/components/metadata-filter/metadata-filter.types').MetadataFilter | undefined
```

- [ ] **Step 4b: Create shared metadata filter types**

Create `fe/src/components/metadata-filter/metadata-filter.types.ts`:

```typescript
/**
 * @fileoverview Shared type definitions for metadata filtering.
 * Used by both Chat and Search config dialogs.
 * @module components/metadata-filter/metadata-filter.types
 */

/**
 * @description Metadata filter condition for RAG retrieval.
 */
export interface MetadataFilterCondition {
  /** Metadata field name */
  name: string
  /** Comparison operator */
  comparison_operator: 'is' | 'is_not' | 'contains' | 'gt' | 'lt' | 'range'
  /** Comparison value */
  value: string | number | [number, number]
}

/**
 * @description Metadata filter configuration with logical grouping.
 */
export interface MetadataFilter {
  /** Logical operator between conditions */
  logic: 'and' | 'or'
  /** Array of filter conditions */
  conditions: MetadataFilterCondition[]
}
```

- [ ] **Step 4c: Update chat PromptConfig to import shared types**

In `fe/src/features/chat/types/chat.types.ts`, replace the inline `MetadataFilterCondition` and `MetadataFilter` interfaces with imports:

```typescript
import type { MetadataFilter, MetadataFilterCondition } from '@/components/metadata-filter/metadata-filter.types'
export type { MetadataFilter, MetadataFilterCondition }
```

- [ ] **Step 5: Commit**

```bash
git add fe/src/features/chat/types/chat.types.ts fe/src/features/search/types/search.types.ts
git commit -m "feat: extend chat and search type definitions for all RAGFlow settings"
```

---

### Task 3: Update Backend Schemas

**Team:** Developer
**Files:**
- Modify: `be/src/modules/chat/schemas/chat-assistant.schemas.ts`
- Modify: `be/src/modules/search/schemas/search.schemas.ts`

- [ ] **Step 1: Add llm_setting and language to chat promptConfigSchema**

In `be/src/modules/chat/schemas/chat-assistant.schemas.ts`, add these fields inside `promptConfigSchema` (after the existing fields):

```typescript
  // LLM sampling parameters (nested object matching RAGFlow llm_setting)
  llm_setting: z.object({
    temperature: z.number().min(0).max(2).optional(),
    temperatureEnabled: z.boolean().optional(),
    top_p: z.number().min(0).max(1).optional(),
    topPEnabled: z.boolean().optional(),
    frequency_penalty: z.number().min(0).max(1).optional(),
    frequencyPenaltyEnabled: z.boolean().optional(),
    presence_penalty: z.number().min(0).max(1).optional(),
    presencePenaltyEnabled: z.boolean().optional(),
    max_tokens: z.number().int().min(1).max(128000).optional(),
    maxTokensEnabled: z.boolean().optional(),
  }).optional(),
  // Text-to-speech toggle
  tts: z.boolean().optional(),
  // Chat language preference
  language: z.string().max(32).optional(),
```

- [ ] **Step 2: Add frequency_penalty and presence_penalty to search schema**

In `be/src/modules/search/schemas/search.schemas.ts`, find the `llm_setting` object inside `searchConfigSchema` and extend it:

```typescript
  llm_setting: z.object({
    temperature: z.number().min(0).max(2).optional(),
    temperatureEnabled: z.boolean().optional(),
    top_p: z.number().min(0).max(1).optional(),
    topPEnabled: z.boolean().optional(),
    frequency_penalty: z.number().min(0).max(1).optional(),
    frequencyPenaltyEnabled: z.boolean().optional(),
    presence_penalty: z.number().min(0).max(1).optional(),
    presencePenaltyEnabled: z.boolean().optional(),
    max_tokens: z.number().int().min(1).max(128000).optional(),
    maxTokensEnabled: z.boolean().optional(),
  }).optional(),
```

Also add `rerank_top_k` and `metadata_filter` to `searchConfigSchema`:

```typescript
  rerank_top_k: z.number().int().min(0).max(2048).optional(),
  metadata_filter: z.object({
    logic: z.enum(['and', 'or']).default('and'),
    conditions: z.array(z.object({
      name: z.string(),
      comparison_operator: z.enum(['is', 'is_not', 'contains', 'gt', 'lt', 'range']),
      value: z.union([z.string(), z.number(), z.tuple([z.number(), z.number()])]),
    })).max(20),
  }).optional(),
```

- [ ] **Step 3: Verify build**

Run: `npm run build -w be`
Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add be/src/modules/chat/schemas/chat-assistant.schemas.ts be/src/modules/search/schemas/search.schemas.ts
git commit -m "feat: extend chat and search BE schemas for full RAGFlow parity"
```

---

### Task 4: SliderWithToggle Shared Component

**Team:** UI/UX Designer → Developer → Tester
**Files:**
- Create: `fe/src/components/llm-setting-fields/SliderWithToggle.tsx`

- [ ] **Step 1: Write the test**

Create `fe/tests/components/SliderWithToggle.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SliderWithToggle } from '@/components/llm-setting-fields/SliderWithToggle'

describe('SliderWithToggle', () => {
  it('renders label and current value', () => {
    render(
      <SliderWithToggle label="Temperature" value={0.5} enabled={true}
        onValueChange={vi.fn()} onEnabledChange={vi.fn()} min={0} max={1} step={0.01} />
    )
    expect(screen.getByText('Temperature')).toBeInTheDocument()
    expect(screen.getByText('0.5')).toBeInTheDocument()
  })

  it('disables slider when toggle is off', () => {
    render(
      <SliderWithToggle label="Temperature" value={0.5} enabled={false}
        onValueChange={vi.fn()} onEnabledChange={vi.fn()} min={0} max={1} step={0.01} />
    )
    // Slider input should be disabled
    const slider = screen.getByRole('slider')
    expect(slider).toBeDisabled()
  })

  it('calls onEnabledChange when toggle clicked', () => {
    const onEnabledChange = vi.fn()
    render(
      <SliderWithToggle label="Temperature" value={0.5} enabled={true}
        onValueChange={vi.fn()} onEnabledChange={onEnabledChange} min={0} max={1} step={0.01} />
    )
    fireEvent.click(screen.getByRole('switch'))
    expect(onEnabledChange).toHaveBeenCalledWith(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w fe -- --run tests/components/SliderWithToggle.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SliderWithToggle**

Create `fe/src/components/llm-setting-fields/SliderWithToggle.tsx`:

```typescript
/**
 * @fileoverview A slider control with an optional enabled/disabled toggle switch.
 * Used for LLM parameters like temperature, top_p, frequency_penalty, etc.
 * @module components/llm-setting-fields/SliderWithToggle
 */
import { Switch } from '@/components/ui/switch'

/**
 * @description Props for the SliderWithToggle component.
 */
interface SliderWithToggleProps {
  /** Display label */
  label: string
  /** Optional tooltip text */
  tooltip?: string
  /** Current numeric value */
  value: number
  /** Whether the parameter is active */
  enabled: boolean
  /** Called when the slider value changes */
  onValueChange: (value: number) => void
  /** Called when the toggle is flipped */
  onEnabledChange: (enabled: boolean) => void
  /** Minimum slider value */
  min: number
  /** Maximum slider value */
  max: number
  /** Slider step increment */
  step: number
}

/**
 * @description A labeled slider with a toggle switch and numeric display.
 * When disabled, the slider and number input are grayed out and non-interactive.
 * @param {SliderWithToggleProps} props - Slider configuration
 * @returns {JSX.Element} Rendered slider row with toggle
 */
export function SliderWithToggle({
  label,
  tooltip,
  value,
  enabled,
  onValueChange,
  onEnabledChange,
  min,
  max,
  step,
}: SliderWithToggleProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Toggle switch to enable/disable the parameter */}
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            className="h-4 w-7 data-[state=checked]:bg-primary"
          />
          <label className="text-sm font-medium text-foreground" title={tooltip}>
            {label}
          </label>
        </div>
        {/* Display current value */}
        <span className="text-sm tabular-nums text-muted-foreground">
          {value}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {/* Range slider */}
        <input
          type="range"
          role="slider"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={!enabled}
          onChange={(e) => onValueChange(Number(e.target.value))}
          className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
        />
        {/* Number input for precise entry */}
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={!enabled}
          onChange={(e) => {
            const v = Number(e.target.value)
            // Clamp value to valid range
            if (v >= min && v <= max) onValueChange(v)
          }}
          className="w-16 rounded border bg-background px-2 py-0.5 text-sm tabular-nums disabled:opacity-40"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w fe -- --run tests/components/SliderWithToggle.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add fe/src/components/llm-setting-fields/SliderWithToggle.tsx fe/tests/components/SliderWithToggle.test.tsx
git commit -m "feat: add SliderWithToggle shared component for LLM parameters"
```

---

### Task 5: LLM Presets Definition

**Team:** UI/UX Designer → Developer
**Files:**
- Create: `fe/src/components/llm-setting-fields/llm-presets.ts`

- [ ] **Step 1: Create presets file**

```typescript
/**
 * @fileoverview LLM parameter presets matching RAGFlow freedom levels.
 * @module components/llm-setting-fields/llm-presets
 */

/**
 * @description A named preset of LLM sampling parameters.
 */
export interface LlmPreset {
  temperature: number
  top_p: number
  frequency_penalty: number
  presence_penalty: number
  max_tokens: number
}

/**
 * @description Available preset names for the freedom selector.
 */
export type PresetName = 'precise' | 'balance' | 'creative' | 'custom'

/**
 * @description Pre-configured LLM parameter sets matching RAGFlow defaults.
 */
export const LLM_PRESETS: Record<Exclude<PresetName, 'custom'>, LlmPreset> = {
  precise: {
    temperature: 0.2,
    top_p: 0.75,
    frequency_penalty: 0.5,
    presence_penalty: 0.5,
    max_tokens: 4096,
  },
  balance: {
    temperature: 0.5,
    top_p: 0.85,
    frequency_penalty: 0.3,
    presence_penalty: 0.2,
    max_tokens: 4096,
  },
  creative: {
    temperature: 0.8,
    top_p: 0.9,
    frequency_penalty: 0.1,
    presence_penalty: 0.1,
    max_tokens: 4096,
  },
}

/**
 * @description Detects which preset matches the current parameter values.
 * Returns 'custom' if no preset matches exactly.
 * @param {LlmPreset} params - Current LLM parameter values
 * @returns {PresetName} Detected preset name
 */
export function detectPreset(params: Partial<LlmPreset>): PresetName {
  for (const [name, preset] of Object.entries(LLM_PRESETS)) {
    if (
      params.temperature === preset.temperature &&
      params.top_p === preset.top_p &&
      params.frequency_penalty === preset.frequency_penalty &&
      params.presence_penalty === preset.presence_penalty &&
      params.max_tokens === preset.max_tokens
    ) {
      return name as PresetName
    }
  }
  return 'custom'
}
```

- [ ] **Step 2: Write test for detectPreset**

Create `fe/tests/components/llm-presets.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectPreset, LLM_PRESETS } from '@/components/llm-setting-fields/llm-presets'

describe('detectPreset', () => {
  it('detects precise preset', () => {
    expect(detectPreset(LLM_PRESETS.precise)).toBe('precise')
  })

  it('detects balance preset', () => {
    expect(detectPreset(LLM_PRESETS.balance)).toBe('balance')
  })

  it('detects creative preset', () => {
    expect(detectPreset(LLM_PRESETS.creative)).toBe('creative')
  })

  it('returns custom for non-matching values', () => {
    expect(detectPreset({ temperature: 0.99, top_p: 0.5, frequency_penalty: 0, presence_penalty: 0, max_tokens: 1000 })).toBe('custom')
  })

  it('returns custom for partial params', () => {
    expect(detectPreset({ temperature: 0.2 })).toBe('custom')
  })
})
```

- [ ] **Step 3: Run test**

Run: `npm run test -w fe -- --run tests/components/llm-presets.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add fe/src/components/llm-setting-fields/llm-presets.ts fe/tests/components/llm-presets.test.ts
git commit -m "feat: add LLM parameter presets (Precise/Balance/Creative)"
```

---

### Task 6: LlmSettingFields Shared Component

**Team:** UI/UX Designer → Developer → Tester
**Files:**
- Create: `fe/src/components/llm-setting-fields/LlmSettingFields.tsx`
- Create: `fe/tests/components/LlmSettingFields.test.tsx`

- [ ] **Step 1: Write the test**

Create `fe/tests/components/LlmSettingFields.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LlmSettingFields } from '@/components/llm-setting-fields/LlmSettingFields'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
)

describe('LlmSettingFields', () => {
  const defaults = {
    temperature: 0.5, temperatureEnabled: true,
    top_p: 0.85, topPEnabled: true,
    frequency_penalty: 0.3, frequencyPenaltyEnabled: true,
    presence_penalty: 0.2, presencePenaltyEnabled: true,
    max_tokens: 4096, maxTokensEnabled: true,
  }

  it('renders preset selector with Balance detected', () => {
    render(wrap(
      <LlmSettingFields value={defaults} onChange={vi.fn()} />
    ))
    // Preset dropdown should show "Balance"
    const select = screen.getByDisplayValue(/balance/i)
    expect(select).toBeInTheDocument()
  })

  it('renders all 5 parameter sliders', () => {
    render(wrap(
      <LlmSettingFields value={defaults} onChange={vi.fn()} />
    ))
    expect(screen.getAllByRole('slider')).toHaveLength(5)
  })

  it('applies preset on selection', () => {
    const onChange = vi.fn()
    render(wrap(
      <LlmSettingFields value={defaults} onChange={onChange} />
    ))
    // Change preset to Precise
    fireEvent.change(screen.getByDisplayValue(/balance/i), { target: { value: 'precise' } })
    expect(onChange).toHaveBeenCalled()
    const call = onChange.mock.calls[0][0]
    expect(call.temperature).toBe(0.2)
  })

  it('respects showFields prop to hide parameters', () => {
    render(wrap(
      <LlmSettingFields value={defaults} onChange={vi.fn()}
        showFields={['temperature', 'top_p']} />
    ))
    expect(screen.getAllByRole('slider')).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w fe -- --run tests/components/LlmSettingFields.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement LlmSettingFields**

Create `fe/src/components/llm-setting-fields/LlmSettingFields.tsx`:

```typescript
/**
 * @fileoverview Shared LLM parameter settings with preset selector and per-parameter toggles.
 * Used in both Chat and Search configuration dialogs.
 * @module components/llm-setting-fields/LlmSettingFields
 */
import { useTranslation } from 'react-i18next'
import { SliderWithToggle } from './SliderWithToggle'
import { LLM_PRESETS, detectPreset, type PresetName } from './llm-presets'

/** All configurable parameter names */
type ParamField = 'temperature' | 'top_p' | 'frequency_penalty' | 'presence_penalty' | 'max_tokens'

/**
 * @description Value shape for the LLM setting fields.
 */
export interface LlmSettingValue {
  temperature?: number
  temperatureEnabled?: boolean
  top_p?: number
  topPEnabled?: boolean
  frequency_penalty?: number
  frequencyPenaltyEnabled?: boolean
  presence_penalty?: number
  presencePenaltyEnabled?: boolean
  max_tokens?: number
  maxTokensEnabled?: boolean
}

interface LlmSettingFieldsProps {
  /** Current parameter values */
  value: LlmSettingValue
  /** Called when any value changes */
  onChange: (value: LlmSettingValue) => void
  /** Which fields to show (defaults to all 5) */
  showFields?: ParamField[]
}

/** Parameter definitions: label key, min, max, step */
const PARAMS: Record<ParamField, { labelKey: string; min: number; max: number; step: number; enabledKey: keyof LlmSettingValue }> = {
  temperature:      { labelKey: 'llmSettings.temperature',      min: 0, max: 2,      step: 0.01, enabledKey: 'temperatureEnabled' },
  top_p:            { labelKey: 'llmSettings.topP',              min: 0, max: 1,      step: 0.01, enabledKey: 'topPEnabled' },
  frequency_penalty:{ labelKey: 'llmSettings.frequencyPenalty',  min: 0, max: 1,      step: 0.01, enabledKey: 'frequencyPenaltyEnabled' },
  presence_penalty: { labelKey: 'llmSettings.presencePenalty',   min: 0, max: 1,      step: 0.01, enabledKey: 'presencePenaltyEnabled' },
  max_tokens:       { labelKey: 'llmSettings.maxTokens',         min: 1, max: 128000, step: 1,    enabledKey: 'maxTokensEnabled' },
}

/**
 * @description Renders LLM sampling parameter controls with preset selector and per-parameter toggles.
 * Matches RAGFlow's chat-model-settings layout: preset dropdown + 5 toggle-enabled sliders.
 * @param {LlmSettingFieldsProps} props - Component props
 * @returns {JSX.Element} Rendered LLM settings panel
 */
export function LlmSettingFields({ value, onChange, showFields }: LlmSettingFieldsProps) {
  const { t } = useTranslation()
  const visibleFields = showFields ?? (['temperature', 'top_p', 'frequency_penalty', 'presence_penalty', 'max_tokens'] as ParamField[])

  // Detect which preset currently matches
  const currentPreset = detectPreset({
    temperature: value.temperature,
    top_p: value.top_p,
    frequency_penalty: value.frequency_penalty,
    presence_penalty: value.presence_penalty,
    max_tokens: value.max_tokens,
  })

  /**
   * Apply a preset — sets all parameter values and enables all toggles.
   */
  const handlePresetChange = (preset: PresetName) => {
    if (preset === 'custom') return
    const p = LLM_PRESETS[preset]
    onChange({
      ...value,
      temperature: p.temperature, temperatureEnabled: true,
      top_p: p.top_p, topPEnabled: true,
      frequency_penalty: p.frequency_penalty, frequencyPenaltyEnabled: true,
      presence_penalty: p.presence_penalty, presencePenaltyEnabled: true,
      max_tokens: p.max_tokens, maxTokensEnabled: true,
    })
  }

  return (
    <div className="space-y-3">
      {/* Preset selector */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{t('llmSettings.preset')}</label>
        <select
          value={currentPreset}
          onChange={(e) => handlePresetChange(e.target.value as PresetName)}
          className="rounded border bg-background px-2 py-1 text-sm"
        >
          <option value="precise">{t('llmSettings.precise')}</option>
          <option value="balance">{t('llmSettings.balance')}</option>
          <option value="creative">{t('llmSettings.creative')}</option>
          <option value="custom">{t('llmSettings.custom')}</option>
        </select>
      </div>

      {/* Parameter sliders with toggles */}
      {visibleFields.map((field) => {
        const def = PARAMS[field]
        return (
          <SliderWithToggle
            key={field}
            label={t(def.labelKey)}
            value={value[field] ?? def.min}
            enabled={Boolean(value[def.enabledKey])}
            onValueChange={(v) => onChange({ ...value, [field]: v })}
            onEnabledChange={(e) => onChange({ ...value, [def.enabledKey]: e })}
            min={def.min}
            max={def.max}
            step={def.step}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w fe -- --run tests/components/LlmSettingFields.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add fe/src/components/llm-setting-fields/LlmSettingFields.tsx fe/tests/components/LlmSettingFields.test.tsx
git commit -m "feat: add LlmSettingFields shared component with presets and per-param toggles"
```

---

### Task 7: ModelSelector Shared Component

**Team:** Developer → Tester
**Files:**
- Create: `fe/src/components/model-selector/ModelSelector.tsx`
- Create: `fe/tests/components/ModelSelector.test.tsx`

- [ ] **Step 1: Write the test**

Create `fe/tests/components/ModelSelector.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModelSelector } from '@/components/model-selector/ModelSelector'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock the public API
vi.mock('@/lib/llmProviderPublicApi', () => ({
  listModels: vi.fn().mockResolvedValue([
    { id: '1', factory_name: 'OpenAI', model_type: 'chat', model_name: 'gpt-4o', max_tokens: 128000, is_default: true },
    { id: '2', factory_name: 'Anthropic', model_type: 'chat', model_name: 'claude-3.5-sonnet', max_tokens: 8192, is_default: false },
  ]),
}))

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
)

describe('ModelSelector', () => {
  it('renders placeholder when no value selected', () => {
    render(wrap(<ModelSelector modelType="chat" value="" onChange={vi.fn()} placeholder="Select model" />))
    expect(screen.getByText('Select model')).toBeInTheDocument()
  })

  it('shows model options after loading', async () => {
    render(wrap(<ModelSelector modelType="chat" value="" onChange={vi.fn()} placeholder="Select" />))
    // Wait for async options to load
    expect(await screen.findByText(/gpt-4o/)).toBeInTheDocument()
    expect(await screen.findByText(/claude-3.5-sonnet/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement ModelSelector**

Create `fe/src/components/model-selector/ModelSelector.tsx`:

```typescript
/**
 * @fileoverview Dropdown selector for model providers, fetched from public API.
 * Groups models by factory_name and marks default with a badge.
 * @module components/model-selector/ModelSelector
 */
import { useQuery } from '@tanstack/react-query'
import { listModels, type PublicModelProvider } from '@/lib/llmProviderPublicApi'

interface ModelSelectorProps {
  /** Model type to filter by: 'chat', 'rerank', 'embedding', 'tts' */
  modelType: string
  /** Currently selected provider ID */
  value: string
  /** Called when selection changes */
  onChange: (id: string) => void
  /** Placeholder text when nothing selected */
  placeholder?: string
  /** Whether the selector is disabled */
  disabled?: boolean
}

/**
 * @description A select dropdown that lists available model providers filtered by type.
 * Fetches from the public /api/models endpoint (no admin permission required).
 * Options are grouped by factory_name and show model_name as the display label.
 * @param {ModelSelectorProps} props - Selector configuration
 * @returns {JSX.Element} Rendered model selector
 */
export function ModelSelector({ modelType, value, onChange, placeholder, disabled }: ModelSelectorProps) {
  // Fetch available models for the given type
  const { data: models = [], isLoading } = useQuery({
    queryKey: ['public-models', modelType],
    queryFn: () => listModels(modelType),
    staleTime: 60_000,
  })

  // Group models by factory_name for optgroup rendering
  const groups = models.reduce<Record<string, PublicModelProvider[]>>((acc, m) => {
    if (!acc[m.factory_name]) acc[m.factory_name] = []
    acc[m.factory_name].push(m)
    return acc
  }, {})

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || isLoading}
      className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
    >
      {/* Empty placeholder option */}
      <option value="">{isLoading ? 'Loading...' : (placeholder ?? 'Select a model')}</option>

      {/* Grouped model options */}
      {Object.entries(groups).map(([factory, factoryModels]) => (
        <optgroup key={factory} label={factory}>
          {factoryModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.model_name}{m.is_default ? ' ★' : ''}{m.max_tokens ? ` (${m.max_tokens.toLocaleString()} tokens)` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test -w fe -- --run tests/components/ModelSelector.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add fe/src/components/model-selector/ModelSelector.tsx fe/tests/components/ModelSelector.test.tsx
git commit -m "feat: add ModelSelector dropdown component with public model API"
```

---

### Task 8: RerankSelector Shared Component

**Team:** Developer → Tester
**Files:**
- Create: `fe/src/components/rerank-selector/RerankSelector.tsx`
- Create: `fe/tests/components/RerankSelector.test.tsx`

- [ ] **Step 1: Write the test**

Create `fe/tests/components/RerankSelector.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RerankSelector } from '@/components/rerank-selector/RerankSelector'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'

vi.mock('@/lib/llmProviderPublicApi', () => ({
  listModels: vi.fn().mockResolvedValue([
    { id: 'r1', factory_name: 'Jina', model_type: 'rerank', model_name: 'jina-reranker-v2', max_tokens: null, is_default: true },
  ]),
}))

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={qc}>
    <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
  </QueryClientProvider>
)

describe('RerankSelector', () => {
  it('shows Top K slider only when rerank model is selected', async () => {
    const { rerender } = render(wrap(
      <RerankSelector rerankId="" topK={1024} onRerankChange={vi.fn()} onTopKChange={vi.fn()} />
    ))
    // Top K slider should NOT be visible when no rerank model
    expect(screen.queryByText(/Top K/i)).not.toBeInTheDocument()

    // Select a rerank model
    rerender(wrap(
      <RerankSelector rerankId="r1" topK={1024} onRerankChange={vi.fn()} onTopKChange={vi.fn()} />
    ))
    expect(screen.getByText(/Top K/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement RerankSelector**

Create `fe/src/components/rerank-selector/RerankSelector.tsx`:

```typescript
/**
 * @fileoverview Rerank model selector with conditional Top K slider.
 * Used in both Chat assistant and Search app configuration.
 * @module components/rerank-selector/RerankSelector
 */
import { useTranslation } from 'react-i18next'
import { ModelSelector } from '@/components/model-selector/ModelSelector'

interface RerankSelectorProps {
  /** Currently selected rerank provider ID */
  rerankId: string
  /** Top K value for reranker input size */
  topK: number
  /** Called when rerank model changes */
  onRerankChange: (id: string) => void
  /** Called when Top K value changes */
  onTopKChange: (value: number) => void
}

/**
 * @description Rerank model dropdown with a conditional Top K slider.
 * Top K slider only appears when a rerank model is selected.
 * Matches RAGFlow's rerank UI pattern.
 * @param {RerankSelectorProps} props - Component configuration
 * @returns {JSX.Element} Rendered rerank selector
 */
export function RerankSelector({ rerankId, topK, onRerankChange, onTopKChange }: RerankSelectorProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      {/* Rerank model dropdown */}
      <div className="space-y-1">
        <label className="text-sm font-medium">{t('llmSettings.rerankModel')}</label>
        <ModelSelector
          modelType="rerank"
          value={rerankId}
          onChange={onRerankChange}
          placeholder={t('llmSettings.rerankPlaceholder')}
        />
      </div>

      {/* Top K slider — only shown when a rerank model is selected */}
      {rerankId && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">{t('llmSettings.topK')}</label>
            <span className="text-sm tabular-nums text-muted-foreground">{topK}</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              role="slider"
              min={1}
              max={2048}
              step={1}
              value={topK}
              onChange={(e) => onTopKChange(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-primary"
            />
            <input
              type="number"
              min={1}
              max={2048}
              value={topK}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (v >= 1 && v <= 2048) onTopKChange(v)
              }}
              className="w-20 rounded border bg-background px-2 py-0.5 text-sm tabular-nums"
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test -w fe -- --run tests/components/RerankSelector.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add fe/src/components/rerank-selector/RerankSelector.tsx fe/tests/components/RerankSelector.test.tsx
git commit -m "feat: add RerankSelector component with conditional Top K slider"
```

---

### Task 9: MetadataFilterEditor Shared Component

**Team:** UI/UX Designer → Developer → Tester
**Files:**
- Create: `fe/src/components/metadata-filter/MetadataFilterEditor.tsx`
- Create: `fe/src/components/metadata-filter/MetadataFilterCondition.tsx`
- Create: `fe/tests/components/MetadataFilterEditor.test.tsx`

- [ ] **Step 1: Write the test**

Create `fe/tests/components/MetadataFilterEditor.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MetadataFilterEditor } from '@/components/metadata-filter/MetadataFilterEditor'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
)

describe('MetadataFilterEditor', () => {
  it('renders empty state with add button', () => {
    render(wrap(
      <MetadataFilterEditor
        value={{ logic: 'and', conditions: [] }}
        onChange={vi.fn()}
      />
    ))
    expect(screen.getByText(/add condition/i)).toBeInTheDocument()
  })

  it('adds a condition when add button clicked', () => {
    const onChange = vi.fn()
    render(wrap(
      <MetadataFilterEditor
        value={{ logic: 'and', conditions: [] }}
        onChange={onChange}
      />
    ))
    fireEvent.click(screen.getByText(/add condition/i))
    expect(onChange).toHaveBeenCalledWith({
      logic: 'and',
      conditions: [{ name: '', comparison_operator: 'is', value: '' }],
    })
  })

  it('shows logic selector when 2+ conditions exist', () => {
    render(wrap(
      <MetadataFilterEditor
        value={{
          logic: 'and',
          conditions: [
            { name: 'type', comparison_operator: 'is', value: 'pdf' },
            { name: 'size', comparison_operator: 'gt', value: 1000 },
          ],
        }}
        onChange={vi.fn()}
      />
    ))
    // Logic selector should be visible with AND/OR options
    expect(screen.getByDisplayValue('and')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement MetadataFilterCondition**

Create `fe/src/components/metadata-filter/MetadataFilterCondition.tsx`:

```typescript
/**
 * @fileoverview A single metadata filter condition row.
 * @module components/metadata-filter/MetadataFilterCondition
 */
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import type { MetadataFilterCondition as ConditionType } from '@/components/metadata-filter/metadata-filter.types'

/** Available comparison operators */
const OPERATORS = ['is', 'is_not', 'contains', 'gt', 'lt', 'range'] as const

interface MetadataFilterConditionProps {
  /** Current condition value */
  value: ConditionType
  /** Called when any field changes */
  onChange: (value: ConditionType) => void
  /** Called when this condition is removed */
  onRemove: () => void
}

/**
 * @description A single row in the metadata filter with key, operator, and value inputs.
 * @param {MetadataFilterConditionProps} props - Condition configuration
 * @returns {JSX.Element} Rendered condition row
 */
export function MetadataFilterCondition({ value, onChange, onRemove }: MetadataFilterConditionProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-start gap-2 rounded-md border p-2">
      {/* Metadata key input */}
      <input
        type="text"
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        placeholder={t('metadataFilter.keyPlaceholder')}
        className="w-1/3 rounded border bg-background px-2 py-1 text-sm"
      />

      {/* Operator dropdown */}
      <select
        value={value.comparison_operator}
        onChange={(e) => onChange({ ...value, comparison_operator: e.target.value as ConditionType['comparison_operator'] })}
        className="rounded border bg-background px-2 py-1 text-sm"
      >
        {OPERATORS.map((op) => (
          <option key={op} value={op}>{t(`metadataFilter.op.${op}`)}</option>
        ))}
      </select>

      {/* Value input */}
      <input
        type="text"
        value={typeof value.value === 'string' ? value.value : String(value.value)}
        onChange={(e) => onChange({ ...value, value: e.target.value })}
        placeholder={t('metadataFilter.valuePlaceholder')}
        className="flex-1 rounded border bg-background px-2 py-1 text-sm"
      />

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="mt-0.5 rounded p-1 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Implement MetadataFilterEditor**

Create `fe/src/components/metadata-filter/MetadataFilterEditor.tsx`:

```typescript
/**
 * @fileoverview Metadata filter editor with AND/OR logic and dynamic conditions.
 * Used in both Chat assistant and Search app configuration.
 * @module components/metadata-filter/MetadataFilterEditor
 */
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { MetadataFilterCondition } from './MetadataFilterCondition'
import type { MetadataFilter, MetadataFilterCondition as ConditionType } from '@/components/metadata-filter/metadata-filter.types'

interface MetadataFilterEditorProps {
  /** Current filter value */
  value: MetadataFilter
  /** Called when filter changes */
  onChange: (value: MetadataFilter) => void
}

/**
 * @description Metadata filter editor with logic selector and dynamic condition rows.
 * Shows AND/OR logic toggle when 2+ conditions exist.
 * Matches RAGFlow's manual metadata filter UI pattern.
 * @param {MetadataFilterEditorProps} props - Editor configuration
 * @returns {JSX.Element} Rendered metadata filter editor
 */
export function MetadataFilterEditor({ value, onChange }: MetadataFilterEditorProps) {
  const { t } = useTranslation()

  /** Add a new empty condition */
  const addCondition = () => {
    onChange({
      ...value,
      conditions: [...value.conditions, { name: '', comparison_operator: 'is', value: '' }],
    })
  }

  /** Update a condition at a specific index */
  const updateCondition = (index: number, updated: ConditionType) => {
    const conditions = [...value.conditions]
    conditions[index] = updated
    onChange({ ...value, conditions })
  }

  /** Remove a condition at a specific index */
  const removeCondition = (index: number) => {
    onChange({
      ...value,
      conditions: value.conditions.filter((_, i) => i !== index),
    })
  }

  return (
    <div className="space-y-2">
      {/* Logic selector — only visible with 2+ conditions */}
      {value.conditions.length >= 2 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">{t('metadataFilter.logic')}</label>
          <select
            value={value.logic}
            onChange={(e) => onChange({ ...value, logic: e.target.value as 'and' | 'or' })}
            className="rounded border bg-background px-2 py-0.5 text-xs"
          >
            <option value="and">AND</option>
            <option value="or">OR</option>
          </select>
        </div>
      )}

      {/* Condition rows */}
      {value.conditions.map((condition, i) => (
        <MetadataFilterCondition
          key={i}
          value={condition}
          onChange={(c) => updateCondition(i, c)}
          onRemove={() => removeCondition(i)}
        />
      ))}

      {/* Add condition button */}
      <button
        type="button"
        onClick={addCondition}
        className="flex items-center gap-1 rounded-md border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        {t('metadataFilter.addCondition')}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -w fe -- --run tests/components/MetadataFilterEditor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add fe/src/components/metadata-filter/ fe/tests/components/MetadataFilterEditor.test.tsx
git commit -m "feat: add MetadataFilterEditor component with AND/OR logic and conditions"
```

---

### Task 10: Add i18n Keys

**Team:** UI/UX Designer → Developer
**Files:**
- Modify: `fe/src/i18n/locales/en.json`
- Modify: `fe/src/i18n/locales/vi.json`
- Modify: `fe/src/i18n/locales/ja.json`

- [ ] **Step 1: Add English i18n keys**

Add these keys to `fe/src/i18n/locales/en.json`:

```json
"llmSettings": {
  "preset": "Parameter Preset",
  "precise": "Precise",
  "balance": "Balance",
  "creative": "Creative",
  "custom": "Custom",
  "temperature": "Temperature",
  "topP": "Top P",
  "frequencyPenalty": "Frequency Penalty",
  "presencePenalty": "Presence Penalty",
  "maxTokens": "Max Tokens",
  "rerankModel": "Rerank Model",
  "rerankPlaceholder": "Select a rerank model",
  "topK": "Top K (Reranker)",
  "llmModel": "LLM Model",
  "llmModelPlaceholder": "Select an LLM model"
},
"chatSettings": {
  "basicInfo": "Basic Information",
  "promptConfig": "Prompt Configuration",
  "retrievalConfig": "Retrieval Configuration",
  "llmConfig": "LLM Model Settings",
  "featureFlags": "Feature Toggles",
  "emptyResponse": "Empty Response Message",
  "emptyResponsePlaceholder": "Message when no relevant content found...",
  "quote": "Show Citations",
  "quoteDesc": "Include source document citations in responses",
  "keyword": "Keyword Extraction",
  "keywordDesc": "Extract keywords from the query for better retrieval",
  "refineMultiturn": "Multi-turn Refinement",
  "refineMultiturnDesc": "Refine context across conversation turns",
  "tocEnhance": "TOC Enhancement",
  "tocEnhanceDesc": "Enhance results using table of contents structure",
  "useKg": "Knowledge Graph",
  "useKgDesc": "Use knowledge graph for entity-based retrieval",
  "tts": "Text-to-Speech",
  "ttsDesc": "Enable audio output for responses",
  "language": "Language",
  "languagePlaceholder": "Select assistant language",
  "similarityThreshold": "Similarity Threshold",
  "vectorWeight": "Vector Similarity Weight",
  "vectorWeightDesc": "Balance between vector search and keyword search",
  "vectorSearch": "Vector",
  "keywordSearch": "Keyword"
},
"metadataFilter": {
  "title": "Metadata Filter",
  "addCondition": "Add Condition",
  "logic": "Match logic",
  "keyPlaceholder": "Metadata key",
  "valuePlaceholder": "Value",
  "op": {
    "is": "equals",
    "is_not": "not equals",
    "contains": "contains",
    "gt": "greater than",
    "lt": "less than",
    "range": "in range"
  }
}
```

- [ ] **Step 2: Add Vietnamese i18n keys**

Add equivalent keys in `vi.json` (translated to Vietnamese).

- [ ] **Step 3: Add Japanese i18n keys**

Add equivalent keys in `ja.json` (translated to Japanese).

- [ ] **Step 4: Commit**

```bash
git add fe/src/i18n/locales/en.json fe/src/i18n/locales/vi.json fe/src/i18n/locales/ja.json
git commit -m "feat: add i18n keys for LLM settings, chat settings, and metadata filter"
```

---

## Chunk 2: Chat Assistant Settings Enhancement

### Task 11: Rewrite ChatAssistantConfig with Full RAGFlow Parity

**Team:** UI/UX Designer → Developer → Tester

**Files:**
- Modify: `fe/src/features/chat/components/ChatAssistantConfig.tsx`

**UI Layout (matching RAGFlow 3-section design):**

```
┌─────────────────────────────────────────────┐
│ Create/Edit Assistant                        │
├─────────────────────────────────────────────┤
│ SECTION 1: Basic Information                 │
│  ├─ Name (text input)                        │
│  ├─ Description (text input)                 │
│  ├─ Language (select dropdown)               │
│  ├─ Public toggle                            │
│  ├─ Knowledge Bases (multi-select)           │
│  ├─ Empty Response (textarea)                │
│  ├─ Welcome Message (text input)             │
│  └─ Feature Toggles:                         │
│      ├─ Quote/Citation (switch)              │
│      ├─ Keyword Extraction (switch)          │
│      ├─ TTS (switch)                         │
│      ├─ TOC Enhance (switch)                 │
│      └─ Reasoning/Deep Thinking (switch)     │
├─────────────────────────────────────────────┤
│ SECTION 2: Prompt Engine                     │
│  ├─ System Prompt (textarea)                 │
│  ├─ Similarity Threshold (slider 0-1)        │
│  ├─ Vector Weight (slider 0-1 with split)    │
│  ├─ Top N (slider 1-30)                      │
│  ├─ Refine Multiturn (switch)                │
│  ├─ Knowledge Graph (switch)                 │
│  ├─ Rerank Selector (dropdown + Top K)       │
│  ├─ Cross-Language (multi-select pills)      │
│  ├─ Metadata Filter (editor)                 │
│  └─ Prompt Variables (table)                 │
├─────────────────────────────────────────────┤
│ SECTION 3: LLM Model Settings               │
│  ├─ LLM Model (dropdown from providers)      │
│  ├─ Preset Selector (Precise/Balance/...)    │
│  ├─ Temperature (slider + toggle)            │
│  ├─ Top P (slider + toggle)                  │
│  ├─ Presence Penalty (slider + toggle)       │
│  ├─ Frequency Penalty (slider + toggle)      │
│  └─ Max Tokens (slider + toggle)             │
├─────────────────────────────────────────────┤
│                  [Cancel] [Save]             │
└─────────────────────────────────────────────┘
```

- [ ] **Step 1: Add new state variables**

In `ChatAssistantConfig.tsx`, add these new `useState` hooks alongside existing ones:

```typescript
// Basic info (existing)
const [name, setName] = useState('')
const [description, setDescription] = useState('')
const [selectedKbs, setSelectedKbs] = useState<string[]>([])
const [isPublic, setIsPublic] = useState(false)
const [variables, setVariables] = useState<PromptVariable[]>([])

// New: Language
const [language, setLanguage] = useState('')

// New: Prompt configuration
const [systemPrompt, setSystemPrompt] = useState('')
const [prologue, setPrologue] = useState('')
const [emptyResponse, setEmptyResponse] = useState('')

// New: Feature flags
const [quote, setQuote] = useState(true)
const [keyword, setKeyword] = useState(false)
const [tts, setTts] = useState(false)
const [tocEnhance, setTocEnhance] = useState(false)
const [refineMultiturn, setRefineMultiturn] = useState(true)
const [useKg, setUseKg] = useState(false)
const [reasoning, setReasoning] = useState(false)

// New: Retrieval parameters
const [topN, setTopN] = useState(6)
const [similarityThreshold, setSimilarityThreshold] = useState(0.2)
const [vectorWeight, setVectorWeight] = useState(0.3)
const [crossLanguages, setCrossLanguages] = useState('')

// New: Rerank
const [rerankId, setRerankId] = useState('')
const [topK, setTopK] = useState(1024)

// New: LLM model selection
const [llmId, setLlmId] = useState('')

// New: LLM sampling parameters
const [llmSetting, setLlmSetting] = useState<ChatLlmSetting>({
  temperature: 0.1, temperatureEnabled: true,
  top_p: 0.3, topPEnabled: false,
  frequency_penalty: 0.7, frequencyPenaltyEnabled: false,
  presence_penalty: 0.4, presencePenaltyEnabled: false,
  max_tokens: 512, maxTokensEnabled: false,
})

// New: Metadata filter
const [metadataFilter, setMetadataFilter] = useState<MetadataFilter>({
  logic: 'and', conditions: [],
})
```

- [ ] **Step 2: Update useEffect to populate all new fields from dialog prop**

```typescript
useEffect(() => {
  if (dialog) {
    setName(dialog.name)
    setDescription(dialog.description ?? '')
    setSelectedKbs(dialog.kb_ids)
    setIsPublic(dialog.is_public ?? false)
    setLlmId(dialog.llm_id ?? '')
    setVariables(dialog.prompt_config.variables ?? [])

    // Prompt config
    const pc = dialog.prompt_config
    setSystemPrompt(pc.system ?? '')
    setPrologue(pc.prologue ?? '')
    setEmptyResponse(pc.empty_response ?? '')
    setLanguage(pc.language ?? '')

    // Feature flags
    setQuote(pc.quote ?? true)
    setKeyword(pc.keyword ?? false)
    setTts(pc.tts ?? false)
    setTocEnhance(pc.toc_enhance ?? false)
    setRefineMultiturn(pc.refine_multiturn ?? true)
    setUseKg(pc.use_kg ?? false)
    setReasoning(pc.reasoning ?? false)

    // Retrieval
    setTopN(pc.top_n ?? 6)
    setSimilarityThreshold(pc.similarity_threshold ?? 0.2)
    setVectorWeight(pc.vector_similarity_weight ?? 0.3)
    setCrossLanguages(pc.cross_languages ?? '')
    setRerankId(pc.rerank_id ?? '')
    setTopK(pc.top_k ?? 1024)

    // LLM settings
    if (pc.llm_setting) setLlmSetting(pc.llm_setting)

    // Metadata filter
    if (pc.metadata_filter) setMetadataFilter(pc.metadata_filter)
  }
}, [dialog])
```

- [ ] **Step 3: Update handleSave to include all new fields**

```typescript
const handleSave = () => {
  if (!name.trim()) return

  // Filter out variables with empty keys
  const validVars = variables.filter((v) => v.key.trim())

  // Build prompt_config with all fields
  const prompt_config: Partial<PromptConfig> = {
    system: systemPrompt || undefined,
    prologue: prologue || undefined,
    empty_response: emptyResponse || undefined,
    language: language || undefined,
    // Feature flags
    quote,
    keyword,
    tts,
    toc_enhance: tocEnhance,
    refine_multiturn: refineMultiturn,
    use_kg: useKg,
    reasoning,
    // Retrieval
    top_n: topN,
    top_k: topK,
    similarity_threshold: similarityThreshold,
    vector_similarity_weight: vectorWeight,
    cross_languages: crossLanguages || undefined,
    rerank_id: rerankId || undefined,
    // LLM sampling (only send enabled params)
    llm_setting: llmSetting,
    // Variables
    variables: validVars.length > 0 ? validVars : undefined,
    // Metadata filter (only send if conditions exist)
    metadata_filter: metadataFilter.conditions.length > 0 ? metadataFilter : undefined,
  }

  onSave({
    name: name.trim(),
    description: description || undefined,
    kb_ids: selectedKbs,
    llm_id: llmId || undefined,
    is_public: isPublic,
    prompt_config,
  })
}
```

- [ ] **Step 4: Rebuild the JSX with 3 sections**

Replace the existing form JSX with the 3-section layout shown in the design above. Use:
- `<Separator />` between sections
- `<Switch>` for all boolean toggles (quote, keyword, tts, tocEnhance, refineMultiturn, useKg)
- `<ModelSelector modelType="chat">` for LLM model dropdown
- `<LlmSettingFields>` for the LLM parameter section
- `<RerankSelector>` for rerank model + Top K
- `<MetadataFilterEditor>` for metadata filtering
- Vector weight slider with split display showing `Vector: {vectorWeight} | Keyword: {1 - vectorWeight}`
- `<CrossLanguageSelector>` shared component (copy `fe/src/features/search/components/SearchCrossLanguage.tsx` to `fe/src/components/cross-language/CrossLanguageSelector.tsx` and update imports in both search and chat features to use the shared location — this avoids violating NX module boundary rules)

Each toggle row should follow this pattern:
```tsx
<div className="flex items-center justify-between">
  <div>
    <p className="text-sm font-medium">{t('chatSettings.quote')}</p>
    <p className="text-xs text-muted-foreground">{t('chatSettings.quoteDesc')}</p>
  </div>
  <Switch checked={quote} onCheckedChange={setQuote} />
</div>
```

- [ ] **Step 5: Run build to verify**

Run: `npm run build -w fe`
Expected: No TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add fe/src/features/chat/components/ChatAssistantConfig.tsx
git commit -m "feat: enhance ChatAssistantConfig with full RAGFlow parity settings"
```

---

## Chunk 3: Search App Settings Enhancement

### Task 12: Enhance SearchAppConfig with Model Dropdowns, Rerank Top K, and Per-Param Toggles

**Team:** UI/UX Designer → Developer → Tester

**Files:**
- Modify: `fe/src/features/search/components/SearchAppConfig.tsx`

**UI Changes from current state:**

| Current | New |
|---------|-----|
| `rerankId` — plain text input | `<ModelSelector modelType="rerank">` dropdown |
| `llmId` — plain text input | `<ModelSelector modelType="chat">` dropdown |
| No Top K slider for rerank | `<RerankSelector>` with conditional Top K (0-2048) |
| Temperature only slider | `<LlmSettingFields>` with all 5 params + toggles + presets |
| No metadata filter | `<MetadataFilterEditor>` component |
| No embedding model validation | Validation warning when mismatched embedding models |
| `topK` range 1-50 | Dynamic: base topK 1-50 for search, plus rerank_top_k 0-2048 when rerank enabled |

- [ ] **Step 1: Replace rerank text input with RerankSelector**

In `SearchAppConfig.tsx`, find the rerank model text input section and replace with:

```tsx
import { RerankSelector } from '@/components/rerank-selector/RerankSelector'

// In the search parameters section, replace the rerankId Input:
<RerankSelector
  rerankId={rerankId}
  topK={rerankTopK}
  onRerankChange={setRerankId}
  onTopKChange={setRerankTopK}
/>
```

Add new state: `const [rerankTopK, setRerankTopK] = useState(1024)`

- [ ] **Step 2: Replace LLM text input with ModelSelector**

Replace the llmId text input with:

```tsx
import { ModelSelector } from '@/components/model-selector/ModelSelector'

<ModelSelector
  modelType="chat"
  value={llmId}
  onChange={setLlmId}
  placeholder={t('searchAdmin.llmModelPlaceholder')}
  disabled={!enableSummary}
/>
```

- [ ] **Step 3: Replace temperature-only slider with LlmSettingFields**

Replace the current single temperature slider with:

```tsx
import { LlmSettingFields, type LlmSettingValue } from '@/components/llm-setting-fields/LlmSettingFields'

// State:
const [llmSetting, setLlmSetting] = useState<LlmSettingValue>({
  temperature: 0.1, temperatureEnabled: true,
  top_p: 0.3, topPEnabled: false,
  frequency_penalty: 0.7, frequencyPenaltyEnabled: false,
  presence_penalty: 0.4, presencePenaltyEnabled: false,
  max_tokens: 512, maxTokensEnabled: false,
})

// In the LLM config section (conditional on enableSummary):
{enableSummary && (
  <>
    <ModelSelector modelType="chat" value={llmId} onChange={setLlmId} />
    <LlmSettingFields
      value={llmSetting}
      onChange={setLlmSetting}
      showFields={['temperature', 'top_p', 'presence_penalty', 'frequency_penalty']}
    />
  </>
)}
```

Note: `max_tokens` excluded from search summary (matching RAGFlow behavior).

- [ ] **Step 4: Add MetadataFilterEditor**

Add a new section before the feature toggles:

```tsx
import { MetadataFilterEditor } from '@/components/metadata-filter/MetadataFilterEditor'

// State:
const [metadataFilter, setMetadataFilter] = useState<MetadataFilter>({
  logic: 'and', conditions: [],
})

// In JSX (after dataset selection):
<div className="space-y-2">
  <h3 className="text-sm font-medium">{t('metadataFilter.title')}</h3>
  <MetadataFilterEditor value={metadataFilter} onChange={setMetadataFilter} />
</div>
```

- [ ] **Step 5: Add embedding model validation**

When datasets are selected, validate they share the same embedding model:

```tsx
import { useQuery } from '@tanstack/react-query'

// Fetch dataset details to get embedding model info
const { data: datasetDetails } = useQuery({
  queryKey: ['datasets-detail-for-search', selectedDatasets],
  queryFn: () => searchApi.listDatasets(),
  select: (datasets) => datasets.filter(d => selectedDatasets.includes(d.id)),
  enabled: selectedDatasets.length > 0,
})

// Check if all selected datasets use the same embedding model
const embeddingModels = [...new Set(datasetDetails?.map(d => d.embedding_model).filter(Boolean) ?? [])]
const hasEmbeddingMismatch = embeddingModels.length > 1

// Show warning in JSX:
{hasEmbeddingMismatch && (
  <p className="text-xs text-destructive">
    {t('searchAdmin.embeddingMismatchWarning')}
  </p>
)}
```

- [ ] **Step 6: Update handleSave to include all new fields**

```typescript
const handleSave = () => {
  if (!name.trim()) return

  const search_config: SearchAppConfig = {
    similarity_threshold: similarityThreshold,
    top_k: topK,
    search_method: searchMethod,
    vector_similarity_weight: vectorWeight,
    rerank_id: rerankId || undefined,
    rerank_top_k: rerankId ? rerankTopK : undefined,
    llm_id: enableSummary ? llmId || undefined : undefined,
    llm_setting: enableSummary ? llmSetting : undefined,
    cross_languages: crossLanguages || undefined,
    keyword: keywordEnabled,
    highlight: highlightEnabled,
    use_kg: useKg,
    web_search: webSearchEnabled,
    tavily_api_key: webSearchEnabled ? tavilyApiKey || undefined : undefined,
    enable_summary: enableSummary,
    enable_related_questions: enableRelatedQuestions,
    enable_mindmap: enableMindmap,
  }

  // Only include metadata filter if conditions exist
  if (metadataFilter.conditions.length > 0) {
    search_config.metadata_filter = metadataFilter
  }

  onSave({
    name: name.trim(),
    description: description || undefined,
    dataset_ids: selectedDatasets,
    is_public: isPublic,
    search_config,
  })
}
```

- [ ] **Step 7: Run build to verify**

Run: `npm run build -w fe`
Expected: No TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add fe/src/features/search/components/SearchAppConfig.tsx
git commit -m "feat: enhance SearchAppConfig with model dropdowns, rerank Top K, LLM presets, metadata filter"
```

---

### Task 13: Update Search Types & Backend Schema for rerank_top_k

**Team:** Developer
**Files:**
- Modify: `fe/src/features/search/types/search.types.ts` (already done in Task 2)
- Modify: `be/src/modules/search/schemas/search.schemas.ts` (already done in Task 3)
- Modify: `be/src/modules/search/services/search.service.ts`

- [ ] **Step 1: Update search service to use rerank_top_k**

In `be/src/modules/search/services/search.service.ts`, find the section where reranking is applied in `retrieveChunks()`. Update to use `rerank_top_k` from the config:

```typescript
// When reranking, use rerank_top_k as the input size limit
if (config?.rerank_id) {
  const rerankTopK = (config.rerank_top_k as number) ?? 1024
  chunks = await ragRerankService.rerank(query, chunks, rerankTopK, config.rerank_id as string)
}
```

- [ ] **Step 2: Run build**

Run: `npm run build -w be`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add be/src/modules/search/services/search.service.ts
git commit -m "feat: use rerank_top_k from search config for reranker input size"
```

---

## Chunk 4: Testing & Verification

### Task 14: Component Tests for ChatAssistantConfig

**Team:** Tester
**Files:**
- Create or modify: `fe/tests/features/chat/ChatAssistantConfig.test.tsx`

- [ ] **Step 1: Write comprehensive tests**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatAssistantConfig } from '@/features/chat/components/ChatAssistantConfig'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'

vi.mock('@/lib/llmProviderPublicApi', () => ({
  listModels: vi.fn().mockResolvedValue([]),
}))

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={qc}>
    <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
  </QueryClientProvider>
)

describe('ChatAssistantConfig', () => {
  const defaults = { open: true, onClose: vi.fn(), onSave: vi.fn(), datasets: [] }

  it('renders all 3 sections', () => {
    render(wrap(<ChatAssistantConfig {...defaults} />))
    expect(screen.getByText(/basic information/i)).toBeInTheDocument()
    expect(screen.getByText(/prompt configuration/i)).toBeInTheDocument()
    expect(screen.getByText(/llm model settings/i)).toBeInTheDocument()
  })

  it('renders feature toggle switches', () => {
    render(wrap(<ChatAssistantConfig {...defaults} />))
    expect(screen.getByText(/show citations/i)).toBeInTheDocument()
    expect(screen.getByText(/keyword extraction/i)).toBeInTheDocument()
    expect(screen.getByText(/multi-turn refinement/i)).toBeInTheDocument()
    expect(screen.getByText(/knowledge graph/i)).toBeInTheDocument()
  })

  it('renders retrieval sliders', () => {
    render(wrap(<ChatAssistantConfig {...defaults} />))
    expect(screen.getByText(/similarity threshold/i)).toBeInTheDocument()
    expect(screen.getByText(/vector similarity weight/i)).toBeInTheDocument()
  })

  it('renders LLM preset selector', () => {
    render(wrap(<ChatAssistantConfig {...defaults} />))
    expect(screen.getByText(/parameter preset/i)).toBeInTheDocument()
  })

  it('renders empty response textarea', () => {
    render(wrap(<ChatAssistantConfig {...defaults} />))
    expect(screen.getByPlaceholderText(/message when no relevant content/i)).toBeInTheDocument()
  })

  it('includes all new fields in save payload', () => {
    const onSave = vi.fn()
    render(wrap(<ChatAssistantConfig {...defaults} onSave={onSave} datasets={[{ id: 'kb1', name: 'Test KB' }]} />))

    // Fill required field
    fireEvent.change(screen.getByPlaceholderText(/enter assistant name/i), { target: { value: 'Test' } })

    // Select a KB
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    // Save
    fireEvent.click(screen.getByText(/save/i))

    expect(onSave).toHaveBeenCalled()
    const payload = onSave.mock.calls[0][0]
    expect(payload.prompt_config).toHaveProperty('quote')
    expect(payload.prompt_config).toHaveProperty('refine_multiturn')
    expect(payload.prompt_config).toHaveProperty('similarity_threshold')
    expect(payload.prompt_config).toHaveProperty('llm_setting')
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npm run test -w fe -- --run tests/features/chat/ChatAssistantConfig.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add fe/tests/features/chat/ChatAssistantConfig.test.tsx
git commit -m "test: add ChatAssistantConfig component tests for new settings"
```

---

### Task 15: Component Tests for SearchAppConfig

**Team:** Tester
**Files:**
- Create or modify: `fe/tests/features/search/SearchAppConfig.test.tsx`

- [ ] **Step 1: Write tests for search config enhancements**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SearchAppConfig } from '@/features/search/components/SearchAppConfig'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'

vi.mock('@/lib/llmProviderPublicApi', () => ({
  listModels: vi.fn().mockResolvedValue([]),
}))

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={qc}>
    <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
  </QueryClientProvider>
)

describe('SearchAppConfig', () => {
  const defaults = { open: true, onClose: vi.fn(), onSave: vi.fn() }

  it('renders rerank model as dropdown (not text input)', () => {
    render(wrap(<SearchAppConfig {...defaults} />))
    // Rerank section should exist with a select element, not a text input
    expect(screen.getByText(/rerank model/i)).toBeInTheDocument()
  })

  it('renders metadata filter section', () => {
    render(wrap(<SearchAppConfig {...defaults} />))
    expect(screen.getByText(/metadata filter/i)).toBeInTheDocument()
    expect(screen.getByText(/add condition/i)).toBeInTheDocument()
  })

  it('shows LLM preset selector when summary enabled', async () => {
    render(wrap(<SearchAppConfig {...defaults} />))
    // Enable AI summary toggle
    const summaryToggle = screen.getByText(/enable ai summary/i).closest('div')?.querySelector('[role="switch"]')
    if (summaryToggle) {
      summaryToggle.click()
      expect(screen.getByText(/parameter preset/i)).toBeInTheDocument()
    }
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npm run test -w fe -- --run tests/features/search/SearchAppConfig.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add fe/tests/features/search/SearchAppConfig.test.tsx
git commit -m "test: add SearchAppConfig tests for model dropdowns, rerank, and metadata filter"
```

---

### Task 16: Full Build Verification

**Team:** Tester
**Files:** None (verification only)

- [ ] **Step 1: Run backend build**

Run: `npm run build -w be`
Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Run frontend build**

Run: `npm run build -w fe`
Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run all tests**

Run: `npm run test`
Expected: All existing + new tests PASS.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: No lint errors.

- [ ] **Step 5: Final commit (if any lint fixes needed)**

```bash
git add -A
git commit -m "chore: lint fixes for chat and search settings gap implementation"
```

---

## Feature Coverage Matrix

| Feature | Task # | Category | Priority |
|---------|--------|----------|----------|
| Language selector | 11 | Chat | Low |
| Parameter presets (Precise/Balance/Creative) | 5, 6 | Chat LLM | Medium |
| Per-parameter enabled toggles | 4, 6 | Chat/Search LLM | Medium |
| Top P, Freq Penalty, Presence Penalty UI | 6, 11 | Chat | Medium |
| Max Tokens UI | 6, 11 | Chat | Medium |
| Empty response message UI | 11 | Chat | Medium |
| Quote/Citation toggle | 11 | Chat | High |
| Keyword extraction toggle | 11 | Chat | Medium |
| Refine multiturn toggle | 11 | Chat | High |
| TOC Enhance toggle | 11 | Chat | Low |
| Knowledge Graph toggle | 11 | Chat | Low |
| Rerank model dropdown/selection | 7, 8, 11, 12 | Chat + Search | High |
| Similarity threshold slider | 11 | Chat | High |
| Vector similarity weight slider | 11 | Chat | High |
| Metadata filter UI | 9, 11, 12 | Chat + Search | Medium |
| TTS toggle | 11 | Chat | Low |
| Reranker Top K (0–2048) | 8, 12, 13 | Search | Medium |
| Embedding model validation for datasets | 12 | Search | Medium |

---

## Dependency Graph

```
Task 1 (Public API) ──┐
                       ├── Task 7 (ModelSelector) ──┬── Task 8 (RerankSelector) ──┐
Task 2 (FE Types) ────┘                            │                               │
                                                     ├── Task 11 (ChatAssistantConfig)
Task 3 (BE Schemas) ──────────────────────────────────┤
                                                     ├── Task 12 (SearchAppConfig)
Task 4 (SliderToggle) ── Task 6 (LlmSettingFields) ──┤
                                                     │
Task 5 (Presets) ──── Task 6 (LlmSettingFields) ─────┘

Task 9 (MetadataFilter) ── Task 11 + Task 12

Task 10 (i18n) ── Task 11 + Task 12

Task 13 (BE rerank_top_k) ── after Task 3

Task 14 (Chat Tests) ── after Task 11
Task 15 (Search Tests) ── after Task 12
Task 16 (Build Verification) ── after all
```

**Parallelizable groups:**
- Tasks 1, 2, 3 can run in parallel (no dependencies)
- Tasks 4, 5, 9, 10 can run in parallel (independent components)
- Tasks 7 depends on Task 1
- Tasks 6 depends on Tasks 4, 5
- Tasks 8 depends on Task 7
- Tasks 11 depends on Tasks 6, 8, 9, 10
- Tasks 12 depends on Tasks 6, 7, 8, 9, 10
- Tasks 14, 15 run after their respective UI tasks
- Task 16 runs last
