import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 8530, strictPort: true },
  preview: { port: 8531, strictPort: true },
  build: {
    target: 'es2022', chunkSizeWarningLimit: 900, assetsDir: 'build',
    rollupOptions: { input: { main: 'index.html', teacher: 'teacher.html' } },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
