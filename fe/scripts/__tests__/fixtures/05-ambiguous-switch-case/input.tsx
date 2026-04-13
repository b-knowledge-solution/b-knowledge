export function Foo({ user }: { user: { role: string } }) {
  switch (user?.role) {
    case 'admin':
      return <div>a</div>
    default:
      return null
  }
}
