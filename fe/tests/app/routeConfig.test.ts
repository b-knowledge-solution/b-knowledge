import { describe, expect, it } from 'vitest'

import {
  ADMIN_AGENT_CANVAS_ROUTE,
  ADMIN_CODE_GRAPH_ROUTE,
  ADMIN_KNOWLEDGE_BASE_ROUTE,
  buildAdminAgentCanvasPath,
  buildAdminCodeGraphPath,
} from '@/app/adminRoutes'
import { getRouteMetadata, ROUTE_CONFIG } from '@/app/routeConfig'

describe('getRouteMetadata', () => {
  it('resolves admin knowledge-base detail routes to the knowledge-base metadata', () => {
    expect(getRouteMetadata('/admin/data-studio/knowledge-base/abc')).toEqual(
      ROUTE_CONFIG[ADMIN_KNOWLEDGE_BASE_ROUTE],
    )
  })

  it('resolves hidden admin code-graph routes instead of falling through', () => {
    expect(getRouteMetadata(buildAdminCodeGraphPath('kb-123'))).toEqual(
      ROUTE_CONFIG[ADMIN_CODE_GRAPH_ROUTE],
    )
  })

  it('resolves admin agent canvas new routes with dynamic route metadata', () => {
    expect(getRouteMetadata(buildAdminAgentCanvasPath('new'))).toEqual(
      ROUTE_CONFIG[ADMIN_AGENT_CANVAS_ROUTE],
    )
  })
})
