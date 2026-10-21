// Reportes: lista, informe de un estudiante, informe del curso y banco de recomendaciones.
// Los informes se imprimen o se guardan como PDF con el diálogo de impresión del celular.
import { getSeccion, create, update, remove, guardarConId, idPar, get } from './data.js';
import { lapsoActual } from './data.js';
import { aprueba } from './calc.js';
import {
  cargarSnapshot, notaAsignatura, promedioGeneral, logroEstudiante, logroCurso, esDebil, esFuerte, enRiesgo, distribucion,
  buscarRecomendacion, sugerenciaGeneral, borradorDescriptivo, claveIndicador, resumenAsistencia,
} from './analisis.js';
import { html, raw, icon, toast, fechaLarga, fechaCorta } from './ui.js';
import { anotacionesDe, tipoValido, nombreTipo } from './anotaciones.js';
import { evolucionLapsos, cambiosDelCurso } from './graficos.js';
import { $, $$, campo, areaTexto, errorBox, mostrarError } from './form.js';
import { promedio } from './calc.js';
import { lineasEncabezado } from './institucion.js';
import { bloqueEnvioSemanal } from './views-reporte-semanal.js';
import { datosDescripcion, datosRecomendacion, mensajeIA } from './ia.js';

const sinSeccion = titulo => ({ title: titulo, html: html`<p class="vacio">Primero crea tu sección en <a href="#/">Inicio</a>.</p>` });
const textoNota = n => (n === null || n === undefined ? '–' : String(n));
const claseNota = (n, s) => (n === null || n === undefined ? '' : aprueba(n, s.cfg) ? 'nota-ok' : 'nota-baja');
const queryDe = q => new URLSearchParams(q || '');

function lapsoElegido(s, q) {
  const n = parseInt(queryDe(q).get('l'), 10);
  return s.lapsos.find(l => l.numero === n) || lapsoActual(s.lapsos) || s.lapsos[0];
}
const tabsLapso = (s, lapso, base) => html`
  <nav class="lapso-tabs no-print" aria-label="Lapso">
    ${s.lapsos.map(l => html`<a href="${base}?l=${l.numero}" ${l.id === lapso?.id ? raw('aria-current="page"') : ''}>Lapso ${l.numero}</a>`)}
  </nav>`;

export const estadoLogro = (pct, s) => (esDebil(pct, s) ? { clase: 'debil', texto: 'Por reforzar' } : esFuerte(pct) ? { clase: 'fuerte', texto: 'Dominado' } : { clase: 'medio', texto: 'En desarrollo' });
export const barra = (clave, pct, s) => {
  const e = estadoLogro(pct, s);
  return html`<li class="barra-fila">
    <span class="barra-clave">${clave}</span>
    <span class="barra-pista" role="img" aria-label="${pct}% de logro"><span class="barra-relleno ${e.clase}" style="width:${Math.max(2, pct)}%"></span></span>
    <span class="barra-valor">${pct}%</span>
    <span class="barra-estado ${e.clase}">${e.texto}</span>
  </li>`;
};

// Franja superior del informe: logo y datos de la institución a la izquierda, tipo de informe y lapso a la derecha.
const banda = (s, lapso, tipo = 'Informe de rendimiento') => html`
  <header class="informe-banda">
    <div class="informe-inst">
      ${s.inst && s.inst.logo ? html`<img class="informe-logo" src="${s.inst.logo}" alt="">` : ''}
      <div>
        ${s.inst ? lineasEncabezado(s.inst).map(l => html`<p>${l}</p>`) : ''}
        ${s.inst && s.inst.nombre ? html`<p class="informe-inst-nombre">${s.inst.nombre}</p>` : ''}
        ${s.inst && s.inst.subtitulo ? html`<p>${s.inst.subtitulo}</p>` : ''}
        ${!s.inst || !(s.inst.nombre || s.inst.subtitulo || s.inst.encabezado) ? html`<p class="informe-inst-nombre">CUADERNO DOCENTE</p>` : ''}
      </div>
    </div>
    <div class="banda-tipo"><span>${tipo}</span><strong>Lapso ${lapso?.numero ?? ''}</strong></div>
  </header>`;

// Ficha de identificación: quién y de qué curso es el informe.
const identidad = (s, lapso, titulo, campos = []) => {
  const datos = [
    ...campos,
    ['Grado', s.seccion.grado], ['Sección', s.seccion.nombre], ['Año escolar', s.seccion.anio_escolar],
    ['Período', lapso?.fecha_inicio && lapso?.fecha_fin ? `${fechaCorta(lapso.fecha_inicio)} al ${fechaCorta(lapso.fecha_fin)}` : ''],
    ['Docente', s.inst && s.inst.docente],
  ].filter(([, v]) => v);
  return html`
    <section class="informe-ident" aria-label="Datos del informe">
      <h2 class="informe-titulo">${titulo}</h2>
      <dl class="ident-datos">${datos.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
    </section>`;
};
const kpi = (num, txt, clase = '') => html`<div class="kpi"><span class="kpi-num ${clase}">${num}</span><span class="kpi-txt">${txt}</span></div>`;
const chipNota = (n, cfg) => (n === null || n === undefined ? html`<span class="chip-nota">–</span>` : html`<span class="chip-nota ${aprueba(n, cfg) ? 'ok' : 'baja'}">${n}</span>`);
const chipSituacion = (ok, ok1 = 'Aprobada', no = 'Por reforzar') => html`<span class="chip-sit ${ok ? 'ok' : 'baja'}">${ok ? ok1 : no}</span>`;
const firmas = (s) => html`
  <section class="informe-firmas" aria-label="Firmas">
    <div class="firma"><span class="firma-linea"></span><strong>${s.inst && s.inst.docente ? s.inst.docente : ''}</strong><span class="firma-rol">Docente</span></div>
  </section>
  <p class="informe-pie">Generado con Cuaderno docente · ${fechaLarga(new Date().toISOString().slice(0, 10))}</p>`;

// Recomendación visible para un indicador débil: la del banco, o una sugerencia general.
function bloqueRecomendacion(s, asig, clave, editable, pct = null, alcance = 'estudiante', ia = false) {
  const r = buscarRecomendacion(s, asig.id, clave);
  return html`<li class="recom" data-asig="${asig.id}" data-clave="${clave}" data-pct="${pct ?? ''}" data-alcance="${alcance}">
    <p><strong>${clave}:</strong> <span class="recom-texto">${r ? r.recomendacion : sugerenciaGeneral(clave)}</span>${r ? '' : html` <span class="hint no-print">(sugerencia general)</span>`}</p>
    ${editable ? html`<details class="no-print recom-editar">
      <summary>${r ? 'Cambiar esta recomendación' : 'Escribir mi recomendación'}</summary>
      <div class="stack">
        <textarea rows="3" placeholder="Qué actividades sugieres para reforzar este tema" aria-label="Recomendación para ${clave}">${r ? r.recomendacion : ''}</textarea>
        <p class="hint">Se guarda en tu banco y se usa para todos los estudiantes con este tema débil en ${asig.nombre}.</p>
        ${ia && pct !== null ? html`<div class="acciones"><button type="button" class="btn secondary chico sugerir-ia">Sugerir con IA</button></div>
          <p class="hint">La IA recibe solo la asignatura, el tema y el porcentaje, sin ningún dato de estudiantes. Revisa lo que escriba antes de guardarlo.</p>` : ''}
        <button type="button" class="btn secondary chico guardar-recom">Guardar en mi banco</button>
      </div>
    </details>` : ''}
  </li>`;
}

async function guardarRecomendacion(s, asigId, clave, texto) {
  const existente = buscarRecomendacion(s, asigId, clave);
  const t = texto.trim();
  if (existente) {
    if (!t) await remove('recomendaciones', existente.id);
    else await update('recomendaciones', existente.id, { recomendacion: t });
  } else if (t) {
    await create('recomendaciones', { asignatura_id: asigId, indicador_etiqueta: clave, recomendacion: t, deficiencia: null, origen: 'docente' });
  }
}

function conectarRecomendaciones(root, s, ctx) {
  $$('.recom', root).forEach(li => {
    const sug = $('.sugerir-ia', li);
    if (sug) sug.addEventListener('click', async () => {
      const asig = s.asignaturas.find(a => a.id === li.dataset.asig);
      sug.disabled = true;
      const antes = sug.textContent;
      sug.textContent = 'Redactando…';
      try {
        const datos = datosRecomendacion(s, asig, li.dataset.clave, li.dataset.pct, li.dataset.alcance);
        const r = await ctx.ia('recomendacion_tema', datos);
        $('textarea', li).value = r.texto;
        toast('Sugerencia lista. Revísala y guárdala si te sirve.');
      } catch (e) { toast(mensajeIA(e), 'error'); }
      sug.disabled = false;
      sug.textContent = antes;
    });
    const b = $('.guardar-recom', li);
    if (!b) return;
    b.addEventListener('click', async () => {
      await guardarRecomendacion(s, li.dataset.asig, li.dataset.clave, $('textarea', li).value);
      toast('Recomendación guardada en tu banco');
      ctx.refresh();
    });
  });
}

const botonImprimir = () => html`
  <div class="acciones no-print">
    <button type="button" class="btn primary" id="b-imprimir">${icon('bajar', 20)} Guardar como PDF o imprimir</button>
  </div>
  <p class="hint no-print">Se abre la ventana de impresión del celular. Elige "Guardar como PDF" como destino.</p>`;

// =====================================================================
// Lista de reportes
// =====================================================================
export async function reportes(ctx, q) {
  const seccion = await getSeccion();
  if (!seccion) return sinSeccion('Reportes');
  const s = await cargarSnapshot(seccion);
  const lapso = lapsoElegido(s, q);
  const base = '#/reportes';
  const hayDatos = lapso && s.estudiantes.some(e => promedioGeneral(s, lapso.id, e.id) !== null);

  const filas = s.estudiantes.map(e => {
    const prom = lapso ? promedioGeneral(s, lapso.id, e.id) : null;
    let debiles = 0;
    const bajas = [];
    if (lapso) for (const a of s.asignaturas) {
      debiles += logroEstudiante(s, a.id, lapso.id, e.id).filter(l => esDebil(l.pct, s)).length;
      const n = notaAsignatura(s, a.id, lapso.id, e.id);
      if (n !== null && !aprueba(n, s.cfg)) bajas.push(a.nombre);
    }
    return { e, prom, debiles, bajas };
  });

  const envio = bloqueEnvioSemanal(ctx);
  return {
    title: 'Reportes',
    live: true,
    mount(root) { envio.mount(root); },
    html: html`
      ${tabsLapso(s, lapso, base)}
      ${hayDatos ? html`
        <div class="acciones">
          <a class="btn primary" href="#/reportes/curso?l=${lapso.numero}">Informe del curso</a>
          <a class="btn secondary" href="#/reportes/banco">Mis recomendaciones</a>
        </div>
        <ol class="hoja">${filas.map(({ e, prom, debiles, bajas }) => html`
          <li><a class="fila" href="#/reportes/e/${e.id}?l=${lapso.numero}">
            <span class="margen ${claseNota(prom, s)}">${textoNota(prom)}</span>
            <span class="fila-texto">
              <span class="fila-nombre">${e.numero_lista ? `${e.numero_lista}. ` : ''}${e.nombre_completo}</span>
              <span class="fila-sub">${prom === null ? 'Sin notas en este lapso' : [bajas.length ? `Por debajo del mínimo en ${bajas.join(', ')}` : '', debiles ? `${debiles} ${debiles === 1 ? 'indicador débil' : 'indicadores débiles'}` : 'Sin indicadores débiles'].filter(Boolean).join(', ')}</span>
            </span>
          </a></li>`)}</ol>
        <p class="hint">El número en el margen es el promedio general del estudiante en el lapso.</p>
        ${cambiosDelCurso(s, lapso)}`
        : html`<div class="vacio">
            <p><strong>Todavía no hay notas en el lapso ${lapso?.numero ?? ''}.</strong></p>
            <p>Cuando completes la lista de cotejo de alguna evaluación, aquí aparecerán los informes de cada estudiante y del curso.</p>
            <p><a class="btn primary" href="#/evaluar">Ir a Evaluar</a></p>
          </div>
          <p><a class="btn secondary" href="#/reportes/banco">Mis recomendaciones</a></p>`}
      ${envio.html}`,
  };
}

// =====================================================================
// Informe de un estudiante
// =====================================================================
const plural2 = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export async function reporteEstudiante(ctx, estId, q) {
  const seccion = await getSeccion();
  if (!seccion) return sinSeccion('Informe');
  const s = await cargarSnapshot(seccion);
  const e = s.estudiantes.find(x => x.id === estId);
  if (!e) return { title: 'Informe', html: html`<p class="vacio">No encontré a este estudiante. <a href="#/reportes">Volver</a></p>` };
  const lapso = lapsoElegido(s, q);
  const base = `#/reportes/e/${e.id}`;
  const iaOk = ctx.iaDisponible();
  const prom = promedioGeneral(s, lapso.id, e.id);

  const asigs = s.asignaturas.map(a => ({ a, nota: notaAsignatura(s, a.id, lapso.id, e.id), logro: logroEstudiante(s, a.id, lapso.id, e.id) })).filter(x => x.nota !== null);
  const idDesc = idPar(`boletin:${lapso.id}`, e.id);
  const guardado = s.reportes.find(r => r.id === idDesc);
  const borrador = borradorDescriptivo(s, e, lapso.id);
  const textoDesc = guardado && guardado.texto != null ? guardado.texto : borrador;

  const idx = s.estudiantes.findIndex(x => x.id === e.id);
  const prev = s.estudiantes[idx - 1], sig = s.estudiantes[idx + 1];

  return {
    title: 'Informe',
    html: html`
      <p class="no-print"><a class="volver" href="#/reportes?l=${lapso.numero}">${icon('atras', 18)} Reportes</a></p>
      ${tabsLapso(s, lapso, base)}
      <nav class="pager no-print" aria-label="Estudiante">
        ${prev ? html`<a class="btn secondary chico" href="#/reportes/e/${prev.id}?l=${lapso.numero}">${icon('atras', 18)} Anterior</a>` : html`<span></span>`}
        <span class="pager-n">${idx + 1} de ${s.estudiantes.length}</span>
        ${sig ? html`<a class="btn secondary chico" href="#/reportes/e/${sig.id}?l=${lapso.numero}">Siguiente <span class="gira">${icon('atras', 18)}</span></a>` : html`<span></span>`}
      </nav>
      ${asigs.length ? botonImprimir() : ''}

      <article class="informe">
        ${banda(s, lapso)}
        <div class="informe-cuerpo">
        ${identidad(s, lapso, e.nombre_completo, [['N.º de lista', e.numero_lista], ['Cédula', e.cedula]])}
        ${asigs.length ? html`
          <section class="kpis" aria-label="Resumen">
            ${kpi(textoNota(prom), 'promedio general', claseNota(prom, s))}
            ${kpi(`${asigs.filter(x => aprueba(x.nota, s.cfg)).length} de ${asigs.length}`, 'asignaturas aprobadas')}
            ${(() => { const r = resumenAsistencia(s, lapso, e.id); return r.dias && r.marcados ? kpi(`${r.pct}%`, 'asistencia', r.pct < 80 ? 'nota-baja' : '') : ''; })()}
          </section>

          <h3 class="informe-h">Calificaciones del lapso</h3>
          <table class="tabla informe-notas">
            <thead><tr><th scope="col">Asignatura</th><th scope="col">Nota (1 a 20)</th><th scope="col">Situación</th></tr></thead>
            <tbody>${asigs.map(({ a, nota }) => html`<tr><th scope="row">${a.nombre}</th><td>${chipNota(nota, s.cfg)}</td><td>${chipSituacion(aprueba(nota, s.cfg))}</td></tr>`)}</tbody>
            <tfoot><tr><th scope="row">Promedio general</th><td>${chipNota(prom, s.cfg)}</td><td>${prom !== null ? chipSituacion(aprueba(prom, s.cfg), 'Aprobado') : ''}</td></tr></tfoot>
          </table>

          ${(() => { const r = resumenAsistencia(s, lapso, e.id); return r.dias && r.marcados ? html`<p class="informe-asistencia"><strong>Asistencia:</strong> ${r.faltas === 0 && r.justificadas === 0 ? 'sin inasistencias' : `${plural2(r.faltas, 'inasistencia', 'inasistencias')}${r.justificadas ? `, ${plural2(r.justificadas, 'justificada', 'justificadas')}` : ''}`} en ${r.dias} ${r.dias === 1 ? 'día' : 'días'} con lista (${r.pct}% de asistencia).</p>` : ''; })()}
          ${evolucionLapsos(s, e.id, s.cfg.minimo_aprobatorio ?? 10)}
          ${(() => { const an = anotacionesDe(s, e.id, lapso); return an.length ? html`<section class="informe-anot no-print"><h3 class="informe-h">Anotaciones del lapso</h3><ul class="an-lista">${an.map(a => html`<li class="an-item an-${tipoValido(a.tipo)}"><p class="an-cab"><span class="hint">${fechaCorta(a.fecha)} · ${nombreTipo(a.tipo)}</span></p><p class="an-texto">${a.texto}</p></li>`)}</ul></section>` : ''; })()}
          <div class="informe-asigs">${asigs.map(({ a, logro }) => html`
            <section class="informe-asig">
              <h3 class="informe-h">${a.nombre}</h3>
              ${logro.length ? html`<ul class="barras">${logro.map(l => barra(l.clave, l.pct, s))}</ul>` : html`<p class="hint">Todavía no hay indicadores marcados.</p>`}
              ${logro.some(l => esDebil(l.pct, s)) ? html`
                <p class="recom-t">Cómo mejorar</p>
                <ul class="recoms">${logro.filter(l => esDebil(l.pct, s)).map(l => bloqueRecomendacion(s, a, l.clave, true, l.pct, 'estudiante', iaOk))}</ul>` : ''}
            </section>`)}</div>

          <section class="informe-desc">
            <h3 class="informe-h">Descripción del lapso</h3>
            <label class="oculto-visual" for="desc">Descripción del lapso</label>
            <textarea id="desc" class="no-print" rows="7" placeholder="Describe el rendimiento del estudiante en el lapso: logros, aspectos por reforzar y qué puede hacer en casa. Puedes escribirlo tú o pedir un borrador a la IA.">${textoDesc}</textarea>
            <div id="desc-impresa" class="solo-impresion">${textoDesc}</div>
            <p class="aviso-ia no-print" id="ia-aviso" hidden>Borrador escrito con IA. Léelo y corrígelo con tus palabras antes de guardarlo.</p>
            ${iaOk ? html`
              <div class="acciones no-print"><button type="button" class="btn secondary" id="b-ia">Redactar con IA</button></div>
              <section class="ia-panel no-print" id="ia-panel" hidden aria-labelledby="ia-t">
                <h4 id="ia-t">Esto es lo que se enviará a la IA</h4>
                <p class="hint">Solo códigos, notas, indicadores y porcentajes. No se envía el nombre, la cédula, la fecha de nacimiento ni contactos.</p>
                <pre class="ia-datos" id="ia-datos"></pre>
                <div class="field"><label for="ia-extra">Algo más que quieras contar (opcional)</label>
                  <textarea id="ia-extra" rows="2" placeholder="Por ejemplo: participa mucho en clase"></textarea>
                  <p class="hint">Si escribes un nombre, se cambia por su código antes de enviar. Lo verás arriba.</p></div>
                ${errorBox('e-ia')}
                <div class="acciones"><button type="button" class="btn primary" id="b-ia-enviar">Enviar y redactar</button><button type="button" class="btn secondary" id="b-ia-cancelar">Cancelar</button></div>
              </section>` : ''}
            <div class="acciones no-print">
              <button type="button" class="btn secondary chico" id="b-desc">Guardar descripción</button>
              <button type="button" class="btn borrar" id="b-borrador">Volver al borrador automático</button>
            </div>
            <p class="hint no-print">El borrador se arma con las notas y los indicadores. Edítalo con tus palabras antes de entregarlo.</p>
          </section>
          ${firmas(s)}`
          : html`<p class="vacio">Este estudiante todavía no tiene notas en el lapso ${lapso.numero}. Pasa la lista de cotejo de alguna evaluación en <a href="#/evaluar">Evaluar</a>.</p>`}
        </div>
      </article>`,
    mount(root) {
      const imp = $('#b-imprimir', root);
      if (imp) imp.addEventListener('click', () => window.print());
      const art = $('.informe', root);
      conectarRecomendaciones(art, s, ctx);
      const d = $('#desc', root);
      if (!d) return;
      const espejo = () => { $('#desc-impresa', root).textContent = d.value; };
      d.addEventListener('input', espejo);
      let desdeIA = !!(guardado && guardado.generado_con_ia);
      const aviso = () => { const a = $('#ia-aviso', root); if (a) a.hidden = !desdeIA; };
      aviso();
      const bIA = $('#b-ia', root);
      if (bIA) {
        const panel = $('#ia-panel', root);
        const pintar = () => { $('#ia-datos', root).textContent = datosDescripcion(s, e, lapso, $('#ia-extra', root).value); };
        bIA.addEventListener('click', () => { panel.hidden = false; bIA.hidden = true; pintar(); panel.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
        $('#ia-extra', root).addEventListener('input', pintar);
        $('#b-ia-cancelar', root).addEventListener('click', () => { panel.hidden = true; bIA.hidden = false; });
        $('#b-ia-enviar', root).addEventListener('click', async ev => {
          const b = ev.currentTarget;
          b.disabled = true;
          b.textContent = 'Redactando, puede tardar unos segundos…';
          mostrarError(root, 'e-ia', '');
          try {
            const r = await ctx.ia('descripcion_estudiante', $('#ia-datos', root).textContent);
            d.value = r.texto;
            espejo();
            desdeIA = true;
            aviso();
            panel.hidden = true;
            bIA.hidden = false;
            toast('Borrador listo. Revísalo y guárdalo.');
          } catch (err) { mostrarError(root, 'e-ia', mensajeIA(err)); }
          b.disabled = false;
          b.textContent = 'Enviar y redactar';
        });
      }
      $('#b-desc', root).addEventListener('click', async () => {
        await guardarConId('reportes', idDesc, { tipo: 'boletin', estudiante_id: e.id, seccion_id: seccion.id, lapso_id: lapso.id, texto: d.value, generado_con_ia: desdeIA, revisado_en: new Date().toISOString() });
        toast('Descripción guardada');
      });
      $('#b-borrador', root).addEventListener('click', async () => {
        d.value = borrador;
        espejo();
        desdeIA = false;
        aviso();
        if (guardado) await guardarConId('reportes', idDesc, { tipo: 'boletin', estudiante_id: e.id, seccion_id: seccion.id, lapso_id: lapso.id, texto: null, generado_con_ia: false, revisado_en: null });
        toast('Se restauró el borrador automático');
      });
    },
  };
}

// =====================================================================
// Informe del curso
// =====================================================================
export async function reporteCurso(ctx, q) {
  const seccion = await getSeccion();
  if (!seccion) return sinSeccion('Informe del curso');
  const s = await cargarSnapshot(seccion);
  const lapso = lapsoElegido(s, q);
  const base = '#/reportes/curso';
  const iaOk = ctx.iaDisponible();
  const proms = s.estudiantes.map(e => ({ e, prom: promedioGeneral(s, lapso.id, e.id) }));
  const conNota = proms.filter(p => p.prom !== null);
  const promCurso = promedio(conNota.map(p => p.prom));
  const aprobados = conNota.filter(p => aprueba(p.prom, s.cfg)).length;
  const dist = distribucion(conNota.map(p => p.prom));
  const maxDist = Math.max(1, ...dist.map(d => d.cantidad));
  const riesgo = enRiesgo(s, lapso.id);
  const asigs = s.asignaturas.map(a => {
    const notas = s.estudiantes.map(e => notaAsignatura(s, a.id, lapso.id, e.id));
    return { a, prom: promedio(notas), n: notas.filter(x => x !== null).length, aprobados: notas.filter(x => x !== null && aprueba(x, s.cfg)).length, logro: logroCurso(s, a.id, lapso.id) };
  }).filter(x => x.n > 0);

  return {
    title: 'Informe del curso',
    html: html`
      <p class="no-print"><a class="volver" href="#/reportes?l=${lapso.numero}">${icon('atras', 18)} Reportes</a></p>
      ${tabsLapso(s, lapso, base)}
      ${conNota.length ? botonImprimir() : ''}
      <article class="informe">
        ${banda(s, lapso, 'Informe del curso')}
        <div class="informe-cuerpo">
        ${identidad(s, lapso, `Curso ${[s.seccion.grado, s.seccion.nombre ? `sección ${s.seccion.nombre}` : ''].filter(Boolean).join(' ')}`, [['Estudiantes', s.estudiantes.length]])}
        ${conNota.length ? html`
          <section class="kpis" aria-label="Resumen del curso">
            ${kpi(textoNota(promCurso), 'promedio del curso', claseNota(promCurso, s))}
            ${kpi(`${aprobados} de ${conNota.length}`, `aprobados (${s.cfg.minimo_aprobatorio} o más)`)}
            ${kpi(String(riesgo.length), 'necesitan apoyo', riesgo.length ? 'nota-baja' : '')}
          </section>

          <section>
            <h3 class="informe-h">Cómo se reparten las notas</h3>
            <ul class="barras distrib">${dist.map(d => html`<li class="barra-fila">
              <span class="barra-clave">${d.texto} puntos</span>
              <span class="barra-pista" role="img" aria-label="${d.cantidad === 1 ? '1 estudiante' : d.cantidad + ' estudiantes'}"><span class="barra-relleno ${d.max < s.cfg.minimo_aprobatorio ? 'debil' : 'fuerte'}" style="width:${d.cantidad ? Math.max(3, (d.cantidad / maxDist) * 100) : 0}%"></span></span>
              <span class="barra-valor">${d.cantidad}</span>
              <span class="barra-estado ${d.max < s.cfg.minimo_aprobatorio ? 'debil' : 'fuerte'}">${d.max < s.cfg.minimo_aprobatorio ? 'Por debajo del mínimo' : 'Aprobado'}</span>
            </li>`)}</ul>
          </section>

          <section>
            <h3 class="informe-h">Por asignatura</h3>
            <table class="tabla informe-notas">
              <thead><tr><th scope="col">Asignatura</th><th scope="col">Promedio</th><th scope="col">Aprobados</th></tr></thead>
              <tbody>${asigs.map(({ a, prom, n, aprobados: ap }) => html`<tr><th scope="row">${a.nombre}</th><td class="${claseNota(prom, s)}">${textoNota(prom)}</td><td>${ap} de ${n}</td></tr>`)}</tbody>
            </table>
          </section>

          ${asigs.map(({ a, logro }) => html`
            <section class="informe-asig">
              <h3 class="informe-h">${a.nombre}: logro del curso por indicador</h3>
              ${logro.length ? html`<ul class="barras">${logro.map(l => barra(l.clave, l.pct, s))}</ul>` : html`<p class="hint">Todavía no hay indicadores marcados.</p>`}
              ${logro.some(l => esDebil(l.pct, s)) ? html`
                <p class="recom-t">Qué reforzar con todo el curso</p>
                <ul class="recoms">${logro.filter(l => esDebil(l.pct, s)).map(l => bloqueRecomendacion(s, a, l.clave, true, l.pct, 'curso', iaOk))}</ul>` : ''}
            </section>`)}

          <section>
            <h3 class="informe-h">Estudiantes que necesitan apoyo</h3>
            ${riesgo.length ? html`<ul class="riesgo">${riesgo.map(r => html`<li><a href="#/reportes/e/${r.estudiante.id}?l=${lapso.numero}">${r.estudiante.nombre_completo}</a>: promedio ${textoNota(r.promedio)}${r.asignaturas.length ? `, por debajo del mínimo en ${r.asignaturas.map(a => a.nombre).join(', ')}` : ''}</li>`)}</ul>`
              : html`<p>Ningún estudiante está por debajo del mínimo en este lapso.</p>`}
          </section>
          ${firmas(s)}`
          : html`<p class="vacio">Todavía no hay notas en el lapso ${lapso.numero}. Pasa la lista de cotejo de alguna evaluación en <a href="#/evaluar">Evaluar</a>.</p>`}
        </div>
      </article>`,
    mount(root) {
      const imp = $('#b-imprimir', root);
      if (imp) imp.addEventListener('click', () => window.print());
      conectarRecomendaciones($('.informe', root), s, ctx);
    },
  };
}

// =====================================================================
// Banco de recomendaciones
// =====================================================================
export async function banco(ctx) {
  const seccion = await getSeccion();
  if (!seccion) return sinSeccion('Mis recomendaciones');
  const s = await cargarSnapshot(seccion);
  const asigIds = new Set(s.asignaturas.map(a => a.id));
  const recs = s.recomendaciones.filter(r => asigIds.has(r.asignatura_id));
  const porAsig = s.asignaturas.map(a => ({ a, items: recs.filter(r => r.asignatura_id === a.id).sort((x, y) => (x.indicador_etiqueta || '').localeCompare(y.indicador_etiqueta || '', 'es')) })).filter(g => g.items.length);
  const temas = [...new Set(s.indicadores.map(claveIndicador))].sort((a, b) => a.localeCompare(b, 'es'));

  return {
    title: 'Mis recomendaciones',
    live: false,
    html: html`
      <p><a class="volver" href="#/reportes">${icon('atras', 18)} Reportes</a></p>
      <p>Aquí guardas qué recomendar cuando un tema sale débil. Se usan en los informes de todos los estudiantes. Si un tema no tiene recomendación, el informe muestra una sugerencia general.</p>
      ${s.asignaturas.length ? html`
        <form id="f-recom" class="stack" novalidate>
          <h2>Agregar una recomendación</h2>
          <div class="field"><label for="r-asig">Asignatura</label>
            <select id="r-asig">${s.asignaturas.map(a => html`<option value="${a.id}">${a.nombre}</option>`)}</select></div>
          <div class="field"><label for="r-tema">Tema o indicador</label>
            <input id="r-tema" type="text" list="temas" autocomplete="off" placeholder="Por ejemplo: Fracciones">
            <datalist id="temas">${temas.map(t => html`<option value="${t}"></option>`)}</datalist>
            <p class="hint">Escribe el mismo nombre del tema o del indicador que usaste al evaluar.</p></div>
          ${areaTexto({ id: 'r-texto', label: 'Recomendación', rows: 3, placeholder: 'Qué actividades se sugieren para reforzar este tema, en el aula y en casa.' })}
          ${errorBox('e-recom')}
          <button class="btn primary" type="submit">Guardar recomendación</button>
        </form>` : html`<p class="vacio">Primero agrega asignaturas en <a href="#/evaluar">Evaluar</a>.</p>`}

      ${porAsig.map(g => html`
        <section class="bloque">
          <h2>${g.a.nombre}</h2>
          <ul class="banco-lista">${g.items.map(r => html`
            <li class="banco-item" data-id="${r.id}">
              <p class="banco-tema">${r.indicador_etiqueta}</p>
              <textarea rows="3" placeholder="Qué actividades sugieres para reforzar este tema" aria-label="Recomendación para ${r.indicador_etiqueta}">${r.recomendacion}</textarea>
              <div class="acciones">
                <button type="button" class="btn secondary chico b-guardar">Guardar cambios</button>
                <button type="button" class="btn borrar chico b-borrar-r">Eliminar</button>
              </div>
            </li>`)}</ul>
        </section>`)}`,
    mount(root) {
      const f = $('#f-recom', root);
      if (f) f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const tema = $('#r-tema', root).value.trim(), texto = $('#r-texto', root).value.trim();
        if (!tema || !texto) { mostrarError(root, 'e-recom', 'Escribe el tema y la recomendación.'); return; }
        await guardarRecomendacion(s, $('#r-asig', root).value, tema, texto);
        toast('Recomendación guardada');
        ctx.refresh();
      });
      $$('.banco-item', root).forEach(li => {
        $('.b-guardar', li).addEventListener('click', async () => {
          const t = $('textarea', li).value.trim();
          if (!t) { toast('La recomendación no puede quedar vacía. Usa Eliminar para borrarla.', 'error'); return; }
          await update('recomendaciones', li.dataset.id, { recomendacion: t });
          toast('Cambios guardados');
        });
        $('.b-borrar-r', li).addEventListener('click', async () => {
          await remove('recomendaciones', li.dataset.id);
          toast('Recomendación eliminada');
          ctx.refresh();
        });
      });
    },
  };
}
