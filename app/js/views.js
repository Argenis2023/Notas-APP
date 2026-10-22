// Pantallas de la app. Cada una devuelve { title, html, mount?, onStatus?, live? }.
import {
  getSeccion, crearSeccion, getLapsos, lapsoActual, listEstudiantes, addEstudiante, get, update, remove,
  getConfig, importEstudiantes, nombrePropio, anioEscolarActual, exportAll, restoreAll, validateBackup, listAsignaturas, listEvaluaciones,
} from './data.js';
import { html, raw, icon, toast, fechaCorta, haceCuanto, infoEstado } from './ui.js';
import { VERSION } from './version.js';

import { bloqueCalculo, bloqueIA } from './views-eval.js';
import { panelInicio } from './views-inicio.js';
import { montarAvisos } from './views-avisos.js';
import { $, $$, campo, areaTexto, errorBox, mostrarError } from './form.js';
import { bloqueProgramacion } from './views-reporte-semanal.js';
import { bloqueAjustes, montarBloqueoAjustes, hayPin } from './bloqueo.js';
import { leerInstitucion, guardarInstitucion, procesarLogo, coloresDelLogo, paleta, hexValido, COLOR_BASE } from './institucion.js';

// =====================================================================
// Inicio
// =====================================================================
export async function inicio(ctx, q = '') {
  const seccion = await getSeccion();

  if (!seccion) {
    return {
      title: 'Cuaderno docente',
      html: html`
        <section class="intro">
          <h2>Empecemos por tu sección</h2>
          <p>Con estos datos se arma la portada de tu cuaderno. Puedes cambiarlos cuando quieras en Ajustes.</p>
        </section>
        <form id="f-seccion" class="stack" novalidate>
          ${campo({ id: 'nombre', label: 'Sección', required: true, extra: 'placeholder="Por ejemplo: A" autocomplete="off"' })}
          ${campo({ id: 'grado', label: 'Grado', extra: 'placeholder="Por ejemplo: 4° grado" autocomplete="off"' })}
          ${campo({ id: 'anio_escolar', label: 'Año escolar', value: anioEscolarActual(), placeholder: 'Por ejemplo: 2026-2027', extra: 'autocomplete="off"' })}
          ${errorBox('e-seccion')}
          <button class="btn primary" type="submit">Crear mi cuaderno</button>
        </form>`,
      mount(root) {
        $('#f-seccion', root).addEventListener('submit', async e => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.target));
          if (!d.nombre.trim()) { mostrarError(root, 'e-seccion', 'Escribe el nombre de la sección, por ejemplo A.'); $('#nombre', root).focus(); return; }
          await crearSeccion(d);
          toast('Tu cuaderno está listo');
          ctx.refresh();
        });
        $('#nombre', root).focus();
      },
    };
  }

  const lapsos = await getLapsos(seccion.id);
  const estudiantes = await listEstudiantes(seccion.id);
  const fechasListas = lapsos.some(l => l.fecha_inicio && l.fecha_fin);
  const actual = lapsoActual(lapsos);
  const asignaturas = await listAsignaturas(seccion.id);
  let hayEvaluacion = false;
  for (const a of asignaturas) if ((await listEvaluaciones(a.id)).length) { hayEvaluacion = true; break; }
  const completo = fechasListas && estudiantes.length > 0 && asignaturas.length > 0 && hayEvaluacion;
  const sinRespaldo = !ctx.configurado;
  const panel = await panelInicio(ctx, seccion, completo, q);

  return {
    title: 'Cuaderno docente',
    live: true,
    html: html`
      ${completo ? '' : html`
        <section aria-labelledby="pasos-t">
          <h2 id="pasos-t">Para dejar el cuaderno listo</h2>
          <ul class="pasos">
            <li class="hecho"><span class="marca">${icon('check', 18)}</span><div><strong>Crear la sección</strong></div></li>
            <li class="${fechasListas ? 'hecho' : ''}">
              <span class="marca">${fechasListas ? icon('check', 18) : ''}</span>
              <div><strong>Poner las fechas del lapso en curso</strong>
                ${fechasListas ? '' : html`<p><a class="btn secondary chico" href="#/ajustes?c=colegio">Poner fechas</a></p>`}</div>
            </li>
            <li class="${estudiantes.length ? 'hecho' : ''}">
              <span class="marca">${estudiantes.length ? icon('check', 18) : ''}</span>
              <div><strong>Cargar a tus estudiantes</strong>
                ${estudiantes.length ? html`<p class="hint">${estudiantes.length} ${estudiantes.length === 1 ? 'cargado' : 'cargados'}.</p><p class="acciones"><a class="btn secondary chico" href="#/estudiantes">Ver estudiantes</a></p>` : html`
                  <p class="acciones">
                    <a class="btn primary chico" href="#/estudiantes/nuevo">Agregar uno</a>
                    <a class="btn secondary chico" href="#/estudiantes/importar">Importar de Excel</a>
                  </p>`}
              </div>
            </li>
            <li class="${asignaturas.length ? 'hecho' : ''}">
              <span class="marca">${asignaturas.length ? icon('check', 18) : ''}</span>
              <div><strong>Agregar tus asignaturas</strong>
                ${asignaturas.length ? html`<p class="hint">${asignaturas.length} ${asignaturas.length === 1 ? 'agregada' : 'agregadas'}.</p><p class="acciones"><a class="btn secondary chico" href="#/evaluar">Ver asignaturas</a></p>` : html`<p><a class="btn primary chico" href="#/evaluar">Agregar asignaturas</a></p>`}
              </div>
            </li>
            <li class="${hayEvaluacion ? 'hecho' : ''}">
              <span class="marca">${hayEvaluacion ? icon('check', 18) : ''}</span>
              <div><strong>Crear tu primera evaluación</strong>
                ${hayEvaluacion ? '' : html`<p class="hint">Entra a una asignatura y toca "Nueva evaluación".</p>`}
              </div>
            </li>
          </ul>
        </section>`}

      ${panel}

      ${sinRespaldo ? html`<aside class="nota" role="note"><strong>Tus datos solo están en este celular.</strong> El respaldo en la nube todavía no está activado. Mientras tanto, descarga una copia desde Ajustes de vez en cuando.</aside>` : ''}
    `,
    mount(root) { montarAvisos(root); },
  };
}

// =====================================================================
// Estudiantes: lista
// =====================================================================
export async function estudiantes(ctx) {
  const seccion = await getSeccion();
  if (!seccion) return { title: 'Estudiantes', html: html`<p class="vacio">Primero crea tu sección en <a class="btn secondary chico" href="#/">Inicio</a>.</p>` };
  const todos = await listEstudiantes(seccion.id);

  const fila = e => html`
    <li><a class="fila" href="#/estudiantes/${e.id}">
      <span class="margen">${e.numero_lista ?? ''}</span>
      <span class="fila-texto">
        <span class="fila-nombre">${e.nombre_completo}</span>
        ${e.representante_nombre || e.representante_contacto
          ? html`<span class="fila-sub">${[e.representante_nombre, e.representante_contacto].filter(Boolean).join(', ')}</span>` : ''}
      </span>
    </a></li>`;

  const lista = (items, q) => {
    if (!items.length) {
      return q
        ? html`<p class="vacio">Ningún estudiante coincide con "${q}".</p>`
        : html`<div class="vacio"><p><strong>Todavía no hay estudiantes.</strong></p><p>Agrégalos uno por uno o importa tu lista desde Excel.</p></div>`;
    }
    return html`<ol class="hoja">${items.map(fila)}</ol>`;
  };

  return {
    title: 'Estudiantes',
    live: true,
    html: html`
      <div class="acciones">
        <a class="btn primary" href="#/estudiantes/nuevo">${icon('mas', 20)} Agregar</a>
        <a class="btn secondary" href="#/estudiantes/importar">${icon('subir', 20)} Importar</a>
      </div>
      ${todos.length > 6 ? html`
        <div class="field buscar">
          <label for="q">Buscar por nombre o cédula</label>
          <input id="q" type="search" autocomplete="off" inputmode="search" placeholder="Escribe un nombre para buscar">
        </div>` : ''}
      <p class="contador" id="contador" aria-live="polite">${todos.length} ${todos.length === 1 ? 'estudiante' : 'estudiantes'}</p>
      <div id="lista">${lista(todos, '')}</div>`,
    mount(root) {
      const q = $('#q', root);
      if (!q) return;
      const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      q.addEventListener('input', () => {
        const t = norm(q.value.trim());
        const f = t ? todos.filter(e => norm(e.nombre_completo).includes(t) || norm(e.cedula).includes(t)) : todos;
        $('#lista', root).innerHTML = lista(f, q.value.trim()).toString();
        $('#contador', root).textContent = t ? `${f.length} de ${todos.length}` : `${todos.length} ${todos.length === 1 ? 'estudiante' : 'estudiantes'}`;
      });
    },
  };
}

// =====================================================================
// Estudiantes: ficha (nuevo o editar)
// =====================================================================
export async function estudianteForm(ctx, id) {
  const seccion = await getSeccion();
  if (!seccion) return { title: 'Estudiante', html: html`<p class="vacio">Primero crea tu sección en <a class="btn secondary chico" href="#/">Inicio</a>.</p>` };
  const todos = await listEstudiantes(seccion.id);
  const nuevo = !id || id === 'nuevo';
  const e = nuevo ? null : await get('estudiantes', id);
  if (!nuevo && (!e || e.deleted)) return { title: 'Estudiante', html: html`<p class="vacio">No encontré a este estudiante. <a class="btn secondary chico" href="#/estudiantes">Volver a la lista</a></p>` };
  const siguiente = Math.max(0, ...todos.map(x => x.numero_lista || 0)) + 1;

  return {
    title: nuevo ? 'Nuevo estudiante' : 'Estudiante',
    html: html`
      <p><a class="volver" href="#/estudiantes">${icon('atras', 18)} Estudiantes</a></p>
      ${e ? html`<div class="acciones">
        <a class="btn secondary chico" href="#/asistencia/calendario?e=${e.id}">Su asistencia</a>
        <a class="btn secondary chico" href="#/representantes?e=${e.id}">Escribir al representante</a>
        <a class="btn secondary chico" href="#/anotaciones?e=${e.id}">Sus anotaciones</a>
      </div>` : ''}
      <form id="f-est" class="stack" novalidate>
        <h2 class="grupo-t">Datos del estudiante</h2>
        ${campo({ id: 'nombre_completo', label: 'Nombre completo', value: e?.nombre_completo, required: true, placeholder: 'Por ejemplo: María Pérez', extra: 'autocomplete="off"' })}
        ${campo({ id: 'numero_lista', label: 'N.º de lista', value: e ? e.numero_lista : siguiente, type: 'number', placeholder: 'Por ejemplo: 7', extra: 'inputmode="numeric" min="1" step="1"' })}
        ${campo({ id: 'cedula', label: 'Cédula o cédula escolar', value: e?.cedula, placeholder: 'Por ejemplo: V-31234567 o cédula escolar', extra: 'autocomplete="off"' })}
        ${campo({ id: 'fecha_nacimiento', label: 'Fecha de nacimiento', value: e?.fecha_nacimiento, type: 'date' })}
        <h2 class="grupo-t">Representante</h2>
        ${campo({ id: 'representante_nombre', label: 'Nombre del representante', value: e?.representante_nombre, placeholder: 'Por ejemplo: Carmen Gil', extra: 'autocomplete="off"' })}
        ${campo({ id: 'representante_contacto', label: 'Contacto del representante', value: e?.representante_contacto, type: 'tel', placeholder: 'Teléfono, por ejemplo: 0412 123 4567', extra: 'autocomplete="off"' })}
        <h2 class="grupo-t">Para tus informes</h2>
        ${areaTexto({ id: 'necesidades_educativas', label: 'Necesidades educativas', value: e?.necesidades_educativas, placeholder: 'Opcional. Por ejemplo: necesita sentarse cerca del pizarrón; apoyo en lectura.' })}
        ${areaTexto({ id: 'observaciones_conducta', label: 'Observaciones de conducta', value: e?.observaciones_conducta, placeholder: 'Opcional. Por ejemplo: colabora con sus compañeros; conversa durante las explicaciones.' })}
        ${e ? html`<p class="hint codigo">Código para la IA: <strong>${e.codigo_ia}</strong>. Cuando se use IA, verá este código y nunca el nombre.</p>` : ''}
        ${errorBox('e-est')}
        <div class="acciones">
          <button class="btn primary" type="submit">${nuevo ? 'Agregar estudiante' : 'Guardar cambios'}</button>
          <a class="btn secondary" href="#/estudiantes">Cancelar</a>
        </div>
      </form>
      ${nuevo ? '' : html`
        <section class="peligro">
          <button class="btn borrar" type="button" id="b-borrar">Eliminar estudiante</button>
          <div id="confirmar" hidden>
            <p><strong>¿Eliminar a ${e.nombre_completo}?</strong> Dejará de aparecer en tu lista.</p>
            <div class="acciones">
              <button class="btn danger" type="button" id="b-si">Sí, eliminar</button>
              <button class="btn secondary" type="button" id="b-no">No, conservar</button>
            </div>
          </div>
        </section>`}`,
    mount(root) {
      const form = $('#f-est', root);
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(form));
        if (!d.nombre_completo.trim()) { mostrarError(root, 'e-est', 'Escribe el nombre del estudiante.'); $('#nombre_completo', root).focus(); return; }
        const n = parseInt(d.numero_lista, 10);
        if (!Number.isNaN(n)) {
          const otro = todos.find(x => x.numero_lista === n && x.id !== e?.id);
          if (otro) { mostrarError(root, 'e-est', `El N° ${n} ya es de ${otro.nombre_completo}. Elige otro número.`); $('#numero_lista', root).focus(); return; }
        }
        if (nuevo) await addEstudiante(seccion.id, d);
        else await update('estudiantes', e.id, { ...d, nombre_completo: nombrePropio(d.nombre_completo), representante_nombre: nombrePropio(d.representante_nombre) });
        toast(nuevo ? 'Estudiante agregado' : 'Cambios guardados');
        ctx.go('#/estudiantes');
      });
      if (nuevo) $('#nombre_completo', root).focus();
      const b = $('#b-borrar', root);
      if (b) {
        b.addEventListener('click', () => { $('#confirmar', root).hidden = false; b.hidden = true; $('#b-no', root).focus(); });
        $('#b-no', root).addEventListener('click', () => { $('#confirmar', root).hidden = true; b.hidden = false; b.focus(); });
        $('#b-si', root).addEventListener('click', async () => {
          await remove('estudiantes', e.id);
          toast('Estudiante eliminado');
          ctx.go('#/estudiantes');
        });
      }
    },
  };
}

// =====================================================================
// Estudiantes: importar desde Excel
// =====================================================================
export async function importar(ctx) {
  const seccion = await getSeccion();
  if (!seccion) return { title: 'Importar', html: html`<p class="vacio">Primero crea tu sección en <a class="btn secondary chico" href="#/">Inicio</a>.</p>` };

  return {
    title: 'Importar de Excel',
    html: html`
      <p><a class="volver" href="#/estudiantes">${icon('atras', 18)} Estudiantes</a></p>
      <section class="paso">
        <h2>Paso 1. Prepara tu lista</h2>
        <p>Usa tu propio Excel o descarga la plantilla. Solo el nombre es obligatorio. Los títulos de las columnas pueden ser, por ejemplo: Nombre completo, Cédula, Fecha de nacimiento, Representante, Contacto.</p>
        <button class="btn secondary" type="button" id="b-plantilla">${icon('bajar', 20)} Descargar plantilla</button>
      </section>
      <section class="paso">
        <h2>Paso 2. Elige el archivo</h2>
        <label class="btn primary" for="archivo">${icon('subir', 20)} Elegir archivo de Excel</label>
        <input id="archivo" class="oculto-visual" type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv">
        ${errorBox('e-imp')}
      </section>
      <section id="vista" aria-live="polite"></section>`,
    mount(root) {
      $('#b-plantilla', root).addEventListener('click', async () => {
        const { plantillaEstudiantes } = await import('./excel.js');
        await plantillaEstudiantes();
      });

      $('#archivo', root).addEventListener('change', async ev => {
        const file = ev.target.files && ev.target.files[0];
        mostrarError(root, 'e-imp', '');
        $('#vista', root).innerHTML = '';
        if (!file) return;
        try {
          const ex = await import('./excel.js');
          const buf = await file.arrayBuffer();
          const { filas, avisos } = await ex.leerEstudiantes(buf);
          if (!filas.length) { mostrarError(root, 'e-imp', 'El archivo no tiene estudiantes para importar.'); return; }
          const existentes = await listEstudiantes(seccion.id);
          const marcadas = ex.marcarRepetidos(filas, existentes);
          pintarVista(root, marcadas, avisos, seccion);
        } catch (err) {
          mostrarError(root, 'e-imp', err.message || 'No se pudo leer el archivo.');
        }
      });
    },
  };

  function pintarVista(root, marcadas, avisos, seccion) {
    const nuevos = marcadas.filter(f => !f._repetido);
    const repetidos = marcadas.filter(f => f._repetido);
    const muestra = marcadas.slice(0, 8);
    $('#vista', root).innerHTML = html`
      <section class="paso">
        <h2>Paso 3. Revisa e importa</h2>
        <p><strong>${marcadas.length} ${marcadas.length === 1 ? 'estudiante encontrado' : 'estudiantes encontrados'}:</strong>
          ${nuevos.length} ${nuevos.length === 1 ? 'nuevo' : 'nuevos'}${repetidos.length ? `, ${repetidos.length} ${repetidos.length === 1 ? 'repetido' : 'repetidos'}` : ''}.</p>
        ${avisos.length ? html`<ul class="avisos">${avisos.slice(0, 6).map(a => html`<li>${a}</li>`)}${avisos.length > 6 ? html`<li>y ${avisos.length - 6} avisos más.</li>` : ''}</ul>` : ''}
        <div class="tabla-wrap">
          <table class="tabla">
            <caption class="solo-lectores">Vista previa de los primeros estudiantes del archivo</caption>
            <thead><tr><th scope="col">N°</th><th scope="col">Nombre</th><th scope="col">Cédula</th><th scope="col">Estado</th></tr></thead>
            <tbody>${muestra.map(f => html`<tr class="${f._repetido ? 'rep' : ''}"><td>${f.numero_lista ?? ''}</td><td>${f.nombre_completo}</td><td>${f.cedula || ''}</td><td>${f._repetido ? f._repetido : 'Nuevo'}</td></tr>`)}</tbody>
          </table>
        </div>
        ${marcadas.length > muestra.length ? html`<p class="hint">Se muestran los primeros ${muestra.length}.</p>` : ''}
        ${repetidos.length ? html`<label class="check"><input type="checkbox" id="c-rep"> <span>Importar también los repetidos</span></label>` : ''}
        <div class="acciones">
          <button class="btn primary" type="button" id="b-importar"></button>
          <a class="btn secondary" href="#/estudiantes">Cancelar</a>
        </div>
      </section>`.toString();

    const boton = $('#b-importar', root);
    const total = () => ($('#c-rep', root) && $('#c-rep', root).checked ? marcadas.length : nuevos.length);
    const etiqueta = () => {
      const n = total();
      boton.textContent = n ? `Importar ${n} ${n === 1 ? 'estudiante' : 'estudiantes'}` : 'No hay estudiantes nuevos';
      boton.disabled = !n;
    };
    etiqueta();
    const c = $('#c-rep', root);
    if (c) c.addEventListener('change', etiqueta);
    boton.addEventListener('click', async () => {
      const elegidos = (c && c.checked ? marcadas : nuevos).map(({ _linea, _repetido, ...resto }) => resto);
      boton.disabled = true;
      const n = await importEstudiantes(seccion.id, elegidos);
      toast(`${n} ${n === 1 ? 'estudiante importado' : 'estudiantes importados'}`);
      ctx.go('#/estudiantes');
    });
  }
}

// =====================================================================
// Ajustes
// =====================================================================
const CATEGORIAS_AJUSTES = [
  ['colegio', 'Mi colegio y curso', 'inicio'],
  ['notas', 'Notas y asistente de IA', 'evaluar'],
  ['avisos', 'Avisos y reporte semanal', 'campana'],
  ['seguridad', 'Seguridad', 'candado'],
  ['datos', 'Datos y respaldo', 'nube'],
  ['cuenta', 'Mi cuenta', 'personas'],
  ['app', 'La aplicación', 'ajustes'],
];

export async function ajustes(ctx, query = '') {
  const cat = (CATEGORIAS_AJUSTES.find(c => c[0] === new URLSearchParams(query || '').get('c')) || [])[0] || '';
  const seccion = await getSeccion();
  const calculo = await bloqueCalculo();
  const asistente = bloqueIA(ctx);
  const programa = bloqueProgramacion(ctx);
  const lapsos = seccion ? await getLapsos(seccion.id) : [];
  const inst = await leerInstitucion();

  const bloqueInstitucion = html`
    <section class="bloque" aria-labelledby="t-inst">
      <h2 id="t-inst">Mi institución</h2>
      <p class="hint">Estos datos aparecen en la parte de arriba de la app y en el encabezado de tus informes. Puedes cambiarlos cuando quieras.</p>
      <form id="f-inst" class="stack" novalidate>
        <p class="hint">Así se ve la barra de arriba de la app:</p>
        <div id="inst-prev" class="inst-prev" aria-label="Vista previa de la cabecera"></div>
        ${campo({ id: 'inst_nombre', label: 'Nombre de la institución', value: inst.nombre, extra: 'autocomplete="off" placeholder="Por ejemplo: U.E.E. Nombre del colegio"' })}
        ${campo({ id: 'inst_subtitulo', label: 'Ubicación o lema', value: inst.subtitulo, extra: 'autocomplete="off" placeholder="Por ejemplo: El Bambú, estado Miranda"' })}
        ${areaTexto({ id: 'inst_encabezado', label: 'Encabezado de los informes', value: inst.encabezado, rows: 3, placeholder: 'República Bolivariana de Venezuela\nMinisterio del Poder Popular para la Educación', hint: 'Una línea por renglón, por ejemplo: República Bolivariana de Venezuela, y debajo: Ministerio del Poder Popular para la Educación.' })}
        ${campo({ id: 'inst_docente', label: 'Tu nombre', value: inst.docente, placeholder: 'Por ejemplo: Prof. Laura Rodríguez', extra: 'autocomplete="name"', hint: 'Aparece en el saludo de Inicio y en la firma de los informes.' })}
        <div class="field">
          <span class="field-t" id="t-logo"><strong>Logo</strong></span>
          <div class="inst-logo" role="group" aria-labelledby="t-logo">
            <img id="inst-logo-img" class="inst-logo-img" alt="Logo actual" hidden>
            <span id="inst-logo-vacio" class="inst-logo-vacio">Sin logo</span>
            <label class="btn secondary chico" for="inst_logo">${icon('subir', 18)} Elegir imagen</label>
            <input id="inst_logo" class="oculto-visual" type="file" accept="image/png,image/jpeg,image/webp">
            <button class="btn borrar chico" type="button" id="b-logo-quitar" hidden>Quitar logo</button>
          </div>
          <p class="hint">Se reduce automáticamente para que el respaldo sea liviano.</p>
        </div>
        <div class="field">
          <label for="inst_color">Color principal</label>
          <div class="inst-color">
            <input id="inst_color" type="color" value="${inst.color || COLOR_BASE}">
            <button class="btn secondary chico" type="button" id="b-color-base">Usar el color base</button>
          </div>
          <div id="inst-swatches" class="inst-swatches" hidden>
            <span class="hint">Colores de tu logo, toca uno para usarlo:</span>
            <div id="inst-swatches-lista" class="inst-swatches-lista"></div>
          </div>
          <p class="hint">La app ajusta los tonos para que el texto siempre se lea bien, también en modo oscuro.</p>
        </div>
        ${errorBox('e-inst')}
        <button class="btn primary" type="submit">Guardar mi institución</button>
      </form>
    </section>`;

  const bloqueSeccion = seccion ? html`
    <section class="bloque" aria-labelledby="t-seccion">
      <h2 id="t-seccion">Sección y lapsos</h2>
      <form id="f-ajustes-seccion" class="stack" novalidate>
        ${campo({ id: 'nombre', label: 'Sección', value: seccion.nombre, required: true, placeholder: 'Por ejemplo: A', extra: 'autocomplete="off"' })}
        ${campo({ id: 'grado', label: 'Grado', value: seccion.grado, placeholder: 'Por ejemplo: 4° grado', extra: 'autocomplete="off"' })}
        ${campo({ id: 'anio_escolar', label: 'Año escolar', value: seccion.anio_escolar, placeholder: 'Por ejemplo: 2026-2027', extra: 'autocomplete="off"' })}
        <fieldset class="lapsos">
          <legend>Fechas de los lapsos</legend>
          ${lapsos.map(l => html`
            <div class="lapso">
              <p class="lapso-nombre">Lapso ${l.numero}</p>
              ${campo({ id: `ini-${l.id}`, label: 'Inicio', value: l.fecha_inicio, type: 'date' })}
              ${campo({ id: `fin-${l.id}`, label: 'Fin', value: l.fecha_fin, type: 'date' })}
            </div>`)}
        </fieldset>
        ${errorBox('e-ajustes')}
        <button class="btn primary" type="submit">Guardar sección y lapsos</button>
      </form>
    </section>` : html`<section class="bloque"><h2>Sección y lapsos</h2><p>Primero crea tu sección en <a class="btn secondary chico" href="#/">Inicio</a>.</p></section>`;

  const respaldo = html`
    <section class="bloque" aria-labelledby="t-respaldo">
      <h2 id="t-respaldo">Respaldo de tus datos</h2>
      <p id="estado-respaldo" class="estado" aria-live="polite"></p>
      <div class="acciones" id="acc-nube"></div>
      <h3>Copias en este celular</h3>
      <p class="hint">Guárdalas en un lugar seguro, por ejemplo tu correo o Google Drive.</p>
      <div class="acciones">
        <button class="btn secondary" type="button" id="b-excel">${icon('bajar', 20)} Descargar Excel con todo</button>
        <button class="btn secondary" type="button" id="b-json">${icon('bajar', 20)} Descargar copia de seguridad</button>
      </div>
      <div class="field">
        <label class="btn secondary" for="f-restaurar">${icon('subir', 20)} Restaurar una copia de seguridad</label>
        <input id="f-restaurar" class="oculto-visual" type="file" accept=".json,application/json">
      </div>
      ${errorBox('e-restaurar')}
      <div id="restaurar-vista" aria-live="polite"></div>
    </section>`;

  const cuenta = html`
    <section class="bloque" aria-labelledby="t-cuenta">
      <h2 class="oculto-visual" id="t-cuenta">Cuenta</h2>
      ${!ctx.configurado ? html`<p>El respaldo en la nube no está activado. Cuando se active, aquí aparecerá tu cuenta.</p>`
        : ctx.sesion ? html`
          <p>Sesión iniciada como <strong>${ctx.sesion.email}</strong>.</p>
          <button class="btn secondary" type="button" id="b-salir">Cerrar sesión</button>
          <div id="salir-conf" hidden>
            <p><strong>¿Cerrar sesión?</strong> Primero se respaldan tus datos en la nube y después se borran de este celular, para que nadie más los vea. Para volver a verlos, entra con tu correo. Si no se puede respaldar, la sesión no se cierra y no se borra nada.</p>
            ${errorBox('e-salir')}
            <div class="acciones">
              <button class="btn danger" type="button" id="b-salir-si">Respaldar y cerrar sesión</button>
              <button class="btn secondary" type="button" id="b-salir-no">No, seguir</button>
            </div>
          </div>`
        : html`<p>No has iniciado sesión. <a class="btn secondary chico" href="${location.pathname}" id="a-recargar">Entrar</a></p>`}
    </section>`;

  const pinActivo = await hayPin();
  const conNube = !!(ctx.configurado && ctx.sesion);
  const borrar = html`
    <section class="bloque bloque-peligro" aria-labelledby="t-borrar">
      <h2 id="t-borrar">Borrar todos mis datos</h2>
      <p>Elimina estudiantes, evaluaciones, notas, asistencia y los datos de tu institución${conNube ? ', tanto en este celular como en la copia de la nube' : ' de este celular'}. <strong>No se puede deshacer.</strong> Antes de borrar, descarga una copia de seguridad en el bloque de Respaldo.</p>
      <button class="btn borrar" type="button" id="b-borrar-todo">Borrar todo…</button>
      <form id="f-borrar-todo" class="stack" hidden novalidate autocomplete="off">
        ${conNube
          ? html`<div class="field"><label for="borrar_clave">Escribe la clave de tu cuenta (${ctx.sesion.email}) para confirmar</label><input id="borrar_clave" name="clave" type="password" autocomplete="current-password"></div>`
          : html`<div class="field"><label for="borrar_clave">Escribe BORRAR para confirmar</label><input id="borrar_clave" name="clave" type="text" autocomplete="off" autocapitalize="characters"></div>`}
        ${errorBox('e-borrar-todo')}
        <div class="acciones">
          <button class="btn danger" type="submit" id="b-borrar-todo-si">Borrar todo definitivamente</button>
          <button class="btn secondary" type="button" id="b-borrar-todo-no">Cancelar</button>
        </div>
      </form>
    </section>`;

  const app = html`
    <section class="bloque" aria-labelledby="t-app">
      <h2 class="oculto-visual" id="t-app">La aplicación</h2>
      <p>Versión <code>${VERSION}</code></p>
      <button class="btn secondary" type="button" id="b-actualizar">Buscar actualización</button>
    </section>`;

  const cfgMin = (await getConfig()).minimo_aprobatorio;
  const resumenes = {
    colegio: [inst.nombre, [seccion && seccion.grado, seccion && seccion.nombre && `Sección ${seccion.nombre}`].filter(Boolean).join(' · ')].filter(Boolean).join(' · ') || 'Institución, sección y lapsos',
    notas: `Nota mínima ${cfgMin ?? 10} y redacción con IA`,
    avisos: 'Reporte semanal por correo y avisos',
    seguridad: pinActivo ? 'Bloqueo con PIN activado' : 'Bloqueo con PIN',
    datos: 'Respaldo, copias y restaurar',
    cuenta: ctx.sesion ? ctx.sesion.email : 'Sin sesión iniciada',
    app: `Versión ${VERSION}`,
  };
  return {
    title: cat ? CATEGORIAS_AJUSTES.find(c => c[0] === cat)[1] : 'Ajustes',
    html: html`
      ${cat ? html`<p><a class="btn secondary chico volver" href="#/ajustes">${icon('atras', 18)} Ajustes</a></p>` : ''}
      <nav class="aj-menu" aria-label="Categorías de ajustes" ${cat ? raw('hidden') : ''}>
        <ul>${CATEGORIAS_AJUSTES.map(([id, nombre, ico]) => html`
          <li><a class="aj-fila" href="#/ajustes?c=${id}">
            <span class="aj-ico" aria-hidden="true">${icon(ico, 22)}</span>
            <span class="aj-texto"><span class="aj-nombre">${nombre}</span><span class="aj-sub">${resumenes[id]}</span></span>
            <span class="aj-flecha" aria-hidden="true">${icon('atras', 18)}</span>
          </a></li>`)}</ul>
      </nav>
      <div class="aj-grupo" data-cat="colegio" ${cat === 'colegio' ? '' : raw('hidden')}>${bloqueInstitucion}${bloqueSeccion}</div>
      <div class="aj-grupo" data-cat="notas" ${cat === 'notas' ? '' : raw('hidden')}>${calculo.html}${asistente.html}</div>
      <div class="aj-grupo" data-cat="avisos" ${cat === 'avisos' ? '' : raw('hidden')}>${programa.html}</div>
      <div class="aj-grupo" data-cat="seguridad" ${cat === 'seguridad' ? '' : raw('hidden')}>${bloqueAjustes(pinActivo)}</div>
      <div class="aj-grupo" data-cat="datos" ${cat === 'datos' ? '' : raw('hidden')}>${respaldo}
        <details class="aj-peligro"><summary>Zona delicada: borrar todos mis datos</summary>${borrar}</details></div>
      <div class="aj-grupo" data-cat="cuenta" ${cat === 'cuenta' ? '' : raw('hidden')}>${cuenta}</div>
      <div class="aj-grupo" data-cat="app" ${cat === 'app' ? '' : raw('hidden')}>${app}</div>`,
    onStatus(root) { pintarRespaldo(root); },
    mount(root) {
      pintarRespaldo(root);
      calculo.mount(root, seccion);
      asistente.mount(root);
      programa.mount(root);

      montarInstitucion(root, inst);

      const f = $('#f-ajustes-seccion', root);
      if (f) {
        f.addEventListener('submit', async ev => {
          ev.preventDefault();
          const d = Object.fromEntries(new FormData(f));
          if (!d.nombre.trim()) { mostrarError(root, 'e-ajustes', 'Escribe el nombre de la sección.'); $('#nombre', root).focus(); return; }
          for (const l of lapsos) {
            const ini = d[`ini-${l.id}`], fin = d[`fin-${l.id}`];
            if (ini && fin && fin < ini) { mostrarError(root, 'e-ajustes', `En el lapso ${l.numero}, la fecha de fin es anterior a la de inicio.`); return; }
          }
          mostrarError(root, 'e-ajustes', '');
          await update('secciones', seccion.id, { nombre: d.nombre, grado: d.grado, anio_escolar: d.anio_escolar });
          for (const l of lapsos) await update('lapsos', l.id, { fecha_inicio: d[`ini-${l.id}`], fecha_fin: d[`fin-${l.id}`] });
          toast('Sección y lapsos guardados');
        });
      }

      $('#b-excel', root).addEventListener('click', async () => {
        try {
          const { exportarTodo } = await import('./excel.js');
          await exportarTodo();
          toast('Excel descargado');
        } catch { toast('No se pudo crear el Excel', 'error'); }
      });
      $('#b-json', root).addEventListener('click', async () => {
        const { descargar } = await import('./excel.js');
        const datos = await exportAll();
        descargar(new Blob([JSON.stringify(datos)], { type: 'application/json' }), `copia-cuaderno-docente-${new Date().toISOString().slice(0, 10)}.json`);
        toast('Copia de seguridad descargada');
      });

      $('#f-restaurar', root).addEventListener('change', async ev => {
        const file = ev.target.files && ev.target.files[0];
        const vista = $('#restaurar-vista', root);
        vista.innerHTML = '';
        mostrarError(root, 'e-restaurar', '');
        if (!file) return;
        try {
          const obj = JSON.parse(await file.text());
          const resumen = validateBackup(obj);
          const partes = Object.entries(resumen).map(([t, n]) => `${n} en ${t}`).join(', ');
          vista.innerHTML = html`
            <p><strong>Esta copia tiene:</strong> ${partes || 'nada'}. Se mezclará con lo que ya tienes: si algo está en la copia, reemplaza la versión actual.</p>
            <div class="acciones">
              <button class="btn primary" type="button" id="b-rest-si">Restaurar</button>
              <button class="btn secondary" type="button" id="b-rest-no">Cancelar</button>
            </div>`.toString();
          $('#b-rest-no', root).addEventListener('click', () => { vista.innerHTML = ''; ev.target.value = ''; });
          $('#b-rest-si', root).addEventListener('click', async () => {
            const n = await restoreAll(obj);
            vista.innerHTML = '';
            ev.target.value = '';
            toast(`Copia restaurada: ${n} registros`);
          });
        } catch (err) {
          mostrarError(root, 'e-restaurar', err instanceof SyntaxError ? 'El archivo no se puede leer. ¿Es una copia de seguridad del Cuaderno docente?' : err.message);
        }
      });

      montarBloqueoAjustes(root, { activo: pinActivo, alCambiar: m => { toast(m === 'quitar' ? 'PIN quitado' : m === 'activar' ? 'PIN activado' : 'PIN cambiado'); ctx.refresh(); } });

      const salir = $('#b-salir', root);
      if (salir) {
        salir.addEventListener('click', () => { $('#salir-conf', root).hidden = false; salir.hidden = true; $('#b-salir-no', root).focus(); });
        $('#b-salir-no', root).addEventListener('click', () => { $('#salir-conf', root).hidden = true; salir.hidden = false; salir.focus(); });
        const si = $('#b-salir-si', root);
        si.addEventListener('click', async () => {
          si.disabled = true; si.textContent = 'Respaldando…';
          mostrarError(root, 'e-salir', '');
          try { await ctx.cerrarSesionSegura(); }
          catch (e) { mostrarError(root, 'e-salir', e.message); si.disabled = false; si.textContent = 'Respaldar y cerrar sesión'; }
        });
      }

      const bBorrar = $('#b-borrar-todo', root), fBorrar = $('#f-borrar-todo', root);
      bBorrar.addEventListener('click', () => { fBorrar.hidden = false; bBorrar.hidden = true; $('#borrar_clave', root).focus(); });
      $('#b-borrar-todo-no', root).addEventListener('click', () => { fBorrar.hidden = true; bBorrar.hidden = false; $('#borrar_clave', root).value = ''; mostrarError(root, 'e-borrar-todo', ''); bBorrar.focus(); });
      fBorrar.addEventListener('submit', async ev => {
        ev.preventDefault();
        const v = $('#borrar_clave', root).value;
        if (conNube ? !v : v.trim().toUpperCase() !== 'BORRAR') { mostrarError(root, 'e-borrar-todo', conNube ? 'Escribe la clave de tu cuenta.' : 'Escribe la palabra BORRAR para confirmar.'); return; }
        mostrarError(root, 'e-borrar-todo', '');
        const si = $('#b-borrar-todo-si', root);
        si.disabled = true; si.textContent = 'Borrando…';
        try { await ctx.borrarTodo(v); } catch (err) {
          si.disabled = false; si.textContent = 'Borrar todo definitivamente';
          mostrarError(root, 'e-borrar-todo', err.message);
        }
      });

      $('#b-actualizar', root).addEventListener('click', async () => {
        const r = await ctx.checkUpdate();
        toast(r === 'nueva' ? 'Hay una versión nueva. Toca Actualizar arriba.' : r === 'offline' ? 'Sin conexión: no se pudo buscar.' : 'Ya tienes la última versión.', r === 'offline' ? 'error' : 'ok');
      });
    },
  };

  function montarInstitucion(root, inicial) {
    const estado = { logo: inicial.logo, color: inicial.color, sugeridos: [] };
    const f = $('#f-inst', root);
    const pintar = () => {
      const cab = paleta(hexValido(estado.color) ? estado.color : COLOR_BASE).claro.cabecera;
      const prev = $('#inst-prev', root);
      prev.style.background = cab;
      const nombre = $('#inst_nombre', root).value.trim() || 'Nombre de la institución';
      const sub = $('#inst_subtitulo', root).value.trim();
      prev.innerHTML = html`${estado.logo ? html`<img src="${estado.logo}" alt="">` : ''}<div><strong>${nombre}</strong>${sub ? html`<span>${sub}</span>` : ''}</div>`.toString();
      const img = $('#inst-logo-img', root);
      img.hidden = !estado.logo; if (estado.logo) img.src = estado.logo;
      $('#inst-logo-vacio', root).hidden = !!estado.logo;
      $('#b-logo-quitar', root).hidden = !estado.logo;
      $('#inst-swatches', root).hidden = !estado.logo || !estado.sugeridos.length;
      $('#inst-swatches-lista', root).innerHTML = estado.sugeridos.map(c => `<button type="button" class="swatch" data-color="${c}" style="background:${c}" aria-label="Usar el color ${c}"></button>`).join('');
    };
    const sugerir = async () => { estado.sugeridos = estado.logo ? await coloresDelLogo(estado.logo).catch(() => []) : []; pintar(); };
    pintar();
    sugerir();
    f.addEventListener('input', pintar);
    $('#inst-swatches-lista', root).addEventListener('click', e => {
      const b = e.target.closest('.swatch');
      if (!b) return;
      estado.color = b.dataset.color; $('#inst_color', root).value = b.dataset.color; pintar();
    });
    $('#inst_color', root).addEventListener('input', e => { estado.color = e.target.value; pintar(); });
    $('#inst_logo', root).addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0];
      mostrarError(root, 'e-inst', '');
      if (!file) return;
      try {
        estado.logo = await procesarLogo(file);
        await sugerir();
      } catch (err) { mostrarError(root, 'e-inst', err.message); }
      e.target.value = '';
    });
    $('#b-logo-quitar', root).addEventListener('click', () => { estado.logo = ''; estado.sugeridos = []; pintar(); });
    $('#b-color-base', root).addEventListener('click', () => { estado.color = ''; $('#inst_color', root).value = COLOR_BASE; pintar(); });
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      mostrarError(root, 'e-inst', '');
      await guardarInstitucion({
        nombre: $('#inst_nombre', root).value, subtitulo: $('#inst_subtitulo', root).value, encabezado: $('#inst_encabezado', root).value,
        docente: $('#inst_docente', root).value, logo: estado.logo, color: estado.color,
      });
      ctx.refresh();
      toast('Datos de la institución guardados');
    });
  }

  function pintarRespaldo(root) {
    const st = ctx.syncState();
    const el = $('#estado-respaldo', root);
    const acc = $('#acc-nube', root);
    if (!el || !acc) return;
    if (!ctx.configurado) {
      el.textContent = 'El respaldo automático en la nube todavía no está activado. Tus datos están solo en este celular.';
      acc.innerHTML = '';
      return;
    }
    if (!ctx.sesion) {
      el.textContent = 'Inicia sesión para respaldar tus datos en la nube.';
      acc.innerHTML = '';
      return;
    }
    const info = infoEstado(st, { configurado: true, sesion: true });
    const partes = [info.texto + '.'];
    if (st.lastSync) partes.push(`Último respaldo: ${haceCuanto(st.lastSync)}.`);
    if (st.status === 'error' && st.error) partes.push(`Detalle: ${st.error}`);
    el.textContent = partes.join(' ');
    el.className = 'estado ' + info.clase;
    acc.innerHTML = html`<button class="btn primary" type="button" id="b-nube" ${st.status === 'syncing' ? raw('disabled') : ''}>Respaldar ahora</button>`.toString();
    $('#b-nube', root).addEventListener('click', async () => {
      const r = await ctx.syncNow();
      if (r.status === 'ok') toast('Datos respaldados');
      else if (r.status === 'offline') toast('Sin conexión. Se respaldará cuando vuelva internet.', 'error');
      else toast('No se pudo respaldar. Inténtalo otra vez.', 'error');
    });
  }
}

// =====================================================================
// Inicio de sesión (pantalla completa)
// =====================================================================
export function pantallaLogin(root, { entrar, puedeOmitir }) {
  root.innerHTML = html`
    <main class="login">
      <section class="portada" aria-label="Cuaderno docente">
        <p class="portada-titulo">CUADERNO DOCENTE</p>
        <p class="portada-sub">Entra para respaldar tu cuaderno y verlo en cualquier dispositivo.</p>
      </section>
      <form id="f-login" class="stack" novalidate>
        ${campo({ id: 'email', label: 'Correo', type: 'email', placeholder: 'tucorreo@ejemplo.com', extra: 'autocomplete="username" inputmode="email" autocapitalize="off"' })}
        ${campo({ id: 'password', label: 'Contraseña', type: 'password', extra: 'autocomplete="current-password"' })}
        ${errorBox('e-login')}
        <button class="btn primary" type="submit" id="b-entrar">Entrar</button>
        ${puedeOmitir ? html`<button class="btn secondary" type="button" id="b-omitir">Seguir sin conexión</button>
          <p class="hint">Sin conexión puedes usar el cuaderno. Se respaldará cuando inicies sesión.</p>` : ''}
      </form>
    </main>`.toString();
  const f = $('#f-login', root);
  $('#email', root).focus();
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    if (!d.email.trim() || !d.password) { mostrarError(root, 'e-login', 'Escribe tu correo y tu contraseña.'); return; }
    const b = $('#b-entrar', root);
    b.disabled = true; b.textContent = 'Entrando';
    try { await entrar(d.email.trim(), d.password); }
    catch (err) {
      b.disabled = false; b.textContent = 'Entrar';
      mostrarError(root, 'e-login', err.message);
    }
  });
  const o = $('#b-omitir', root);
  if (o) o.addEventListener('click', () => entrar(null, null, true));
}
