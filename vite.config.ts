import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    define: {
      'import.meta.env.LAUNCHDARKLY_CLIENT_KEY': JSON.stringify(env.LAUNCHDARKLY_CLIENT_KEY)
    },
    server: {
      proxy: {
        '/api': {
          target: `http://localhost:${env.SERVER_PORT || '3001'}`,
          changeOrigin: true,
        },
      },
    },
  }
})
