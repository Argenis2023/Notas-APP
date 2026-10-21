// Pantalla "Anotaciones": escribir una nota rápida sobre un estudiante y ver las recientes.
import { getSeccion, listEstudiantes, list, create, remove } from './data.js';
import { TIPOS, tipoValido, nombreTipo } from './anotaciones.js';
import { html, icon, toast, fechaCorta } from './ui.js';
import { $, $$, errorBox, mostrarError } from './form.js';

const pad = n => String(n).padStart(2, '0');
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export async function anotaciones(ctx, query) {
  const seccion = await getSeccion();
  if (!seccion) return { title: 'Anotaciones', html: html`<p class="vacio">Primero crea tu sección en <a href="#/">Inicio</a>.</p>` };
  const estudiantes = await listEstudiantes(seccion.id);
  if (!estudiantes.length) return { title: 'Anotaciones', html: html`<p><a href="#/">Inicio</a></p><p class="vacio">Todavía no hay estudiantes. <a href="#/estudiantes">Agrégalos</a> para poder anotar.</p>` };
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
      <p><a href="#/">Inicio</a></p>
      <section aria-labelledby="an-t">
        <h2 id="an-t">Anotaciones rápidas</h2>
        <p>Anota en segundos algo que pasó con un estudiante. Se suma a su informe del lapso.</p>
        <form id="f-an" class="stack" novalidate>
          <div class="field"><label for="an-est">Estudiante</label>
            <select id="an-est" name="estudiante_id">
              <option value="">Elige un estudiante</option>
              ${estudiantes.map(e => html`<option value="${e.id}" ${elegido && e.id === elegido.id ? 'selected' : ''}>${e.numero_lista ? e.numero_lista + '. ' : ''}${e.nombre_completo}</option>`)}
            </select></div>
          <fieldset class="so-opciones"><legend>Tipo</legend>
            ${TIPOS.map(([id, texto], i) => html`<label class="check"><input type="radio" name="tipo" value="${id}" ${i === 0 ? 'checked' : ''}> <span>${texto}</span></label>`)}
          </fieldset>
          <div class="field"><label for="an-texto">Qué pasó</label>
            <textarea id="an-texto" name="texto" rows="3" placeholder="Por ejemplo: ayudó a un compañero con la suma; no trajo el material."></textarea></div>
          <div class="field"><label for="an-fecha">Fecha</label><input id="an-fecha" name="fecha" type="date" value="${hoyIso()}"></div>
          ${errorBox('e-an')}
          <div class="acciones"><button class="btn primary" type="submit">Guardar anotación</button></div>
        </form>
      </section>
      <section aria-labelledby="an-l">
        <h2 id="an-l">${elegido ? 'Anotaciones de ' + elegido.nombre_completo : 'Últimas anotaciones'}</h2>
        ${elegido ? html`<p><a href="#/anotaciones">Ver de todos</a></p>` : ''}
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
      $('#an-est', root).addEventListener('change', ev => { location.hash = ev.target.value ? `#/anotaciones?e=${ev.target.value}` : '#/anotaciones'; });
      $$('.an-borrar', root).forEach(b => b.addEventListener('click', async () => {
        if (b.dataset.paso !== '1') { b.dataset.paso = '1'; b.textContent = 'Toca otra vez para eliminar'; return; }
        await remove('anotaciones', b.dataset.id);
        const li = b.closest('li'); if (li) li.remove();
        toast('Anotación eliminada.');
      }));
    },
  };
}
