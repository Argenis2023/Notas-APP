// Arranque de la app: base de datos, sesión, sincronización, rutas y actualizaciones.
import { db, bus, getSeccion } from './data.js';
import { createSync } from './sync.js';
import { html, toast, infoEstado, mensajeError } from './ui.js';
import * as V from './views.js';

const $ = (s, r = document) => r.querySelector(s);

const ctx = {
  configurado: false,
  sesion: null,
  supa: null,
  go: hash => { location.hash = hash; },
  refresh: () => render({ suave: true }),
  syncNow: () => (sync ? sync.syncNow() : Promise.resolve({ status: 'disabled' })),
  syncState: () => (sync ? sync.state : { status: 'disabled', pending: 0 }),
  signOut,
  checkUpdate,
};

let sync = null;
let actual = null;
let ficha = 0;

// ---------- rutas ----------
const RUTAS = [
  [/^#\/?$/, () => V.inicio(ctx), 'inicio'],
  [/^#\/estudiantes\/importar$/, () => V.importar(ctx), 'estudiantes'],
  [/^#\/estudiantes\/nuevo$/, () => V.estudianteForm(ctx, 'nuevo'), 'estudiantes'],
  [/^#\/estudiantes\/([^/]+)$/, m => V.estudianteForm(ctx, m[1]), 'estudiantes'],
  [/^#\/estudiantes$/, () => V.estudiantes(ctx), 'estudiantes'],
  [/^#\/ajustes$/, () => V.ajustes(ctx), 'ajustes'],
];

async function render({ suave = false } = {}) {
  const hash = location.hash || '#/';
  const ruta = RUTAS.find(r => r[0].test(hash));
  if (!ruta) { location.hash = '#/'; return; }
  const token = ++ficha;
  const vista = await ruta[1](hash.match(ruta[0]));
  if (token !== ficha) return;
  actual = vista;
  $('#titulo').textContent = vista.title;
  document.title = vista.title === 'Cuaderno docente' ? 'Cuaderno docente' : `${vista.title} | Cuaderno docente`;
  const main = $('#view');
  main.innerHTML = vista.html.toString();
  $$('.tabs a').forEach(a => { if (a.dataset.ruta !== ruta[2]) a.removeAttribute('aria-current'); else a.setAttribute('aria-current', 'page'); });
  if (!suave) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  if (vista.mount) vista.mount(main);
}
function $$(s, r = document) { return Array.from(r.querySelectorAll(s)); }

// Las pantallas "vivas" se redibujan cuando cambian los datos, salvo que se esté escribiendo.
let tRefresco;
bus.addEventListener('change', () => {
  clearTimeout(tRefresco);
  tRefresco = setTimeout(() => {
    const el = document.activeElement;
    const escribiendo = el && $('#view').contains(el) && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    if (actual && actual.live && !escribiendo) render({ suave: true });
  }, 150);
});

// ---------- estado de sincronización ----------
function pintarEstado() {
  const chip = $('#chip');
  if (!chip) return;
  const st = ctx.syncState();
  const info = infoEstado(st, { configurado: ctx.configurado, sesion: ctx.sesion });
  chip.className = `chip ${info.clase}`;
  $('#chip-texto').textContent = info.texto;
  chip.setAttribute('aria-label', `Estado del respaldo: ${info.texto}`);
  if (actual && actual.onStatus) actual.onStatus($('#view'));
}

// ---------- sesión ----------
function pedirLogin(supa) {
  const gate = $('#gate');
  gate.hidden = false;
  return new Promise(resolve => {
    V.pantallaLogin(gate, {
      puedeOmitir: navigator.onLine === false,
      entrar: async (email, password, omitir) => {
        if (omitir) { gate.hidden = true; resolve(null); return; }
        try {
          const s = await supa.auth.signIn(email, password);
          gate.hidden = true;
          resolve(s);
        } catch (e) { throw new Error(mensajeError(e)); }
      },
    });
  });
}

async function signOut() {
  try { await ctx.supa.auth.signOut(); } catch { /* sin conexión: se limpia igual al recargar */ }
  location.reload();
}

// ---------- configuración (Supabase) ----------
async function cargarConfig() {
  try {
    const r = await fetch('./config.json', { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch { /* sin conexión: se usa la copia guardada por el service worker */ }
  try {
    const r = await caches.match('./config.json');
    if (r) return await r.json();
  } catch { /* sin caché */ }
  return {};
}

// ---------- actualizaciones ----------
let reg = null;
let pideActualizar = false;
function avisarActualizacion() {
  const b = $('#banner');
  b.hidden = false;
  b.innerHTML = html`<p><strong>Hay una versión nueva del cuaderno.</strong></p><button class="btn primary chico" type="button" id="b-act">Actualizar</button>`.toString();
  $('#b-act').addEventListener('click', () => {
    pideActualizar = true;
    if (reg && reg.waiting) reg.waiting.postMessage('skipWaiting');
    else location.reload();
  });
}
async function registrarSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  try {
    reg = await navigator.serviceWorker.register('./sw.js');
    const vigilar = w => w && w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) avisarActualizacion();
    });
    reg.addEventListener('updatefound', () => vigilar(reg.installing));
    if (reg.waiting && navigator.serviceWorker.controller) avisarActualizacion();
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (pideActualizar) location.reload(); });
    reg.update().catch(() => {});
  } catch { /* la app funciona igual, solo sin modo sin conexión */ }
}
async function checkUpdate() {
  if (!reg) return 'ok';
  if (navigator.onLine === false) return 'offline';
  try { await reg.update(); } catch { return 'offline'; }
  await new Promise(r => setTimeout(r, 1200));
  return reg.installing || reg.waiting ? 'nueva' : 'ok';
}

// ---------- arranque ----------
function falloGrave(titulo, detalle) {
  $('#gate').hidden = false;
  $('#gate').innerHTML = html`<main class="login"><section class="portada"><p class="portada-titulo">${titulo}</p></section><p>${detalle}</p></main>`.toString();
}

async function boot() {
  try { await db.open(); }
  catch {
    falloGrave('No se puede guardar datos', 'Tu navegador está bloqueando el almacenamiento. Si estás en una ventana privada, abre el cuaderno en una ventana normal de Chrome.');
    return;
  }
  registrarSW();

  const hooks = window.CMS_TEST_HOOKS || {};
  let supa = hooks.supa || null;
  if (!supa) {
    const cfg = await cargarConfig();
    if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
      try {
        const { createSupabase } = await import('./remote.js');
        supa = createSupabase(cfg.supabaseUrl, cfg.supabaseAnonKey);
      } catch { supa = null; }
    }
  }
  ctx.configurado = !!supa;
  ctx.supa = supa;
  if (supa) {
    ctx.sesion = await supa.auth.session().catch(() => null);
    if (!ctx.sesion) ctx.sesion = await pedirLogin(supa);
  }

  sync = createSync({ remote: ctx.sesion ? supa.remote : null, onStatus: pintarEstado });
  await sync.init();

  $('#shell').hidden = false;
  $('#chip').addEventListener('click', () => {
    if (ctx.sesion && sync.enabled) sync.syncNow().then(r => {
      if (r.status === 'ok') toast('Datos respaldados');
      else if (r.status === 'offline') toast('Sin conexión. Se respaldará cuando vuelva internet.', 'error');
      else toast('No se pudo respaldar. Revisa Ajustes.', 'error');
    });
    else ctx.go('#/ajustes');
  });
  window.addEventListener('hashchange', () => render());
  // Dispositivo nuevo con sesión: se traen primero los datos de la nube, para no ofrecer crear un cuaderno que ya existe.
  let yaSincronizo = false;
  if (ctx.sesion && sync.enabled && !(await getSeccion()) && navigator.onLine !== false) {
    $('#titulo').textContent = 'Cuaderno docente';
    $('#view').innerHTML = html`<p class="vacio" role="status">Buscando tu cuaderno en la nube…</p>`.toString();
    await Promise.race([sync.syncNow(), new Promise(r => setTimeout(r, 12000))]);
    yaSincronizo = true;
  }
  await render();
  pintarEstado();
  if (ctx.sesion && !yaSincronizo) sync.syncNow();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

boot();
