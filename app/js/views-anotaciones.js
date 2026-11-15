// Pantalla "Anotaciones": escribir una nota rápida sobre un estudiante y ver las recientes.
import { getSeccion, listEstudiantes, list, create, eliminarConDeshacer } from './data.js';
import { mensajeIA } from './ia.js';
import { TIPOS, tipoValido, nombreTipo } from './anotaciones.js';
import { html, icon, toast, toastDeshacer, fechaCorta } from './ui.js';
import { $, $$, errorBox, mostrarError } from './form.js';
import { vozDisponible, crearDictado, limpiarDictado, unirTexto, detectarEstudiante, detectarTipo, mensajeVoz, datosDictado, interpretarDictado } from './voz.js';

const pad = n => String(n).padStart(2, '0');
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export async function anotaciones(ctx, query) {
  const seccion = await getSeccion();
  if (!seccion) return { title: 'Anotaciones', html: html`<div class="vacio"><p>Primero crea tu sección.</p><a class="btn primary" href="#/">Ir a Inicio</a></div>` };
  const estudiantes = await listEstudiantes(seccion.id);
  if (!estudiantes.length) return { title: 'Anotaciones', html: html`<div class="vacio"><p>Todavía no hay estudiantes.</p><a class="btn primary" href="#/estudiantes">Agregar estudiantes</a></div>` };
  const q = new URLSearchParams(query || '');
  const elegido = estudiantes.find(e => e.id === q.get('e'));
  const ids = new Set(estudiantes.map(e => e.id));
  const todas = (await list('anotaciones')).filter(a => ids.has(a.estudiante_id) && a.texto)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.created_at).localeCompare(String(a.created_at)));
  const nombre = id => (estudiantes.find(e => e.id === id) || {}).nombre_completo || '';
  const vistas = (elegido ? todas.filter(a => a.estudiante_id === elegido.id) : todas).slice(0, elegido ? 100 : 30);

  return {
    title: 'Anotaciones',
    html: html`
      
      <section aria-labelledby="an-t">
        <h2 class="oculto-visual" id="an-t">Anotaciones rápidas</h2>
        <p class="lead">Anota en segundos algo que pasó con un estudiante. Se suma a su informe del lapso.</p>
        <form id="f-an" class="stack" novalidate>
          <div class="field"><label for="an-est">Estudiante</label>
            <select id="an-est" name="estudiante_id">
              <option value="">Elige un estudiante</option>
              ${estudiantes.map(e => html`<option value="${e.id}" ${elegido && e.id === elegido.id ? 'selected' : ''}>${e.numero_lista ? e.numero_lista + '. ' : ''}${e.nombre_completo}</option>`)}
            </select></div>
          <fieldset class="so-opciones"><legend>Tipo</legend>
            ${[...TIPOS, ['reunion', 'Reunión (se guarda en la agenda)']].map(([id, texto], i) => html`<label class="check"><input type="radio" name="tipo" value="${id}" ${i === 0 ? 'checked' : ''}> <span>${texto}</span></label>`)}
          </fieldset>
          <div class="field"><label for="an-texto">¿Qué pasó?</label>
            <div class="campo-voz">
              <textarea id="an-texto" name="texto" rows="4" placeholder="Escribe aquí, o mantén presionado el micrófono y cuéntalo. Por ejemplo: ayudó a un compañero con la suma; no trajo el material."></textarea>
              ${vozDisponible() ? html`<button type="button" class="btn-mic" id="an-voz" aria-pressed="false" aria-label="Mantén presionado para dictar">${icon('microfono', 22)}</button>` : ''}
            </div>
            ${vozDisponible() ? html`<p class="hint" id="an-voz-ayuda">Mantén presionado el micrófono mientras hablas y suéltalo al terminar. O escribe tú.</p>` : ''}</div>
          <div class="field"><label for="an-fecha" id="an-fecha-l">Fecha</label><input id="an-fecha" name="fecha" type="date" value="${hoyIso()}"></div>
          <div class="field" id="an-f-hora" hidden><label for="an-hora">Hora (opcional)</label><input id="an-hora" name="hora" type="time"></div>
          ${errorBox('e-an')}
          <div class="acciones"><button class="btn primary" type="submit" id="an-guardar">Guardar anotación</button></div>
        </form>
      </section>
      <section aria-labelledby="an-l">
        <h2 id="an-l">${elegido ? 'Anotaciones de ' + elegido.nombre_completo : 'Últimas anotaciones'}</h2>
        ${elegido ? html`<p><a class="btn secondary chico" href="#/anotaciones">Ver de todos</a></p>` : ''}
        ${vistas.length ? html`<ul class="an-lista" id="an-lista">${vistas.map(a => html`
          <li class="an-item an-${tipoValido(a.tipo)}" data-id="${a.id}">
            <p class="an-cab"><strong>${elegido ? '' : nombre(a.estudiante_id)}</strong> <span class="hint">${fechaCorta(a.fecha)} · ${nombreTipo(a.tipo)}</span></p>
            <p class="an-texto">${a.texto}</p>
            <div class="acciones"><button type="button" class="btn secondary chico an-borrar" data-id="${a.id}">Eliminar</button></div>
          </li>`)}</ul>` : html`<p class="vacio">Todavía no hay anotaciones${elegido ? ' de este estudiante' : ''}.</p>`}
      </section>`,
    mount(root) {
      const form = $('#f-an', root);
      const texto = $('#an-texto', root);
      let tituloIA = '';
      const radio = v => form.querySelector(`input[name=tipo][value=${v}]`);
      const tipoActual = () => (form.querySelector('input[name=tipo]:checked') || {}).value || 'nota';
      const ajustarTipo = () => {
        const reu = tipoActual() === 'reunion';
        $('#an-f-hora', root).hidden = !reu;
        $('#an-fecha-l', root).textContent = reu ? 'Fecha de la reunión' : 'Fecha';
        $('#an-guardar', root).textContent = reu ? 'Guardar en la agenda' : 'Guardar anotación';
        form.querySelector('label[for=an-est]').textContent = reu ? 'Estudiante (opcional)' : 'Estudiante';
      };
      form.addEventListener('change', ev => { if (ev.target.name === 'tipo') ajustarTipo(); });
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const d = Object.fromEntries(new FormData(form));
        const cuerpo = String(d.texto || '').trim();
        if (d.tipo === 'reunion') {
          if (!cuerpo) { mostrarError(root, 'e-an', 'Escribe de qué es la reunión.'); texto.focus(); return; }
          if (!d.fecha) { mostrarError(root, 'e-an', 'Elige la fecha de la reunión.'); return; }
          const titulo = (tituloIA || cuerpo).slice(0, 80);
          await create('agenda', { seccion_id: seccion.id, titulo, fecha: d.fecha, hora: d.hora || null, tipo: 'reunion', nota: cuerpo === titulo ? null : cuerpo, hecho: false });
          toast('Reunión guardada en la agenda.');
          location.hash = '#/agenda';
          return;
        }
        if (!d.estudiante_id) { mostrarError(root, 'e-an', 'Elige a qué estudiante corresponde.'); $('#an-est', root).focus(); return; }
        if (!cuerpo) { mostrarError(root, 'e-an', 'Escribe qué pasó.'); texto.focus(); return; }
        await create('anotaciones', { estudiante_id: d.estudiante_id, seccion_id: seccion.id, fecha: d.fecha || hoyIso(), texto: cuerpo, tipo: tipoValido(d.tipo) });
        toast(d.tipo === 'incidencia' ? 'Incidencia guardada.' : 'Anotación guardada.');
        location.hash = `#/anotaciones?e=${d.estudiante_id}&r=${Date.now()}`;
      });

      // Dictado: se mantiene presionado el micrófono y se suelta al terminar.
      const bVoz = $('#an-voz', root);
      if (bVoz) {
        const ayuda = $('#an-voz-ayuda', root);
        const AYUDA = ayuda.textContent;
        let dictado = null, base = '', huboError = false, ocupado = false, apretado = false, inicio = 0;
        const aplicar = p => {
          texto.value = unirTexto(base, p.texto);
          tituloIA = p.titulo || '';
          const sel = $('#an-est', root);
          if (p.estudianteId && !sel.value) sel.value = p.estudianteId;
          const v = p.tipo === 'reunion' ? 'reunion' : p.tipo === 'incidencia' ? 'incidencia' : p.subtipo;
          if (radio(v)) radio(v).checked = true;
          if (p.tipo === 'reunion') { $('#an-fecha', root).value = p.fecha; $('#an-hora', root).value = p.hora || ''; }
          ajustarTipo();
        };
        const ordenar = async dicho => {
          ocupado = true; texto.readOnly = true; bVoz.disabled = true; ayuda.textContent = 'Ordenando lo que dijiste…';
          const hoy = new Date();
          let p = null, aviso = '';
          if (ctx.iaDisponible && ctx.iaDisponible()) {
            try {
              const { datos, mapa } = datosDictado(dicho, estudiantes, hoy);
              const r = await ctx.ia('dictado', datos);
              p = interpretarDictado(r && r.texto, mapa, hoy);
              if (!p) aviso = 'No se pudo ordenar con la IA. Revisa el texto.';
            } catch (e) { aviso = mensajeIA(e); }
          }
          if (!p) p = { tipo: 'anotacion', subtipo: detectarTipo(dicho), estudianteId: detectarEstudiante(dicho, estudiantes), titulo: '', texto: limpiarDictado(dicho), fecha: hoyIso(), hora: '' };
          aplicar(p);
          ocupado = false; texto.readOnly = false; bVoz.disabled = false;
          ayuda.textContent = aviso || 'Revisa el texto, el estudiante y el tipo, y guarda.';
        };
        const crear = () => crearDictado({
          alTexto: (fin, parcial) => { texto.value = unirTexto(base, [fin, parcial].filter(Boolean).join(' ')); },
          alEstado: on => {
            bVoz.setAttribute('aria-pressed', String(on)); bVoz.classList.toggle('grabando', on);
            if (on) { huboError = false; texto.readOnly = true; ayuda.textContent = 'Escuchando… suelta el micrófono al terminar.'; return; }
            texto.readOnly = false;
            if (huboError) { texto.value = base; return; }
            const dicho = texto.value.slice(base.length).trim();
            if (dicho) ordenar(dicho); else { texto.value = base; ayuda.textContent = 'No se escuchó nada. Mantén presionado y habla.'; }
          },
          alError: c => { huboError = true; ayuda.textContent = mensajeVoz(c); },
        });
        const empezar = () => {
          if (ocupado || apretado) return;
          if (!dictado) dictado = crear();
          if (!dictado) return;
          apretado = true; inicio = Date.now(); base = texto.value.trimEnd();
          dictado.iniciar();
        };
        const terminar = () => {
          if (!apretado) return;
          apretado = false;
          if (!huboError && Date.now() - inicio < 350) ayuda.textContent = 'Mantén presionado el micrófono mientras hablas.';
          if (dictado) dictado.parar();
        };
        bVoz.addEventListener('pointerdown', ev => { ev.preventDefault(); try { bVoz.setPointerCapture(ev.pointerId); } catch { /* sin captura */ } empezar(); });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => bVoz.addEventListener(n, terminar));
        bVoz.addEventListener('contextmenu', ev => ev.preventDefault());
        // Con teclado: mantener Espacio o Enter, igual que con el dedo.
        bVoz.addEventListener('keydown', ev => { if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) { ev.preventDefault(); empezar(); } });
        bVoz.addEventListener('keyup', ev => { if (ev.key === ' ' || ev.key === 'Enter') terminar(); });
        window.addEventListener('hashchange', () => { apretado = false; if (dictado) dictado.parar(); }, { once: true });
        void AYUDA;
      }
      $('#an-est', root).addEventListener('change', ev => {
        if (texto.value.trim()) return; // no perder lo escrito o dictado
        location.hash = ev.target.value ? `#/anotaciones?e=${ev.target.value}` : '#/anotaciones';
      });
      $$('.an-borrar', root).forEach(b => b.addEventListener('click', async () => {
        const deshacer = await eliminarConDeshacer('anotaciones', b.dataset.id);
        const li = b.closest('li'); if (li) li.hidden = true;
        toastDeshacer('Anotación eliminada.', async () => { await deshacer(); ctx.refresh(); });
      }));
    },
  };
}
