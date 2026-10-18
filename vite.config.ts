import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Build stamp so the running app can tell whether it is on the newest code.
const BUILD_ID = new Date().toISOString()

export default defineConfig({
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    VitePWA({
      // 'prompt' so a new version waits until the start screen instead of reloading mid-game.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['sprites/**/*', 'misc/**/*', 'sounds/**/*', 'models/**/*'],
      manifest: {
        name: 'Rainbow Blast',
        short_name: 'Rainbow Blast',
        description: 'Blokjes puzzelen met Katrien en bouwen aan haar eiland',
        lang: 'nl',
        start_url: './index.html',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#cdb9ef',
        theme_color: '#cdb9ef',
        icons: [
          { src: 'misc/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'misc/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'misc/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: false,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,webp,png,svg,json,mp3,glb,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any)
