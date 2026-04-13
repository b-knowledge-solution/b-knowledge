import { UserRole } from '@/constants/roles'

export function Foo({ user }: { user: { role: string } }) {
  // TODO(perm-codemod): multi-role chain — manual migration required (split into useHasPermission calls per capability)
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.LEADER
  return <div>{String(isAdmin)}</div>
}
