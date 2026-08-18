import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    // Geolocation requires a secure context. Vite's built-in HTTPS uses a
    // self-signed cert — the browser will show a cert warning once, after
    // which real device GPS (not IP-based) becomes available.
    // Run: npx vite --https   OR set HTTPS=true in your .env
    // Without HTTPS, browser geolocation falls back to IP positioning (~1-20 km accuracy).
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1000, // 1MB — leaflet + recharts are legitimately large
    rollupOptions: {
      output: {
        manualChunks: {
          // Split large vendors into separate cached chunks
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts':  ['recharts'],
          'vendor-map':     ['leaflet', 'react-leaflet'],
          'vendor-ui':      ['lucide-react', '@tanstack/react-query'],
          'vendor-socket':  ['socket.io-client'],
        },
      },
    },
  },
});
