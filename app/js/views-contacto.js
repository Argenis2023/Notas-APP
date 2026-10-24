// Pantalla "Representantes": preparar un mensaje y abrirlo en WhatsApp.
import { getSeccion, listEstudiantes, lapsoActual } from './data.js';
import { cargarSnapshot, promedioGeneral, resumenAsistencia } from './analisis.js';
import { MOTIVOS, normalizarTelefono, urlWhatsApp, mensajeBase } from './contacto.js';
import { html, icon, toast } from './ui.js';
import { $, errorBox, mostrarError } from './form.js';
import { datosMensaje, completarMensaje, mensajeIA } from './ia.js';

export async function representantes(ctx, query) {
  const seccion = await getSeccion();
  const volver = html``;
  if (!seccion) return { title: 'Representantes', html: html`${volver}<p class="vacio">Primero crea tu sección.</p>` };
  const estudiantes = await listEstudiantes(seccion.id);
  if (!estudiantes.length) return { title: 'Representantes', html: html`${volver}<p class="vacio">Todavía no hay estudiantes.</p><p><a class="btn primary" href="#/estudiantes">Agregar estudiantes</a></p>` };
  const q = new URLSearchParams(query || '');
  const elegido = estudiantes.find(e => e.id === q.get('e')) || null;
  const motivo = MOTIVOS.some(m => m[0] === q.get('m')) ? q.get('m') : 'faltas';
  const s = await cargarSnapshot(seccion);
  const lapso = lapsoActual(s.lapsos) || s.lapsos[0];
  const docente = (s.inst && s.inst.docente) || '';
  const tel = e => normalizarTelefono(e && e.representante_contacto);
  const sinContacto = estudiantes.filter(e => !tel(e));

  const iaOk = ctx.iaDisponible();
  let texto = '', url = '', tiene = false, hechos = {};
  if (elegido) {
    const r = lapso ? resumenAsistencia(s, lapso, elegido.id) : { faltas: 0 };
    hechos = { faltas: r.faltas, promedio: lapso ? promedioGeneral(s, lapso.id, elegido.id) : null };
    texto = mensajeBase(motivo, { estudiante: elegido, docente, lapso: lapso ? lapso.numero : '', faltas: r.faltas, promedio: lapso ? promedioGeneral(s, lapso.id, elegido.id) : null });
    tiene = !!tel(elegido);
    url = urlWhatsApp(tel(elegido), texto);
  }

  return {
    title: 'Representantes',
    html: html`
      ${volver}
      <section aria-labelledby="rp-t">
        <h2 class="oculto-visual" id="rp-t">Escribir a un representante</h2>
        <p class="lead">Prepara un mensaje y ábrelo en WhatsApp. La app no envía nada: tú lo revisas y lo mandas.</p>
        <div class="field"><label for="rp-est">Estudiante</label>
          <select id="rp-est"><option value="">Elige un estudiante</option>
            ${estudiantes.map(e => html`<option value="${e.id}" ${elegido && e.id === elegido.id ? 'selected' : ''}>${e.numero_lista ? e.numero_lista + '. ' : ''}${e.nombre_completo}</option>`)}
          </select></div>
        ${elegido ? html`
          <p class="hint rp-rep">Representante: <strong>${elegido.representante_nombre || 'sin nombre'}</strong> · ${elegido.representante_contacto || 'sin teléfono'}</p>
          <nav class="motivos" aria-label="Motivo del mensaje">${MOTIVOS.map(([id, t]) => html`<a class="btn chico ${id === motivo ? 'primary' : 'secondary'}" href="#/representantes?e=${elegido.id}&m=${id}" ${id === motivo ? html`aria-current="page"` : ''}>${t}</a>`)}</nav>
          ${tiene ? html`
            <div class="field"><label for="rp-texto">Mensaje</label><textarea id="rp-texto" rows="6">${texto}</textarea>
              <p class="hint">Puedes cambiarlo. Se abre WhatsApp con este texto y tú lo envías.</p></div>
            <p class="aviso-ia" id="rp-aviso" hidden>Borrador escrito con IA. Léelo y cámbialo con tus palabras antes de enviarlo.</p>
            <div class="acciones">
              <a class="btn primary" id="rp-abrir" href="${url}" target="_blank" rel="noopener noreferrer">Abrir en WhatsApp</a>
              ${iaOk ? html`<button type="button" class="btn secondary" id="rp-ia">Redactar con IA</button>` : ''}
              <button type="button" class="btn secondary" id="rp-base" hidden>Volver al texto base</button>
            </div>
            ${iaOk ? html`
              <section class="ia-panel" id="rp-panel" hidden aria-labelledby="rp-ia-t">
                <h4 id="rp-ia-t">Esto es lo que se enviará a la IA</h4>
                <p class="hint">Solo código, notas y números. No se envía el nombre del estudiante, ni el del representante, ni teléfonos.</p>
                <pre class="ia-datos" id="rp-datos"></pre>
                <div class="field"><label for="rp-extra">Qué quieres decirle (opcional)</label>
                  <textarea id="rp-extra" rows="2" placeholder="Por ejemplo: ha estado distraído en clase y quiero conversar con calma"></textarea>
                  <p class="hint">Si escribes un nombre, se cambia por su código antes de enviar. Lo verás arriba.</p></div>
                ${errorBox('e-rp')}
                <div class="acciones"><button type="button" class="btn primary" id="rp-enviar">Enviar y redactar</button><button type="button" class="btn secondary" id="rp-cancelar">Cancelar</button></div>
              </section>` : ''}`
          : html`<div class="vacio"><p>Falta un teléfono válido del representante.</p><a class="btn primary" href="#/estudiantes/${elegido.id}">Agregar el contacto</a></div>`}`
        : ''}
      </section>
      ${sinContacto.length ? html`
        <section aria-labelledby="rp-s"><h2 id="rp-s">Sin teléfono válido (${sinContacto.length})</h2>
          <ul class="hoja lista-simple">${sinContacto.map(e => html`<li>${e.nombre_completo}</li>`)}</ul>
          <p class="hint">Escribe el teléfono con el código de área, por ejemplo 0412 123 4567.</p></section>` : ''}`,
    mount(root) {
      $('#rp-est', root).addEventListener('change', ev => { location.hash = ev.target.value ? `#/representantes?e=${ev.target.value}` : '#/representantes'; });
      const t = $('#rp-texto', root), a = $('#rp-abrir', root);
      if (t && a) t.addEventListener('input', () => { a.href = urlWhatsApp(tel(elegido), t.value); });
      const bIA = $('#rp-ia', root);
      if (!t || !a || !bIA) return;
      const panel = $('#rp-panel', root), base = $('#rp-base', root), aviso = $('#rp-aviso', root);
      const motivoTexto = (MOTIVOS.find(m => m[0] === motivo) || MOTIVOS[0])[1];
      const pintar = () => { $('#rp-datos', root).textContent = datosMensaje(s, elegido, lapso, motivoTexto, hechos, $('#rp-extra', root).value); };
      const poner = v => { t.value = v; a.href = urlWhatsApp(tel(elegido), v); };
      bIA.addEventListener('click', () => { panel.hidden = false; bIA.hidden = true; pintar(); panel.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
      $('#rp-extra', root).addEventListener('input', pintar);
      $('#rp-cancelar', root).addEventListener('click', () => { panel.hidden = true; bIA.hidden = false; });
      base.addEventListener('click', () => { poner(texto); aviso.hidden = true; base.hidden = true; });
      $('#rp-enviar', root).addEventListener('click', async ev => {
        const b = ev.currentTarget;
        b.disabled = true; b.textContent = 'Redactando, puede tardar unos segundos…';
        mostrarError(root, 'e-rp', '');
        try {
          const r = await ctx.ia('mensaje_representante', $('#rp-datos', root).textContent);
          poner(completarMensaje(r.texto, elegido, docente));
          aviso.hidden = false; base.hidden = false; panel.hidden = true; bIA.hidden = false;
          toast('Borrador listo. Revísalo y ábrelo en WhatsApp cuando quieras.');
        } catch (err) { mostrarError(root, 'e-rp', mensajeIA(err)); }
        b.disabled = false; b.textContent = 'Enviar y redactar';
      });
    },
  };
}
