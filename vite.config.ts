import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      // Keep the generated SW in the normal "waiting" phase until the app's
      // update prompt calls updateServiceWorker(true). With `autoUpdate`,
      // vite-plugin-pwa overrides workbox.skipWaiting/clientsClaim to true,
      // which can make iOS Safari swap service workers while the page is still
      // loading and leave it with mismatched HTML/chunk caches.
      registerType: "prompt",
      includeAssets: ["favicon.ico", "robots.txt"],
      manifest: {
        id: "/ktrenz-pwa",
        name: "KTrenZ - Live K-Pop Trend Rankings",
        short_name: "KTrenZ",
        description: "Real-time K-Pop trend rankings powered by YouTube, X, and music data",
        theme_color: "#0d1017",
        background_color: "#0d1017",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // skipWaiting=false → wait for the in-page prompt (PWAUpdatePrompt)
        // before activating the new SW. This prevents mid-session reloads.
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
        // Disable auto-bound NavigationRoute that vite-plugin-pwa injects by
        // default. That route registers FIRST and forces every navigation to
        // serve precached index.html — which dead-codes our NetworkFirst
        // navigate handler and produced blank screens for users whose stale
        // SW pointed at evicted chunks. Setting navigateFallback to null lets
        // the runtimeCaching `request.mode === "navigate"` NetworkFirst
        // actually run.
        navigateFallback: null,
        // Bumped to v2 to evict stale runtime caches from builds that did not
        // have Supabase/CDN image runtime caching wired up. Old cached entries
        // (incl. failed/opaque responses for cross-origin images) were causing
        // images to silently 404 on mobile Chrome. Bumping the id forces a
        // clean cache namespace on next SW activation.
        // v3 (2026-05-10) — force SW cache invalidation after the H1 vaul→Sheet
        // refactor. Mobile users on the old SW were seeing "오류가 발생했습니다"
        // because the broken vaul drawer chunk was still being served from
        // cache even though the deployed build had moved to Sheet.
        // v4 (2026-05-10) — force-evict stale SW state for users on v3. v3
        // shipped with the auto-bound NavigationRoute serving precached
        // index.html that referenced evicted chunks → blank screen on new
        // tabs. v4 disables navigateFallback (see above) and rotates the
        // cache namespace so existing v3 SWs can't keep serving the broken
        // setup.
        // v5 (2026-05-18) — iOS Safari deploy hardening. `registerType:
        // autoUpdate` was silently re-enabling skipWaiting/clientsClaim, and
        // the 3s navigation timeout could serve stale cached HTML on slow
        // mobile networks. Rotate caches and let navigations prefer network
        // unless the request actually fails.
        cacheId: "ktrenz-pwa-v5",
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // navigateFallback omitted from explicit config, but vite-plugin-pwa
        // still auto-binds /index.html for navigation handling. We must
        // include it in globPatterns or SW init throws `non-precached-url`.
        // The runtimeCaching NetworkFirst handler below still fires first
        // for navigation requests, so the precached index.html is just an
        // offline fallback — no stale-route problem.
        // Precache critical assets. index.html MUST be included because
        // vite-plugin-pwa auto-binds a navigation route to it; excluding it
        // throws `non-precached-url` at SW init. NetworkFirst handler in
        // runtimeCaching still fires first on navigations so this is just
        // an offline fallback.
        globPatterns: [
          "index.html",
          "manifest.webmanifest",
          "robots.txt",
          "pwa-*.png",
          "favicon.*",
          "assets/index-*.{js,css}",
          "assets/vendor-*.js",
          "assets/web-*.js",
          "assets/*.{webp,jpg,jpeg,png,svg,woff,woff2}",
        ],
        runtimeCaching: [
          {
            // Navigation requests (top-level URLs, refreshes) — network first
            // so newly added routes work without a stale-SW reload.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "ktrenz-pwa-html-v5",
              expiration: { maxEntries: 10, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/assets\/.*\.js$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "ktrenz-pwa-lazy-chunks-v5",
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            // Supabase Storage images (article thumbnails, star photos) —
            // long-lived assets keyed by hash, safe to cache aggressively.
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/.*$/,
            handler: "CacheFirst",
            options: {
              cacheName: "ktrenz-pwa-supabase-images",
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // YouTube/CDN thumbnails referenced by content cards.
            urlPattern: /^https:\/\/(i\.ytimg\.com|img\.youtube\.com|p16-sign-va\.tiktokcdn\.com)\/.*$/,
            handler: "CacheFirst",
            options: {
              cacheName: "ktrenz-pwa-cdn-images",
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Instagram CDN images — IG signed-URL images get reused across
            // session reopens within a few hours. URLs change after expiry,
            // so cache key by full URL with a short max-age. Big payoff for
            // sponsored carousel posts where the high-res image is 1-2MB.
            urlPattern: /^https:\/\/(scontent[a-z0-9-]*\.cdninstagram\.com|.*\.fbcdn\.net)\/.*$/,
            handler: "CacheFirst",
            options: {
              cacheName: "ktrenz-pwa-ig-images",
              expiration: { maxEntries: 150, maxAgeSeconds: 6 * 60 * 60 }, // 6h — within IG URL lifetime
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|react-helmet-async|scheduler)[\\/]/.test(id)) {
            return "vendor-react";
          }
          if (/[\\/]node_modules[\\/]@radix-ui[\\/]/.test(id)) {
            return "vendor-radix";
          }
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) {
            return "vendor-supabase";
          }
          if (/[\\/]node_modules[\\/](date-fns|lodash|lodash-es|zod)[\\/]/.test(id)) {
            return "vendor-utils";
          }
        },
      },
    },
  },
}));
