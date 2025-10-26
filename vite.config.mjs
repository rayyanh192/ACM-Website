import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vuetify({autoImport: true})
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  define: {
    // Ensure environment variables are available at build time
    'process.env.VUE_APP_AWS_REGION': JSON.stringify(process.env.VUE_APP_AWS_REGION),
    'process.env.VUE_APP_AWS_ACCESS_KEY_ID': JSON.stringify(process.env.VUE_APP_AWS_ACCESS_KEY_ID),
    'process.env.VUE_APP_AWS_SECRET_ACCESS_KEY': JSON.stringify(process.env.VUE_APP_AWS_SECRET_ACCESS_KEY),
    'process.env.VUE_APP_LOG_GROUP_NAME': JSON.stringify(process.env.VUE_APP_LOG_GROUP_NAME),
    'process.env.VUE_APP_LOG_STREAM_NAME': JSON.stringify(process.env.VUE_APP_LOG_STREAM_NAME),
    'process.env.VUE_APP_ACTIVITY_STREAM_NAME': JSON.stringify(process.env.VUE_APP_ACTIVITY_STREAM_NAME),
  },
  build: {
    // Ensure proper handling of environment variables in production
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'vuetify'],
          aws: ['aws-sdk']
        }
      }
    }
  }
})