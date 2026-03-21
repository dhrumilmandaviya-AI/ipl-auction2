import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages: set VITE_BASE_PATH to your repo name e.g. /ipl-auction/
  // Custom domain or root repo: leave unset (defaults to /)
  base: process.env.VITE_BASE_PATH || '/',
})
