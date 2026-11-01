import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // app.js intentionally initializes its API-backed store with top-level await.
  // Preserve that syntax in the production bundle instead of transpiling it to ES2020.
  build: { target: 'esnext' }
});
