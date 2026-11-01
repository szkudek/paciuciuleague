const CACHE_PREFIX = "pstragi-cache-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const CORE_FILES = ["./", "./index.html", "./style.css", "./app.js", "./config.js", "./manifest.json", "./header-bg.jpg", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_FILES.map(url => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Aktualizujemy tylko pliki aplikacji. Baza danych i zewnętrzne usługi
// zachowują własne zasady komunikacji i nie trafiają do tego cache.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith((async () => {
    try {
      // Rewalidacja HTTP zapobiega zwracaniu starego kodu przez cache przeglądarki.
      const response = await fetch(event.request, { cache: "no-cache" });
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {}));
      }
      return response;
    } catch (error) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        const page = await cache.match(new URL("index.html", self.registration.scope).href);
        if (page) return page;
      }
      return Response.error();
    }
  })());
});
