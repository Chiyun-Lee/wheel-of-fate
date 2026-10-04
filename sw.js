// Network-first: when online, every launch gets the latest deploy (and the
// cache is refreshed); when offline, the cached copy is served.
// No version bumping needed — new deploys are picked up automatically.
const CACHE = 'wheel-of-fate';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './wheel.js',
  './db.js',
  './pattern.svg',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // always straight to the network

  event.respondWith(
    // 'no-cache' revalidates with the server (cheap 304s) instead of trusting
    // GitHub Pages' 10-minute HTTP cache.
    fetch(request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put(request, copy)));
        }
        return res;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((r) => r ?? caches.match('./')))
  );
});
