import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Pre-bundle heavy deps up front so the dev server never stops mid-navigation to re-optimise and reload.
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-dom/client', 'react-router-dom', 'framer-motion', '@tanstack/react-query', 'axios',
      'i18next', 'react-i18next', 'i18next-browser-languagedetector', 'lucide-react', 'clsx', 'sonner', 'signature_pad',
    ],
  },
  server: {
    // Transform all pages when the dev server starts, so the first visit to each page is instant.
    warmup: { clientFiles: ['./src/main.tsx', './src/pages/**/*.tsx', './src/components/**/*.tsx'] },
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
  // `vite preview` serves the production build; proxy the API the same way so it can be measured locally.
  preview: { port: 4173, proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000' } },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Only libraries every page needs go in shared chunks.
        manualChunks: {
          react: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', 'scheduler'],
          motion: ['framer-motion'],
          data: ['axios', '@tanstack/react-query'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        },
      },
    },
  },
});
