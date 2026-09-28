import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
export default defineConfig({
  root: 'web',
  plugins: [preact()],
  build: { outDir: '../dist', emptyOutDir: true },
  // `npx vite` serves web/ with hot reload and forwards the API to a running `npm start`.
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4747' } },
})
