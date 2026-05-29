import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3010,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});
