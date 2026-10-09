import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    main: {
      define: {
        'process.env.ABAPFY_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
        'process.env.ABAPFY_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || '')
      }
      // Keep the main process self-contained. External production dependencies rely
      // on pnpm's symlink layout, which electron-builder cannot reproduce reliably.
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
  }
})
