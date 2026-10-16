import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nativeModelsPlugin } from './scripts/native-models/plugin';
import { persistentWorldPlugin } from './scripts/world/plugin';

export default defineConfig({
  base: './',
  plugins: [react(), nativeModelsPlugin(), persistentWorldPlugin()],
  build: { target: 'es2022' },
  worker: { format: 'es' },
  server: { host: '0.0.0.0', allowedHosts: ['.nat100.top'] },
});
