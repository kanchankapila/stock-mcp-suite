import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  server: {
    host: 'localhost',
    port: 4200,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});

