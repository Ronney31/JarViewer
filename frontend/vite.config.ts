import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@components': resolve(__dirname, './src/components'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@services': resolve(__dirname, './src/services'),
      '@stores': resolve(__dirname, './src/stores'),
      '@types': resolve(__dirname, './src/types'),
      '@utils': resolve(__dirname, './src/utils'),
      '@assets': resolve(__dirname, './src/assets'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        secure: false,
        timeout: 120000, // 2 minutes for large file uploads
        headers: {
          'Connection': 'keep-alive',
        },
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('❌ Proxy error:', err.message)
            console.log('Request URL:', req.url)
          })
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('📤 Proxying request:', req.method, req.url)
            // Ensure proper headers for file uploads
            if (req.url?.includes('/upload')) {
              console.log('🔧 File upload request detected')
              proxyReq.setHeader('Host', 'backend:8000')
            }
          })
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('📥 Proxy response:', proxyRes.statusCode, req.url)
            if (proxyRes.statusCode >= 400) {
              console.log('❌ Proxy error response:', proxyRes.statusCode, proxyRes.statusMessage)
            }
          })
        },
      },
      '/health': {
        target: 'http://backend:8000',
        changeOrigin: true,
        secure: false,
        timeout: 30000,
      },
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          query: ['@tanstack/react-query'],
          ui: ['@headlessui/react', 'lucide-react', 'framer-motion'],
          editor: ['@monaco-editor/react', 'shiki'],
          tree: ['react-arborist', 'react-window'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
})
