import { Route, Switch } from 'wouter'

export function App({ user }: { user: { role: string } }) {
  if (user.role === 'admin') console.info('admin tools on')
  return (
    <Switch>
      <Route path="/">
        <h1>Documents</h1>
      </Route>
      <Route path="/settings/roles">
        <h1>Roles</h1>
      </Route>
      <Route path="/settings/roles/create">
        <h1>New role</h1>
      </Route>
      <Route path="/settings/roles/:id/edit">
        <h1>Edit role</h1>
      </Route>
      <Route path="/users">
        <h1>Users</h1>
      </Route>
    </Switch>
  )
}
