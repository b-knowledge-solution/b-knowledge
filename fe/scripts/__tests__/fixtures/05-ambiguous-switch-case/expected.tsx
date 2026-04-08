export function Foo({ user }: { user: { role: string } }) {
  // TODO(perm-codemod): review — replace with useHasPermission
  switch (user?.role) {
    case 'admin':
      return <div>a</div>
    default:
      return null
  }
}
