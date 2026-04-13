import { UserRole } from '@/constants/roles'

export function Foo({ user }: { user: { role: string } }) {
  if (user?.role === UserRole.ADMIN) {
    return <div>admin</div>
  }
  return null
}
