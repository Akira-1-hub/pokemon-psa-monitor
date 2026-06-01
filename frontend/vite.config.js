import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages はサブパス /pokemon-psa-monitor/ で公開される。
// 本番ビルド時のみ base を設定し、ローカル開発(dev)では '/' のまま。
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/pokemon-psa-monitor/' : '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
}))
