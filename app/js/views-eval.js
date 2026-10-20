// Pantallas de evaluación: asignaturas, evaluaciones, indicadores y lista de cotejo.
import {
  getSeccion, getConfig, getLapsos, lapsoActual, listEstudiantes, listAsignaturas, addAsignatura, listEvaluaciones,
  listIndicadores, addIndicadores, nivelesDeEvaluacion, listNotas, setNivel, setNiveles, corregirNota,
  eliminarIndicador, eliminarEvaluacion, eliminarAsignatura, recalcularEvaluacion, recalcularTodo, create, update, get, idPar,
} from './data.js';
import { NIVELES, calcularEvaluacion, notaVigente, promedio, aprueba } from './calc.js';
import { html, raw, icon, toast, fechaCorta } from './ui.js';
import { $, $$, campo, areaTexto, errorBox, mostrarError } from './form.js';

export const TIPOS = ['Prueba', 'Trabajo', 'Exposición', 'Taller', 'Participación', 'Actividad en clase', 'Otra'];
const SUGERIDAS = ['Lenguaje', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales', 'Educación Física', 'Educación Artística'];

const sinSeccion = titulo => ({ title: titulo, html: html`<p class="vacio">Primero crea tu sección en <a href="#/">Inicio</a>.</p>` });
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const query = q => new URLSearchParams(q || '');
const claseNota = (n, cfg) => (n === null || n === undefined ? '' : aprueba(n, cfg) ? 'nota-ok' : 'nota-baja');
const textoNota = n => (n === null || n === undefined ? '–' : String(n));

function selectCampo({ id, label, value, opciones }) {
  return html`<div class="field">
    <label for="${id}">${label}</label>
    <select id="${id}" name="${id}">${opciones.map(([v, t]) => html`<option value="${v}" ${String(v) === String(value) ? raw('selected') : ''}>${t}</option>`)}</select>
  </div>`;
}

// Botón "Eliminar" con confirmación en la misma pantalla (sin diálogos del navegador).
function confirmarBorrado(root, onSi) {
  const b = $('#b-borrar', root);
  if (!b) return;
  b.addEventListener('click', () => { $('#confirmar', root).hidden = false; b.hidden = true; $('#b-no', root).focus(); });
  $('#b-no', root).addEventListener('click', () => { $('#confirmar', root).hidden = true; b.hidden = false; b.focus(); });
  $('#b-si', root).addEventListener('click', onSi);
}
const bloqueBorrar = (texto, aviso) => html`
  <div class="peligro">
    <button class="btn borrar" type="button" id="b-borrar">${texto}</button>
    <div id="confirmar" hidden>
      <p class="error">${aviso}</p>
      <div class="acciones">
        <button class="btn danger" type="button" id="b-si">Sí, eliminar</button>
        <button class="btn secondary" type="button" id="b-no">No, conservar</button>
      </div>
    </div>
  </div>`;

// =====================================================================
// Evaluar: lista de asignaturas
// =====================================================================
export async function evaluar(ctx) {
  const seccion = await getSeccion();
  if (!seccion) return sinSeccion('Evaluar');
  const asignaturas = await listAsignaturas(seccion.id);
  const filas = [];
  for (const a of asignaturas) filas.push({ a, n: (await listEvaluaciones(a.id)).length });
  const usadas = new Set(asignaturas.map(a => a.nombre.toLowerCase()));
  const sugeridas = SUGERIDAS.filter(s => !usadas.has(s.toLowerCase()));

  return {
    title: 'Evaluar',
    live: true,
    html: html`
      ${asignaturas.length ? html`
        <ol class="hoja">${filas.map(({ a, n }, i) => html`
          <li><a class="fila" href="#/evaluar/a/${a.id}">
            <span class="margen">${i + 1}</span>
            <span class="fila-texto">
              <span class="fila-nombre">${a.nombre}</span>
              <span class="fila-sub">${n === 0 ? 'Sin evaluaciones todavía' : `${n} ${n === 1 ? 'evaluación' : 'evaluaciones'}`}</span>
            </span>
          </a></li>`)}</ol>` : html`
        <div class="vacio">
          <p><strong>Todavía no hay asignaturas.</strong></p>
          <p>Agrega las que das en esta sección. Dentro de cada una crearás tus evaluaciones y su lista de cotejo.</p>
        </div>`}
      <form id="f-asig" class="stack" novalidate>
        ${campo({ id: 'nombre', label: 'Nueva asignatura', extra: 'autocomplete="off" placeholder="Por ejemplo: Matemática"' })}
        ${errorBox('e-asig')}
        <button class="btn primary" type="submit">${icon('mas', 20)} Agregar asignatura</button>
      </form>
      ${sugeridas.length ? html`
        <p class="hint sugeridas-t">Toca una para agregarla:</p>
        <div class="chips">${sugeridas.map(s => html`<button type="button" class="chip-sug" data-nombre="${s}">${s}</button>`)}</div>` : ''}`,
    mount(root) {
      const agregar = async nombre => {
        const n = nombre.trim();
        if (!n) { mostrarError(root, 'e-asig', 'Escribe el nombre de la asignatura.'); $('#nombre', root).focus(); return; }
        if (usadas.has(n.toLowerCase())) { mostrarError(root, 'e-asig', 'Ya tienes una asignatura con ese nombre.'); return; }
        await addAsignatura(seccion.id, n);
        toast('Asignatura agregada');
        ctx.refresh();
      };
      $('#f-asig', root).addEventListener('submit', ev => { ev.preventDefault(); agregar($('#nombre', root).value); });
      $$('.chip-sug', root).forEach(b => b.addEventListener('click', () => agregar(b.dataset.nombre)));
    },
  };
}

// =====================================================================
// Una asignatura: evaluaciones por lapso y cuadro de notas
// =====================================================================
export async function asignatura(ctx, id, q) {
  const seccion = await getSeccion();
  if (!seccion) return sinSeccion('Asignatura');
  const asig = await get('asignaturas', id);
  if (!asig || asig.deleted) return { title: 'Asignatura', html: html`<p class="vacio">No encontré esta asignatura. <a href="#/evaluar">Volver</a></p>` };
  const [cfg, lapsos, estudiantes, todasEv] = [await getConfig(), await getLapsos(seccion.id), await listEstudiantes(seccion.id), await listEvaluaciones(asig.id)];
  const pedido = parseInt(query(q).get('l'), 10);
  const lapso = lapsos.find(l => l.numero === pedido) || lapsoActual(lapsos) || lapsos[0];
  const evals = todasEv.filter(e => e.lapso_id === lapso?.id);

  const notasPorEv = {};
  for (const ev of evals) {
    const m = {};
    for (const n of await listNotas(ev.id)) m[n.estudiante_id] = notaVigente(n);
    notasPorEv[ev.id] = m;
  }
  const promedioEv = ev => promedio(estudiantes.map(e => notasPorEv[ev.id][e.id]));
  const evaluados = ev => estudiantes.filter(e => typeof notasPorEv[ev.id][e.id] === 'number').length;
  const promEst = e => promedio(evals.map(ev => notasPorEv[ev.id][e.id]));

  return {
    title: asig.nombre,
    live: true,
    html: html`
      <p><a class="volver" href="#/evaluar">${icon('atras', 18)} Asignaturas</a></p>
      <nav class="lapso-tabs" aria-label="Lapso">
        ${lapsos.map(l => html`<a href="#/evaluar/a/${asig.id}?l=${l.numero}" ${l.id === lapso?.id ? raw('aria-current="page"') : ''}>Lapso ${l.numero}</a>`)}
      </nav>
      <div class="acciones">
        <a class="btn primary" href="#/evaluar/a/${asig.id}/nueva?l=${lapso?.numero || 1}">${icon('mas', 20)} Nueva evaluación</a>
      </div>
      ${evals.length ? html`
        <ol class="hoja">${evals.map(ev => {
          const p = promedioEv(ev);
          return html`<li><a class="fila" href="#/evaluar/e/${ev.id}">
            <span class="margen ${claseNota(p, cfg)}" aria-label="Promedio del curso">${textoNota(p)}</span>
            <span class="fila-texto">
              <span class="fila-nombre">${ev.nombre}</span>
              <span class="fila-sub">${[ev.tipo, fechaCorta(ev.fecha), estudiantes.length ? `${evaluados(ev)} de ${estudiantes.length} evaluados` : ''].filter(Boolean).join(', ')}</span>
            </span>
          </a></li>`;
        })}</ol>
        <p class="hint">El número en el margen es el promedio del curso en esa evaluación.</p>` : html`
        <div class="vacio"><p><strong>No hay evaluaciones en el lapso ${lapso?.numero || 1}.</strong></p><p>Crea la primera y escribe sus indicadores, que son lo que vas a marcar en la lista de cotejo.</p></div>`}

      ${evals.length && estudiantes.length ? html`
        <h2>Notas del lapso ${lapso?.numero}</h2>
        <div class="tabla-wrap"><table class="tabla notas">
          <thead><tr><th scope="col">Estudiante</th>${evals.map(ev => html`<th scope="col" title="${ev.nombre}">${ev.nombre.length > 12 ? ev.nombre.slice(0, 11) + '…' : ev.nombre}</th>`)}<th scope="col">Prom.</th></tr></thead>
          <tbody>${estudiantes.map(e => {
            const p = promEst(e);
            return html`<tr><th scope="row">${e.numero_lista ? `${e.numero_lista}. ` : ''}${e.nombre_completo}</th>
              ${evals.map(ev => { const n = notasPorEv[ev.id][e.id]; return html`<td class="${claseNota(n, cfg)}">${textoNota(n)}</td>`; })}
              <td class="prom ${claseNota(p, cfg)}">${textoNota(p)}</td></tr>`;
          })}</tbody>
        </table></div>
        <p class="hint">Las notas en rojo están por debajo de ${cfg.minimo_aprobatorio ?? 10}.</p>` : ''}

      <details class="mas">
        <summary>Cambiar nombre o eliminar esta asignatura</summary>
        <form id="f-renombrar" class="stack" novalidate>
          ${campo({ id: 'nombre', label: 'Nombre de la asignatura', value: asig.nombre, extra: 'autocomplete="off"' })}
          ${errorBox('e-ren')}
          <button class="btn secondary" type="submit">Guardar nombre</button>
        </form>
        ${bloqueBorrar('Eliminar asignatura', `Se eliminarán también sus ${todasEv.length} evaluaciones y todas las notas. Esto no se puede deshacer.`)}
      </details>`,
    mount(root) {
      $('#f-renombrar', root).addEventListener('submit', async ev => {
        ev.preventDefault();
        const n = $('#nombre', root).value.trim();
        if (!n) { mostrarError(root, 'e-ren', 'El nombre no puede quedar vacío.'); return; }
        await update('asignaturas', asig.id, { nombre: n });
        toast('Nombre guardado');
      });
      confirmarBorrado(root, async () => {
        await eliminarAsignatura(asig.id);
        toast('Asignatura eliminada');
        ctx.go('#/evaluar');
      });
    },
  };
}

// =====================================================================
// Evaluación: nueva o editar datos
// =====================================================================
export async function evaluacionForm(ctx, { asignaturaId, evaluacionId, lapsoNum }) {
  const seccion = await getSeccion();
  if (!seccion) return sinSeccion('Evaluación');
  const ev = evaluacionId ? await get('evaluaciones', evaluacionId) : null;
  if (evaluacionId && (!ev || ev.deleted)) return { title: 'Evaluación', html: html`<p class="vacio">No encontré esta evaluación. <a href="#/evaluar">Volver</a></p>` };
  const asig = await get('asignaturas', ev ? ev.asignatura_id : asignaturaId);
  if (!asig || asig.deleted) return { title: 'Evaluación', html: html`<p class="vacio">No encontré la asignatura. <a href="#/evaluar">Volver</a></p>` };
  const lapsos = await getLapsos(seccion.id);
  const lapsoInicial = ev ? ev.lapso_id : (lapsos.find(l => l.numero === parseInt(lapsoNum, 10)) || lapsoActual(lapsos) || lapsos[0])?.id;
  const nuevo = !ev;
  const volver = nuevo ? `#/evaluar/a/${asig.id}` : `#/evaluar/e/${ev.id}`;

  return {
    title: nuevo ? 'Nueva evaluación' : 'Datos de la evaluación',
    html: html`
      <p><a class="volver" href="${volver}">${icon('atras', 18)} ${nuevo ? asig.nombre : ev.nombre}</a></p>
      <form id="f-ev" class="stack" novalidate>
        ${campo({ id: 'nombre', label: 'Nombre', value: ev?.nombre, required: true, extra: 'autocomplete="off" placeholder="Por ejemplo: Prueba de fracciones"' })}
        ${selectCampo({ id: 'tipo', label: 'Tipo', value: ev?.tipo || 'Prueba', opciones: TIPOS.map(t => [t, t]) })}
        ${campo({ id: 'fecha', label: 'Fecha', value: ev?.fecha || hoyIso(), type: 'date' })}
        ${selectCampo({ id: 'lapso_id', label: 'Lapso', value: lapsoInicial, opciones: lapsos.map(l => [l.id, `Lapso ${l.numero}`]) })}
        ${nuevo ? areaTexto({ id: 'indicadores', label: 'Indicadores de evaluación', rows: 6, hint: 'Escribe uno por línea. Después puedes agregar, cambiar o quitar indicadores.' }) : ''}
        ${errorBox('e-ev')}
        <div class="acciones">
          <button class="btn primary" type="submit">${nuevo ? 'Crear evaluación' : 'Guardar cambios'}</button>
          <a class="btn secondary" href="${volver}">Cancelar</a>
        </div>
      </form>
      ${nuevo ? '' : bloqueBorrar('Eliminar evaluación', 'Se eliminarán sus indicadores y las notas de todos los estudiantes. Esto no se puede deshacer.')}`,
    mount(root) {
      const form = $('#f-ev', root);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(form));
        if (!d.nombre.trim()) { mostrarError(root, 'e-ev', 'Escribe el nombre de la evaluación.'); $('#nombre', root).focus(); return; }
        const datos = { nombre: d.nombre.trim(), tipo: d.tipo, fecha: d.fecha || null, lapso_id: d.lapso_id };
        if (nuevo) {
          const creada = await create('evaluaciones', { asignatura_id: asig.id, ...datos });
          await addIndicadores(creada.id, (d.indicadores || '').split('\n'));
          toast('Evaluación creada');
          ctx.go(`#/evaluar/e/${creada.id}`);
        } else {
          await update('evaluaciones', ev.id, datos);
          toast('Cambios guardados');
          ctx.go(`#/evaluar/e/${ev.id}`);
        }
      });
      if (nuevo) $('#nombre', root).focus();
      if (!nuevo) confirmarBorrado(root, async () => {
        await eliminarEvaluacion(ev.id);
        toast('Evaluación eliminada');
        ctx.go(`#/evaluar/a/${asig.id}`);
      });
    },
  };
}

// =====================================================================
// Evaluación: resumen, indicadores y notas
// =====================================================================
export async function evaluacion(ctx, id) {
  const seccion = await getSeccion();
  if (!seccion) return sinSeccion('Evaluación');
  const ev = await get('evaluaciones', id);
  if (!ev || ev.deleted) return { title: 'Evaluación', html: html`<p class="vacio">No encontré esta evaluación. <a href="#/evaluar">Volver</a></p>` };
  const asig = await get('asignaturas', ev.asignatura_id);
  const lapso = await get('lapsos', ev.lapso_id);
  const [cfg, estudiantes, inds] = [await getConfig(), await listEstudiantes(seccion.id), await listIndicadores(ev.id)];
  const niveles = await nivelesDeEvaluacion(ev.id, inds);
  const notas = {};
  for (const n of await listNotas(ev.id)) notas[n.estudiante_id] = n;
  const filas = estudiantes.map(e => {
    const c = calcularEvaluacion(inds, niveles[e.id] || {}, cfg);
    return { e, c, nota: notas[e.id] ? notaVigente(notas[e.id]) : null, corregida: !!(notas[e.id] && notas[e.id].nota_final != null) };
  });
  const conNota = filas.filter(f => typeof f.nota === 'number');
  const prom = promedio(conNota.map(f => f.nota));
  const aprobados = conNota.filter(f => aprueba(f.nota, cfg)).length;
  const puedeCotejar = inds.length > 0 && estudiantes.length > 0;

  return {
    title: ev.nombre,
    live: true,
    html: html`
      <p><a class="volver" href="#/evaluar/a/${asig?.id}?l=${lapso?.numero || 1}">${icon('atras', 18)} ${asig?.nombre || 'Asignatura'}</a></p>
      <p class="hint meta">${[ev.tipo, fechaCorta(ev.fecha), lapso ? `Lapso ${lapso.numero}` : ''].filter(Boolean).join(', ')} · <a href="#/evaluar/e/${ev.id}/editar">Editar datos</a></p>

      <div class="acciones">
        ${puedeCotejar
          ? html`<a class="btn primary" href="#/evaluar/e/${ev.id}/cotejo">Pasar lista de cotejo</a>`
          : html`<span class="hint">${inds.length === 0 ? 'Agrega al menos un indicador para pasar la lista de cotejo.' : 'Agrega estudiantes para pasar la lista de cotejo.'}</span>`}
      </div>

      ${conNota.length ? html`
        <section class="resumen" aria-label="Resumen de la evaluación">
          <div class="dato"><span class="dato-num ${claseNota(prom, cfg)}">${textoNota(prom)}</span><span class="dato-txt">promedio del curso</span></div>
          <div class="dato"><span class="dato-num">${aprobados} de ${conNota.length}</span><span class="dato-txt">aprobados (${cfg.minimo_aprobatorio ?? 10} o más)</span></div>
        </section>` : ''}

      <h2>Indicadores</h2>
      ${inds.length ? html`
        <ol class="indicadores">${inds.map(i => html`
          <li><a href="#/evaluar/e/${ev.id}/indicador/${i.id}"><span>${i.texto}</span>${i.etiqueta ? html`<small>${i.etiqueta}</small>` : ''}</a></li>`)}</ol>`
        : html`<p class="vacio">Todavía no hay indicadores.</p>`}
      <form id="f-inds" class="stack" novalidate>
        ${areaTexto({ id: 'nuevos', label: 'Agregar indicadores', rows: 3, hint: 'Uno por línea.' })}
        ${errorBox('e-inds')}
        <button class="btn secondary" type="submit">Agregar indicadores</button>
      </form>

      ${estudiantes.length && inds.length ? html`
        <h2>Notas</h2>
        <ol class="hoja">${filas.map(({ e, c, nota, corregida }) => html`
          <li><a class="fila" href="#/evaluar/e/${ev.id}/cotejo?e=${e.id}">
            <span class="margen ${claseNota(nota, cfg)}">${textoNota(nota)}</span>
            <span class="fila-texto">
              <span class="fila-nombre">${e.numero_lista ? `${e.numero_lista}. ` : ''}${e.nombre_completo}</span>
              <span class="fila-sub">${c.completo ? `${Math.round(c.porcentaje)}% de logro${corregida ? ', nota corregida' : ''}` : c.marcados === 0 ? 'Sin marcar' : `${c.marcados} de ${c.total} indicadores marcados`}</span>
            </span>
          </a></li>`)}</ol>` : ''}`,
    mount(root) {
      $('#f-inds', root).addEventListener('submit', async e => {
        e.preventDefault();
        const lineas = $('#nuevos', root).value.split('\n').map(s => s.trim()).filter(Boolean);
        if (!lineas.length) { mostrarError(root, 'e-inds', 'Escribe al menos un indicador.'); $('#nuevos', root).focus(); return; }
        await addIndicadores(ev.id, lineas);
        toast(lineas.length === 1 ? 'Indicador agregado' : `${lineas.length} indicadores agregados`);
        ctx.refresh();
      });
    },
  };
}

// =====================================================================
// Un indicador: editar texto, tema y peso, o eliminar
// =====================================================================
export async function indicadorForm(ctx, evaluacionId, id) {
  const ind = await get('indicadores', id);
  if (!ind || ind.deleted) return { title: 'Indicador', html: html`<p class="vacio">No encontré este indicador. <a href="#/evaluar/e/${evaluacionId}">Volver</a></p>` };
  const volver = `#/evaluar/e/${ind.evaluacion_id}`;
  return {
    title: 'Indicador',
    html: html`
      <p><a class="volver" href="${volver}">${icon('atras', 18)} Evaluación</a></p>
      <form id="f-ind" class="stack" novalidate>
        ${areaTexto({ id: 'texto', label: 'Indicador', value: ind.texto, rows: 3 })}
        ${campo({ id: 'etiqueta', label: 'Tema o contenido', value: ind.etiqueta, hint: 'Opcional. Agrupa indicadores parecidos (por ejemplo: "Fracciones"). Sirve para ver en qué temas el curso va más débil.', extra: 'autocomplete="off"' })}
        ${campo({ id: 'peso', label: 'Peso', value: ind.peso ?? 1, type: 'number', hint: 'Normalmente 1. Un indicador con peso 2 cuenta el doble en la nota.', extra: 'inputmode="decimal" min="1" max="10" step="1"' })}
        ${errorBox('e-ind')}
        <div class="acciones">
          <button class="btn primary" type="submit">Guardar cambios</button>
          <a class="btn secondary" href="${volver}">Cancelar</a>
        </div>
      </form>
      ${bloqueBorrar('Eliminar indicador', 'Se borran las marcas de este indicador y las notas se recalculan. Esto no se puede deshacer.')}`,
    mount(root) {
      $('#f-ind', root).addEventListener('submit', async e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        if (!d.texto.trim()) { mostrarError(root, 'e-ind', 'El indicador no puede quedar vacío.'); return; }
        const peso = Math.max(1, Math.min(10, parseInt(d.peso, 10) || 1));
        await update('indicadores', ind.id, { texto: d.texto.trim(), etiqueta: d.etiqueta.trim() || null, peso });
        await recalcularEvaluacion(ind.evaluacion_id);
        toast('Cambios guardados');
        ctx.go(volver);
      });
      confirmarBorrado(root, async () => {
        await eliminarIndicador(ind);
        toast('Indicador eliminado');
        ctx.go(volver);
      });
    },
  };
}

// =====================================================================
// Lista de cotejo: se marca por indicador o por estudiante
// =====================================================================
const botonesNivel = (actual, ind, est) => html`
  <div class="niveles" role="group" aria-label="Nivel de logro">${NIVELES.map(n => html`
    <button type="button" class="niv niv-${n.id}" data-ind="${ind}" data-est="${est}" data-nivel="${n.id}" aria-pressed="${actual === n.id ? 'true' : 'false'}">${n.nombre}</button>`)}
  </div>`;

export async function cotejo(ctx, id, q) {
  const seccion = await getSeccion();
  if (!seccion) return sinSeccion('Lista de cotejo');
  const ev = await get('evaluaciones', id);
  if (!ev || ev.deleted) return { title: 'Lista de cotejo', html: html`<p class="vacio">No encontré esta evaluación. <a href="#/evaluar">Volver</a></p>` };
  const [cfg, estudiantes, inds] = [await getConfig(), await listEstudiantes(seccion.id), await listIndicadores(ev.id)];
  if (!estudiantes.length || !inds.length) return { title: 'Lista de cotejo', html: html`<p><a class="volver" href="#/evaluar/e/${ev.id}">${icon('atras', 18)} ${ev.nombre}</a></p><p class="vacio">Necesitas al menos un estudiante y un indicador.</p>` };

  const niveles = await nivelesDeEvaluacion(ev.id, inds);
  const notas = {};
  for (const n of await listNotas(ev.id)) notas[n.estudiante_id] = n;
  const params = query(q);
  const porEst = params.has('e');
  const iEst = Math.max(0, estudiantes.findIndex(e => e.id === params.get('e')));
  const iInd = Math.min(inds.length - 1, Math.max(0, parseInt(params.get('i'), 10) || 0));
  const base = `#/evaluar/e/${ev.id}/cotejo`;
  const total = estudiantes.length * inds.length;
  const marcadosTotal = () => estudiantes.reduce((a, e) => a + inds.filter(i => (niveles[e.id] || {})[i.id]).length, 0);

  const pager = (n, de, hrefPrev, hrefNext, etiqueta) => html`
    <nav class="pager" aria-label="${etiqueta}">
      ${hrefPrev ? html`<a class="btn secondary chico" href="${hrefPrev}">${icon('atras', 18)} Anterior</a>` : html`<span></span>`}
      <span class="pager-n">${etiqueta} ${n} de ${de}</span>
      ${hrefNext ? html`<a class="btn secondary chico" href="${hrefNext}">Siguiente ${raw('<span class="gira">')}${icon('atras', 18)}${raw('</span>')}</a>` : html`<span></span>`}
    </nav>`;

  let cuerpo;
  if (!porEst) {
    const ind = inds[iInd];
    cuerpo = html`
      ${pager(iInd + 1, inds.length, iInd > 0 ? `${base}?i=${iInd - 1}` : '', iInd < inds.length - 1 ? `${base}?i=${iInd + 1}` : '', 'Indicador')}
      <p class="indicador-texto">${ind.texto}</p>
      <div class="acciones">
        <button type="button" class="btn secondary chico" id="b-todos">Marcar a todos como Logrado</button>
      </div>
      <ol class="cotejo-lista">${estudiantes.map(e => html`
        <li class="cotejo-fila" data-fila="${e.id}">
          <p class="cotejo-nombre">${e.numero_lista ? `${e.numero_lista}. ` : ''}${e.nombre_completo}</p>
          ${botonesNivel((niveles[e.id] || {})[ind.id], ind.id, e.id)}
        </li>`)}</ol>`;
  } else {
    const e = estudiantes[iEst];
    cuerpo = html`
      ${pager(iEst + 1, estudiantes.length, iEst > 0 ? `${base}?e=${estudiantes[iEst - 1].id}` : '', iEst < estudiantes.length - 1 ? `${base}?e=${estudiantes[iEst + 1].id}` : '', 'Estudiante')}
      <p class="indicador-texto">${e.numero_lista ? `${e.numero_lista}. ` : ''}${e.nombre_completo}</p>
      <div class="nota-vivo" id="nota-vivo" aria-live="polite"></div>
      <ol class="cotejo-lista">${inds.map(i => html`
        <li class="cotejo-fila" data-fila="${i.id}">
          <p class="cotejo-nombre">${i.texto}</p>
          ${botonesNivel((niveles[e.id] || {})[i.id], i.id, e.id)}
        </li>`)}</ol>
      <form id="f-corregir" class="stack corregir" novalidate>
        <h2>Corregir la nota</h2>
        <p class="hint">Si quieres poner otra nota distinta a la calculada, escríbela aquí. La nota calculada no se pierde.</p>
        ${campo({ id: 'nota_final', label: 'Nota (1 a 20)', value: notas[e.id]?.nota_final ?? '', type: 'number', extra: 'inputmode="numeric" min="1" max="20" step="1"' })}
        ${errorBox('e-corr')}
        <div class="acciones">
          <button class="btn secondary" type="submit">Guardar nota corregida</button>
          <button class="btn borrar" type="button" id="b-calc">Volver a la nota calculada</button>
        </div>
      </form>`;
  }

  return {
    title: ev.nombre,
    html: html`
      <p><a class="volver" href="#/evaluar/e/${ev.id}">${icon('atras', 18)} ${ev.nombre}</a></p>
      <nav class="lapso-tabs" aria-label="Forma de marcar">
        <a href="${base}?i=0" ${!porEst ? raw('aria-current="page"') : ''}>Por indicador</a>
        <a href="${base}?e=${estudiantes[0].id}" ${porEst ? raw('aria-current="page"') : ''}>Por estudiante</a>
      </nav>
      <p class="progreso" id="progreso" aria-live="polite"></p>
      ${cuerpo}`,
    mount(root) {
      const progreso = () => {
        const m = marcadosTotal();
        $('#progreso', root).textContent = m === total ? `Todo marcado (${total} de ${total})` : `Marcado ${m} de ${total}`;
      };
      const pintarNota = () => {
        const el = $('#nota-vivo', root);
        if (!el) return;
        const e = estudiantes[iEst];
        const c = calcularEvaluacion(inds, niveles[e.id] || {}, cfg);
        const corr = notas[e.id]?.nota_final;
        if (!c.completo) el.innerHTML = `<span class="hint">Marcados ${c.marcados} de ${c.total}. La nota aparece cuando marques todos.</span>`;
        else el.innerHTML = `<strong class="${claseNota(corr ?? c.nota, cfg)}">Nota ${corr ?? c.nota}</strong> <span class="hint">${Math.round(c.porcentaje)}% de logro${corr != null ? `, corregida (calculada: ${c.nota})` : ''}</span>`;
      };
      const marcar = (btn, nivel) => {
        const grupo = btn.closest('.niveles');
        $$('.niv', grupo).forEach(b => b.setAttribute('aria-pressed', b.dataset.nivel === nivel ? 'true' : 'false'));
      };

      $('.cotejo-lista', root).addEventListener('click', async ev2 => {
        // El escuchador va en la lista (se crea de nuevo en cada pantalla), no en #view, que se reutiliza.
        const b = ev2.target.closest('.niv');
        if (!b) return;
        const { ind, est } = b.dataset;
        const actual = (niveles[est] || {})[ind];
        const nuevo = actual === b.dataset.nivel ? null : b.dataset.nivel;
        (niveles[est] ||= {})[ind] = nuevo;
        if (!nuevo) delete niveles[est][ind];
        marcar(b, nuevo);
        progreso();
        pintarNota();
        await setNivel(ev.id, ind, est, nuevo);
        const n = await get('notas', idPar(ev.id, est));
        if (n) notas[est] = n;
        pintarNota();
      });

      const todos = $('#b-todos', root);
      if (todos) todos.addEventListener('click', async () => {
        const ind = inds[iInd];
        const pares = estudiantes.map(e => [ind.id, e.id]);
        for (const e of estudiantes) (niveles[e.id] ||= {})[ind.id] = 'logrado';
        $$('.cotejo-fila', root).forEach(li => marcar($('.niv', li), 'logrado'));
        progreso();
        await setNiveles(ev.id, pares, 'logrado');
        toast('Todos marcados como Logrado. Cambia solo a quien no lo logró.');
      });

      const f = $('#f-corregir', root);
      if (f) {
        const e = estudiantes[iEst];
        f.addEventListener('submit', async x => {
          x.preventDefault();
          const v = parseInt($('#nota_final', root).value, 10);
          if (Number.isNaN(v) || v < 1 || v > 20) { mostrarError(root, 'e-corr', 'Escribe una nota entera entre 1 y 20.'); return; }
          mostrarError(root, 'e-corr', '');
          await corregirNota(ev.id, e.id, v);
          notas[e.id] = await get('notas', idPar(ev.id, e.id));
          pintarNota();
          toast('Nota corregida guardada');
        });
        $('#b-calc', root).addEventListener('click', async () => {
          await corregirNota(ev.id, e.id, null);
          notas[e.id] = await get('notas', idPar(ev.id, e.id));
          $('#nota_final', root).value = '';
          pintarNota();
          toast('Se usa la nota calculada');
        });
      }
      progreso();
      pintarNota();
    },
  };
}

// =====================================================================
// Ajustes: cómo se calcula la nota
// =====================================================================
export async function bloqueCalculo() {
  const cfg = await getConfig();
  return {
    html: html`
      <section class="bloque" aria-labelledby="t-calculo">
        <h2 id="t-calculo">Cómo se calcula la nota</h2>
        <p>Cada indicador marcado como <strong>Logrado</strong> suma 1 punto y <strong>No logrado</strong> suma 0. La nota va de 1 a 20: es 20 por el porcentaje de puntos obtenidos, redondeada.</p>
        <form id="f-calculo" class="stack" novalidate>
          ${campo({ id: 'puntos_en_proceso', label: 'Puntos de "En proceso"', value: cfg.puntos_en_proceso ?? 0.5, type: 'number', hint: 'Entre 0 y 1. Con 0,5 vale la mitad de un Logrado.', extra: 'inputmode="decimal" min="0" max="1" step="0.05"' })}
          ${campo({ id: 'minimo_aprobatorio', label: 'Nota mínima aprobatoria', value: cfg.minimo_aprobatorio ?? 10, type: 'number', extra: 'inputmode="numeric" min="1" max="20" step="1"' })}
          ${campo({ id: 'umbral_indicador_debil', label: 'Un indicador se considera débil por debajo de (%)', value: cfg.umbral_indicador_debil ?? 50, type: 'number', hint: 'Se usará en los reportes para señalar en qué falla el curso o un estudiante.', extra: 'inputmode="numeric" min="1" max="100" step="1"' })}
          ${errorBox('e-calculo')}
          <button class="btn primary" type="submit">Guardar</button>
        </form>
      </section>`,
    mount(root, seccion) {
      $('#f-calculo', root).addEventListener('submit', async e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        const pp = Number(String(d.puntos_en_proceso).replace(',', '.'));
        const mn = parseInt(d.minimo_aprobatorio, 10);
        const um = parseInt(d.umbral_indicador_debil, 10);
        if (Number.isNaN(pp) || pp < 0 || pp > 1) { mostrarError(root, 'e-calculo', 'Los puntos de "En proceso" deben estar entre 0 y 1.'); return; }
        if (Number.isNaN(mn) || mn < 1 || mn > 20) { mostrarError(root, 'e-calculo', 'La nota mínima debe estar entre 1 y 20.'); return; }
        if (Number.isNaN(um) || um < 1 || um > 100) { mostrarError(root, 'e-calculo', 'El porcentaje debe estar entre 1 y 100.'); return; }
        mostrarError(root, 'e-calculo', '');
        const actual = await getConfig();
        await update('configuracion', actual.id, { puntos_en_proceso: pp, minimo_aprobatorio: mn, umbral_indicador_debil: um });
        if (seccion) await recalcularTodo(seccion.id);
        toast('Guardado. Las notas se recalcularon.');
      });
    },
  };
}

// =====================================================================
// Ajustes: asistente de redacción (IA)
// =====================================================================
export function bloqueIA(ctx) {
  const disponible = ctx.iaDisponible && ctx.iaDisponible();
  return {
    html: html`
      <section class="bloque" aria-labelledby="t-ia">
        <h2 id="t-ia">Asistente de redacción (IA)</h2>
        <p>Redacta borradores de la descripción del lapso y sugiere actividades de refuerzo. Siempre ves lo que se envía y el resultado es un borrador que tú revisas.</p>
        <p class="hint">La IA recibe códigos como "Estudiante 7", notas, indicadores y porcentajes. Nunca recibe nombres, cédula, fecha de nacimiento ni contactos.</p>
        ${disponible ? html`
          <div class="acciones"><button type="button" class="btn secondary" id="b-probar-ia">Probar la conexión con la IA</button></div>
          <p id="estado-ia" class="estado" aria-live="polite"></p>`
          : html`<p class="estado local">Disponible cuando el respaldo en la nube esté activo y hayas iniciado sesión.</p>`}
      </section>`,
    mount(root) {
      const b = $('#b-probar-ia', root);
      if (!b) return;
      b.addEventListener('click', async () => {
        const out = $('#estado-ia', root);
        out.className = 'estado';
        out.textContent = 'Probando…';
        b.disabled = true;
        try {
          const r = await ctx.ia('prueba', '');
          out.className = 'estado ok';
          out.textContent = `La IA responde (${r.proveedor}).`;
        } catch (e) {
          out.className = 'estado error';
          out.textContent = mensajeIAAjustes(e);
        }
        b.disabled = false;
      });
    },
  };
}
function mensajeIAAjustes(e) {
  const c = e && e.codigo ? e.codigo : '';
  if (c === 'no_desplegada') return 'La función de IA todavía no está instalada en Supabase.';
  if (c === 'sin_sesion') return 'Tu sesión venció. Cierra sesión y vuelve a entrar.';
  if (c === 'cuota') return 'La IA gratuita llegó a su límite por ahora.';
  if (c === 'ia_no_disponible') return /_503|_500|_502/.test(e.detalle || '') ? 'La IA de Google está saturada en este momento. Espera un minuto y vuelve a probar.' : /_401|_403|sin_clave/.test(e.detalle || '') ? `La función existe, pero la clave de la IA no sirve o falta en Supabase. ${e.detalle || ''}`.trim() : `La función existe, pero la IA no respondió. ${e.detalle || ''}`.trim();
  if (c === 'offline') return 'No hay conexión con internet.';
  return 'No se pudo conectar con la IA.';
}
