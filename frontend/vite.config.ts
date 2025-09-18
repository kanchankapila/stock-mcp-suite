import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  server: {
    host: 'localhost',
    port: 4200,
    proxy: {
      // Forward API calls to the backend server
      '/api': {
        target: 'http://localhost:4010',
        changeOrigin: true,
      },
      // Proxy WebSocket to backend
      '/ws': {
        target: 'ws://localhost:4010',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
