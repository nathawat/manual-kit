export default {
  router: {
    extendRoutes(routes, resolve) {
      routes.push({ name: 'custom', path: '/custom', component: resolve(__dirname, 'pages/index.vue') })
    },
  },
}
