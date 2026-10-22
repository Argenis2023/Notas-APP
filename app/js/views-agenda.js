// Pantalla "Agenda": lo que viene en el aula (eventos, entregas, reuniones) junto con las fechas de evaluaciones.
import { getSeccion, create, update, remove } from './data.js';
import { cargarSnapshot } from './analisis.js';
import { TIPOS_EVENTO, tipoEvento, nombreTipoEvento, todosLosEventos, etiquetaDia, rango } from './agenda.js';
import { html, icon, toast } from './ui.js';
import { $, $$, errorBox, mostrarError } from './form.js';

const pad = n => String(n).padStart(2, '0');
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const GRUPOS = [['hoy', 'Hoy'], ['manana', 'Mañana'], ['semana', 'Esta semana'], ['despues', 'Más adelante']];

export async function agenda(ctx) {
  const seccion = await getSeccion();
  if (!seccion) return { title: 'Agenda', html: html`<p class="vacio">Primero crea tu sección en <a class="btn secondary chico" href="#/">Inicio</a>.</p>` };
  const s = await cargarSnapshot(seccion);
  const hoy = hoyIso();
  const todos = todosLosEventos(s, hoy);
  const futuros = todos.filter(e => !e.hecho && rango(e.fecha, hoy) !== 'pasado');
  const hechos = todos.filter(e => e.hecho && rango(e.fecha, hoy) !== 'pasado');
  const anteriores = todos.filter(e => rango(e.fecha, hoy) === 'pasado').reverse().slice(0, 15);

  const fila = e => html`
    <li class="ag-item ag-${e.tipo} ${e.hecho ? 'ag-hecho' : ''}" data-id="${e.id}">
      <p class="ag-cab"><strong>${e.titulo}</strong></p>
      <p class="hint">${[etiquetaDia(e.fecha, hoy), e.hora, e.origen === 'evaluacion' ? e.nota : nombreTipoEvento(e.tipo)].filter(Boolean).join(' · ')}</p>
      ${e.origen === 'agenda' && e.nota ? html`<p class="ag-nota">${e.nota}</p>` : ''}
      <div class="acciones">
        ${e.origen === 'evaluacion' ? html`<a class="btn secondary chico" href="${e.href}">Abrir evaluación</a>` : html`
          <button type="button" class="btn secondary chico ag-hecho-b" data-id="${e.id}" data-hecho="${e.hecho ? '0' : '1'}">${e.hecho ? 'Volver a pendiente' : 'Marcar hecho'}</button>
          <button type="button" class="btn secondary chico ag-borrar" data-id="${e.id}">Eliminar</button>`}
      </div>
    </li>`;

  return {
    title: 'Agenda',
    html: html`
      <section aria-labelledby="ag-t">
        <h2 class="oculto-visual" id="ag-t">Agenda del aula</h2>
        <p class="lead">Anota lo que viene: entregas, reuniones, actividades. Las fechas de tus evaluaciones aparecen solas.</p>
        <form id="f-ag" class="stack" novalidate>
          <div class="field"><label for="ag-titulo">¿Qué es?</label>
            <input id="ag-titulo" name="titulo" type="text" autocomplete="off" placeholder="Por ejemplo: Entregar planificación"></div>
          <div class="field"><label for="ag-fecha">Fecha</label><input id="ag-fecha" name="fecha" type="date" value="${hoy}"></div>
          <div class="field"><label for="ag-hora">Hora (opcional)</label><input id="ag-hora" name="hora" type="time"></div>
          <div class="field"><label for="ag-tipo">Tipo</label>
            <select id="ag-tipo" name="tipo">${TIPOS_EVENTO.map(([id, t]) => html`<option value="${id}">${t}</option>`)}</select></div>
          <div class="field"><label for="ag-nota">Detalle (opcional)</label><textarea id="ag-nota" name="nota" rows="2" placeholder="Por ejemplo: llevar lista de asistencia"></textarea></div>
          ${errorBox('e-ag')}
          <div class="acciones"><button class="btn primary" type="submit">Guardar en la agenda</button></div>
        </form>
      </section>
      ${GRUPOS.map(([id, titulo]) => { const l = futuros.filter(e => rango(e.fecha, hoy) === id); return l.length ? html`<section aria-label="${titulo}"><h2>${titulo}</h2><ul class="ag-lista">${l.map(fila)}</ul></section>` : ''; })}
      ${!futuros.length ? html`<p class="vacio">No hay nada pendiente en la agenda.</p>` : ''}
      ${hechos.length ? html`<details class="ag-mas"><summary>Hechos (${hechos.length})</summary><ul class="ag-lista">${hechos.map(fila)}</ul></details>` : ''}
      ${anteriores.length ? html`<details class="ag-mas"><summary>Anteriores (${anteriores.length})</summary><ul class="ag-lista">${anteriores.map(fila)}</ul></details>` : ''}`,
    mount(root) {
      const form = $('#f-ag', root);
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(form));
        if (!String(d.titulo || '').trim()) { mostrarError(root, 'e-ag', 'Escribe qué quieres anotar.'); $('#ag-titulo', root).focus(); return; }
        if (!d.fecha) { mostrarError(root, 'e-ag', 'Elige la fecha.'); return; }
        await create('agenda', { seccion_id: seccion.id, titulo: d.titulo.trim(), fecha: d.fecha, hora: d.hora || null, tipo: tipoEvento(d.tipo), nota: String(d.nota || '').trim() || null, hecho: false });
        toast('Guardado en la agenda.');
        ctx.refresh();
      });
      $$('.ag-hecho-b', root).forEach(b => b.addEventListener('click', async () => { await update('agenda', b.dataset.id, { hecho: b.dataset.hecho === '1' }); ctx.refresh(); }));
      $$('.ag-borrar', root).forEach(b => b.addEventListener('click', async () => {
        if (b.dataset.paso !== '1') { b.dataset.paso = '1'; b.textContent = 'Toca otra vez para eliminar'; return; }
        await remove('agenda', b.dataset.id);
        const li = b.closest('li'); if (li) li.remove();
        toast('Eliminado.');
      }));
    },
  };
}
