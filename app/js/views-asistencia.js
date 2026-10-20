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
  if (!fechaValida(pedido)) return asistenciaCurso(ctx, q, estudiantes);
  const fecha = pedido;
  const ids = new Set(estudiantes.map(e => e.id));
  const estado = {};
  for (const a of await list('asistencia')) if (a.fecha === fecha && ids.has(a.estudiante_id) && a.estado) estado[a.estudiante_id] = a.estado;
  const base = '#/asistencia';
  const lapsos = await getLapsos(seccion.id);
  const lapso = lapsos.find(l => l.fecha_inicio && l.fecha_fin && fecha >= l.fecha_inicio && fecha <= l.fecha_fin) || lapsoActual(lapsos);

  return {
    title: 'Asistencia',
    html: html`
      <p><a class="volver" href="#/asistencia?m=${fecha.slice(0, 7)}">${icon('atras', 18)} Calendario</a></p>
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
      <p><a href="#/asistencia/resumen${lapso ? `?l=${lapso.numero}` : ''}">Ver el resumen del lapso</a> · <a href="#/asistencia/calendario">Ver el calendario de un estudiante</a></p>`,
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
            <th scope="row"><a href="#/asistencia/calendario?e=${e.id}">${e.nombre_completo}</a></th><td class="${r.faltas ? 'nota-baja' : ''}">${r.faltas}</td><td>${r.justificadas}</td><td class="${r.pct !== null && r.pct < 80 ? 'nota-baja' : ''}">${r.pct === null ? '–' : r.pct + '%'}</td></tr>`)}</tbody>
        </table>
        <p class="hint">Asistencia es el porcentaje de días con lista en que el estudiante asistió. Se marca en rojo por debajo de 80%. Toca un nombre para ver su calendario.</p>`
        : html`<p class="vacio">Todavía no has pasado lista en este lapso. <a href="#/asistencia">Pasar lista de hoy</a></p>`}`,
  };
}

// ---------- calendario por estudiante ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_CORTOS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const mesAnterior = (y, m) => (m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`);
const mesSiguiente = (y, m) => (m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`);
const LETRA = { presente: 'A', ausente: 'I', justificado: 'J' };
const NOMBRE = Object.fromEntries(ESTADOS_ASIST.map(e => [e.id, e.nombre]));

export async function asistenciaCalendario(ctx, q) {
  const seccion = await getSeccion();
  if (!seccion) return sinSeccion();
  const s = await cargarSnapshot(seccion);
  if (!s.estudiantes.length) return { title: 'Asistencia', html: html`<p class="vacio">Primero agrega a tus estudiantes en <a href="#/estudiantes">Estudiantes</a>.</p>` };
  const p = new URLSearchParams(q || '');
  const est = s.estudiantes.find(e => e.id === p.get('e')) || s.estudiantes[0];
  const hoy = hoyIso();
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(p.get('m') || '') ? p.get('m') : hoy.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const marcas = {};
  for (const a of s.asistencia) if (a.estudiante_id === est.id && String(a.fecha).startsWith(ym)) marcas[a.fecha] = a.estado;
  const total = { presente: 0, ausente: 0, justificado: 0 };
  for (const v of Object.values(marcas)) if (total[v] !== undefined) total[v]++;
  const marcados = total.presente + total.ausente + total.justificado;
  const diasMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const vacios = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // la semana empieza el lunes
  const celdas = [];
  for (let i = 0; i < vacios; i++) celdas.push(html`<li class="cal-vacio" aria-hidden="true"></li>`);
  for (let d = 1; d <= diasMes; d++) {
    const iso = `${ym}-${pad(d)}`;
    const estado = marcas[iso];
    const finde = esFinDeSemana(iso);
    const etiqueta = `${d} de ${MESES[m - 1]}${estado ? `: ${NOMBRE[estado]}` : finde ? ', fin de semana' : ', sin marca'}`;
    const marca = estado
      ? html`<span class="cal-c cal-${estado}"><b>${d}</b><i aria-hidden="true">${LETRA[estado]}</i></span>`
      : html`<span class="cal-c cal-nada"><b>${d}</b></span>`;
    celdas.push(finde
      ? html`<li class="cal-dia cal-finde ${iso === hoy ? 'cal-hoy' : ''}" aria-label="${etiqueta}">${marca}</li>`
      : html`<li class="cal-dia ${iso === hoy ? 'cal-hoy' : ''}"><a href="#/asistencia?f=${iso}" aria-label="${etiqueta}">${marca}</a></li>`);
  }
  const base = `#/asistencia/calendario?e=${est.id}`;
  return {
    title: 'Asistencia',
    html: html`
      <p><a class="volver" href="#/asistencia/resumen">${icon('atras', 18)} Resumen del lapso</a></p>
      <div class="field cal-est"><label for="cal-est">Estudiante</label>
        <select id="cal-est">${s.estudiantes.map(e => html`<option value="${e.id}" ${e.id === est.id ? raw('selected') : ''}>${e.numero_lista ? `${e.numero_lista}. ` : ''}${e.nombre_completo}</option>`)}</select></div>
      <nav class="pager pager-dia" aria-label="Mes">
        <a class="btn secondary chico" href="${base}&m=${mesAnterior(y, m)}">${icon('atras', 18)} Anterior</a>
        <span class="pager-n cal-mes">${MESES[m - 1]} ${y}</span>
        <a class="btn secondary chico" href="${base}&m=${mesSiguiente(y, m)}">Siguiente <span class="gira">${icon('atras', 18)}</span></a>
      </nav>
      <div class="cal" role="group" aria-label="Calendario de ${MESES[m - 1]} de ${y}">
        <ol class="cal-semana" aria-hidden="true">${DIAS_CORTOS.map(d => html`<li>${d}</li>`)}</ol>
        <ol class="cal-grid">${celdas}</ol>
      </div>
      <ul class="cal-leyenda" aria-label="Leyenda">
        <li><span class="cal-pto cal-presente"></span>Asistió <strong>${total.presente}</strong></li>
        <li><span class="cal-pto cal-ausente"></span>Faltó <strong>${total.ausente}</strong></li>
        <li><span class="cal-pto cal-justificado"></span>Justificada <strong>${total.justificado}</strong></li>
      </ul>
      <p class="hint">${marcados
        ? `Asistencia del mes: ${Math.round((100 * total.presente) / marcados)}% de ${marcados === 1 ? '1 día con lista' : `${marcados} días con lista`}. Toca un día para ver o corregir la lista completa de ese día.`
        : 'Todavía no hay días marcados en este mes. Toca un día para pasar lista.'}</p>`,
    mount(root) {
      $('#cal-est', root).addEventListener('change', ev => { location.hash = `#/asistencia/calendario?e=${ev.target.value}&m=${ym}`; });
    },
  };
}

// ---------- calendario del curso: elegir el día para pasar lista ----------
async function asistenciaCurso(ctx, q, estudiantes) {
  const p = new URLSearchParams(q || '');
  const hoy = hoyIso();
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(p.get('m') || '') ? p.get('m') : hoy.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const ids = new Set(estudiantes.map(e => e.id));
  const porDia = {};
  for (const a of await list('asistencia')) {
    if (!ids.has(a.estudiante_id) || !a.estado || !String(a.fecha).startsWith(ym)) continue;
    const d = (porDia[a.fecha] ||= { presente: 0, ausente: 0, justificado: 0 });
    if (d[a.estado] !== undefined) d[a.estado]++;
  }
  const diasMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const vacios = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const celdas = [];
  for (let i = 0; i < vacios; i++) celdas.push(html`<li class="cal-vacio" aria-hidden="true"></li>`);
  let conLista = 0;
  for (let d = 1; d <= diasMes; d++) {
    const iso = `${ym}-${pad(d)}`;
    const r = porDia[iso];
    const finde = esFinDeSemana(iso);
    if (r) conLista++;
    const clase = !r ? 'cal-nada' : r.ausente ? 'cal-ausente' : r.justificado ? 'cal-justificado' : 'cal-presente';
    const n = r ? (r.ausente || r.justificado) : 0;
    const etiqueta = `${d} de ${MESES[m - 1]}${r ? `: lista tomada, ${r.ausente === 1 ? '1 falta' : `${r.ausente} faltas`}, ${r.justificado === 1 ? '1 justificada' : `${r.justificado} justificadas`}` : finde ? ', fin de semana' : ', sin lista'}`;
    const marca = html`<span class="cal-c ${clase}"><b>${d}</b>${n ? html`<i aria-hidden="true">${n}</i>` : ''}</span>`;
    celdas.push(finde
      ? html`<li class="cal-dia cal-finde ${iso === hoy ? 'cal-hoy' : ''}" aria-label="${etiqueta}">${marca}</li>`
      : html`<li class="cal-dia ${iso === hoy ? 'cal-hoy' : ''}"><a href="#/asistencia?f=${iso}" aria-label="${etiqueta}">${marca}</a></li>`);
  }
  const base = '#/asistencia';
  const marcadoHoy = !!porDia[hoy];
  return {
    title: 'Asistencia',
    html: html`
      ${esFinDeSemana(hoy) ? '' : html`<div class="acciones"><a class="btn ${marcadoHoy ? 'secondary' : 'primary'}" href="#/asistencia?f=${hoy}">${marcadoHoy ? 'Ver o corregir la lista de hoy' : 'Pasar lista de hoy'}</a></div>`}
      <nav class="pager pager-dia" aria-label="Mes">
        <a class="btn secondary chico" href="${base}?m=${mesAnterior(y, m)}">${icon('atras', 18)} Anterior</a>
        <span class="pager-n cal-mes">${MESES[m - 1]} ${y}</span>
        <a class="btn secondary chico" href="${base}?m=${mesSiguiente(y, m)}">Siguiente <span class="gira">${icon('atras', 18)}</span></a>
      </nav>
      <div class="cal" role="group" aria-label="Calendario de ${MESES[m - 1]} de ${y}">
        <ol class="cal-semana" aria-hidden="true">${DIAS_CORTOS.map(d => html`<li>${d}</li>`)}</ol>
        <ol class="cal-grid">${celdas}</ol>
      </div>
      <ul class="cal-leyenda" aria-label="Leyenda">
        <li><span class="cal-pto cal-presente"></span>Asistieron todos</li>
        <li><span class="cal-pto cal-ausente"></span>Hubo faltas</li>
        <li><span class="cal-pto cal-justificado"></span>Solo justificadas</li>
      </ul>
      <p class="hint">${conLista ? `${conLista === 1 ? '1 día con lista' : `${conLista} días con lista`} en ${MESES[m - 1]}. El número pequeño es la cantidad de faltas del día.` : `Todavía no hay listas en ${MESES[m - 1]}.`} Toca un día para pasar lista o revisar la de ese día.</p>
      <p><a href="#/asistencia/resumen">Ver el resumen del lapso</a> · <a href="#/asistencia/calendario">Ver el calendario de un estudiante</a></p>`,
  };
}
