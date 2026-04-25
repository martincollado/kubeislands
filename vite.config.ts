import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 3000,
    strictPort: true,
    // Prevent Dropbox atomic-rename churn from triggering recursive rebuilds
    watch: {
      ignored: ['**/node_modules/**', '**/dist/**', '**/.DS_Store', '**/.dropbox*'],
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/three/') || id.includes('/three@'))        return 'three'
          if (id.includes('@react-three/'))                            return 'r3f'
          if (id.includes('postprocessing'))                           return 'post'
          if (id.includes('@tanstack/'))                               return 'tanstack'
        },
      },
    },
  },
  // Pre-bundle heavy ESM packages so dev cold-start stays fast
  optimizeDeps: {
    include: [
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      '@react-three/postprocessing',
      'postprocessing',
      'zustand',
      '@tanstack/react-router',
    ],
  },
})
