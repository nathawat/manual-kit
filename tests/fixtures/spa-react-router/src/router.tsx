import { createBrowserRouter } from 'react-router-dom'

export const router = createBrowserRouter([
  {
    path: '/admin',
    element: <Admin />,
    children: [
      { index: true, element: <AdminHome /> },
      {
        path: 'audit/:entryId',
        element: <Audit />,
      },
      { path: 'reports', children: [{ path: 'monthly', element: <Monthly /> }] },
    ],
  },
])
