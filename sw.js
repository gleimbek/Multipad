// Service worker: guarda la app en caché para que abra sin conexión.
// Cambia VERSION cada vez que publiques cambios; así cada dispositivo descarga la versión nueva.
const VERSION = 'multipad-v1.1.0';

const ASSETS = [
  './',
  './index.html',
  './preview.html',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/langs.js',
  './js/i18n.js',
  './js/util.js',
  './js/runner.js',
  './js/py-worker.js',
  './vendor/markdown.js',
  './vendor/codemirror.js',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    // index.html se pide con ?w=... ; se ignora la consulta para encontrarlo en caché.
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return cache.match('./index.html');
      throw err;
    }
  })());
});
