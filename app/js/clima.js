// Clima y radiación UV de la zona de la docente, para la pantalla Hoy.
// - La ubicación se guarda solo en este celular (localStorage), nunca en la nube de la app.
// - Datos: Open-Meteo (temperatura, UV, cielo). Nombre de la zona: BigDataCloud (solo recibe coordenadas).
// - Todo falla en silencio: sin internet o sin permiso se ve la última lectura o una invitación a activarlo.
import { html, raw, icon } from './ui.js';

const LLAVE = 'cuaderno-clima';
const VIGENCIA = 30 * 60 * 1000; // minutos que se considera "fresca" una lectura
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
    timezone: 'auto', forecast_days: '1', wind_speed_unit: 'kmh',
  });
  const j = await pedir(`${API}?${q}`);
  const c = j && j.current, d = (j && j.daily) || {};
  if (!c || typeof c.temperature_2m !== 'number') throw new Error('Respuesta sin datos');
  const num = v => (typeof v === 'number' ? v : null);
  return {
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
      e => mal(e), { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 });
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
export function cielo(codigo, dia = true) {
  const c = codigo;
  if (c === 0) return { texto: dia ? 'Despejado' : 'Noche despejada', icono: dia ? 'sol' : 'luna' };
  if (c === 1) return { texto: 'Mayormente despejado', icono: dia ? 'sol' : 'luna' };
  if (c === 2) return { texto: 'Parcialmente nublado', icono: dia ? 'nubesol' : 'nube' };
  if (c === 3) return { texto: 'Nublado', icono: 'nube' };
  if (c === 45 || c === 48) return { texto: 'Neblina', icono: 'niebla' };
  if (c >= 51 && c <= 57) return { texto: 'Llovizna', icono: 'lluvia' };
  if (c === 61 || c === 80) return { texto: 'Lluvia ligera', icono: 'lluvia' };
  if (c === 63 || c === 81) return { texto: 'Lluvia', icono: 'lluvia' };
  if (c === 65 || c === 82 || c === 66 || c === 67) return { texto: 'Lluvia fuerte', icono: 'lluvia' };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { texto: 'Nieve', icono: 'nieve' };
  if (c === 95) return { texto: 'Tormenta eléctrica', icono: 'tormenta' };
  if (c >= 96) return { texto: 'Tormenta con granizo', icono: 'tormenta' };
  return { texto: 'Nublado', icono: 'nube' };
}

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

// ---------- control principal ----------
export function iniciarClima(boton) {
  let est = leer();               // { lugar: {lat, lon, nombre}, datos, t }
  let cargando = false, visible = false, modo = 'datos', msg = '', resultados = [];
  let dlg = null;

  const pintarBoton = () => {
    const d = est.datos;
    if (!est.lugar || !d) {
      boton.innerHTML = `${icon('nubesol', 20)}<span class="clima-t">Clima</span>`;
      boton.setAttribute('aria-label', est.lugar ? 'Clima: no se pudo leer. Toca para ver o reintentar' : 'Activar el clima de tu zona');
    } else {
      const i = cielo(d.codigo, d.dia).icono;
      boton.innerHTML = `${icon(i, 20)}<span class="clima-t">${grados(d.temp)} · UV ${Math.round(d.uv)}</span>`;
      boton.setAttribute('aria-label', `Clima: ${Math.round(d.temp)} grados, radiación UV ${Math.round(d.uv)}, nivel ${nivelUV(d.uv).nombre.toLowerCase()}. Toca para ver detalles`);
    }
    boton.classList.toggle('cargando', cargando && !est.datos);
  };

  async function refrescar(forzar = false) {
    if (!est.lugar || cargando) return false;
    if (!forzar && est.datos && Date.now() - est.t < VIGENCIA) return true;
    cargando = true; pintarBoton(); if (dlg && dlg.open) pintarModal();
    try {
      est = { ...est, datos: await obtenerClima(est.lugar), t: Date.now() };
      guardar(est); msg = '';
      return true;
    } catch {
      msg = est.datos ? 'No hay conexión. Esta es la última lectura guardada.' : 'No pudimos leer el clima ahora. Revisa tu conexión e intenta de nuevo.';
      return false;
    } finally { cargando = false; pintarBoton(); if (dlg && dlg.open) pintarModal(); }
  }

  async function usarMiUbicacion() {
    msg = 'Buscando tu ubicación…'; modo = 'inicio'; pintarModal();
    try {
      const p = await ubicar();
      const nombre = await nombreLugar(p.lat, p.lon);
      est = { lugar: { ...p, nombre }, datos: null, t: 0 }; guardar(est);
      modo = 'datos'; msg = '';
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
    est = { lugar: { lat: r.lat, lon: r.lon, nombre: r.nombre }, datos: null, t: 0 }; guardar(est);
    modo = 'datos'; msg = ''; resultados = [];
    await refrescar(true);
  }

  // ---------- ventana ----------
  const cuerpoDatos = () => {
    const d = est.datos, c = cielo(d.codigo, d.dia), k = consejos(d);
    const celda = (t, v) => v == null ? '' : html`<div class="clima-celda"><span class="clima-celda-t">${t}</span><strong>${v}</strong></div>`;
    return html`
      <div class="clima-grande">
        <span class="clima-ico">${icon(c.icono, 44)}</span>
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
  document.addEventListener('visibilitychange', () => { if (visible && document.visibilityState === 'visible') refrescar(false); });
  pintarBoton();

  return {
    mostrar(v) {
      visible = !!v; boton.hidden = !visible;
      if (visible) { pintarBoton(); refrescar(false); }
    },
  };
}
