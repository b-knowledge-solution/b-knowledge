export function useThing(user: { role: string }) {
  const enabled = user?.role === 'leader'
  return { enabled }
}
