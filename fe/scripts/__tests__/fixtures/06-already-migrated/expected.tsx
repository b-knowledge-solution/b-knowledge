import { useHasPermission } from '@/lib/permissions'
import { PERMISSION_KEYS } from '@/constants/permission-keys'

export function DocumentTable() {
  const isAdmin = useHasPermission(PERMISSION_KEYS.DATASETS_VIEW)
  return <Toolbar canEdit={isAdmin} />
}
