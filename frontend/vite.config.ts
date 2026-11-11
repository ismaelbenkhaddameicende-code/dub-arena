import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'DUB ARENA · Doblaje colaborativo',
        short_name: 'DUB ARENA',
        description: 'Crea salas, dobla la misma escena con tus amigos y exporta el video final.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#08080c',
        theme_color: '#08080c',
        categories: ['entertainment', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-180.png', sizes: '180x180', type: 'image/png' },
        ],
        shortcuts: [
          { name: 'Nueva sala', short_name: 'Nueva sala', url: '/?nueva=1' },
          { name: 'Mis salas', short_name: 'Salas', url: '/salas' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        runtimeCaching: [
          // El video y las grabaciones NUNCA se cachean: son grandes y privados.
          { urlPattern: /\/api\//, handler: 'NetworkOnly' },
        ],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
