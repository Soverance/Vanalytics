import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

const commonLocal = path.resolve(__dirname, '../../lib/Common/src/Soverance.Web')
const commonDocker = path.resolve(__dirname, 'common-web')
const commonPath = fs.existsSync(commonLocal) ? commonLocal : commonDocker

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@common': commonPath,
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
      '/item-images': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
