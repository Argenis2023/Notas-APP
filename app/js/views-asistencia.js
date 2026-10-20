// Asistencia: pasar lista por día y resumen por lapso.
import { getSeccion, getLapsos, lapsoActual, listEstudiantes, list, guardarConId, idPar } from './data.js';
import { cargarSnapshot, ESTADOS_ASIST, resumenAsistencia } from './analisis.js';
import { html, raw, icon, toast, fechaLarga, fechaCorta } from './ui.js';
import { $, $$ } from './form.js';

const sinSeccion = () => ({ title: 'Asistencia', html: html`<p class="vacio">Primero crea tu sección en <a href="#/">Inicio</a>.</p>` });
const pad = n => String(n).padStart(2, '0');
export const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fechaValida = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '') && !Number.isNaN(Date.parse(f + 'T00:00:00Z'));
// Mueve la fecha de a un día hábil (salta sábado y domingo).
export function diaHabil(iso, paso) {
  const d = new Date(iso + 'T00:00:00Z');
  do { d.setUTCDate(d.getUTCDate() + paso); } while ([0, 6].includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}
const esFinDeSemana = iso => [0, 6].includes(new Date(iso + 'T00:00:00Z').getUTCDay());

const botones = (actual, est) => html`
  <div class="niveles niveles-cortos" role="group" aria-label="Asistencia">${ESTADOS_ASIST.map(n => html`
    <button type="button" class="niv asi-${n.id}" data-est="${est}" data-estado="${n.id}" aria-pressed="${actual === n.id ? 'true' : 'false'}" aria-label="${n.nombre}" title="${n.nombre}">${n.letra}</button>`)}
  </div>`;

export async function asistenciaDia(ctx, q) {
  const seccion = await getSeccion();
  if (!seccion) return sinSeccion();
  const estudiantes = await listEstudiantes(seccion.id);
  if (!estudiantes.length) return { title: 'Asistencia', html: html`<p class="vacio">Primero agrega a tus estudiantes en <a href="#/estudiantes">Estudiantes</a>.</p>` };
  const pedido = new URLSearchParams(q || '').get('f');
  const fecha = fechaValida(pedido) ? pedido : hoyIso();
  const ids = new Set(estudiantes.map(e => e.id));
  const estado = {};
  for (const a of await list('asistencia')) if (a.fecha === fecha && ids.has(a.estudiante_id) && a.estado) estado[a.estudiante_id] = a.estado;
  const base = '#/asistencia';
  const lapsos = await getLapsos(seccion.id);
  const lapso = lapsos.find(l => l.fecha_inicio && l.fecha_fin && fecha >= l.fecha_inicio && fecha <= l.fecha_fin) || lapsoActual(lapsos);

  return {
    title: 'Asistencia',
    html: html`
      <nav class="pager pager-dia" aria-label="Día">
        <a class="btn secondary chico" href="${base}?f=${diaHabil(fecha, -1)}">${icon('atras', 18)} Anterior</a>
        <span class="pager-n"><label class="oculto-visual" for="f-dia">Fecha</label><input id="f-dia" class="dia-input" type="date" value="${fecha}"></span>
        <a class="btn secondary chico" href="${base}?f=${diaHabil(fecha, 1)}">Siguiente <span class="gira">${icon('atras', 18)}</span></a>
      </nav>
      <p class="dia-titulo">${fechaLarga(fecha)}${fecha === hoyIso() ? ' (hoy)' : ''}</p>
      ${esFinDeSemana(fecha) ? html`<p class="hint">Este día cae en fin de semana. Cámbialo si hubo clases.</p>` : ''}
      <p class="progreso" id="resumen-dia" aria-live="polite"></p>
      <div class="acciones"><button type="button" class="btn secondary chico" id="b-todos-asist">Marcar a todos como asistió</button></div>
      <p class="leyenda-niv">A Asistió · I Faltó · J Falta justificada</p>
      <ol class="cotejo-lista cotejo-denso">${estudiantes.map(e => html`
        <li class="cotejo-fila" data-fila="${e.id}">
          <p class="cotejo-nombre">${e.numero_lista ? html`<span class="cotejo-num">${e.numero_lista}</span>` : ''}${e.nombre_completo}</p>
          ${botones(estado[e.id], e.id)}
        </li>`)}</ol>
      <p><a href="#/asistencia/resumen${lapso ? `?l=${lapso.numero}` : ''}">Ver el resumen del lapso</a></p>`,
    mount(root) {
      const resumen = () => {
        const c = { presente: 0, ausente: 0, justificado: 0 };
        for (const e of estudiantes) if (estado[e.id]) c[estado[e.id]]++;
        const sin = estudiantes.length - c.presente - c.ausente - c.justificado;
        $('#resumen-dia', root).textContent = sin === estudiantes.length ? 'Todavía no pasas lista este día.'
          : `Asistieron ${c.presente} · Faltaron ${c.ausente} · Justificadas ${c.justificado}${sin ? ` · Sin marcar ${sin}` : ''}`;
      };
      const pintar = (li, v) => $$('.niv', li).forEach(b => b.setAttribute('aria-pressed', b.dataset.estado === v ? 'true' : 'false'));
      const guardar = (est, v) => guardarConId('asistencia', idPar(est, fecha), { estudiante_id: est, fecha, estado: v || null });

      $('#f-dia', root).addEventListener('change', e => { if (fechaValida(e.target.value)) ctx.go(`${base}?f=${e.target.value}`); });
      $('.cotejo-lista', root).addEventListener('click', async ev => {
        const b = ev.target.closest('.niv');
        if (!b) return;
        const est = b.dataset.est;
        const nuevo = estado[est] === b.dataset.estado ? null : b.dataset.estado;
        if (nuevo) estado[est] = nuevo; else delete estado[est];
        pintar(b.closest('.cotejo-fila'), nuevo);
        resumen();
        await guardar(est, nuevo);
      });
      $('#b-todos-asist', root).addEventListener('click', async () => {
        const faltan = estudiantes.filter(e => !estado[e.id]);
        for (const e of faltan) { estado[e.id] = 'presente'; pintar($(`[data-fila="${e.id}"]`, root), 'presente'); }
        resumen();
        for (const e of faltan) await guardar(e.id, 'presente');
        toast('Listo. Cambia solo a quien faltó.');
      });
      resumen();
    },
  };
}

export async function asistenciaResumen(ctx, q) {
  const seccion = await getSeccion();
  if (!seccion) return sinSeccion();
  const s = await cargarSnapshot(seccion);
  const num = parseInt(new URLSearchParams(q || '').get('l'), 10);
  const lapso = s.lapsos.find(l => l.numero === num) || lapsoActual(s.lapsos);
  if (!lapso) return { title: 'Asistencia', html: html`<p class="vacio">Todavía no hay lapsos.</p>` };
  const filas = s.estudiantes.map(e => ({ e, r: resumenAsistencia(s, lapso, e.id) }));
  const dias = filas[0]?.r.dias || 0;
  const ordenadas = [...filas].sort((a, b) => b.r.faltas - a.r.faltas || (a.e.numero_lista ?? 1e9) - (b.e.numero_lista ?? 1e9));
  return {
    title: 'Asistencia',
    html: html`
      <p><a class="volver" href="#/asistencia">${icon('atras', 18)} Pasar lista</a></p>
      ${s.lapsos.length > 1 ? html`<nav class="lapso-tabs" aria-label="Lapso">${s.lapsos.map(l => html`
        <a href="#/asistencia/resumen?l=${l.numero}" ${l.id === lapso.id ? raw('aria-current="page"') : ''}>Lapso ${l.numero}</a>`)}</nav>` : ''}
      ${dias ? html`
        <p class="lapso-linea">${dias === 1 ? '1 día con lista' : `${dias} días con lista`} en el lapso ${lapso.numero}. Ordenado por más faltas.</p>
        <table class="tabla">
          <thead><tr><th scope="col">Estudiante</th><th scope="col">Faltas</th><th scope="col">Justif.</th><th scope="col">Asistencia</th></tr></thead>
          <tbody>${ordenadas.map(({ e, r }) => html`<tr>
            <th scope="row">${e.nombre_completo}</th><td class="${r.faltas ? 'nota-baja' : ''}">${r.faltas}</td><td>${r.justificadas}</td><td class="${r.pct !== null && r.pct < 80 ? 'nota-baja' : ''}">${r.pct === null ? '–' : r.pct + '%'}</td></tr>`)}</tbody>
        </table>
        <p class="hint">Asistencia es el porcentaje de días con lista en que el estudiante asistió. Se marca en rojo por debajo de 80%.</p>`
        : html`<p class="vacio">Todavía no has pasado lista en este lapso. <a href="#/asistencia">Pasar lista de hoy</a></p>`}`,
  };
}
