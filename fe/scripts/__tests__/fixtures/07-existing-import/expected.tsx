import { PERMISSION_KEYS } from '@/constants/permission-keys'
import { UserRole } from '@/constants/roles'
import { useHasPermission } from '@/lib/permissions'

export function ConnectorListPanel({ user }: { user: { role: string } }) {
  const isAdmin = useHasPermission(PERMISSION_KEYS.DATASETS_VIEW)
  return <div>{String(isAdmin)} {PERMISSION_KEYS.DATASETS_VIEW}</div>
}
