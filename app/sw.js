// Service worker del Cuaderno docente (la versión y la lista de archivos las pone tools/build.mjs).
// - Archivos de la app: se guardan al instalar y se sirven desde el celular, así abre sin internet.
// - config.json: primero la red (para que un cambio llegue pronto), y si no hay red, la copia guardada.
// - Una versión nueva espera hasta que la docente toque "Actualizar".
const VERSION = '3bda0e3643';
const CACHE = 'cuaderno-app-' + VERSION;
const CACHE_CONFIG = 'cuaderno-config';
const FILES = ["./","css/styles.css","fonts/public-sans.woff2","fonts/source-serif-4.woff2","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","index.html","js/agenda.js","js/analisis.js","js/anotaciones.js","js/avisos.js","js/bloqueo.js","js/calc.js","js/consultas.js","js/contacto.js","js/cuenta.js","js/data.js","js/diccionario.js","js/excel.js","js/form.js","js/graficos.js","js/ia.js","js/institucion.js","js/main.js","js/pausas.js","js/planificacion.js","js/remote.js","js/schema.js","js/sorteo.js","js/sync.js","js/ui.js","js/views-agenda.js","js/views-anotaciones.js","js/views-asistencia.js","js/views-aula.js","js/views-avisos.js","js/views-chat.js","js/views-contacto.js","js/views-eval.js","js/views-inicio.js","js/views-planificacion.js","js/views-reporte-semanal.js","js/views-reportes.js","js/views-sorteo.js","js/views.js","manifest.webmanifest","vendor/dexie.js","vendor/supabase.js","vendor/xlsx.js","js/version.js","config.json"];

self.addEventListener('install', event => {
  // cache: 'reload' obliga a pedir cada archivo a la red, sin usar la copia temporal del navegador o de GitHub Pages,
  // para no guardar archivos viejos bajo la versión nueva.
  event.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(async f => {
    const r = await fetch(new Request(f, { cache: 'reload' }));
    if (!r.ok) throw new Error(`No se pudo guardar ${f}`);
    await c.put(f, r);
  }))));
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
  if (url.searchParams.has('t')) return; // consulta de versión: siempre a la red

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
