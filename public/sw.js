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

    try {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.all(clients.map((client) => {
        const url = new URL(client.url);
        if (url.origin !== self.location.origin) return undefined;
        if (url.searchParams.get("__sw_reset") === "1") return undefined;
        url.searchParams.set("__sw_reset", "1");
        return client.navigate(url.href);
      }));
    } catch {
      // Navigation is best-effort. The next manual reload will be uncontrolled.
    }
  })());
});
