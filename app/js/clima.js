// Clima y radiación UV de la zona de la docente, para la pantalla Hoy.
// - La ubicación se guarda solo en este celular (localStorage), nunca en la nube de la app.
// - Datos: Open-Meteo (temperatura, UV, cielo). Nombre de la zona: BigDataCloud (solo recibe coordenadas).
// - Sin internet (o si la lectura falla) el indicador no se muestra; reaparece solo cuando vuelve la conexión.
// - Se actualiza cada 15 minutos con la app abierta, al abrirla y al volver a ella. Si la docente dio permiso de
//   ubicación, la ciudad se actualiza sola; si eligió la ciudad a mano, se respeta.
import { html, raw, icon } from './ui.js';

const LLAVE = 'cuaderno-clima';
const VIGENCIA = 15 * 60 * 1000;  // cada cuánto se vuelve a pedir el clima
const EDAD_MAX = 16.5 * 60 * 1000; // una lectura más vieja que esto no se muestra
const REINTENTO = 2 * 60 * 1000;  // si falla, se vuelve a intentar pronto
const MOVIDA_KM = 3;              // desde cuántos km se considera que cambió de zona
const API = 'https://api.open-meteo.com/v1/forecast';
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const REV = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

function leer() { try { return JSON.parse(localStorage.getItem(LLAVE)) || {}; } catch { return {}; } }
function guardar(o) { try { localStorage.setItem(LLAVE, JSON.stringify(o)); } catch { /* sin almacenamiento: se pierde al cerrar */ } }

// ---------- datos ----------
async function pedir(url, ms = 9000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function obtenerClima(lugar) {
  const q = new URLSearchParams({
    latitude: lugar.lat, longitude: lugar.lon,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day,uv_index',
    daily: 'uv_index_max,temperature_2m_max,temperature_2m_min',
    hourly: 'precipitation_probability,precipitation,weather_code',
    timezone: 'auto', forecast_days: '1', wind_speed_unit: 'kmh',
  });
  const j = await pedir(`${API}?${q}`);
  const c = j && j.current, d = (j && j.daily) || {};
  if (!c || typeof c.temperature_2m !== 'number') throw new Error('Respuesta sin datos');
  const num = v => (typeof v === 'number' ? v : null);
  const h = (j && j.hourly) || {};
  const ahora = String(c.time || '').slice(0, 13);
  const horas = (h.time || []).map((t, i) => ({ t, prob: num(h.precipitation_probability && h.precipitation_probability[i]) ?? 0, mm: num(h.precipitation && h.precipitation[i]) ?? 0, cod: num(h.weather_code && h.weather_code[i]) ?? 0 }))
    .filter(x => String(x.t).slice(0, 13) >= ahora).slice(0, 8);
  return {
    hora: String(c.time || ''), horas,
    temp: c.temperature_2m, sensacion: num(c.apparent_temperature) ?? c.temperature_2m,
    humedad: num(c.relative_humidity_2m), lluvia: num(c.precipitation) ?? 0, codigo: num(c.weather_code) ?? 0,
    viento: num(c.wind_speed_10m), dia: c.is_day !== 0, uv: num(c.uv_index) ?? 0,
    uvMax: num(d.uv_index_max && d.uv_index_max[0]), max: num(d.temperature_2m_max && d.temperature_2m_max[0]), min: num(d.temperature_2m_min && d.temperature_2m_min[0]),
  };
}

async function nombreLugar(lat, lon) {
  try {
    const j = await pedir(`${REV}?${new URLSearchParams({ latitude: lat, longitude: lon, localityLanguage: 'es' })}`, 6000);
    const sitio = j.city || j.locality || '';
    const zona = j.principalSubdivision || j.countryName || '';
    const nombre = [sitio, zona].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
    return nombre || 'Tu ubicación';
  } catch { return 'Tu ubicación'; }
}

function ubicar() {
  return new Promise((ok, mal) => {
    if (!navigator.geolocation) { mal(new Error('sin-gps')); return; }
    navigator.geolocation.getCurrentPosition(
      p => ok({ lat: Math.round(p.coords.latitude * 1000) / 1000, lon: Math.round(p.coords.longitude * 1000) / 1000 }),
      e => mal(e), { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 });
  });
}

async function buscarCiudad(texto) {
  const j = await pedir(`${GEO}?${new URLSearchParams({ name: texto, count: '6', language: 'es', format: 'json' })}`, 8000);
  return (j.results || []).map(r => ({
    lat: Math.round(r.latitude * 1000) / 1000, lon: Math.round(r.longitude * 1000) / 1000,
    nombre: [r.name, r.admin1, r.country].filter((x, i, a) => x && a.indexOf(x) === i).join(', '),
  }));
}

// ---------- lectura del estado del cielo y de la radiación ----------
const esLluviaCod = c => (c >= 51 && c <= 67) || (c >= 80 && c <= 82);
export const VIENTO_FUERTE = 30; // km/h

// Qué mostrar según el momento: tormenta > lluvia > nieve > viento fuerte > neblina > nubes > sol (día) o luna (noche).
export function cielo(codigo, dia = true, viento = null, lluvia = 0) {
  const c = codigo;
  let r;
  if (c === 0) r = { texto: dia ? 'Despejado' : 'Noche despejada', icono: dia ? 'sol' : 'luna' };
  else if (c === 1) r = { texto: dia ? 'Mayormente despejado' : 'Noche mayormente despejada', icono: dia ? 'sol' : 'luna' };
  else if (c === 2) r = { texto: 'Parcialmente nublado', icono: dia ? 'nubesol' : 'nube' };
  else if (c === 3) r = { texto: 'Nublado', icono: 'nube' };
  else if (c === 45 || c === 48) r = { texto: 'Neblina', icono: 'niebla' };
  else if (c >= 51 && c <= 57) r = { texto: 'Llovizna', icono: 'lluvia' };
  else if (c === 61 || c === 80) r = { texto: 'Lluvia ligera', icono: 'lluvia' };
  else if (c === 63 || c === 81) r = { texto: 'Lluvia', icono: 'lluvia' };
  else if (c === 65 || c === 82 || c === 66 || c === 67) r = { texto: 'Lluvia fuerte', icono: 'lluvia' };
  else if ((c >= 71 && c <= 77) || c === 85 || c === 86) r = { texto: 'Nieve', icono: 'nieve' };
  else if (c === 95) r = { texto: 'Tormenta eléctrica', icono: 'tormenta' };
  else if (c >= 96) r = { texto: 'Tormenta con granizo', icono: 'tormenta' };
  else r = { texto: 'Nublado', icono: 'nube' };
  // lluvia medida aunque el código del cielo no la diga
  if (lluvia > 0 && !['lluvia', 'tormenta', 'nieve'].includes(r.icono)) r = { texto: 'Lluvia', icono: 'lluvia' };
  // viento fuerte: manda sobre el cielo, salvo tormenta, lluvia o nieve
  if (viento != null && viento >= VIENTO_FUERTE && !['lluvia', 'tormenta', 'nieve'].includes(r.icono)) r = { texto: `${r.texto} con viento`, icono: 'viento' };
  return r;
}

// Aviso de clima para la campana: lluvia o tormenta ahora o en las próximas horas del día. null si no hace falta.
const hora12 = t => { const h = +String(t).slice(11, 13), m = String(t).slice(14, 16); return `${h % 12 || 12}${m && m !== '00' ? ':' + m : ''} ${h >= 12 ? 'p. m.' : 'a. m.'}`; };
export function avisoClima(d) {
  if (!d) return null;
  const dia = String(d.hora || '').slice(0, 10) || 'hoy';
  const horas = d.horas || [];
  const tormentaYa = d.codigo >= 95;
  const tormentaLuego = horas.find(x => x.cod >= 95);
  if (tormentaYa || tormentaLuego) {
    return { id: `clima:tormenta:${dia}`, tipo: 'clima', icono: 'tormenta', href: '#/',
      titulo: tormentaYa ? 'Hay tormenta eléctrica ahora' : `Posible tormenta eléctrica hoy a partir de las ${hora12(tormentaLuego.t)}`,
      texto: 'Mantén a los estudiantes dentro del salón y lejos de las ventanas, y deja para otro día las actividades al aire libre.' };
  }
  const llueveYa = d.lluvia > 0 || esLluviaCod(d.codigo);
  const luego = horas.find(x => x.prob >= 60 || esLluviaCod(x.cod));
  if (llueveYa || luego) {
    return { id: `clima:lluvia:${dia}`, tipo: 'clima', icono: 'lluvia', href: '#/',
      titulo: llueveYa ? 'Está lloviendo ahora' : `Puede llover hoy a partir de las ${hora12(luego.t)}`,
      texto: `${!llueveYa && luego.prob ? `Probabilidad de ${Math.round(luego.prob)} %. ` : ''}Lleva paraguas o impermeable, cuida el piso mojado y piensa en mover las actividades al aire libre.` };
  }
  return null;
}

// Ícono animado del clima (las partes que se mueven llevan clases "cl-*"; el CSS las anima y las frena con "reducir movimiento").
const NUBE = 'M7 15.5a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 6a4.8 4.8 0 0 1 .5 9.5z';
const PARTES = {
  sol: '<g class="cl-rayos"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></g><circle cx="12" cy="12" r="4"/>',
  luna: '<path class="cl-luna" d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/><path class="cl-estrella" d="M17.5 3.8v2.4M16.3 5h2.4"/><path class="cl-estrella e2" d="M20.6 8.6v1.8M19.7 9.5h1.8"/>',
  nubesol: '<g class="cl-rayos" style="transform-box:view-box;transform-origin:8px 8px"><path d="M8 2.6v1M2.6 8h1M4.2 4.2l.7.7M11.8 4.2l-.7.7"/></g><circle cx="8" cy="8" r="2.6"/><path class="cl-deriva" d="M9 20a3.6 3.6 0 0 1-.4-7.2A5 5 0 0 1 18.3 13 3.5 3.5 0 0 1 18 20z"/>',
  nube: `<path class="cl-deriva" d="${NUBE}"/><path class="cl-deriva" d="M7 19.5h10" opacity="0"/>`,
  lluvia: `<path d="${NUBE}"/><path class="cl-gota g1" d="M8.5 18.2l-.8 2"/><path class="cl-gota g2" d="M12.5 18.2l-.8 2"/><path class="cl-gota g3" d="M16.5 18.2l-.8 2"/>`,
  tormenta: `<path d="${NUBE}"/><path class="cl-rayo" d="m12.7 14.5-2 3h3l-1.6 3.2"/>`,
  nieve: `<path d="${NUBE}"/><path class="cl-gota g1" d="M9 18.5v.01"/><path class="cl-gota g2" d="M12.5 20v.01"/><path class="cl-gota g3" d="M16 18.5v.01"/>`,
  niebla: '<path class="cl-niebla n1" d="M5 9h14"/><path class="cl-niebla n2" d="M3 13h18"/><path class="cl-niebla n1" d="M6 17h12"/>',
  viento: '<path class="cl-viento v1" d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5"/><path class="cl-viento v2" d="M3 12h14a2.5 2.5 0 1 1-2.5 2.5"/><path class="cl-viento v3" d="M3 16h7"/>',
};
export const iconoClima = (nombre, tam = 22) =>
  `<svg class="ico cl-ico" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PARTES[nombre] || PARTES.nube}</svg>`;

export function nivelUV(uv) {
  const v = Math.round(uv ?? 0);
  if (v <= 2) return { clave: 'bajo', nombre: 'Bajo', color: '#2f855a', medidas: ['No necesitas protección especial. Si vas a estar mucho rato afuera, una gorra ayuda.'] };
  if (v <= 5) return { clave: 'moderado', nombre: 'Moderado', color: '#b7791f', medidas: ['Usa gorra o sombrero y lentes de sol.', 'Si estarás al aire libre un buen rato, ponte protector solar.'] };
  if (v <= 7) return { clave: 'alto', nombre: 'Alto', color: '#c05621', medidas: ['Usa protector solar (FPS 30 o más) y vuelve a aplicarlo cada 2 horas.', 'Gorra o sombrero y lentes de sol.', 'Busca la sombra entre las 11 a. m. y las 3 p. m.'] };
  if (v <= 10) return { clave: 'muy-alto', nombre: 'Muy alto', color: '#c53030', medidas: ['Protector solar (FPS 50) y reaplícalo cada 2 horas.', 'Gorra o sombrero, lentes de sol y ropa que cubra brazos y hombros.', 'Evita el sol directo entre las 10 a. m. y las 4 p. m.; haz las actividades afuera a la sombra.'] };
  return { clave: 'extremo', nombre: 'Extremo', color: '#6b46c1', medidas: ['Evita estar al aire libre al mediodía; si es inevitable, busca sombra y protégete por completo.', 'Protector solar (FPS 50 o más), gorra, lentes de sol y ropa que cubra la piel.', 'Mueve las actividades de los estudiantes a espacios techados.'] };
}

export function consejos(d) {
  const otros = [];
  const llueve = d.lluvia > 0 || (d.codigo >= 51 && d.codigo <= 67) || (d.codigo >= 80 && d.codigo <= 82);
  if (d.codigo >= 95) otros.push('Hay tormenta eléctrica: mantén a los estudiantes dentro del salón y lejos de las ventanas.');
  else if (llueve) otros.push('Hay lluvia: lleva paraguas o impermeable y cuida el piso mojado en el aula y los pasillos.');
  if (d.viento != null && d.viento >= 40) otros.push('Hay viento fuerte: cuidado con objetos sueltos y con las actividades al aire libre.');
  if (d.sensacion >= 38) otros.push('El calor es extremo: evita el ejercicio al aire libre, busca lugares frescos y haz pausas largas.');
  else if (d.sensacion >= 32) otros.push('Hace calor: usa ropa ligera y de colores claros y haz las pausas a la sombra.');
  else if (d.sensacion <= 10) otros.push('Hace frío: abrígate en capas y cuida que los estudiantes también lo estén.');
  const calor = d.sensacion >= 32 || d.uv >= 8;
  const agua = calor
    ? 'Toma un vaso de agua (unos 250 ml) cada hora. Con este calor se pierde más líquido de lo que parece.'
    : 'Toma un vaso de agua (unos 250 ml) cada 1 o 2 horas, aunque no tengas sed.';
  return { uv: nivelUV(d.uv), otros, agua };
}

const hace = t => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : 'hace más de un día';
};
const grados = n => `${Math.round(n)}°`;

// ---------- estado compartido con la campana de avisos ----------
let avisoActual = null;
export const avisoClimaActual = () => avisoActual;
function publicarAviso(a) {
  const antes = avisoActual && avisoActual.id;
  avisoActual = a;
  if (antes !== (a && a.id)) { try { document.dispatchEvent(new CustomEvent('clima:cambio')); } catch { /* sin documento */ } }
}

const enLinea = () => navigator.onLine !== false;
const sinMov = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
async function permisoGps() {
  try { return (await navigator.permissions.query({ name: 'geolocation' })).state; } catch { return 'desconocido'; }
}
function km(a, b) {
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// ---------- control principal ----------
export function iniciarClima(boton) {
  let est = leer();               // { lugar: {lat, lon, nombre, auto}, datos, t }
  let cargando = false, visible = false, fallo = false, resolviendo = false, yaEntro = false;
  let modo = 'datos', msg = '', resultados = [], dlg = null, tReintento = null, htmlBoton = '';

  // El indicador solo se ve en Hoy, con internet y con una lectura reciente (o como invitación si aún no hay ciudad).
  const fresco = () => !!(est.datos && !fallo && Date.now() - est.t <= EDAD_MAX);
  const puedeVerse = () => visible && enLinea() && !resolviendo && (!est.lugar || fresco());

  const pintarBoton = () => {
    const d = est.datos;
    let h, aria;
    if (!est.lugar || !d) {
      h = `${iconoClima('nubesol', 20)}<span class="clima-t">Clima</span>`;
      aria = 'Activar el clima de tu zona';
    } else {
      const c = cielo(d.codigo, d.dia, d.viento, d.lluvia);
      h = `${iconoClima(c.icono, 20)}<span class="clima-t">${grados(d.temp)} · UV ${Math.round(d.uv)}</span>`;
      aria = `Clima: ${c.texto.toLowerCase()}, ${Math.round(d.temp)} grados, radiación UV ${Math.round(d.uv)}, nivel ${nivelUV(d.uv).nombre.toLowerCase()}. Toca para ver detalles`;
    }
    if (h !== htmlBoton) { boton.innerHTML = htmlBoton = h; } // solo si cambió, para no reiniciar las animaciones
    boton.setAttribute('aria-label', aria);
  };

  // Llega desde el borde derecho, como si lo trajera el viento. Solo la primera vez que aparece tras abrir la app.
  function entrada() {
    if (sinMov() || !boton.animate) return;
    const top = boton.closest('.top');
    if (top) top.classList.add('clima-llegando');
    boton.classList.add('clima-entra');
    const fin = () => { boton.classList.remove('clima-entra'); if (top) top.classList.remove('clima-llegando'); };
    boton.addEventListener('animationend', e => { if (e.target === boton && e.animationName === 'clima-llega') fin(); });
    setTimeout(fin, 1800);
  }

  function actualizarVista() {
    const ver = puedeVerse();
    const estabaOculto = boton.hidden;
    if (ver) pintarBoton();
    boton.hidden = !ver;
    if (ver && estabaOculto && !yaEntro) { yaEntro = true; entrada(); }
    publicarAviso(enLinea() && fresco() ? avisoClima(est.datos) : null);
  }

  async function refrescar(forzar = false) {
    if (!est.lugar || cargando) return false;
    if (!enLinea()) { if (dlg && dlg.open) { msg = 'No hay conexión a internet.'; pintarModal(); } return false; }
    if (!forzar && est.datos && !fallo && Date.now() - est.t < VIGENCIA) return true;
    cargando = true; if (dlg && dlg.open) pintarModal();
    try {
      est = { ...est, datos: await obtenerClima(est.lugar), t: Date.now() };
      guardar(est); fallo = false; msg = ''; clearTimeout(tReintento);
      return true;
    } catch {
      fallo = true;
      msg = 'No pudimos leer el clima ahora. Intenta de nuevo en un momento.';
      clearTimeout(tReintento); tReintento = setTimeout(() => { if (enLinea()) refrescar(true); }, REINTENTO);
      return false;
    } finally { cargando = false; actualizarVista(); if (dlg && dlg.open) pintarModal(); }
  }

  // Si la docente ya dio permiso, la ciudad se mantiene al día sola. Nunca se pide el permiso por cuenta propia,
  // y una ciudad elegida a mano se respeta.
  async function ubicacionAuto() {
    if (!enLinea() || (est.lugar && !est.lugar.auto)) return false;
    if ((await permisoGps()) !== 'granted') return false;
    const nueva = !est.lugar;
    if (nueva) { resolviendo = true; actualizarVista(); }
    try {
      const p = await ubicar();
      if (nueva || km(est.lugar, p) >= MOVIDA_KM) {
        const nombre = await nombreLugar(p.lat, p.lon);
        est = { lugar: { ...p, nombre, auto: true }, datos: null, t: 0 }; guardar(est); fallo = false;
        return true;
      }
    } catch { /* sin posición por ahora: se conserva la que hay */ } finally { resolviendo = false; }
    return false;
  }

  async function ciclo(forzar) {
    if (!enLinea()) { actualizarVista(); return; }
    const cambio = await ubicacionAuto();
    await refrescar(forzar || cambio);
    actualizarVista();
  }

  async function usarMiUbicacion() {
    msg = 'Buscando tu ubicación…'; modo = 'inicio'; pintarModal();
    try {
      const p = await ubicar();
      const nombre = await nombreLugar(p.lat, p.lon);
      est = { lugar: { ...p, nombre, auto: true }, datos: null, t: 0 }; guardar(est); fallo = false;
      modo = 'datos'; msg = '';
      actualizarVista();
      await refrescar(true);
    } catch (e) {
      modo = est.lugar ? 'datos' : 'inicio';
      msg = e && e.code === 1
        ? 'No tenemos permiso para usar tu ubicación. Puedes permitirla en los ajustes del navegador o buscar tu ciudad.'
        : 'No pudimos obtener tu ubicación. Puedes buscar tu ciudad.';
      pintarModal();
    }
  }

  async function elegir(i) {
    const r = resultados[i];
    if (!r) return;
    est = { lugar: { lat: r.lat, lon: r.lon, nombre: r.nombre, auto: false }, datos: null, t: 0 }; guardar(est); fallo = false;
    modo = 'datos'; msg = ''; resultados = [];
    actualizarVista();
    await refrescar(true);
  }

  // ---------- ventana ----------
  const cuerpoDatos = () => {
    const d = est.datos, c = cielo(d.codigo, d.dia, d.viento, d.lluvia), k = consejos(d);
    const celda = (t, v) => v == null ? '' : html`<div class="clima-celda"><span class="clima-celda-t">${t}</span><strong>${v}</strong></div>`;
    return html`
      <div class="clima-grande">
        <span class="clima-ico">${raw(iconoClima(c.icono, 44))}</span>
        <div><div class="clima-temp">${grados(d.temp)}</div><div class="clima-cielo">${c.texto}</div></div>
      </div>
      <section class="clima-tarjeta" aria-labelledby="clima-uv-t">
        <h3 id="clima-uv-t"><span class="clima-punto" style="background:${k.uv.color}" aria-hidden="true"></span>Radiación UV ${Math.round(d.uv)}: ${k.uv.nombre}</h3>
        <ul>${k.uv.medidas.map(m => html`<li>${m}</li>`)}</ul>
      </section>
      <section class="clima-tarjeta clima-agua" aria-labelledby="clima-a-t">
        <h3 id="clima-a-t">${icon('gota', 18)} Recordatorio: toma agua</h3>
        <p>${k.agua}</p>
      </section>
      ${k.otros.length ? html`<section class="clima-tarjeta" aria-labelledby="clima-o-t"><h3 id="clima-o-t">Para hoy</h3><ul>${k.otros.map(m => html`<li>${m}</li>`)}</ul></section>` : ''}
      <div class="clima-datos">
        ${celda('Sensación', grados(d.sensacion))}
        ${celda('Mín. / máx. hoy', d.min != null && d.max != null ? `${grados(d.min)} / ${grados(d.max)}` : null)}
        ${celda('Humedad', d.humedad != null ? `${Math.round(d.humedad)} %` : null)}
        ${celda('Viento', d.viento != null ? `${Math.round(d.viento)} km/h` : null)}
        ${celda('Lluvia', d.lluvia > 0 ? `${d.lluvia.toFixed(1).replace('.', ',')} mm` : 'Sin lluvia')}
        ${celda('UV máximo hoy', d.uvMax != null ? String(Math.round(d.uvMax)) : null)}
      </div>`;
  };

  const cuerpoInicio = () => html`
    <p class="clima-intro">Mira la temperatura y la radiación UV de tu zona, con recomendaciones para cuidarte durante la jornada.</p>
    <p class="clima-chico">Tu ubicación se guarda solo en este celular. Para consultar el clima se envían las coordenadas a Open-Meteo, un servicio público de datos del tiempo.</p>
    <div class="clima-acc">
      <button type="button" class="btn primary" data-acc="gps">Usar mi ubicación</button>
      <button type="button" class="btn secondary" data-acc="buscar">Buscar mi ciudad</button>
    </div>`;

  const cuerpoBuscar = () => html`
    <form class="clima-form" data-form="buscar" novalidate>
      <label for="clima-q">Ciudad o municipio</label>
      <div class="clima-fila"><input id="clima-q" type="search" autocomplete="off" placeholder="Por ejemplo: Valencia"><button class="btn primary" type="submit">Buscar</button></div>
    </form>
    ${resultados.length ? html`<ul class="clima-res">${resultados.map((r, i) => html`<li><button type="button" data-acc="elegir" data-i="${i}">${r.nombre}</button></li>`)}</ul>` : ''}
    <div class="clima-acc"><button type="button" class="btn secondary" data-acc="gps">Usar mi ubicación</button></div>`;

  function pintarModal() {
    if (!dlg) return;
    let cuerpo, pie = '';
    if (modo === 'buscar') cuerpo = cuerpoBuscar();
    else if (!est.lugar || modo === 'inicio') cuerpo = cuerpoInicio();
    else if (est.datos) {
      cuerpo = cuerpoDatos();
      pie = html`<div class="clima-acc">
        <button type="button" class="btn secondary chico" data-acc="actualizar" ${cargando ? raw('disabled') : ''}>${cargando ? 'Actualizando…' : 'Actualizar'}</button>
        <button type="button" class="btn secondary chico" data-acc="buscar">Cambiar ubicación</button>
      </div>
      <p class="clima-chico">Orientación general, no es consejo médico. Datos de Open-Meteo, leídos ${hace(est.t)}.</p>`;
    } else {
      cuerpo = html`<p class="clima-intro">${cargando ? 'Leyendo el clima…' : 'Todavía no hay datos.'}</p>
        ${cargando ? '' : html`<div class="clima-acc"><button type="button" class="btn primary" data-acc="actualizar">Reintentar</button><button type="button" class="btn secondary" data-acc="buscar">Cambiar ubicación</button></div>`}`;
    }
    const titulo = est.lugar && modo === 'datos' ? est.lugar.nombre : 'Clima de tu zona';
    dlg.innerHTML = html`
      <div class="clima-cab">
        <h2 id="clima-titulo">${titulo}</h2>
        <button type="button" class="top-btn" data-acc="cerrar" aria-label="Cerrar">${icon('cerrar', 22)}</button>
      </div>
      <div class="clima-cuerpo">
        <p class="clima-msg" role="status" aria-live="polite">${msg}</p>
        ${cuerpo}${pie}
      </div>`.toString();
    const q = dlg.querySelector('#clima-q');
    if (q && !q.dataset.listo) { q.dataset.listo = '1'; q.focus(); }
  }

  function crearDialogo() {
    dlg = document.createElement('dialog');
    dlg.className = 'clima-modal';
    dlg.setAttribute('aria-labelledby', 'clima-titulo');
    document.body.appendChild(dlg);
    dlg.addEventListener('click', async e => {
      if (e.target === dlg) { dlg.close(); return; }
      const b = e.target.closest('[data-acc]');
      if (!b) return;
      const a = b.dataset.acc;
      if (a === 'cerrar') dlg.close();
      else if (a === 'gps') await usarMiUbicacion();
      else if (a === 'buscar') { modo = 'buscar'; msg = ''; resultados = []; pintarModal(); }
      else if (a === 'actualizar') { msg = ''; await refrescar(true); }
      else if (a === 'elegir') await elegir(Number(b.dataset.i));
    });
    dlg.addEventListener('submit', async e => {
      e.preventDefault();
      const q = dlg.querySelector('#clima-q');
      const texto = q ? q.value.trim() : '';
      if (texto.length < 2) { msg = 'Escribe el nombre de tu ciudad.'; pintarModal(); return; }
      msg = 'Buscando…'; pintarModal();
      try {
        resultados = await buscarCiudad(texto);
        msg = resultados.length ? 'Elige tu ciudad:' : `No encontramos "${texto}". Prueba con otro nombre.`;
      } catch { resultados = []; msg = 'No pudimos buscar ahora. Revisa tu conexión.'; }
      pintarModal();
    });
    dlg.addEventListener('close', () => { msg = ''; });
  }

  async function abrir() {
    if (!dlg) crearDialogo();
    modo = est.lugar ? 'datos' : 'inicio'; msg = ''; resultados = [];
    pintarModal();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    if (est.lugar) refrescar(false);
  }

  boton.addEventListener('click', abrir);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ciclo(false); });
  window.addEventListener('online', () => { fallo = false; ciclo(true); });
  window.addEventListener('offline', () => actualizarVista());
  setInterval(() => { if (document.visibilityState === 'visible') ciclo(true); }, VIGENCIA);
  ciclo(false);

  return {
    mostrar(v) {
      visible = !!v;
      actualizarVista();
      if (visible && est.lugar) refrescar(false);
    },
  };
}
