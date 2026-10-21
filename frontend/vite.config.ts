import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (outgoing, incoming) => {
            // Translate only the two trusted dev origins. Other Origins remain rejected.
            const origin = incoming.headers.origin
            if (origin === 'http://127.0.0.1:5173' || origin === 'http://localhost:5173') {
              outgoing.setHeader('Origin', 'http://127.0.0.1:8080')
            }
          })
        },
      },
    },
  },
  preview: { port: 4173, strictPort: true },
})
