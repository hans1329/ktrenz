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
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        cacheId: "ktrenz-pwa",
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/report(?:\/|$)/, /^\/~oauth/, /^\/sitemap\.xml$/, /^\/robots\.txt$/],
        // Precache only the main entry + critical assets. Route-lazy chunks
        // (Admin*, B2B*, FanAgent, recharts, etc.) are fetched on-demand and
        // handled by workbox runtime caching instead.
        globPatterns: [
          "index.html",
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
            urlPattern: /\/assets\/.*\.js$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "ktrenz-pwa-lazy-chunks",
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
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
