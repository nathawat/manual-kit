import { Route, Routes } from 'react-router-dom'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route
          path="users"
          element={<Users />}
        >
          <Route path=":userId" element={<User />} />
          <Route path="/users/new" element={<NewUser />} />
        </Route>
        <Route element={<AuthOnly />}>
          <Route path="account" element={<Account />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
