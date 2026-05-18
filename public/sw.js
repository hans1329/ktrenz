self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    } catch {
      // Cache deletion is best-effort; unregistering the SW is the important bit.
    }

    try {
      await self.registration.unregister();
    } catch {
      // Ignore; the next navigation will retry the update check.
    }

    try {
      await self.clients.claim();
    } catch {
      // Older WebKit builds may reject claim after unregister.
    }
  })());
});
