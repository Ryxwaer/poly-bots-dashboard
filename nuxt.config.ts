export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  modules: ['@nuxtjs/tailwindcss'],

  tailwindcss: {
    cssPath: '~/assets/css/main.css',
  },

  runtimeConfig: {
    mongoUri: process.env.MONGO_URI || '',
    mongoCollection: process.env.MONGO_COLLECTION || 'gabagool_events',
  },

  devtools: { enabled: false },
})
