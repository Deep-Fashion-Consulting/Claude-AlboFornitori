import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Il frontend non usa variabili d'ambiente: non legge il .env del backend,
  // che contiene NODE_ENV=development e trasformerebbe la build di produzione in una di sviluppo.
  envDir: 'nessun-env',
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/docs': 'http://localhost:3000' },
  },
});
