/**
 * @fileoverview Sidebar shell regressions for the Phase 8 admin split.
 *
 * The direct `Sidebar.tsx` render harness currently stalls in this repo's UI
 * runner, so this suite locks the same contract via the real nav registry plus
 * source-order assertions against `Sidebar.tsx`.
 */
// @vitest-environment node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { UserRole } from '@/constants/roles'
import { USER_SIDEBAR_NAV } from '@/layouts/sidebarNav'
import { canAccessAdminShell } from '@/features/auth/components/AdminRoute'

const sidebarSource = readFileSync(resolve(__dirname, '../../src/layouts/Sidebar.tsx'), 'utf8')

describe('SidebarAdminShell', () => {
  it('keeps the user shell nav limited to Chat and Search', () => {
    expect(USER_SIDEBAR_NAV).toHaveLength(2)
    expect(USER_SIDEBAR_NAV.map((entry) => ('path' in entry ? entry.path : entry.labelKey))).toEqual([
      '/chat',
      '/search',
    ])
  })

  it.each([UserRole.LEADER, UserRole.ADMIN, UserRole.SUPER_ADMIN])(
    'allows admin-shell role %s to see the Administrator action',
    (role) => {
      expect(canAccessAdminShell(role)).toBe(true)
    },
  )

  it('denies a plain user role from the Administrator action', () => {
    expect(canAccessAdminShell(UserRole.USER)).toBe(false)
  })

  it('keeps Administrator before Logout in the dropdown source order', () => {
    const administratorIndex = sidebarSource.indexOf("t('nav.administrator')")
    const logoutIndex = sidebarSource.indexOf("t('nav.signOut')")

    expect(administratorIndex).toBeGreaterThan(-1)
    expect(logoutIndex).toBeGreaterThan(-1)
    expect(administratorIndex).toBeLessThan(logoutIndex)
  })
})
