// Pantalla "Representantes": preparar un mensaje y abrirlo en WhatsApp.
import { getSeccion, listEstudiantes, lapsoActual } from './data.js';
import { cargarSnapshot, promedioGeneral, resumenAsistencia } from './analisis.js';
import { MOTIVOS, normalizarTelefono, urlWhatsApp, mensajeBase } from './contacto.js';
import { html, icon } from './ui.js';
import { $, $$ } from './form.js';

export async function representantes(ctx, query) {
  const seccion = await getSeccion();
  const volver = html`<p><a class="btn secondary chico volver" href="#/">${icon('atras', 18)} Inicio</a></p>`;
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

  let texto = '', url = '', tiene = false;
  if (elegido) {
    const r = lapso ? resumenAsistencia(s, lapso, elegido.id) : { faltas: 0 };
    texto = mensajeBase(motivo, { estudiante: elegido, docente, lapso: lapso ? lapso.numero : '', faltas: r.faltas, promedio: lapso ? promedioGeneral(s, lapso.id, elegido.id) : null });
    tiene = !!tel(elegido);
    url = urlWhatsApp(tel(elegido), texto);
  }

  return {
    title: 'Representantes',
    html: html`
      ${volver}
      <section aria-labelledby="rp-t">
        <h2 id="rp-t">Escribir a un representante</h2>
        <p>Prepara un mensaje y ábrelo en WhatsApp. La app no envía nada: tú lo revisas y lo mandas.</p>
        <div class="field"><label for="rp-est">Estudiante</label>
          <select id="rp-est"><option value="">Elige un estudiante</option>
            ${estudiantes.map(e => html`<option value="${e.id}" ${elegido && e.id === elegido.id ? 'selected' : ''}>${e.numero_lista ? e.numero_lista + '. ' : ''}${e.nombre_completo}</option>`)}
          </select></div>
        ${elegido ? html`
          <p class="hint">Representante: <strong>${elegido.representante_nombre || 'sin nombre'}</strong> · ${elegido.representante_contacto || 'sin teléfono'}</p>
          <nav class="lapso-tabs" aria-label="Motivo del mensaje">${MOTIVOS.map(([id, t]) => html`<a href="#/representantes?e=${elegido.id}&m=${id}" ${id === motivo ? html`aria-current="page"` : ''}>${t}</a>`)}</nav>
          ${tiene ? html`
            <div class="field"><label for="rp-texto">Mensaje</label><textarea id="rp-texto" rows="6">${texto}</textarea>
              <p class="hint">Puedes cambiarlo. Se abre WhatsApp con este texto y tú lo envías.</p></div>
            <div class="acciones"><a class="btn primary" id="rp-abrir" href="${url}" target="_blank" rel="noopener noreferrer">Abrir en WhatsApp</a></div>`
          : html`<p class="vacio">Falta un teléfono válido del representante. <a class="btn primary" href="#/estudiantes/${elegido.id}">Agregar el contacto</a></p>`}`
        : ''}
      </section>
      ${sinContacto.length ? html`
        <section aria-labelledby="rp-s"><h2 id="rp-s">Sin teléfono válido (${sinContacto.length})</h2>
          <ul class="so-lista">${sinContacto.map(e => html`<li>${e.nombre_completo}</li>`)}</ul>
          <p class="hint">Escribe el teléfono con el código de área, por ejemplo 0412 123 4567.</p></section>` : ''}`,
    mount(root) {
      $('#rp-est', root).addEventListener('change', ev => { location.hash = ev.target.value ? `#/representantes?e=${ev.target.value}` : '#/representantes'; });
      const t = $('#rp-texto', root), a = $('#rp-abrir', root);
      if (t && a) t.addEventListener('input', () => { a.href = urlWhatsApp(tel(elegido), t.value); });
    },
  };
}
