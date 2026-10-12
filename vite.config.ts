import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022' },
  worker: { format: 'es' },
  server: { host: '0.0.0.0', allowedHosts: ['.nat100.top'] },
});
