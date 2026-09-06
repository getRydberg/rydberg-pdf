import { defineConfig } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Vite 6 blocks requests with unrecognized Host headers by default.
    // Traffic arrives via the Cloudflare Tunnel (Host: pdf.rydberg.app, or
    // whatever PDF_HOST is set to) and from other containers on
    // rydberg-net (Host: rydberg-frontend-pdf).
    allowedHosts: [
      process.env.PDF_HOST || 'pdf.rydberg.app',
      'rydberg-frontend-pdf',
    ],
  },
})
