import { UserRole } from '@/constants/roles'
import { useAuth } from '@/hooks/useAuth'

export function DocumentTable() {
  const { user } = useAuth()
  const isAdmin = user?.role === UserRole.ADMIN
  return <Toolbar isAdmin={isAdmin} />
}
