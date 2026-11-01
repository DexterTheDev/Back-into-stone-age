import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5180,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: ['game.perspectivepharos.online'],
    fs: { allow: ['../..'] },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: ['game.perspectivepharos.online'],
  },
  worker: { format: 'es' },
  build: { target: 'esnext', chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
}); 