import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'حصر الكميات - Quantity Takeoff',
          short_name: 'حصر الكميات',
          description: 'حصر الكميات - Quantity Takeoff | مراجعة وحصر الكميات الهندسية من مخططات PDF وDXF',
          theme_color: '#0d1e31',
          background_color: '#0d1e31',
          display: 'standalone',
          lang: 'ar',
          dir: 'rtl',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // .mjs = the PDF.js worker; without it PDF reading would fail offline
          globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff,woff2,wasm}'],
          maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
