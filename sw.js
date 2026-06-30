// Beachwave service worker.
//
// Goals: make the app installable and resilient offline, WITHOUT ever
// interfering with authentication or media. Therefore it:
//   * only touches same-origin GET requests;
//   * never caches /api/* (token, grant-speak, client-metadata) — always network;
//   * never caches OAuth callbacks (requests carrying ?code/?state) — always network;
//   * serves navigations network-first (fresh app after every deploy), falling
//     back to the cached shell only when offline;
//   * serves other same-origin assets stale-while-revalidate.
//
// Bump CACHE_VERSION to invalidate old caches on the next activation.

const CACHE_VERSION = 'beachwave-v1';
const SHELL = ['/', '/index.html', '/src/client/styles.css', '/beachwave.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (esm.sh, bsky, livekit, fonts) pass through
  if (url.pathname.startsWith('/api/')) return; // never cache server functions
  if (url.search.includes('code=') || url.search.includes('state=')) return; // never cache OAuth callbacks

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(request, response.clone());
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          cachePut(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

function cachePut(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return;
  caches.open(CACHE_VERSION).then((cache) => cache.put(request, response));
}
