// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Everything starting with /api/jaspar will be proxied
      '/api/jaspar': {
        target: 'https://jaspar.elixir.no',
        changeOrigin: true,
        secure: true,
        /**
         * Incoming:  /api/jaspar/api/v1/matrix/?search=SOX&format=json
         * Outgoing:  /api/v1/matrix/?search=SOX&format=json
         */
        rewrite: (path) => path.replace(/^\/api\/jaspar/, ''),
      },
    },
  },
});
