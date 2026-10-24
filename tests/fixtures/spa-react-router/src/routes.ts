import type { RouteObject } from 'react-router-dom'
import { useRoutes } from 'react-router-dom'

export const helpRoutes: RouteObject[] = [{ path: '/help', children: [{ path: 'faq' }] }]

const settings = [{ path: '/settings/profile' }]
export const SettingsRoutes = () => useRoutes(settings)

export const menu = [{ path: '/not-a-route-definition', label: 'Menu item' }]
