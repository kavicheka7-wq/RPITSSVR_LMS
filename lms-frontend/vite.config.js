// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router-dom/') ||
              id.includes('/react-router/')
            ) {
              return 'react-vendor';
            }
            if (id.includes('@heroicons/react')) {
              return 'icons-vendor';
            }
            if (id.includes('xlsx-js-style')) {
              return 'excel-vendor';
            }
            if (id.includes('recharts')) {
              return 'charts-vendor';
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});