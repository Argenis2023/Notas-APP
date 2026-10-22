// Panel del Inicio: fichas de acceso con información al día, pendientes y alertas.
import { lapsoActual, nombrePropio } from './data.js';
import { aprueba, promedio } from './calc.js';
import { cargarSnapshot, notaAsignatura, resumenAsistencia, promedioGeneral, enRiesgo, logroCurso, esDebil } from './analisis.js';
import { proximos, etiquetaDia } from './agenda.js';
import { barra } from './views-reportes.js';
import { avisosPendientes, tarjetaAviso } from './views-avisos.js';
import { semanaAsistencia, notasDelCurso, evolucionPromedio, seguirYDestacados } from './graficos.js';
import { html, raw, icon, fechaCorta } from './ui.js';

const DIA = 86400000;
const utc = iso => Date.parse(iso + 'T00:00:00Z');
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const HONORIFICOS = /^(prof|profa|profesor|profesora|lic|licda|licenciado|licenciada|sr|sra|srta|mtro|mtra|maestro|maestra|docente)\.?$/i;
// Primer nombre de la docente o del docente, sin títulos (Prof., Lic., etc.). Vacío si no lo ha escrito en Ajustes.
export function primerNombreDocente(nombre) {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  while (partes.length && HONORIFICOS.test(partes[0])) partes.shift();
  return partes[0] ? nombrePropio(partes[0]) : '';
}
function saludo(d = new Date()) {
  const h = d.getHours();
  const t = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const f = new Intl.DateTimeFormat('es-VE', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return { t, f };
}

export async function panelInicio(ctx, seccion, completo, q = '') {
  const s = await cargarSnapshot(seccion);
  const pedido = parseInt(new URLSearchParams(q || '').get('l'), 10);
  const lapso = s.lapsos.find(l => l.numero === pedido) || lapsoActual(s.lapsos);
  const hoy = new Date();
  const hoyUtc = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const nEst = s.estudiantes.length;
  const minimo = s.cfg.minimo_aprobatorio ?? 10;

  let lapsoInfo = null;
  if (lapso && lapso.fecha_inicio && lapso.fecha_fin) {
    const ini = utc(lapso.fecha_inicio), fin = utc(lapso.fecha_fin);
    const pct = Math.max(0, Math.min(100, Math.round(((hoyUtc - ini) / Math.max(1, fin - ini)) * 100)));
    const dias = Math.ceil((fin - hoyUtc) / DIA);
    lapsoInfo = { pct, texto: hoyUtc < ini ? `Empieza el ${fechaCorta(lapso.fecha_inicio)}` : dias < 0 ? 'Lapso terminado' : dias === 0 ? 'Termina hoy' : `Quedan ${plural(dias, 'día', 'días')}` };
  }

  const evalsLapso = lapso ? s.evaluaciones.filter(e => e.lapso_id === lapso.id) : [];
  const pendientes = [];
  for (const ev of evalsLapso) {
    const asig = s.asignaturas.find(a => a.id === ev.asignatura_id);
    const nInd = s.indicadores.filter(i => i.evaluacion_id === ev.id).length;
    const hechos = s.estudiantes.filter(e => typeof s.nota[`${ev.id}|${e.id}`] === 'number').length;
    const marcados = s.estudiantes.filter(e => s.indicadores.some(i => i.evaluacion_id === ev.id && s.niveles[`${i.id}|${e.id}`])).length;
    if (!nInd) pendientes.push({ ev, asig, texto: 'Falta escribir los indicadores', href: `#/evaluar/e/${ev.id}`, marca: '!', act: '' });
    else if (nEst && hechos < nEst) pendientes.push({ ev, asig, texto: `${hechos} de ${nEst} estudiantes evaluados`, href: `#/evaluar/e/${ev.id}/cotejo`, marca: `${hechos}/${nEst}`, act: s.actividad?.[ev.id] || '', marcados, hechos });
  }
  const quedaste = [...pendientes].filter(p => p.act).sort((a, b) => b.act.localeCompare(a.act))[0] || null;
  const resto = pendientes.filter(p => p !== quedaste);

  const proms = lapso ? s.estudiantes.map(e => promedioGeneral(s, lapso.id, e.id)).filter(n => n !== null) : [];
  const promCurso = promedio(proms);
  const aprobados = proms.filter(n => aprueba(n, s.cfg)).length;
  const riesgo = lapso ? enRiesgo(s, lapso.id) : [];

  const debiles = [];
  const porAsig = [];
  if (lapso) for (const a of s.asignaturas) {
    for (const l of logroCurso(s, a.id, lapso.id)) if (esDebil(l.pct, s)) debiles.push({ ...l, asig: a.nombre });
    const ns = s.estudiantes.map(e => notaAsignatura(s, a.id, lapso.id, e.id)).filter(n => n !== null && n !== undefined);
    if (ns.length) porAsig.push({ nombre: a.nombre, prom: promedio(ns), n: ns.length });
  }
  debiles.sort((x, y) => x.pct - y.pct);

  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const deHoy = s.asistencia.filter(a => a.fecha === hoyIso);
  const asisHoy = { n: deHoy.length, faltaron: deHoy.filter(a => a.estado === 'ausente').length, finde: [0, 6].includes(hoy.getDay()) };
  const proxAgenda = proximos(s, hoyIso, 7);
  const av = await avisosPendientes(s, ctx);
  const avInicio = av.visibles.filter(a => !a.id.startsWith('lista:'));
  const g = saludo(hoy);
  const sub = [seccion.grado, seccion.nombre && `Sección ${seccion.nombre}`, seccion.anio_escolar].filter(Boolean).join(' · ');

  return html`
    <section aria-labelledby="menu-t">
      <h2 id="menu-t" class="saludo">${g.t}${primerNombreDocente(s.inst && s.inst.docente) ? `, ${primerNombreDocente(s.inst.docente)}` : ''}<span class="saludo-fecha">${g.f}</span></h2>
      ${sub ? html`<p class="inicio-curso">${sub}</p>` : ''}
      ${s.lapsos.length > 1 ? html`<nav class="lapso-tabs" aria-label="Lapso">${s.lapsos.map(l => html`
        <a href="#/?l=${l.numero}" ${l.id === lapso?.id ? raw('aria-current="page"') : ''}>Lapso ${l.numero}</a>`)}</nav>` : ''}
      ${lapso ? (lapsoInfo ? html`
        <p class="lapso-linea">${fechaCorta(lapso.fecha_inicio)} al ${fechaCorta(lapso.fecha_fin)} · ${lapsoInfo.texto}</p>
        <span class="avance" role="img" aria-label="${lapsoInfo.pct}% del lapso transcurrido"><span style="width:${lapsoInfo.pct}%"></span></span>`
        : html`<p class="lapso-linea"><a class="btn secondary chico" href="#/ajustes?c=colegio">Poner las fechas del lapso</a></p>`) : ''}
    </section>

    <section aria-labelledby="aula-t">
      <h2 id="aula-t">Para el aula</h2>
      <div class="acciones">
        <a class="btn secondary" href="#/aula/diccionario">${icon('diccionario', 20)} Diccionario</a>
        <a class="btn secondary" href="#/aula/pausas">${icon('pausa', 20)} Pausa activa</a>
        <a class="btn secondary" href="#/aula/sorteo">${icon('sorteo', 20)} Sorteo y grupos</a>
      </div>
    </section>

    <div class="inicio-cols">
    <div class="col">
    ${avInicio.length ? html`
      <section aria-labelledby="avisos-t">
        <h2 id="avisos-t">Avisos</h2>
        <ul class="avisos">${avInicio.slice(0, 3).map(tarjetaAviso)}</ul>
        ${avInicio.length > 3 ? html`<p><a class="btn secondary chico" href="#/avisos">Ver los ${avInicio.length} avisos</a></p>` : ''}
      </section>` : ''}

    <section aria-labelledby="ag-t">
      <h2 id="ag-t">Agenda</h2>
      ${proxAgenda.length ? html`<ul class="ag-lista">${proxAgenda.slice(0, 3).map(e => html`<li class="ag-item ag-${e.tipo}"><p class="ag-cab"><strong>${e.titulo}</strong></p><p class="hint">${[etiquetaDia(e.fecha, hoyIso), e.hora].filter(Boolean).join(' · ')}</p></li>`)}</ul>` : html`<p>No tienes nada anotado para esta semana.</p>`}
      <div class="acciones">
        <a class="btn secondary" href="#/agenda">${icon('calendario', 20)} ${proxAgenda.length > 3 ? `Ver la agenda (${proxAgenda.length})` : 'Abrir la agenda'}</a>
        <a class="btn secondary" href="#/planificacion">${icon('nota', 20)} Planificación diaria</a>
      </div>
    </section>

    ${nEst && !asisHoy.finde ? html`
      <section class="asistencia-hoy" aria-labelledby="as-t">
        <h2 id="as-t">Asistencia de hoy</h2>
        <p>${asisHoy.n ? `${asisHoy.n - asisHoy.faltaron} de ${nEst} asistieron${asisHoy.faltaron ? `, ${plural(asisHoy.faltaron, 'faltó', 'faltaron')}` : ''}${asisHoy.n < nEst ? `, ${nEst - asisHoy.n} sin marcar` : ''}.` : 'Todavía no has pasado lista hoy.'}</p>
        <a class="btn ${asisHoy.n ? 'secondary' : 'primary'}" href="#/asistencia?f=${hoyIso}">${asisHoy.n ? 'Ver o corregir la lista' : 'Pasar lista'}</a>
      </section>` : ''}

    ${quedaste ? html`
      <section class="quedaste" aria-labelledby="qd-t">
        <h2 id="qd-t">Quedaste en</h2>
        <p class="qd-nombre">${quedaste.ev.nombre}</p>
        <p class="qd-sub">${[quedaste.asig?.nombre, `${quedaste.marcados} de ${nEst} estudiantes marcados`].filter(Boolean).join(', ')}</p>
        <span class="avance" role="img" aria-label="${Math.round(100 * quedaste.marcados / nEst)}% evaluado"><span style="width:${Math.round(100 * quedaste.marcados / nEst)}%"></span></span>
        <a class="btn primary" href="${quedaste.href}">Continuar la lista de cotejo</a>
      </section>` : (pendientes.length ? '' : (evalsLapso.length && nEst ? html`<p class="todo-al-dia">Todo al día: todas las evaluaciones de este lapso tienen nota.</p>` : ''))}

    ${resto.length ? html`
      <section aria-labelledby="pend-t">
        <h2 id="pend-t">Pendiente</h2>
        <ol class="hoja">${resto.slice(0, 4).map(p => html`
          <li><a class="fila" href="${p.href}">
            <span class="margen">${p.marca}</span>
            <span class="fila-texto"><span class="fila-nombre">${p.ev.nombre}</span><span class="fila-sub">${[p.asig?.nombre, p.texto].filter(Boolean).join(', ')}</span></span>
          </a></li>`)}</ol>
        ${resto.length > 4 ? html`<p class="hint">Y ${resto.length - 4} más en <a class="btn secondary chico" href="#/evaluar">Evaluar</a>.</p>` : ''}
      </section>` : ''}

    ${seguirYDestacados(s, lapso)}

    </div>
    <div class="col">
    ${proms.length ? html`
      <section aria-labelledby="cur-t">
        <h2 id="cur-t">El curso en este lapso</h2>
        <dl class="resumen">
          <div><dt>Promedio general</dt><dd class="${aprueba(promCurso, s.cfg) ? 'bien' : 'mal'}"><span data-cuenta="${promCurso}">${promCurso}</span></dd></div>
          <div><dt>Aprueban</dt><dd><span data-cuenta="${aprobados}">${aprobados}</span> de ${proms.length}</dd></div>
          <div><dt>En riesgo</dt><dd class="${riesgo.length ? 'mal' : ''}"><span data-cuenta="${riesgo.length}">${riesgo.length}</span></dd></div>
        </dl>
        ${riesgo.length ? html`<p class="hint">Necesitan apoyo: ${riesgo.slice(0, 3).map(r => r.estudiante.nombre_completo.split(/\s+/)[0]).join(', ')}${riesgo.length > 3 ? ` y ${riesgo.length - 3} más` : ''}. <a class="btn secondary chico" href="#/reportes/curso?l=${lapso.numero}">Ver informe del curso</a></p>` : ''}
        ${debiles.length ? html`<p class="hint">Lo más débil: <strong>${debiles[0].clave}</strong> (${debiles[0].asig}), ${debiles[0].pct}% de logro.</p>` : ''}
      </section>` : ''}

    ${nEst ? semanaAsistencia(s, hoy) : ''}
    ${notasDelCurso(proms, minimo)}
    ${evolucionPromedio(s, lapso, minimo)}

    ${porAsig.length ? html`
      <section aria-labelledby="pa-t">
        <h2 id="pa-t">Promedio por asignatura</h2>
        <ul class="prom-asig">${porAsig.map(a => html`
          <li><span class="pa-nombre">${a.nombre}</span><span class="pa-valor ${a.prom >= minimo ? 'bien' : 'mal'}">${a.prom}</span>
            <span class="pa-pista" role="img" aria-label="Promedio ${a.prom} de 20, mínimo ${minimo}"><span style="width:${Math.round(a.prom * 5)}%"></span><i style="left:${minimo * 5}%"></i></span></li>`)}</ul>
      </section>` : ''}

    </div>
    </div>`;
}
