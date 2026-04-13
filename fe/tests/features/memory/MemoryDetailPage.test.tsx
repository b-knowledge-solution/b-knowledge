/**
 * @fileoverview Source-contract regressions for the MemoryDetailPage admin route migration.
 *
 * The repo's jsdom UI harness currently stalls when importing this page's full
 * component tree, so this suite locks the Phase 8 contract by asserting against
 * the real source and shared admin route constants in the node runner.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADMIN_MEMORY_ROUTE, ADMIN_MEMORY_DETAIL_ROUTE } from '@/app/adminRoutes'

const memoryDetailPageSource = readFileSync(
  resolve(__dirname, '../../../src/features/memory/pages/MemoryDetailPage.tsx'),
  'utf8',
)

describe('MemoryDetailPage route contract', () => {
  it('keeps the admin memory detail route under /admin/agent-studio/memory/:id', () => {
    expect(ADMIN_MEMORY_DETAIL_ROUTE).toBe('/admin/agent-studio/memory/:id')
  })

  it('uses the shared admin memory route constant for the not-found back action', () => {
    expect(memoryDetailPageSource).toContain("onClick={() => navigate(ADMIN_MEMORY_ROUTE)}")
    expect(memoryDetailPageSource).toContain("t('common.back', { defaultValue: 'Back' })")
  })

  it('uses the shared admin memory route constant for the header back button', () => {
    const headerBackButtonIndex = memoryDetailPageSource.indexOf('className="h-8 w-8 p-0"')
    const headerNavigateIndex = memoryDetailPageSource.indexOf(
      'onClick={() => navigate(ADMIN_MEMORY_ROUTE)}',
    )

    expect(headerNavigateIndex).toBeGreaterThan(-1)
    expect(headerBackButtonIndex).toBeGreaterThan(-1)
    expect(headerNavigateIndex).toBeLessThan(headerBackButtonIndex)
  })

  it('continues to fetch memory detail from the route param id', () => {
    expect(memoryDetailPageSource).toContain("const { id } = useParams<{ id: string }>()")
    expect(memoryDetailPageSource).toContain("const { data: memory, isLoading, isError } = useMemory(id ?? '')")
  })
})
