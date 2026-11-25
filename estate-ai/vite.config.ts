import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { swManifest } from './scripts/sw-manifest-plugin.ts';

// `--mode https` serves over a self-signed certificate so an iPhone on the same
// Wi-Fi can use the camera and install the app (Safari needs HTTPS for both).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), swManifest(), ...(mode === 'https' ? [basicSsl()] : [])],
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
  test: { environment: 'node', include: ['tests/unit/**/*.test.ts'], setupFiles: ['tests/unit/setup.ts'] },
}));
