import { Route, Switch } from 'wouter'
import { Shell } from './Shell'
import { paths } from './paths'

export function App() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route
        path="/documents/:documentId/printing"
        component={PrintPage}
      />
      <Route>
        <Shell>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/inbox" component={InboxPage} />
            <Route path={"/inbox/:id"} component={InboxDetailPage} />
            <Route path={paths.reports} component={ReportsPage} />
            <Route path="/settings" nest>
              <Route path="/users" component={UsersPage} />
              <Route path="roles/:id" component={RolePage} />
            </Route>
            <Route path="/inbox" component={InboxPage} />
          </Switch>
        </Shell>
      </Route>
      <Route component={NotFoundPage} />
    </Switch>
  )
}
