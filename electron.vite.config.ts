import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { config } from 'dotenv'

config()  // load .env into process.env at build/dev time

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      'process.env.DEEPGRAM_API_KEY': JSON.stringify(process.env.DEEPGRAM_API_KEY ?? ''),
    },
    build: {
      rollupOptions: {
        external: ['better-sqlite3-multiple-ciphers', 'sqlite-vec']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
