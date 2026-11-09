import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiTarget = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000'
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      strictPort: true,
      proxy: {
        // Keep proxy connections alive longer than the UI's 10-minute upload deadline.
        '/api': { target: apiTarget, changeOrigin: true, timeout: 660_000, proxyTimeout: 660_000 },
        '/openapi.json': { target: apiTarget, changeOrigin: true },
      },
    },
  }
})
