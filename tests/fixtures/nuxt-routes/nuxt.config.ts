import { removePagesMatching } from './utils/pages'

const prefix = '/generated'

export default defineNuxtConfig({
  modules: [['@nuxtjs/i18n', { customRoutes: 'config', pages: { help: { th: '/ช่วยเหลือ', en: '/help', fr: false }, ghost: { en: '/ghost' } } }]],
  hooks: {
    'pages:extend'(pages) {
      pages.push({ name: 'extra', path: '/extra', file: '~/extra/page.vue' })
      pages.push({ path: `${prefix}/x`, file: '~/extra/x.vue' })
      pages.splice(pages.findIndex((p) => p.path === '/old'), 1)
      removePagesMatching(/\.ignore\.vue$/, pages)
    },
  },
})
