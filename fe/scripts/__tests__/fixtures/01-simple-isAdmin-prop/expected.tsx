import { UserRole } from '@/constants/roles'
import { useAuth } from '@/hooks/useAuth'
import { useHasPermission } from '@/lib/permissions'
import { PERMISSION_KEYS } from '@/constants/permission-keys'

export function DocumentTable() {
  const { user } = useAuth()
  const isAdmin = useHasPermission(PERMISSION_KEYS.DATASETS_VIEW)
  return <Toolbar />
}
