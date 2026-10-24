// Burbuja de consultas: un chat con preguntas predefinidas sobre un estudiante.
// Responde con los datos del cuaderno (sin IA) y deja ver de dónde salió cada respuesta.
import { getSeccion, listEstudiantes, lapsoActual, bus } from './data.js';
import { cargarSnapshot, enRiesgo } from './analisis.js';
import { PREGUNTAS, responder, primerNombre } from './consultas.js';
import { html, icon } from './ui.js';
import { $ } from './form.js';

// Estudiante al que se refiere la pantalla actual, si la hay.
function estudianteDeLaRuta() {
  const h = location.hash || '';
  const m = h.match(/^#\/estudiantes\/([^/?]+)$/) || h.match(/^#\/reportes\/e\/([^/?]+)/);
  if (m && m[1] !== 'nuevo' && m[1] !== 'importar') return m[1];
  const q = h.match(/[?&]e=([^&]+)/);
  return q ? q[1] : null;
}

export function montarChat() {
  const shell = $('#shell');
  if (!shell || $('#chat-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'chat-fab'; fab.type = 'button'; fab.className = 'chat-fab';
  fab.setAttribute('aria-label', 'Abrir consultas sobre un estudiante');
  fab.setAttribute('aria-expanded', 'false');
  // Al abrir la app, una manito "toca" el botón y un globo invita a preguntar. Se repite hasta que se abran las consultas.
  fab.innerHTML = html`${icon('chat', 26)}<span class="chat-fab-txt">Consultas</span><span class="chat-punto" hidden></span><span class="chat-globo" aria-hidden="true">Pregúntame por un estudiante</span><span class="chat-mano" aria-hidden="true">${icon('mano', 30)}</span>`.toString();
  fab.classList.add('llama');
  const panel = document.createElement('section');
  panel.id = 'chat'; panel.className = 'chat'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Consultas sobre un estudiante');
  panel.innerHTML = html`
    <header class="chat-cab">
      <h2>Consultas</h2>
      <button type="button" class="chat-limpiar" id="chat-limpiar" aria-label="Limpiar la conversación">${icon('limpiar', 18)} Limpiar</button>
      <button type="button" class="chat-x" id="chat-cerrar" aria-label="Cerrar consultas">${icon('cerrar', 22)}</button>
    </header>
    <div class="chat-est"><label for="chat-est">Estudiante</label><select id="chat-est"></select></div>
    <div class="chat-msgs" id="chat-msgs" role="log" aria-live="polite"></div>
    <div class="chat-preguntas" id="chat-preguntas" role="group" aria-label="Preguntas sobre el estudiante"></div>`.toString();
  shell.append(fab, panel);

  // Al bajar por la pantalla el botón se encoge a solo el ícono para no tapar el contenido;
  // al volver arriba recupera la palabra "Consultas".
  const ajustarTamano = () => fab.classList.toggle('mini', (window.scrollY || document.documentElement.scrollTop || 0) > 48);
  window.addEventListener('scroll', ajustarTamano, { passive: true });
  window.addEventListener('hashchange', () => setTimeout(ajustarTamano, 60));
  ajustarTamano();

  const msgs = $('#chat-msgs', panel), sel = $('#chat-est', panel), pregs = $('#chat-preguntas', panel);
  let estudiantes = [];
  let ocupado = false;

  const burbuja = (clase, contenido) => {
    const d = document.createElement('div');
    d.className = `chat-b ${clase}`;
    d.innerHTML = contenido.toString();
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  };
  // Estudiantes que necesitan apoyo en el lapso actual: se muestran como puntito rojo en el botón y en la bienvenida.
  let apoyo = [];
  async function actualizarAlerta() {
    try {
      const seccion = await getSeccion();
      if (!seccion) { apoyo = []; } else {
        const s = await cargarSnapshot(seccion);
        const l = lapsoActual(s.lapsos) || s.lapsos[0];
        apoyo = l ? enRiesgo(s, l.id).map(r => primerNombre(r.estudiante)) : [];
      }
    } catch { apoyo = []; }
    const punto = $('.chat-punto', fab);
    punto.hidden = apoyo.length === 0;
    punto.textContent = apoyo.length ? String(apoyo.length) : '';
    fab.setAttribute('aria-label', apoyo.length ? `Abrir consultas sobre un estudiante. ${apoyo.length} ${apoyo.length === 1 ? 'estudiante necesita' : 'estudiantes necesitan'} apoyo` : 'Abrir consultas sobre un estudiante');
  }
  let tAlerta;
  bus.addEventListener('change', () => { clearTimeout(tAlerta); tAlerta = setTimeout(actualizarAlerta, 600); });
  actualizarAlerta();
  const bienvenida = (preferido = null) => {
    msgs.innerHTML = '';
    burbuja('chat-bot', html`<p>Elige un estudiante y toca una pregunta. Respondo con los datos que ya tienes en el cuaderno y te muestro de dónde salió cada respuesta.</p>`);
    const e = preferido && estudiantes.find(x => x.id === preferido);
    if (e) burbuja('chat-bot', html`<p>Ya elegí a <strong>${primerNombre(e)}</strong> porque estás en su pantalla. Si quieres otro estudiante, cámbialo arriba.</p>`);
    if (apoyo.length) burbuja('chat-bot', html`<p>Ojo: ${apoyo.length === 1 ? 'necesita apoyo' : 'necesitan apoyo'} ${apoyo.slice(0, 4).join(', ')}${apoyo.length > 4 ? ` y ${apoyo.length - 4} más` : ''} en este lapso.</p>`);
  };

  async function cargarEstudiantes(preferido) {
    const seccion = await getSeccion();
    estudiantes = seccion ? await listEstudiantes(seccion.id) : [];
    const actual = preferido || sel.value;
    sel.innerHTML = estudiantes.map(e => html`<option value="${e.id}">${e.numero_lista ? `${e.numero_lista}. ` : ''}${e.nombre_completo}</option>`.toString()).join('');
    if (estudiantes.some(e => e.id === actual)) sel.value = actual;
    const hay = estudiantes.length > 0;
    sel.disabled = !hay;
    pregs.innerHTML = hay
      ? PREGUNTAS.map(p => html`<button type="button" class="chat-q" data-q="${p.id}">${p.corta}</button>`.toString()).join('')
      : html`<p class="hint">Primero agrega estudiantes.</p><div class="acciones"><a class="btn secondary" href="#/estudiantes" data-cerrar>Ir a Estudiantes</a></div>`.toString();
  }

  async function preguntar(id) {
    if (ocupado) return;
    const e = estudiantes.find(x => x.id === sel.value);
    const p = PREGUNTAS.find(x => x.id === id);
    if (!e || !p) return;
    ocupado = true;
    burbuja('chat-yo', html`<p>${p.texto(primerNombre(e))}</p>`);
    try {
      const seccion = await getSeccion();
      const s = await cargarSnapshot(seccion);
      const est = s.estudiantes.find(x => x.id === e.id) || e;
      const r = responder(id, s, est);
      const n = msgs.querySelectorAll('.chat-bot').length;
      const idf = `chat-fuente-${Date.now()}-${n}`;
      const fuentes = r.fuentes || [];
      burbuja('chat-bot', html`
        <p>${r.texto}</p>
        ${fuentes.length ? html`
          <button type="button" class="chat-ver" aria-expanded="false" aria-controls="${idf}">Ver de dónde salió</button>
          <div class="chat-fuente" id="${idf}" hidden>${fuentes.map(f => html`
            <h3>${f.titulo}</h3>
            <ul>${(f.lineas || []).map(l => html`<li>${l}</li>`)}</ul>
            ${f.enlace ? html`<p><a class="btn secondary chico" href="${f.enlace.href}" data-cerrar>${f.enlace.texto}</a></p>` : ''}`)}
          </div>` : ''}`);
    } catch {
      burbuja('chat-bot', html`<p>No pude leer los datos para responder. Inténtalo otra vez.</p>`);
    }
    ocupado = false;
  }

  async function abrir() {
    fab.classList.remove('llama');
    const mano = fab.querySelector('.chat-mano'), globo = fab.querySelector('.chat-globo');
    if (mano) mano.remove();
    if (globo) globo.remove();
    const preferido = estudianteDeLaRuta();
    await cargarEstudiantes(preferido);
    await actualizarAlerta();
    if (!msgs.childElementCount) bienvenida(preferido);
    else if (preferido && sel.value === preferido) { const e = estudiantes.find(x => x.id === preferido); if (e) burbuja('chat-nota', html`<p>Elegí a ${primerNombre(e)} porque estás en su pantalla.</p>`); }
    panel.hidden = false;
    fab.hidden = true;
    fab.setAttribute('aria-expanded', 'true');
    ($('.chat-q', panel) || $('#chat-cerrar', panel)).focus();
  }
  function cerrar() {
    panel.hidden = true;
    fab.hidden = false;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }

  fab.addEventListener('click', abrir);
  $('#chat-cerrar', panel).addEventListener('click', cerrar);
  panel.addEventListener('keydown', ev => { if (ev.key === 'Escape') cerrar(); });
  sel.addEventListener('change', () => {
    const e = estudiantes.find(x => x.id === sel.value);
    if (e) burbuja('chat-nota', html`<p>Ahora consultas sobre ${e.nombre_completo}.</p>`);
  });
  pregs.addEventListener('click', ev => {
    const b = ev.target.closest('.chat-q');
    if (b) preguntar(b.dataset.q);
    if (ev.target.closest('[data-cerrar]')) cerrar();
  });
  msgs.addEventListener('click', ev => {
    const ver = ev.target.closest('.chat-ver');
    if (ver) {
      const f = document.getElementById(ver.getAttribute('aria-controls'));
      const abierto = ver.getAttribute('aria-expanded') === 'true';
      ver.setAttribute('aria-expanded', abierto ? 'false' : 'true');
      ver.textContent = abierto ? 'Ver de dónde salió' : 'Ocultar fuentes';
      if (f) f.hidden = abierto;
      msgs.scrollTop = msgs.scrollHeight;
      return;
    }
    if (ev.target.closest('[data-cerrar]')) cerrar();
  });
  $('#chat-limpiar', panel).addEventListener('click', () => bienvenida(estudianteDeLaRuta()));
}
