import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  root: 'web',
  plugins: [preact()],
  define: { __VIEWER_VERSION__: JSON.stringify(version) },
  build: { outDir: '../dist', emptyOutDir: true },
  // `npx vite` serves web/ with hot reload and forwards the API to a running `npm start`.
  server: { port: 5174, proxy: { '/api': 'http://127.0.0.1:5182' } },
})
