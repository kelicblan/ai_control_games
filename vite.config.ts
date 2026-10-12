import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022' },
  server: {
    host: '0.0.0.0',
    // 允许 nat100.top 的内网穿透子域名访问（如 aigames.nat100.top）
    allowedHosts: ['.nat100.top'],
  },
});
