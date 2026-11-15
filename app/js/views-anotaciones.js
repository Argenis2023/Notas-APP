// Pantalla "Anotaciones": escribir una nota rápida sobre un estudiante y ver las recientes.
import { getSeccion, listEstudiantes, list, create, eliminarConDeshacer } from './data.js';
import { TIPOS_EVENTO } from './agenda.js';
import { mensajeIA } from './ia.js';
import { TIPOS, tipoValido, nombreTipo } from './anotaciones.js';
import { html, icon, toast, toastDeshacer, fechaCorta } from './ui.js';
import { $, $$, errorBox, mostrarError } from './form.js';
import { vozDisponible, crearDictado, limpiarDictado, detectarEstudiante, detectarTipo, mensajeVoz, datosDictado, interpretarDictado } from './voz.js';

const pad = n => String(n).padStart(2, '0');
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export async function anotaciones(ctx, query) {
  const seccion = await getSeccion();
  if (!seccion) return { title: 'Anotaciones', html: html`<div class="vacio"><p>Primero crea tu sección.</p><a class="btn primary" href="#/">Ir a Inicio</a></div>` };
  const estudiantes = await listEstudiantes(seccion.id);
  if (!estudiantes.length) return { title: 'Anotaciones', html: html`<div class="vacio"><p>Todavía no hay estudiantes.</p><a class="btn primary" href="#/estudiantes">Agregar estudiantes</a></div>` };
  const q = new URLSearchParams(query || '');
  const elegido = estudiantes.find(e => e.id === q.get('e'));
  const ids = new Set(estudiantes.map(e => e.id));
  const todas = (await list('anotaciones')).filter(a => ids.has(a.estudiante_id) && a.texto)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.created_at).localeCompare(String(a.created_at)));
  const nombre = id => (estudiantes.find(e => e.id === id) || {}).nombre_completo || '';
  const vistas = (elegido ? todas.filter(a => a.estudiante_id === elegido.id) : todas).slice(0, elegido ? 100 : 30);

  return {
    title: 'Anotaciones',
    html: html`
      
      <section aria-labelledby="an-t">
        <h2 class="oculto-visual" id="an-t">Anotaciones rápidas</h2>
        <p class="lead">Anota en segundos algo que pasó con un estudiante. Se suma a su informe del lapso.</p>
        ${vozDisponible() ? html`
        <div class="dictado" id="dictado">
          <div class="acciones"><button type="button" class="btn primary" id="an-voz" aria-pressed="false">${icon('microfono', 20)} <span>Dictar con voz</span></button></div>
          <p class="hint" id="an-voz-ayuda">Cuenta lo que pasó, una incidencia o una reunión por agendar. Se ordena solo y tú lo revisas antes de guardar.</p>
          <p class="dictado-vivo" id="an-vivo" hidden></p>
          <form id="f-prop" class="stack propuesta" hidden novalidate aria-label="Revisar lo dictado">
            <h3 class="grupo-t">Revisa antes de guardar</h3>
            <div class="field"><label for="pr-tipo">Es</label>
              <select id="pr-tipo" name="tipo"><option value="anotacion">Una anotación</option><option value="incidencia">Una incidencia</option><option value="reunion">Una reunión</option></select></div>
            <div class="field" id="pr-f-est"><label for="pr-est">Estudiante</label>
              <select id="pr-est" name="estudiante_id"><option value="">Ninguno</option>${estudiantes.map(e => html`<option value="${e.id}">${e.numero_lista ? e.numero_lista + '. ' : ''}${e.nombre_completo}</option>`)}</select></div>
            <div class="field" id="pr-f-sub"><label for="pr-sub">Tipo de anotación</label>
              <select id="pr-sub" name="subtipo">${TIPOS.filter(x => x[0] !== 'incidencia').map(([id, tx]) => html`<option value="${id}">${tx}</option>`)}</select></div>
            <div class="field" id="pr-f-tit"><label for="pr-tit">Título</label><input id="pr-tit" name="titulo" type="text" autocomplete="off"></div>
            <div class="field"><label for="pr-texto">Texto</label><textarea id="pr-texto" name="texto" rows="4"></textarea></div>
            <div class="field" id="pr-f-fecha"><label for="pr-fecha">Fecha</label><input id="pr-fecha" name="fecha" type="date" value="${hoyIso()}"></div>
            <div class="field" id="pr-f-hora"><label for="pr-hora">Hora (opcional)</label><input id="pr-hora" name="hora" type="time"></div>
            ${errorBox('e-pr')}
            <div class="acciones"><button class="btn primary" type="submit" id="pr-guardar">Guardar</button><button class="btn secondary" type="button" id="pr-descartar">Descartar</button></div>
          </form>
        </div>
        <h3 class="grupo-t">O escríbelo tú</h3>` : ''}
        <form id="f-an" class="stack" novalidate>
          <div class="field"><label for="an-est">Estudiante</label>
            <select id="an-est" name="estudiante_id">
              <option value="">Elige un estudiante</option>
              ${estudiantes.map(e => html`<option value="${e.id}" ${elegido && e.id === elegido.id ? 'selected' : ''}>${e.numero_lista ? e.numero_lista + '. ' : ''}${e.nombre_completo}</option>`)}
            </select></div>
          <fieldset class="so-opciones"><legend>Tipo</legend>
            ${TIPOS.map(([id, texto], i) => html`<label class="check"><input type="radio" name="tipo" value="${id}" ${i === 0 ? 'checked' : ''}> <span>${texto}</span></label>`)}
          </fieldset>
          <div class="field"><label for="an-texto">¿Qué pasó?</label>
            <textarea id="an-texto" name="texto" rows="3" placeholder="Por ejemplo: ayudó a un compañero con la suma; no trajo el material."></textarea></div>
          <div class="field"><label for="an-fecha">Fecha</label><input id="an-fecha" name="fecha" type="date" value="${hoyIso()}"></div>
          ${errorBox('e-an')}
          <div class="acciones"><button class="btn primary" type="submit">Guardar anotación</button></div>
        </form>
      </section>
      <section aria-labelledby="an-l">
        <h2 id="an-l">${elegido ? 'Anotaciones de ' + elegido.nombre_completo : 'Últimas anotaciones'}</h2>
        ${elegido ? html`<p><a class="btn secondary chico" href="#/anotaciones">Ver de todos</a></p>` : ''}
        ${vistas.length ? html`<ul class="an-lista" id="an-lista">${vistas.map(a => html`
          <li class="an-item an-${tipoValido(a.tipo)}" data-id="${a.id}">
            <p class="an-cab"><strong>${elegido ? '' : nombre(a.estudiante_id)}</strong> <span class="hint">${fechaCorta(a.fecha)} · ${nombreTipo(a.tipo)}</span></p>
            <p class="an-texto">${a.texto}</p>
            <div class="acciones"><button type="button" class="btn secondary chico an-borrar" data-id="${a.id}">Eliminar</button></div>
          </li>`)}</ul>` : html`<p class="vacio">Todavía no hay anotaciones${elegido ? ' de este estudiante' : ''}.</p>`}
      </section>`,
    mount(root) {
      const form = $('#f-an', root);
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(form));
        if (!d.estudiante_id) { mostrarError(root, 'e-an', 'Elige a qué estudiante corresponde.'); $('#an-est', root).focus(); return; }
        if (!String(d.texto || '').trim()) { mostrarError(root, 'e-an', 'Escribe qué pasó.'); $('#an-texto', root).focus(); return; }
        await create('anotaciones', { estudiante_id: d.estudiante_id, seccion_id: seccion.id, fecha: d.fecha || hoyIso(), texto: d.texto.trim(), tipo: tipoValido(d.tipo) });
        toast('Anotación guardada.');
        location.hash = `#/anotaciones?e=${d.estudiante_id}&r=${Date.now()}`;
      });
      const bVoz = $('#an-voz', root);
      if (bVoz) {
        const ayuda = $('#an-voz-ayuda', root), vivo = $('#an-vivo', root), prop = $('#f-prop', root);
        let dictado = null, huboError = false, ocupado = false;
        const campos = () => {
          const tipo = $('#pr-tipo', root).value;
          $('#pr-f-sub', root).hidden = tipo !== 'anotacion';
          $('#pr-f-tit', root).hidden = tipo !== 'reunion';
          $('#pr-f-fecha', root).hidden = tipo !== 'reunion';
          $('#pr-f-hora', root).hidden = tipo !== 'reunion';
          $('#pr-f-est', root).querySelector('label').textContent = tipo === 'reunion' ? 'Estudiante (opcional)' : 'Estudiante';
        };
        $('#pr-tipo', root).addEventListener('change', campos);
        const mostrarPropuesta = p => {
          $('#pr-tipo', root).value = p.tipo; $('#pr-est', root).value = p.estudianteId || '';
          $('#pr-sub', root).value = p.subtipo; $('#pr-tit', root).value = p.titulo || '';
          $('#pr-texto', root).value = p.texto; $('#pr-fecha', root).value = p.fecha || hoyIso(); $('#pr-hora', root).value = p.hora || '';
          campos(); prop.hidden = false; $('#pr-texto', root).focus({ preventScroll: false });
        };
        const ordenar = async dicho => {
          ocupado = true; bVoz.disabled = true; ayuda.textContent = 'Ordenando lo que dijiste…';
          const hoy = new Date();
          let p = null, aviso = '';
          if (ctx.iaDisponible && ctx.iaDisponible()) {
            try {
              const { datos, mapa } = datosDictado(dicho, estudiantes, hoy);
              const r = await ctx.ia('dictado', datos);
              p = interpretarDictado(r && r.texto, mapa, hoy);
              if (!p) aviso = 'La IA no pudo ordenarlo. Revisa el texto.';
            } catch (e) { aviso = mensajeIA(e); }
          } else aviso = 'Sin la IA no se puede ordenar solo. Revisa el texto.';
          if (!p) {
            p = { tipo: 'anotacion', subtipo: detectarTipo(dicho), estudianteId: detectarEstudiante(dicho, estudiantes), titulo: '', texto: limpiarDictado(dicho), fecha: hoyIso(), hora: '' };
          }
          ocupado = false; bVoz.disabled = false;
          ayuda.textContent = aviso || 'Revisa lo que entendí y corrige si hace falta.';
          mostrarPropuesta(p);
        };
        const pintarBoton = on => { bVoz.setAttribute('aria-pressed', String(on)); bVoz.classList.toggle('grabando', on); $('span', bVoz).textContent = on ? 'Detener' : 'Dictar con voz'; };
        const crear = () => crearDictado({
          alTexto: (fin, parcial) => { vivo.hidden = false; vivo.textContent = [fin, parcial].filter(Boolean).join(' '); },
          alEstado: on => {
            pintarBoton(on);
            if (on) { huboError = false; prop.hidden = true; vivo.hidden = false; vivo.textContent = ''; ayuda.textContent = 'Escuchando… habla con normalidad.'; return; }
            if (huboError) { vivo.hidden = true; return; }
            const dicho = vivo.textContent.trim();
            vivo.hidden = true;
            if (dicho) ordenar(dicho); else ayuda.textContent = 'No se escuchó nada. Toca Dictar e inténtalo otra vez.';
          },
          alError: c => { huboError = true; ayuda.textContent = mensajeVoz(c); },
        });
        bVoz.addEventListener('click', () => {
          if (ocupado) return;
          if (!dictado) dictado = crear();
          if (!dictado) return;
          if (bVoz.getAttribute('aria-pressed') === 'true') dictado.parar(); else dictado.iniciar();
        });
        $('#pr-descartar', root).addEventListener('click', () => { prop.hidden = true; ayuda.textContent = 'Descartado.'; });
        prop.addEventListener('submit', async ev => {
          ev.preventDefault();
          const d = Object.fromEntries(new FormData(prop));
          const texto = String(d.texto || '').trim();
          if (!texto) { mostrarError(root, 'e-pr', 'Escribe el texto.'); $('#pr-texto', root).focus(); return; }
          if (d.tipo === 'reunion') {
            const titulo = String(d.titulo || '').trim() || texto.slice(0, 60);
            if (!d.fecha) { mostrarError(root, 'e-pr', 'Elige la fecha de la reunión.'); return; }
            await create('agenda', { seccion_id: seccion.id, titulo, fecha: d.fecha, hora: d.hora || null, tipo: 'reunion', nota: texto === titulo ? null : texto, hecho: false });
            toast('Reunión guardada en la agenda.');
            location.hash = '#/agenda';
            return;
          }
          if (!d.estudiante_id) { mostrarError(root, 'e-pr', 'Elige a qué estudiante corresponde.'); $('#pr-est', root).focus(); return; }
          await create('anotaciones', { estudiante_id: d.estudiante_id, seccion_id: seccion.id, fecha: hoyIso(), texto, tipo: d.tipo === 'incidencia' ? 'incidencia' : tipoValido(d.subtipo) });
          toast(d.tipo === 'incidencia' ? 'Incidencia guardada.' : 'Anotación guardada.');
          location.hash = `#/anotaciones?e=${d.estudiante_id}&r=${Date.now()}`;
        });
        window.addEventListener('hashchange', () => { if (dictado) dictado.parar(); }, { once: true });
      }
      $('#an-est', root).addEventListener('change', ev => { location.hash = ev.target.value ? `#/anotaciones?e=${ev.target.value}` : '#/anotaciones'; });
      $$('.an-borrar', root).forEach(b => b.addEventListener('click', async () => {
        const deshacer = await eliminarConDeshacer('anotaciones', b.dataset.id);
        const li = b.closest('li'); if (li) li.hidden = true;
        toastDeshacer('Anotación eliminada.', async () => { await deshacer(); ctx.refresh(); });
      }));
    },
  };
}
