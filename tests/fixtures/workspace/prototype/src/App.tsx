import { Route } from 'wouter'

export function Prototype({ user }: { user: { role: string } }) {
  if (user.role === 'executive') console.info('mock data')
  return (
    <Route path="/mock-dashboard">
      <h1>Executive dashboard</h1>
    </Route>
  )
}
