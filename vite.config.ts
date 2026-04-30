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
      registerType: "autoUpdate",
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
        cacheId: "ktrenz-pwa",
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/report(?:\/|$)/, /^\/~oauth/, /^\/sitemap\.xml$/, /^\/robots\.txt$/],
        // Precache critical assets only. index.html is intentionally excluded
        // so navigation requests always hit network first (see runtimeCaching).
        // Route-lazy chunks (Admin*, B2B*, recharts, lang chunks 등)는
        // 별도로 runtime cache에서 처리.
        globPatterns: [
          "manifest.webmanifest",
          "registerSW.js",
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
              cacheName: "ktrenz-pwa-html",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/assets\/.*\.js$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "ktrenz-pwa-lazy-chunks",
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
