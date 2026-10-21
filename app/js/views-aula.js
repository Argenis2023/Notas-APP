// Pantallas "Para el aula": Diccionario con IA y Pausas activas.
import { getSeccion, getMeta, setMeta } from './data.js';
import { mensajeIA } from './ia.js';
import { limpiarPalabra, claveDePalabra, datosDiccionario, leerRespuesta, enlaceRAE } from './diccionario.js';
import { TIPOS, PAUSAS, filtrarPausas, pausaAlAzar, pausaPorId } from './pausas.js';
import { html, icon, toast } from './ui.js';
import { $, $$, campo, errorBox, mostrarError } from './form.js';

const MAX_HISTORIAL = 30;

// ---------- Diccionario ----------
function respuestaHtml(palabra, r) {
  if (r.noEncontrada) {
    return html`<p>No encontré esa palabra.${r.sugerencia ? html` ¿Quisiste decir <strong>${r.sugerencia}</strong>?` : ''} Revisa cómo está escrita.</p>`;
  }
  return html`
    <h3 class="dic-palabra">${palabra}</h3>
    <dl class="dic-partes">
      <div><dt>Significado</dt><dd>${r.significado}</dd></div>
      ${r.ejemplo ? html`<div><dt>Ejemplo</dt><dd>${r.ejemplo}</dd></div>` : ''}
      ${r.sinonimo ? html`<div><dt>Sinónimo</dt><dd>${r.sinonimo}</dd></div>` : ''}
      ${r.otro ? html`<div><dt>Otro significado</dt><dd>${r.otro}</dd></div>` : ''}
    </dl>
    <p class="hint">Explicado con ayuda de la IA para que lo entiendan los niños. Para la definición oficial, revisa la RAE.</p>
    <p><a class="btn secondary" href="${enlaceRAE(palabra)}" target="_blank" rel="noopener noreferrer">Ver en la RAE</a></p>`;
}

export async function diccionario(ctx) {
  const seccion = await getSeccion();
  const historial = (await getMeta('diccionario', [])) || [];
  return {
    title: 'Diccionario',
    html: html`
      <p><a class="btn secondary chico volver" href="#/">${icon('atras', 18)} Inicio</a></p>
      <section aria-labelledby="dic-t">
        <h2 id="dic-t">Diccionario para el aula</h2>
        <p>Escribe una palabra y la IA te la explica con frases simples, un ejemplo y un sinónimo.${seccion && seccion.grado ? ` Se adapta a ${seccion.grado}.` : ''}</p>
        <form id="f-dic" class="stack" novalidate autocomplete="off">
          ${campo({ id: 'dic_palabra', label: 'Palabra', placeholder: 'Por ejemplo: curioso', extra: 'maxlength="40" autocapitalize="none" autocorrect="off" spellcheck="false"' })}
          ${errorBox('e-dic')}
          <button class="btn primary" type="submit" id="b-dic">Buscar y explicar</button>
        </form>
        <div id="dic-res" class="dic-res" aria-live="polite" tabindex="-1"></div>
      </section>
      <section aria-labelledby="dic-h" id="dic-hist-w" ${historial.length ? '' : 'hidden'}>
        <h2 id="dic-h">Palabras que ya buscaste</h2>
        <p class="hint">Se guardan solo en este celular (no en la nube) y se pueden ver sin internet.</p>
        <div class="chips" id="dic-hist">${historial.map(h => html`<button type="button" class="chip-b" data-p="${h.p}">${h.p}</button>`)}</div>
        <p><button type="button" class="btn secondary" id="b-dic-borrar">Borrar historial</button></p>
      </section>`,
    mount(root) {
      const res = $('#dic-res', root), inp = $('#dic_palabra', root), btn = $('#b-dic', root);
      let lista = historial.slice();
      const pintarHist = () => {
        $('#dic-hist-w', root).hidden = !lista.length;
        $('#dic-hist', root).innerHTML = lista.map(h => html`<button type="button" class="chip-b" data-p="${h.p}">${h.p}</button>`.toString()).join('');
      };
      const mostrar = (palabra, texto) => {
        res.innerHTML = respuestaHtml(palabra, leerRespuesta(texto)).toString();
        res.focus({ preventScroll: true });
      };
      async function buscar(crudo) {
        const palabra = limpiarPalabra(crudo);
        mostrarError(root, 'e-dic', '');
        if (palabra.length < 2) { mostrarError(root, 'e-dic', 'Escribe una palabra de al menos 2 letras.'); return; }
        const clave = claveDePalabra(palabra);
        const previo = lista.find(h => h.k === clave);
        if (previo) { mostrar(previo.p, previo.texto); return; }
        if (!ctx.iaDisponible || !ctx.iaDisponible()) { mostrarError(root, 'e-dic', 'La IA necesita internet y la cuenta con respaldo activada. Las palabras que ya buscaste se ven sin conexión.'); return; }
        btn.disabled = true; btn.textContent = 'Buscando…';
        res.innerHTML = '';
        try {
          const r = await ctx.ia('diccionario', datosDiccionario(palabra, seccion && seccion.grado));
          const texto = String(r.texto || '').trim();
          mostrar(palabra, texto);
          if (!leerRespuesta(texto).noEncontrada) {
            lista = [{ k: clave, p: palabra, texto }, ...lista].slice(0, MAX_HISTORIAL);
            await setMeta('diccionario', lista);
            pintarHist();
          }
        } catch (err) {
          const c = err && err.codigo;
          mostrarError(root, 'e-dic', c === 'tipo' || c === 'no_desplegada' ? 'La función de IA en Supabase no tiene todavía el diccionario. Hay que actualizarla con el archivo nuevo.' : mensajeIA(err));
        }
        btn.disabled = false; btn.textContent = 'Buscar y explicar';
      }
      $('#b-dic-borrar', root).addEventListener('click', async () => {
        lista = [];
        await setMeta('diccionario', []);
        pintarHist();
        res.innerHTML = '';
        toast('Historial borrado');
      });
      $('#f-dic', root).addEventListener('submit', ev => { ev.preventDefault(); buscar(inp.value); });
      $('#dic-hist', root).addEventListener('click', ev => {
        const b = ev.target.closest('[data-p]');
        if (b) { inp.value = b.dataset.p; buscar(b.dataset.p); }
      });
    },
  };
}

// ---------- Pausas activas ----------
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
let reloj = null;
let candado = null;
const detenerReloj = () => {
  if (reloj) { clearInterval(reloj); reloj = null; }
  if (candado) { try { candado.release(); } catch { /* ya liberado */ } candado = null; }
};

// Sonido con Web Audio (sin archivos). El contexto se crea al tocar "Empezar", que es cuando el navegador permite sonar.
let audio = null;
function prepararAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === 'suspended') audio.resume();
  } catch { audio = null; }
}
function tono(frec, inicio, dur, vol = 0.35) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'sine'; o.frequency.value = frec;
  const t0 = audio.currentTime + inicio;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(audio.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
export function sonarFin() { if (!audio) return; try { [660, 880, 1175].forEach((f, i) => tono(f, i * 0.28, 0.5)); tono(1175, 0.9, 0.9); } catch { /* sin sonido */ } }
export function tic(ultimos) { if (!audio) return; try { tono(ultimos ? 1320 : 1000, 0, 0.07, ultimos ? 0.3 : 0.18); } catch { /* sin sonido */ } }
function sonarInicio() { if (!audio) return; try { tono(880, 0, 0.25); } catch { /* sin sonido */ } }

function fichaPausa(p, sonido = true) {
  return html`
    <article class="pausa" aria-labelledby="pa-t">
      <h3 id="pa-t">${p.titulo}</h3>
      <p class="hint">${TIPOS.find(t => t.id === p.tipo).texto} · unos ${p.min} minutos</p>
      <ol class="pausa-pasos">${p.pasos.map(x => html`<li>${x}</li>`)}</ol>
      <div class="pausa-reloj" role="timer" aria-live="off"><span id="pa-tiempo" class="pa-tiempo">${mmss(p.min * 60)}</span></div>
      <label class="pa-sonido"><input type="checkbox" id="pa-sonido" ${sonido ? 'checked' : ''}> Sonido</label>
      <div class="acciones">
        <button type="button" class="btn primary" id="pa-inicio">Empezar</button>
        <button type="button" class="btn secondary" id="pa-reiniciar">Reiniciar</button>
      </div>
    </article>`;
}

export async function pausas(ctx, query) {
  const q = new URLSearchParams(query || '');
  const tipo = TIPOS.some(t => t.id === q.get('t')) ? q.get('t') : 'todas';
  const inicial = pausaPorId(q.get('p')) || null;
  let conSonido = (await getMeta('pausa-sonido', true)) !== false;
  return {
    title: 'Pausa activa',
    html: html`
      <p><a class="btn secondary chico volver" href="#/">${icon('atras', 18)} Inicio</a></p>
      <section aria-labelledby="pa-h">
        <h2 id="pa-h">Pausa activa</h2>
        <p>Actividades cortas para despertar o calmar al curso. Funcionan sin internet.</p>
        <nav class="lapso-tabs" aria-label="Tipo de pausa">${TIPOS.map(t => html`<a href="#/aula/pausas?t=${t.id}" ${t.id === tipo ? html`aria-current="page"` : ''}>${t.texto}</a>`)}</nav>
        <div class="acciones"><button type="button" class="btn primary" id="pa-azar">${icon('pausa', 20)} Sorpréndeme</button></div>
        <div id="pa-ficha" aria-live="polite">${inicial ? fichaPausa(inicial, conSonido) : ''}</div>
      </section>
      <section aria-labelledby="pa-l">
        <h2 id="pa-l">Todas las actividades</h2>
        <ul class="hoja">${filtrarPausas(tipo).map(p => html`
          <li><button type="button" class="fila fila-btn" data-p="${p.id}">
            <span class="margen">${p.min}'</span>
            <span class="fila-texto"><span class="fila-nombre">${p.titulo}</span><span class="fila-sub">${TIPOS.find(t => t.id === p.tipo).texto}</span></span>
          </button></li>`)}</ul>
      </section>`,
    mount(root) {
      detenerReloj();
      const ficha = $('#pa-ficha', root);
      let actual = inicial;
      const poner = p => {
        detenerReloj();
        actual = p;
        ficha.innerHTML = fichaPausa(p, conSonido).toString();
        $('#pa-sonido', ficha).addEventListener('change', async ev => { conSonido = ev.target.checked; await setMeta('pausa-sonido', conSonido); if (conSonido) { prepararAudio(); sonarInicio(); } });
        ficha.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const tiempo = $('#pa-tiempo', ficha), inicio = $('#pa-inicio', ficha);
        let resto = p.min * 60, corriendo = false;
        const parar = () => { detenerReloj(); corriendo = false; inicio.textContent = resto === 0 ? 'Empezar de nuevo' : 'Seguir'; };
        inicio.addEventListener('click', () => {
          if (corriendo) { parar(); inicio.textContent = 'Seguir'; return; }
          if (resto === 0) { resto = p.min * 60; tiempo.textContent = mmss(resto); tiempo.classList.remove('fin'); }
          corriendo = true; inicio.textContent = 'Pausar';
          if (conSonido) { prepararAudio(); sonarInicio(); }
          try { if (navigator.wakeLock && !candado) navigator.wakeLock.request('screen').then(w => { candado = w; }).catch(() => {}); } catch { /* sin bloqueo de pantalla */ }
          reloj = setInterval(() => {
            if (!document.body.contains(tiempo)) { detenerReloj(); return; }
            resto -= 1; tiempo.textContent = mmss(resto);
            if (conSonido && resto > 0) tic(resto <= 3);
            if (resto <= 0) {
              parar(); tiempo.classList.add('fin'); tiempo.textContent = '¡Listo!';
              if (conSonido) sonarFin();
              try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch { /* sin vibración */ }
              toast('Terminó la pausa activa');
            }
          }, 1000);
        });
        $('#pa-reiniciar', ficha).addEventListener('click', () => poner(p));
      };
      if (inicial) poner(inicial);
      $('#pa-azar', root).addEventListener('click', () => poner(pausaAlAzar(tipo, actual && actual.id)));
      $$('.fila-btn', root).forEach(b => b.addEventListener('click', () => poner(pausaPorId(b.dataset.p))));
    },
  };
}
