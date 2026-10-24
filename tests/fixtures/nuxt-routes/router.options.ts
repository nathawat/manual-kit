import type { RouterConfig } from '@nuxt/schema'

const make = () => ({ path: '/made', component: () => import('./made.vue') })

export default <RouterConfig>{
  routes: (_routes) => [
    ..._routes,
    { path: '/print/:id', component: () => import('./print.vue'), alias: '/p/:id', children: [{ path: 'preview', component: () => import('./preview.vue') }] },
    make(),
  ],
}
