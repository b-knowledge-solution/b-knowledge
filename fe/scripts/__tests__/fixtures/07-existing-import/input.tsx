import { PERMISSION_KEYS } from '@/constants/permission-keys'
import { UserRole } from '@/constants/roles'

export function ConnectorListPanel({ user }: { user: { role: string } }) {
  const isAdmin = user?.role === UserRole.ADMIN
  return <div>{String(isAdmin)} {PERMISSION_KEYS.DATASETS_VIEW}</div>
}
