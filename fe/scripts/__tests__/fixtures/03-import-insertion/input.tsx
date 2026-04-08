import { UserRole } from '@/constants/roles'

export function DatasetCard({ user }: { user: { role: string } }) {
  const isAdmin = user?.role === UserRole.ADMIN
  return <div data-admin={isAdmin} />
}
