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
    'process.env.VUE_APP_LOG_GROUP_NAME': JSON.stringify(process.env.VUE_APP_LOG_GROUP_NAME),
    'process.env.VUE_APP_LOG_STREAM_NAME': JSON.stringify(process.env.VUE_APP_LOG_STREAM_NAME),
    'process.env.VUE_APP_ACTIVITY_STREAM_NAME': JSON.stringify(process.env.VUE_APP_ACTIVITY_STREAM_NAME),
    'process.env.VUE_APP_ENABLE_CLOUDWATCH': JSON.stringify(process.env.VUE_APP_ENABLE_CLOUDWATCH),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV)
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'aws-sdk': ['aws-sdk']
        }
      }
    }
  }
})