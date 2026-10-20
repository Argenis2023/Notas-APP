// Burbuja de consultas: un chat con preguntas predefinidas sobre un estudiante.
// Responde con los datos del cuaderno (sin IA) y deja ver de dónde salió cada respuesta.
import { getSeccion, listEstudiantes } from './data.js';
import { cargarSnapshot } from './analisis.js';
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
  fab.innerHTML = html`${icon('chat', 26)}<span class="chat-fab-txt">Consultas</span>`.toString();
  const panel = document.createElement('section');
  panel.id = 'chat'; panel.className = 'chat'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Consultas sobre un estudiante');
  panel.innerHTML = html`
    <header class="chat-cab">
      <h2>Consultas</h2>
      <button type="button" class="chat-x" id="chat-cerrar" aria-label="Cerrar consultas">${icon('cerrar', 22)}</button>
    </header>
    <div class="chat-est"><label for="chat-est">Estudiante</label><select id="chat-est"></select></div>
    <div class="chat-msgs" id="chat-msgs" role="log" aria-live="polite"></div>
    <div class="chat-preguntas" id="chat-preguntas" role="group" aria-label="Preguntas sobre el estudiante"></div>
    <div class="chat-pie"><button type="button" class="enlace" id="chat-limpiar">Limpiar conversación</button></div>`.toString();
  shell.append(fab, panel);

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
  const bienvenida = () => {
    msgs.innerHTML = '';
    burbuja('chat-bot', html`<p>Elige un estudiante y toca una pregunta. Respondo con los datos que ya tienes en el cuaderno y te muestro de dónde salió cada respuesta.</p>`);
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
      : html`<p class="hint">Primero agrega estudiantes en <a href="#/estudiantes" data-cerrar>Estudiantes</a>.</p>`.toString();
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
            ${f.enlace ? html`<p><a href="${f.enlace.href}" data-cerrar>${f.enlace.texto}</a></p>` : ''}`)}
          </div>` : ''}`);
    } catch {
      burbuja('chat-bot', html`<p>No pude leer los datos para responder. Inténtalo otra vez.</p>`);
    }
    ocupado = false;
  }

  async function abrir() {
    await cargarEstudiantes(estudianteDeLaRuta());
    if (!msgs.childElementCount) bienvenida();
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
  $('#chat-limpiar', panel).addEventListener('click', bienvenida);
}
