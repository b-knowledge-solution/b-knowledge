import { UserRole } from '@/constants/roles'
import { useHasPermission } from '@/lib/permissions'
import { PERMISSION_KEYS } from '@/constants/permission-keys'

export function DatasetCard({ user }: { user: { role: string } }) {
  const isAdmin = useHasPermission(PERMISSION_KEYS.DATASETS_VIEW)
  return <div data-admin={isAdmin} />
}
