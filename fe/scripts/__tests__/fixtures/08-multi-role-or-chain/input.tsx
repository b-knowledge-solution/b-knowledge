import { UserRole } from '@/constants/roles'

export function Foo({ user }: { user: { role: string } }) {
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.LEADER
  return <div>{String(isAdmin)}</div>
}
