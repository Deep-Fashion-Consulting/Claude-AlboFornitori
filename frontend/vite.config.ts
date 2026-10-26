import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Le variabili VITE_* vengono lette dal .env nella radice del progetto
  envDir: '..',
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/docs': 'http://localhost:3000' },
  },
});
