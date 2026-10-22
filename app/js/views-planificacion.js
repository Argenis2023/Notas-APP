// Planificación diaria de aula: lista, formulario con ayuda de IA y hoja para imprimir o guardar como PDF.
import { getSeccion, lapsoActual, create, update, remove, get, list } from './data.js';
import { cargarSnapshot } from './analisis.js';
import { SECCIONES, leerPlanificacion, completa, datosPlanificacion } from './planificacion.js';
import { mensajeIA } from './ia.js';
import { banda, firmas, botonImprimir } from './views-reportes.js';
import { html, icon, toast, fechaLarga, fechaCorta } from './ui.js';
import { $, $$, errorBox, mostrarError } from './form.js';

const pad = n => String(n).padStart(2, '0');
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const AREAS = ['Lenguaje, Comunicación y Cultura', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales, Ciudadanía e Identidad', 'Educación Física, Deporte y Recreación', 'Educación Artística'];

export async function planificaciones(ctx) {
  const seccion = await getSeccion();
  if (!seccion) return { title: 'Planificación', html: html`<p class="vacio">Primero crea tu sección en <a class="btn secondary chico" href="#/">Inicio</a>.</p>` };
  const todas = (await list('planificaciones')).filter(p => p.seccion_id === seccion.id)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.created_at).localeCompare(String(a.created_at)));
  return {
    title: 'Planificación',
    html: html`
      <section aria-labelledby="pl-t">
        <h2 class="oculto-visual" id="pl-t">Planificación diaria</h2>
        <p class="lead">Arma tu planificación del día con ayuda de la IA, corrígela con tus palabras y guárdala como PDF.</p>
        <div class="acciones"><a class="btn primary" href="#/planificacion/nueva">Nueva planificación</a></div>
      </section>
      <section aria-labelledby="pl-l">
        <h2 id="pl-l">Guardadas</h2>
        ${todas.length ? html`<ul class="ag-lista">${todas.map(p => html`
          <li class="ag-item"><p class="ag-cab"><strong>${p.tema || p.area || 'Planificación'}</strong></p>
            <p class="hint">${[fechaCorta(p.fecha), p.area].filter(Boolean).join(' · ')}</p>
            <div class="acciones"><a class="btn secondary chico" href="#/planificacion/${p.id}">Abrir</a></div></li>`)}</ul>`
          : html`<p class="vacio">Todavía no tienes planificaciones guardadas.</p>`}
      </section>`,
  };
}

export async function planificacionForm(ctx, id) {
  const seccion = await getSeccion();
  if (!seccion) return { title: 'Planificación', html: html`<p class="vacio">Primero crea tu sección en <a class="btn secondary chico" href="#/">Inicio</a>.</p>` };
  const nueva = !id || id === 'nueva';
  const guardada = nueva ? null : await get('planificaciones', id);
  if (!nueva && (!guardada || guardada.deleted)) return { title: 'Planificación', html: html`<p class="vacio">No encontré esta planificación. <a class="btn secondary chico" href="#/planificacion">Volver</a></p>` };
  const s = await cargarSnapshot(seccion);
  const previas = (await list('planificaciones')).filter(p => p.seccion_id === seccion.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const ult = previas[0] || {};
  const p = guardada || { fecha: hoyIso(), area: ult.area || '', tema: '', proyecto: ult.proyecto || '', lineas: ult.lineas || '', generado_con_ia: false };
  const iaOk = ctx.iaDisponible();
  const lapso = lapsoActual(s.lapsos) || s.lapsos[0];

  return {
    title: 'Planificación',
    html: html`
      <p class="no-print"><a class="btn secondary chico volver" href="#/planificacion">${icon('atras', 18)} Planificaciones</a></p>
      <form id="f-pl" class="stack no-print" novalidate>
        <div class="field"><label for="pl-fecha">Fecha</label><input id="pl-fecha" name="fecha" type="date" value="${p.fecha || hoyIso()}"></div>
        <div class="field"><label for="pl-area">Área de formación</label>
          <input id="pl-area" name="area" type="text" list="pl-areas" autocomplete="off" value="${p.area || ''}" placeholder="Por ejemplo: Lenguaje, Comunicación y Cultura">
          <datalist id="pl-areas">${AREAS.map(a => html`<option value="${a}"></option>`)}</datalist></div>
        <div class="field"><label for="pl-tema">Tema generador</label>
          <textarea id="pl-tema" name="tema" rows="2" placeholder="Por ejemplo: La comprensión lectora y la producción escrita creativa">${p.tema || ''}</textarea></div>
        <div class="field"><label for="pl-proyecto">Proyecto de aprendizaje</label>
          <input id="pl-proyecto" name="proyecto" type="text" autocomplete="off" value="${p.proyecto || ''}" placeholder="Por ejemplo: Ingenio, Letras y Cuentas"></div>
        <div class="field"><label for="pl-lineas">Líneas de investigación priorizadas</label>
          <textarea id="pl-lineas" name="lineas" rows="3" placeholder="Una por línea. Se recuerdan para la próxima planificación.">${p.lineas || ''}</textarea></div>

        ${iaOk ? html`
          <div class="acciones"><button type="button" class="btn secondary" id="pl-ia">Redactar con IA</button></div>
          <section class="ia-panel" id="pl-panel" hidden aria-labelledby="pl-ia-t">
            <h4 id="pl-ia-t">Esto es lo que se enviará a la IA</h4>
            <p class="hint">Solo el grado, el área, el tema y lo que escribas aquí. No se envía nada de tus estudiantes.</p>
            <pre class="ia-datos" id="pl-datos"></pre>
            <div class="field"><label for="pl-idea">Qué quieres trabajar (opcional)</label>
              <textarea id="pl-idea" rows="2" placeholder="Por ejemplo: lectura en voz alta, sujeto y predicado, separar en sílabas"></textarea></div>
            ${errorBox('e-pl-ia')}
            <div class="acciones"><button type="button" class="btn primary" id="pl-enviar">Enviar y redactar</button><button type="button" class="btn secondary" id="pl-cancelar">Cancelar</button></div>
          </section>
          <p class="aviso-ia" id="pl-aviso" hidden>Borrador escrito con IA. Léelo y corrígelo con tus palabras antes de usarlo.</p>` : html`<p class="hint">La ayuda de IA aparece cuando tienes la cuenta con respaldo en la nube. Mientras tanto puedes escribir tu planificación aquí.</p>`}

        ${SECCIONES.map(([clave, , titulo]) => html`
          <div class="field"><label for="pl-${clave}">${titulo}</label><textarea id="pl-${clave}" name="${clave}" rows="${clave === 'desarrollo' ? 8 : 5}">${p[clave] || ''}</textarea></div>`)}

        ${errorBox('e-pl')}
        <div class="acciones"><button class="btn primary" type="submit">Guardar planificación</button></div>
      </form>
      ${botonImprimir()}
      ${guardada ? html`<section class="peligro no-print"><button type="button" class="btn borrar" id="pl-borrar">Eliminar esta planificación</button></section>` : ''}

      <article class="informe plan solo-impresion" id="pl-hoja" aria-hidden="true"></article>`,
    mount(root) {
      const form = $('#f-pl', root);
      const val = n => (form.elements[n] ? form.elements[n].value : '');
      const datos = () => ({ area: val('area').trim(), tema: val('tema').trim(), proyecto: val('proyecto').trim(), lineas: val('lineas').trim(), idea: $('#pl-idea', root) ? $('#pl-idea', root).value : '' });
      let desdeIA = !!(guardada && guardada.generado_con_ia);

      const lista = t => String(t || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => `<p>${esc(l.replace(/^[-•]\s*/, '• '))}</p>`).join('');
      const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      function pintarHoja() {
        const aula = [seccion.grado, seccion.nombre ? `Aula ${seccion.nombre}` : ''].filter(Boolean).join(' · ');
        const banda_ = banda(s, lapso, 'Planificación diaria').toString();
        $('#pl-hoja', root).innerHTML = `${banda_}<div class="informe-cuerpo">
          <h2 class="informe-titulo">Planificación diaria de aula</h2>
          <p><strong>Grado:</strong> ${esc(aula)}${val('fecha') ? ` · <strong>Fecha:</strong> ${esc(fechaLarga(val('fecha')))}` : ''}</p>
          ${val('proyecto') ? `<p><strong>Proyecto de aprendizaje:</strong> ${esc(val('proyecto'))}</p>` : ''}
          ${val('lineas') ? `<h3 class="informe-h">1. Líneas de investigación priorizadas</h3>${lista(val('lineas'))}` : ''}
          <h3 class="informe-h">2. Estructura didáctica del día</h3>
          ${val('area') ? `<p><strong>Área de formación priorizada:</strong> ${esc(val('area'))}</p>` : ''}
          ${val('tema') ? `<p><strong>Tema generador:</strong> ${esc(val('tema'))}</p>` : ''}
          ${val('tejido') ? `<p><strong>Tejido temático:</strong></p>${lista(val('tejido'))}` : ''}
          ${val('intencion') ? `<p><strong>Intencionalidad pedagógica:</strong> ${esc(val('intencion'))}</p>` : ''}
          <h3 class="informe-h">3. Secuencia didáctica</h3>
          ${['inicio', 'desarrollo', 'cierre'].map(k => val(k) ? `<p><strong>${k[0].toUpperCase() + k.slice(1)}</strong></p>${lista(val(k))}` : '').join('')}
          ${val('evaluacion') ? `<h3 class="informe-h">4. Criterios de evaluación</h3>${lista(val('evaluacion'))}` : ''}
          </div>${firmas(s).toString()}`;
      }
      const imp = $('#b-imprimir', root);
      if (imp) imp.addEventListener('click', () => { pintarHoja(); window.print(); });

      const bIA = $('#pl-ia', root);
      if (bIA) {
        const panel = $('#pl-panel', root), aviso = $('#pl-aviso', root);
        const pintar = () => { $('#pl-datos', root).textContent = datosPlanificacion(s, datos()); };
        bIA.addEventListener('click', () => {
          if (!val('area').trim() && !val('tema').trim()) { mostrarError(root, 'e-pl', 'Escribe el área de formación o el tema generador para que la IA tenga de dónde partir.'); return; }
          mostrarError(root, 'e-pl', '');
          panel.hidden = false; bIA.hidden = true; pintar(); panel.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
        ['pl-area', 'pl-tema', 'pl-proyecto', 'pl-lineas', 'pl-idea'].forEach(i => { const el = $('#' + i, root); if (el) el.addEventListener('input', () => { if (!panel.hidden) pintar(); }); });
        $('#pl-cancelar', root).addEventListener('click', () => { panel.hidden = true; bIA.hidden = false; });
        $('#pl-enviar', root).addEventListener('click', async ev => {
          const b = ev.currentTarget;
          b.disabled = true; b.textContent = 'Redactando, puede tardar unos segundos…';
          mostrarError(root, 'e-pl-ia', '');
          try {
            const r = await ctx.ia('planificacion_diaria', $('#pl-datos', root).textContent);
            const out = leerPlanificacion(r.texto);
            if (!Object.keys(out).length) throw Object.assign(new Error('formato'), { codigo: 'formato' });
            for (const [k] of SECCIONES) if (out[k] && form.elements[k]) form.elements[k].value = out[k];
            desdeIA = true; aviso.hidden = false; panel.hidden = true; bIA.hidden = false;
            toast(completa(out) ? 'Borrador listo. Revísalo y guárdalo.' : 'Borrador listo, pero faltaron partes. Complétalas tú o vuelve a pedirlo.');
          } catch (err) { mostrarError(root, 'e-pl-ia', err.codigo === 'formato' ? 'La IA respondió en un formato que no pude leer. Inténtalo otra vez.' : mensajeIA(err)); }
          b.disabled = false; b.textContent = 'Enviar y redactar';
        });
        if (desdeIA) aviso.hidden = false;
      }

      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        if (!val('tema').trim() && !val('area').trim()) { mostrarError(root, 'e-pl', 'Escribe al menos el área de formación o el tema generador.'); return; }
        const d = { seccion_id: seccion.id, fecha: val('fecha') || hoyIso(), area: val('area').trim(), tema: val('tema').trim(), proyecto: val('proyecto').trim(), lineas: val('lineas').trim(), generado_con_ia: desdeIA };
        for (const [k] of SECCIONES) d[k] = val(k).trim();
        if (guardada) await update('planificaciones', guardada.id, d); else await create('planificaciones', d);
        toast('Planificación guardada.');
        location.hash = '#/planificacion';
      });
      const bor = $('#pl-borrar', root);
      if (bor) bor.addEventListener('click', async () => {
        if (bor.dataset.paso !== '1') { bor.dataset.paso = '1'; bor.textContent = 'Toca otra vez para eliminar'; return; }
        await remove('planificaciones', guardada.id);
        toast('Planificación eliminada.');
        location.hash = '#/planificacion';
      });
    },
  };
}
