// Service worker del Cuaderno docente (la versión y la lista de archivos las pone tools/build.mjs).
// - Archivos de la app: se guardan al instalar y se sirven desde el celular, así abre sin internet.
// - config.json: primero la red (para que un cambio llegue pronto), y si no hay red, la copia guardada.
// - Una versión nueva espera hasta que la docente toque "Actualizar".
const VERSION = '6d56648e8a';
const CACHE = 'cuaderno-app-' + VERSION;
const CACHE_CONFIG = 'cuaderno-config';
const FILES = ["./","css/styles.css","fonts/caveat.woff2","fonts/lexend.woff2","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","index.html","js/data.js","js/excel.js","js/main.js","js/remote.js","js/schema.js","js/sync.js","js/ui.js","js/views.js","manifest.webmanifest","vendor/dexie.js","vendor/supabase.js","vendor/xlsx.js","js/version.js","config.json"];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('cuaderno-app-') && k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase y demás: directo a la red

  if (url.pathname.endsWith('/config.json')) {
    event.respondWith((async () => {
      try {
        const r = await fetch(req, { cache: 'no-store' });
        if (r.ok) (await caches.open(CACHE_CONFIG)).put(req, r.clone());
        return r;
      } catch {
        return (await caches.match(req, { ignoreSearch: true })) || new Response('{}', { headers: { 'content-type': 'application/json' } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch {
      if (req.mode === 'navigate') {
        const home = (await caches.match('index.html')) || (await caches.match('./'));
        if (home) return home;
      }
      return new Response('Sin conexión', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  })());
});
