// Self-destructing service worker.
//
// The RoboMop operator console used to be served at the site root and registered
// a service worker at this URL (/RoboMop/sw.js, scope /RoboMop/). The console now
// lives under /app/, and the root now serves the marketing landing page. Browsers
// that visited the old app still have that stale root worker installed, and it
// keeps serving the cached app shell instead of the landing page.
//
// A plain 404 at this URL does NOT remove an already-installed worker, so we ship
// this kill-switch: on its next background update check the browser fetches this
// script, installs it, and it unregisters itself, drops the old caches, and
// reloads open tabs back to the (now landing) root. The /app/ console keeps its
// own worker (scope /RoboMop/app/), which this leaves untouched.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys.map((key) => {
            // Workbox bakes the scope into its cache names. Preserve anything
            // belonging to the /app/ console; only clear the old root caches.
            if (key.includes("/app/")) return Promise.resolve(false);
            return caches.delete(key);
          })
        );
      } catch (err) {
        // Best effort — clearing caches must not block unregistration.
      }

      await self.registration.unregister();

      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        try {
          client.navigate(client.url);
        } catch (err) {
          // Ignore clients we cannot navigate (e.g. cross-origin).
        }
      }
    })()
  );
});
