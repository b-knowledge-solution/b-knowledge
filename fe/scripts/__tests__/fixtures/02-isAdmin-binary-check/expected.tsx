import { UserRole } from '@/constants/roles'

export function Foo({ user }: { user: { role: string } }) {
  // TODO(perm-codemod): review — replace with useHasPermission
  if (user?.role === UserRole.ADMIN) {
    return <div>admin</div>
  }
  return null
}
