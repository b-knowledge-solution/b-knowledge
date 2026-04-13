export function useThing(user: { role: string }) {
  // TODO(perm-codemod): review — replace with useHasPermission
  const enabled = user?.role === 'leader'
  return { enabled }
}
