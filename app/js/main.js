// Arranque de la app: base de datos, sesión, sincronización, rutas y actualizaciones.
import { db, bus, getSeccion, borrarTodoLocal, countPending, TABLE_NAMES, normalizarNombresGuardados } from './data.js';
import { createSync } from './sync.js';
import { html, raw, icon, toast, infoEstado, mensajeError } from './ui.js';
import * as V from './views.js';
import * as E from './views-eval.js';
import * as R from './views-reportes.js';
import * as A from './views-asistencia.js';
import { revisarDueno, pedirCambioDeCuenta } from './cuenta.js';
import * as AU from './views-aula.js';
import { sorteo } from './views-sorteo.js';
import { anotaciones } from './views-anotaciones.js';
import { representantes } from './views-contacto.js';
import { agenda } from './views-agenda.js';
import { planificaciones, planificacionForm } from './views-planificacion.js';
import * as AV from './views-avisos.js';
import { VERSION } from './version.js';
import { leerInstitucion, aplicarInstitucion } from './institucion.js';
import { iniciarBloqueo } from './bloqueo.js';
import { montarChat } from './views-chat.js';
import { cargarSnapshot } from './analisis.js';
import { mas, MENU_PC } from './views-mas.js';
import { iniciarClima } from './clima.js';

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
  cerrarSesionSegura,
  checkUpdate,
  borrarTodo,
};

let sync = null;
let actual = null;
let ficha = 0;

// ---------- rutas ----------
const RUTAS = [
  [/^#\/?(?:\?(.*))?$/, m => V.inicio(ctx, m[1]), 'inicio'],
  [/^#\/evaluar$/, () => E.evaluar(ctx), 'evaluar'],
  [/^#\/evaluar\/a\/([^/?]+)\/nueva(?:\?(.*))?$/, m => E.evaluacionForm(ctx, { asignaturaId: m[1], lapsoNum: new URLSearchParams(m[2] || '').get('l') }), 'evaluar'],
  [/^#\/evaluar\/a\/([^/?]+)(?:\?(.*))?$/, m => E.asignatura(ctx, m[1], m[2]), 'evaluar'],
  [/^#\/evaluar\/e\/([^/?]+)\/editar$/, m => E.evaluacionForm(ctx, { evaluacionId: m[1] }), 'evaluar'],
  [/^#\/evaluar\/e\/([^/?]+)\/indicador\/([^/?]+)$/, m => E.indicadorForm(ctx, m[1], m[2]), 'evaluar'],
  [/^#\/evaluar\/e\/([^/?]+)\/cotejo(?:\?(.*))?$/, m => E.cotejo(ctx, m[1], m[2]), 'evaluar'],
  [/^#\/evaluar\/e\/([^/?]+)$/, m => E.evaluacion(ctx, m[1]), 'evaluar'],
  [/^#\/reportes(?:\?(.*))?$/, m => R.reportes(ctx, m[1]), 'reportes'],
  [/^#\/reportes\/curso(?:\?(.*))?$/, m => R.reporteCurso(ctx, m[1]), 'reportes'],
  [/^#\/reportes\/banco$/, () => R.banco(ctx), 'reportes'],
  [/^#\/reportes\/e\/([^/?]+)(?:\?(.*))?$/, m => R.reporteEstudiante(ctx, m[1], m[2]), 'reportes'],
  [/^#\/estudiantes\/importar$/, () => V.importar(ctx), 'curso'],
  [/^#\/estudiantes\/nuevo$/, () => V.estudianteForm(ctx, 'nuevo'), 'curso'],
  [/^#\/estudiantes\/([^/]+)$/, m => V.estudianteForm(ctx, m[1]), 'curso'],
  [/^#\/estudiantes$/, () => V.estudiantes(ctx), 'curso'],
  [/^#\/asistencia\/calendario(?:\?(.*))?$/, m => A.asistenciaCalendario(ctx, m[1]), 'curso'],
  [/^#\/asistencia\/resumen(?:\?(.*))?$/, m => A.asistenciaResumen(ctx, m[1]), 'curso'],
  [/^#\/asistencia(?:\?(.*))?$/, m => A.asistenciaDia(ctx, m[1]), 'curso'],
  [/^#\/aula\/diccionario$/, () => AU.diccionario(ctx), 'mas'],
  [/^#\/aula\/pausas(?:\?(.*))?$/, m => AU.pausas(ctx, m[1]), 'mas'],
  [/^#\/planificacion$/, () => planificaciones(ctx), 'mas'],
  [/^#\/planificacion\/([^/?]+)$/, m => planificacionForm(ctx, m[1]), 'mas'],
  [/^#\/agenda$/, () => agenda(ctx), 'inicio'],
  [/^#\/representantes(?:\?(.*))?$/, m => representantes(ctx, m[1]), 'curso'],
  [/^#\/anotaciones(?:\?(.*))?$/, m => anotaciones(ctx, m[1]), 'curso'],
  [/^#\/aula\/sorteo(?:\?(.*))?$/, m => sorteo(ctx, m[1]), 'mas'],
  [/^#\/avisos$/, () => AV.avisos(ctx), 'inicio'],
  [/^#\/ajustes(?:\?(.*))?$/, m => V.ajustes(ctx, m[1]), 'mas'],
  [/^#\/mas$/, () => mas(ctx), 'mas'],
];

let clima = null; // indicador del clima (solo se ve en Hoy)
let claveActiva = 'inicio';

// Menú lateral de PC: se arma con todas las secciones (en el celular siguen las 5 pestañas).
const enPc = () => !!(window.matchMedia && window.matchMedia('(min-width: 48rem)').matches);
function armarMenuPc() {
  const nav = $('.tabs');
  if (!nav || nav.dataset.menu) return;
  nav.dataset.menu = '1';
  const grupo = t => { const e = document.createElement('p'); e.className = 'tabs-grupo solo-pc'; e.textContent = t; return e; };
  const fila = ([ic, nombre, href], abajo) => {
    const a = document.createElement('a');
    a.href = href; a.dataset.pc = href; a.className = 'solo-pc' + (abajo ? ' tabs-abajo' : '');
    a.innerHTML = icon(ic, 24).toString() + '<span></span>'; a.querySelector('span').textContent = nombre;
    return a;
  };
  const piezas = bloques => bloques.flatMap(b => [...(b.grupo ? [grupo(b.grupo)] : []), ...b.filas.map(f => fila(f, b.abajo))]);
  const hoy = nav.querySelector('[data-ruta="inicio"]'), rep = nav.querySelector('[data-ruta="reportes"]');
  if (hoy) hoy.after(...piezas(MENU_PC.despuesDeHoy));
  if (rep) rep.after(...piezas(MENU_PC.despuesDeReportes));
}
// Marca la sección actual: en el celular por pestaña, en PC por la ruta exacta de cada enlace.
function marcarActivo() {
  const ruta = (location.hash || '#/').split('?')[0];
  const lateral = enPc();
  const coincide = pref => pref === '#/' ? (ruta === '#/' || ruta === '#') : (ruta === pref || ruta.startsWith(pref + '/'));
  $$('.tabs a').forEach(a => {
    const on = lateral ? (a.dataset.pc ? coincide(a.dataset.pc) : false) : a.dataset.ruta === claveActiva;
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
armarMenuPc();
if (window.matchMedia) window.matchMedia('(min-width: 48rem)').addEventListener('change', () => { marcarActivo(); moverPildora(); });
async function render({ suave = false } = {}) {
  const hash = location.hash || '#/';
  const ruta = RUTAS.find(r => r[0].test(hash));
  if (!ruta) { location.hash = '#/'; return; }
  const token = ++ficha;
  const vista = await ruta[1](hash.match(ruta[0]));
  if (token !== ficha) return;
  try { aplicarInstitucion(await leerInstitucion()); } catch { /* sin datos de la institución: se ve el tema base */ }
  actual = vista;
  if (!clima && $('#clima')) clima = iniciarClima($('#clima'));
  if (clima) clima.mostrar(!!vista.clima);
  $('#titulo').textContent = vista.title === 'Cuaderno docente' ? 'Hoy' : vista.title;
  document.title = vista.title === 'Cuaderno docente' ? 'Cuaderno docente' : `${vista.title} | Cuaderno docente`;
  const main = $('#view');
  const seg = selectorCurso(hash);
  if (seg) { $('#titulo').textContent = 'Curso'; document.title = 'Curso | Cuaderno docente'; }
  main.innerHTML = seg + vista.html.toString();
  cerrarRapido();
  claveActiva = ruta[2];
  marcarActivo();
  moverPildora();
  lapicesTab();
  if (!suave) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); entrada(main); }
  if (vista.mount) vista.mount(main);
  pintarCampana();
}

// Dentro de "Curso": un selector para pasar de la lista de estudiantes a la asistencia.
function selectorCurso(hash) {
  const [ruta, q = ''] = hash.split('?');
  const enLista = ruta === '#/estudiantes';
  const enAsistencia = ruta === '#/asistencia' && !new URLSearchParams(q).get('f');
  if (!enLista && !enAsistencia) return '';
  return html`<nav class="seg" aria-label="Qué ver del curso">
    <a href="#/estudiantes" ${enLista ? raw('aria-current="page"') : ''}>Estudiantes</a>
    <a href="#/asistencia" ${enAsistencia ? raw('aria-current="page"') : ''}>Asistencia</a>
  </nav>`.toString();
}

// Menú "+" de la barra superior: atajos para crear algo nuevo.
function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function cerrarRapido() {
  const m = $('#rapido-menu'), b = $('#rapido');
  if (!m || m.hidden) return;
  m.hidden = true;
  b.setAttribute('aria-expanded', 'false');
}
function iniciarRapido() {
  const m = $('#rapido-menu'), b = $('#rapido');
  b.addEventListener('click', () => {
    if (!m.hidden) { cerrarRapido(); return; }
    $('#rapido-lista').setAttribute('href', `#/asistencia?f=${hoyIso()}`);
    m.hidden = false;
    b.setAttribute('aria-expanded', 'true');
    ($('.rapido-i', m)).focus();
  });
  m.addEventListener('click', ev => { if (ev.target.closest('.rapido-i')) cerrarRapido(); });
  document.addEventListener('click', ev => { if (!m.hidden && !m.contains(ev.target) && !b.contains(ev.target)) cerrarRapido(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !m.hidden) { cerrarRapido(); b.focus(); } });
}

// Píldora de la barra inferior: se desliza hasta la pestaña activa (solo en el celular).
let pildoraLista = false;
// Disco de la pestaña activa (floating notch): salta hasta la pestaña nueva y deja una muesca en la barra.
const ELEVA = 1.1; // rem que sube el icono activo (debe coincidir con --eleva del CSS)
let posDisco = null, rutaDisco = null;
// Centro del icono activo en la barra, sin la elevación (que puede estar a medio animar).
function centroIcono(nav, ico) {
  const n = nav.getBoundingClientRect(), r = ico.getBoundingClientRect();
  const ty = new DOMMatrixReadOnly(getComputedStyle(ico).transform).m42 || 0;
  return [r.left - n.left + r.width / 2, r.top - n.top + r.height / 2 - ty];
}
function moverPildora() {
  const pil = document.querySelector('.tabs-pildora');
  const nav = document.querySelector('.tabs');
  if (!pil || !nav) return;
  const a = nav.querySelector('a[aria-current="page"]');
  const ico = a && a.querySelector('svg');
  const lateral = window.matchMedia && window.matchMedia('(min-width: 48rem)').matches;
  if (!ico || lateral) { pil.classList.remove('ver'); nav.style.removeProperty('--nx'); nav.style.removeProperty('--ny'); posDisco = null; return; }
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const d = pil.offsetWidth || 3.1 * rem;
  // centro del disco: el del icono sin elevar, menos lo que sube (medido por diseño, no por la animación en curso)
  const [cx0, cy0] = centroIcono(nav, ico);
  const cx = cx0, cy = cy0 - ELEVA * rem;
  const x = cx - d / 2, y = cy - d / 2;
  const ruta = a.dataset.ruta, cambio = posDisco && rutaDisco !== ruta;
  rutaDisco = ruta;
  if (!pildoraLista) {
    pil.style.transition = 'none'; nav.style.transition = 'none';
    pil.style.transform = `translate(${x}px, ${y}px)`;
    nav.style.setProperty('--nx', `${cx}px`); nav.style.setProperty('--ny', `${cy}px`);
    pil.classList.add('ver'); void pil.offsetWidth; pil.style.transition = ''; nav.style.transition = ''; pildoraLista = true;
  } else {
    const [px, py] = posDisco || [x, y];
    if (cambio && !sinMovimiento() && pil.animate) {
      // salto en arco: sube un poco a mitad de camino y cae con un pequeño aplastamiento
      pil.animate([
        { transform: `translate(${px}px, ${py}px)` },
        { transform: `translate(${(px + x) / 2}px, ${py - 0.9 * rem}px)`, offset: 0.5 },
        { transform: `translate(${x}px, ${y}px)` }
      ], { duration: 400, easing: 'cubic-bezier(0.3, 0.8, 0.3, 1)' });
      pil.animate([{ scale: '1' }, { scale: '1', offset: 0.7 }, { scale: '1.14 0.86', offset: 0.85 }, { scale: '1' }], { duration: 400 });
    }
    pil.style.transform = `translate(${x}px, ${y}px)`;
    nav.style.setProperty('--nx', `${cx}px`); nav.style.setProperty('--ny', `${cy}px`);
    pil.classList.add('ver');
  }
  posDisco = [x, y];
}
window.addEventListener('resize', moverPildora);

// Al cambiar de pestaña: el icono se "presiona" y suben unos lápices pequeños que giran y se desvanecen.
const LAPIZ = '<svg viewBox="0 0 8 24" aria-hidden="true"><rect x="1" y="0.5" width="6" height="4" rx="1.4" fill="var(--acento-suave)" stroke="var(--acento)" stroke-width="0.8"/><rect x="1" y="5" width="6" height="12" fill="var(--acento)"/><path d="M1 17h6l-3 6.2z" fill="var(--acento-suave)" stroke="var(--acento)" stroke-width="0.8" stroke-linejoin="round"/><path d="M3 21.6h2L4 23.6z" fill="var(--tinta)"/></svg>';
let rutaPrev = null;
function lapicesTab() {
  const nav = document.querySelector('.tabs');
  const a = nav && nav.querySelector('a[aria-current="page"]');
  if (!a) return;
  const ruta = a.getAttribute('href');
  const cambio = rutaPrev !== null && rutaPrev !== ruta;
  rutaPrev = ruta;
  if (!cambio || sinMovimiento() || !nav.animate) return;
  const lateral = !!(window.matchMedia && window.matchMedia('(min-width: 48rem)').matches);
  const pil = nav.querySelector('.tabs-pildora');
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const ico = a.querySelector('svg');
  let cx, cy;
  if (lateral) {
    // Menú lateral (PC): los lápices salen hacia el lado desde el icono de la sección nueva.
    [cx, cy] = centroIcono(nav, ico);
  } else {
    if (!pil || !pil.classList.contains('ver')) return;
    const [x0, y0] = centroIcono(nav, ico);
    cx = x0; cy = y0 - ELEVA * rem - pil.offsetHeight / 2;
  }
  for (let i = 0; i < 6; i++) {
    const el = document.createElement('span');
    el.className = 'lapiz'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = LAPIZ;
    const tam = 0.8 + Math.random() * 0.5;
    el.style.cssText = `left:${cx}px;top:${cy}px;width:${(0.62 * tam).toFixed(2)}rem;height:${(1.85 * tam).toFixed(2)}rem`;
    nav.appendChild(el);
    let dx = (i - 2.5) * 11 + (Math.random() * 10 - 5), subir = 46 + Math.random() * 30;
    const giro = (Math.random() * 140 - 70);
    if (lateral) { dx = 40 + Math.random() * 80; subir = -((i - 2.5) * 9 + (Math.random() * 8 - 4)); } // hacia la derecha y abierto en abanico
    const dur = 650 + Math.random() * 300;
    const anim = el.animate([
      { transform: 'translate(-50%,-50%) translate(0,0) rotate(0deg) scale(0.3)', opacity: 0 },
      { transform: `translate(-50%,-50%) translate(${dx * 0.4}px,${-subir * 0.45}px) rotate(${giro * 0.4}deg) scale(1)`, opacity: 1, offset: 0.25 },
      { transform: `translate(-50%,-50%) translate(${dx}px,${-subir}px) rotate(${giro}deg) scale(0.85)`, opacity: 0 }
    ], { duration: dur, delay: (lateral ? 0 : 300) + Math.random() * 90, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'both' });
    anim.onfinish = () => el.remove();
  }
}

if (document.fonts && document.fonts.ready) document.fonts.ready.then(moverPildora);

// ---------- movimiento sutil ----------
const sinMovimiento = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let tAnima;
// Al abrir una pantalla: las tarjetas entran y las barras crecen (lo define el CSS con la clase "anima").
function entrada(main) {
  if (sinMovimiento()) return;
  main.classList.remove('anima');
  void main.offsetWidth;
  main.classList.add('anima');
  clearTimeout(tAnima);
  tAnima = setTimeout(() => main.classList.remove('anima'), 1400);
  if (!window.CMS_TEST_HOOKS) contarNumeros(main);
}
// Los números grandes suben hasta su valor.
function contarNumeros(raiz) {
  for (const el of raiz.querySelectorAll('[data-cuenta]')) {
    const meta = Number(el.dataset.cuenta);
    if (!Number.isFinite(meta) || meta === 0) continue;
    const dec = String(el.dataset.cuenta).includes('.') ? 1 : 0;
    const t0 = performance.now(), dur = 700;
    const paso = t => {
      const k = Math.min(1, (t - t0) / dur);
      const v = meta * (1 - Math.pow(1 - k, 3));
      el.textContent = k >= 1 ? String(meta) : v.toFixed(dec);
      if (k < 1) requestAnimationFrame(paso);
    };
    el.textContent = dec ? '0.0' : '0';
    requestAnimationFrame(paso);
  }
}

// ---------- campana de avisos ----------
async function pintarCampana() {
  const el = $('#campana');
  if (!el) return;
  try {
    const seccion = await getSeccion();
    if (!seccion) { el.hidden = true; return; }
    const s = await cargarSnapshot(seccion);
    const { visibles } = await AV.avisosPendientes(s, ctx);
    const n = visibles.length;
    el.hidden = n === 0;
    $('#campana-n').textContent = n > 9 ? '9+' : String(n);
    el.setAttribute('aria-label', n === 1 ? '1 aviso nuevo' : `${n} avisos nuevos`);
  } catch { el.hidden = true; }
}
document.addEventListener('avisos:cambio', () => pintarCampana());
// Pequeño rebote en los botones de nivel (L, P, N y A, I, J) al tocarlos.
document.addEventListener('click', ev => {
  const b = ev.target.closest && ev.target.closest('.niv');
  if (!b) return;
  b.classList.remove('pulsa');
  void b.offsetWidth;
  b.classList.add('pulsa');
});
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

// Cierra la sesión y deja este celular limpio, pero SOLO si todo quedó respaldado en la nube. Si no se puede respaldar
// (sin internet, error, cambios pendientes) no cierra nada y explica por qué, para no perder datos.
async function cerrarSesionSegura() {
  if (!(ctx.sesion && sync && sync.enabled)) { await signOut(); return; }
  if (navigator.onLine === false) throw new Error('Sin internet no se puede respaldar, así que no se cerró la sesión. Conéctate e inténtalo otra vez.');
  const r = await sync.syncNow();
  if (!r || r.status !== 'ok') throw new Error(r && r.status === 'offline' ? 'Sin internet no se puede respaldar, así que no se cerró la sesión. Conéctate e inténtalo otra vez.' : 'No se pudo respaldar tus datos, así que no se cerró la sesión ni se borró nada. Inténtalo otra vez en unos minutos.');
  if ((await countPending()) > 0) throw new Error('Todavía hay cambios sin respaldar, así que no se cerró la sesión ni se borró nada. Inténtalo otra vez.');
  await sync.detener();
  await borrarTodoLocal();
  await signOut();
}

// Borra todo: la nube (si hay cuenta) y este dispositivo. Con cuenta pide su clave de nuevo.
async function borrarTodo(clave) {
  const conNube = !!(ctx.configurado && ctx.sesion && ctx.supa);
  if (conNube) {
    if (navigator.onLine === false) throw new Error('Necesitas internet para borrar, porque también se borra la copia en la nube.');
    try { await ctx.supa.auth.verify(clave); } catch (e) { throw new Error(/invalid login/i.test(e && e.message) ? 'La clave no es correcta.' : /failed to fetch|network/i.test(e && e.message) ? 'No hay conexión con internet.' : 'No se pudo comprobar la clave. Inténtalo otra vez.'); }
    await sync.detener();
    try { for (const t of TABLE_NAMES) await ctx.supa.remote.wipe(t); }
    catch (e) { sync.reanudar(); throw new Error('No se pudo borrar la copia en la nube, así que no se borró nada más en este celular. Inténtalo otra vez con internet.'); }
  }
  await borrarTodoLocal();
  location.hash = '#/';
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
let forzarActualizar = false;
// Pide a la red el número de versión publicado y lo compara con el que está corriendo.
// Sirve cuando el service worker no se enteró de que hay versión nueva.
async function hayVersionNueva() {
  if (navigator.onLine === false) return false;
  try {
    const r = await fetch(`./js/version.js?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const m = (await r.text()).match(/VERSION\s*=\s*'([^']+)'/);
    return !!m && m[1] !== VERSION;
  } catch { return false; }
}
async function limpiarYRecargar() {
  try {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) if (k.startsWith('cuaderno-app-')) await caches.delete(k);
  } catch { /* se recarga igual */ }
  location.reload();
}
function avisarActualizacion() {
  const b = $('#banner');
  b.hidden = false;
  b.innerHTML = html`<p><strong>Hay una versión nueva del cuaderno.</strong></p><button class="btn primary chico" type="button" id="b-act">Actualizar</button>`.toString();
  $('#b-act').addEventListener('click', () => {
    pideActualizar = true;
    if (reg && reg.waiting) reg.waiting.postMessage('skipWaiting');
    else if (forzarActualizar) limpiarYRecargar();
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
    // Si en unos segundos el service worker no avisó pero la red tiene otra versión, se ofrece actualizar igual.
    setTimeout(async () => {
      if (!$('#banner').hidden) return;
      if (await hayVersionNueva()) { forzarActualizar = true; avisarActualizacion(); }
    }, 6000);
  } catch { /* la app funciona igual, solo sin modo sin conexión */ }
}
async function checkUpdate() {
  if (!reg) return 'ok';
  if (navigator.onLine === false) return 'offline';
  try { await reg.update(); } catch { return 'offline'; }
  await new Promise(r => setTimeout(r, 1200));
  if (reg.installing || reg.waiting) return 'nueva';
  if (await hayVersionNueva()) { forzarActualizar = true; avisarActualizacion(); return 'nueva'; }
  return 'ok';
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
  ctx.iaDisponible = () => !!(ctx.configurado && ctx.sesion && ctx.supa && ctx.supa.ia);
  ctx.ia = (tipo, datos) => ctx.supa.ia(tipo, datos);
  ctx.reporteDisponible = () => !!(ctx.configurado && ctx.sesion && ctx.supa && ctx.supa.reporte);
  ctx.reporte = (accion, datos) => ctx.supa.reporte(accion, datos);
  await iniciarBloqueo(supa);
  if (supa) {
    ctx.sesion = await supa.auth.session().catch(() => null);
    if (!ctx.sesion) ctx.sesion = await pedirLogin(supa);
    // Si este celular tenía datos de otra cuenta, se pregunta antes de usarlos o subirlos a la cuenta nueva.
    if (ctx.sesion && ctx.sesion.email) {
      const caso = await revisarDueno(ctx.sesion.email);
      if ((caso === 'otra' || caso === 'desconocida') && !(await pedirCambioDeCuenta(ctx.sesion.email, caso))) { await signOut(); return; }
    }
  }

  sync = createSync({ remote: ctx.sesion ? supa.remote : null, onStatus: pintarEstado });
  await sync.init();
  try { await normalizarNombresGuardados(); } catch { /* si falla, los nombres quedan como estaban */ }

  $('#shell').hidden = false;
  iniciarRapido();
  montarChat();
  $('#chip').addEventListener('click', () => {
    if (ctx.sesion && sync.enabled) sync.syncNow().then(r => {
      if (r.status === 'ok') toast('Datos respaldados');
      else if (r.status === 'offline') toast('Sin conexión. Se respaldará cuando vuelva internet.', 'error');
      else toast('No se pudo respaldar. Revisa Ajustes.', 'error');
    });
    else ctx.go('#/ajustes?c=datos');
  });
  window.addEventListener('hashchange', () => render());
  // Dispositivo nuevo con sesión: se traen primero los datos de la nube, para no ofrecer crear un cuaderno que ya existe.
  let yaSincronizo = false;
  if (ctx.sesion && sync.enabled && !(await getSeccion()) && navigator.onLine !== false) {
    $('#titulo').textContent = 'Hoy';
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

// Safari de iPhone ignora el bloqueo del zoom en la etiqueta del viewport: se frenan los gestos de pellizco.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
