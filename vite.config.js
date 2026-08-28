import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/physics-lab/',

  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/build/three.module.js') || id.includes('node_modules/three/src')) {
            return 'three-core'
          }
          if (id.includes('node_modules/@react-three')) {
            return 'three-r3f'
          }
          if (id.includes('node_modules/three/')) {
            return 'three'
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/scheduler') || id.includes('node_modules/zustand') || id.includes('node_modules/framer-motion')) {
            return 'vendor'
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3') || id.includes('node_modules/victory')) {
            return 'charts'
          }
        }
      }
    }
  }
})
