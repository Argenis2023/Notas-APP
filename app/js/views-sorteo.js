// Pantalla "Sorteo y grupos": elegir a uno, sortear el orden de turnos y armar grupos al azar con los estudiantes de la sección.
import { getSeccion, listEstudiantes, list } from './data.js';
import { mezclar, repartirGrupos, sacarUno, cantidadDeGrupos } from './sorteo.js';
import { html, icon } from './ui.js';
import { $, $$ } from './form.js';

const MODOS = [['uno', 'Elegir uno'], ['turnos', 'Orden de turnos'], ['grupos', 'Grupos']];
const pad = n => String(n).padStart(2, '0');
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const menosMov = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export async function sorteo(ctx, query) {
  const seccion = await getSeccion();
  if (!seccion) return { title: 'Sorteo y grupos', html: html`<p class="vacio">Primero crea tu sección en <a href="#/">Inicio</a>.</p>` };
  const q = new URLSearchParams(query || '');
  const modo = MODOS.some(m => m[0] === q.get('m')) ? q.get('m') : 'uno';
  const estudiantes = await listEstudiantes(seccion.id);
  const hoy = hoyIso();
  const marcasHoy = (await list('asistencia')).filter(a => a.fecha === hoy && a.estado && estudiantes.some(e => e.id === a.estudiante_id));
  const hayListaHoy = marcasHoy.length > 0;

  return {
    title: 'Sorteo y grupos',
    html: !estudiantes.length
      ? html`<p><a href="#/">Inicio</a></p><p class="vacio">Todavía no hay estudiantes. <a href="#/estudiantes">Agrégalos</a> para poder sortear.</p>`
      : html`
      <p><a href="#/">Inicio</a></p>
      <section aria-labelledby="so-t">
        <h2 id="so-t">Sorteo y grupos</h2>
        <p>Elige a alguien al azar, sortea el orden de los turnos o arma grupos. No se guarda nada.</p>
        <nav class="lapso-tabs" aria-label="Qué quieres hacer">${MODOS.map(([id, texto]) => html`<a href="#/aula/sorteo?m=${id}" ${id === modo ? html`aria-current="page"` : ''}>${texto}</a>`)}</nav>

        <details class="so-quienes" id="so-quienes">
          <summary id="so-resumen">Participan ${estudiantes.length} de ${estudiantes.length}</summary>
          <div class="acciones">
            <button type="button" class="btn secondary chico" id="so-todos">Todos</button>
            <button type="button" class="btn secondary chico" id="so-ninguno">Ninguno</button>
            ${hayListaHoy ? html`<button type="button" class="btn secondary chico" id="so-presentes">Solo los que asistieron hoy</button>` : ''}
          </div>
          <ul class="so-lista">${estudiantes.map(e => html`
            <li><label class="check"><input type="checkbox" class="so-est" value="${e.id}" checked> <span>${e.nombre_completo}</span></label></li>`)}</ul>
        </details>

        <div id="so-panel" aria-live="polite">
          ${modo === 'uno' ? html`
            <p class="so-nombre" id="so-nombre" aria-live="assertive">¿Quién será?</p>
            <p class="hint" id="so-faltan"></p>
            <div class="acciones">
              <button type="button" class="btn primary" id="so-elegir">Elegir</button>
              <button type="button" class="btn secondary" id="so-reiniciar">Empezar de nuevo</button>
            </div>
            <div id="so-pasaron"></div>`
          : modo === 'turnos' ? html`
            <div class="acciones"><button type="button" class="btn primary" id="so-sortear">${icon('sorteo', 20)} Sortear el orden</button></div>
            <div id="so-orden"></div>`
          : html`
            <fieldset class="so-opciones">
              <legend>¿Cómo quieres armarlos?</legend>
              <label class="check"><input type="radio" name="so-como" value="grupos" checked> <span>Por cantidad de grupos</span></label>
              <label class="check"><input type="radio" name="so-como" value="tam"> <span>Por integrantes en cada grupo</span></label>
              <div class="field"><label for="so-num" id="so-num-l">Cantidad de grupos</label><input id="so-num" type="number" inputmode="numeric" min="1" value="4"></div>
            </fieldset>
            <div class="acciones"><button type="button" class="btn primary" id="so-armar">${icon('sorteo', 20)} Armar grupos</button></div>
            <div id="so-grupos"></div>`}
        </div>
      </section>`,
    mount(root) {
      if (!estudiantes.length) return;
      const porId = new Map(estudiantes.map(e => [e.id, e]));
      const checks = $$('.so-est', root);
      const participan = () => checks.filter(c => c.checked).map(c => porId.get(c.value));
      const resumen = $('#so-resumen', root);
      let pendientes = null, pasaron = [], ruleta = null;
      const nombreUno = $('#so-nombre', root);
      const faltan = $('#so-faltan', root);
      const pintarUno = () => {
        if (!nombreUno) return;
        faltan.textContent = pendientes ? (pendientes.length ? `Faltan ${plural(pendientes.length, 'estudiante', 'estudiantes')} por pasar.` : 'Ya pasaron todos.') : '';
        $('#so-elegir', root).disabled = !!pendientes && pendientes.length === 0;
        $('#so-elegir', root).textContent = pasaron.length ? 'Elegir otro' : 'Elegir';
        $('#so-pasaron', root).innerHTML = pasaron.length ? html`<h3>Ya pasaron</h3><ol class="so-ya">${pasaron.map(e => html`<li>${e.nombre_completo}</li>`)}</ol>`.toString() : '';
      };
      const reiniciar = () => { clearInterval(ruleta); pendientes = null; pasaron = []; if (nombreUno) nombreUno.textContent = '¿Quién será?'; pintarUno(); };
      const alCambiar = () => {
        const n = participan().length;
        resumen.textContent = `Participan ${n} de ${estudiantes.length}`;
        reiniciar();
        const num = $('#so-num', root);
        if (num) num.max = String(Math.max(1, n));
      };
      checks.forEach(c => c.addEventListener('change', alCambiar));
      $('#so-todos', root).addEventListener('click', () => { checks.forEach(c => { c.checked = true; }); alCambiar(); });
      $('#so-ninguno', root).addEventListener('click', () => { checks.forEach(c => { c.checked = false; }); alCambiar(); });
      const bp = $('#so-presentes', root);
      if (bp) bp.addEventListener('click', () => {
        const presentes = new Set(marcasHoy.filter(a => a.estado === 'presente').map(a => a.estudiante_id));
        checks.forEach(c => { c.checked = presentes.has(c.value); });
        alCambiar();
      });
      const sinNadie = () => { const n = participan().length; if (!n) { $('#so-quienes', root).open = true; resumen.textContent = 'Marca al menos a un estudiante'; } return !n; };

      // --- Elegir uno ---
      const bElegir = $('#so-elegir', root);
      if (bElegir) {
        pintarUno();
        $('#so-reiniciar', root).addEventListener('click', reiniciar);
        bElegir.addEventListener('click', () => {
          if (sinNadie()) return;
          if (!pendientes) pendientes = participan();
          if (!pendientes.length) return;
          const { elegido, resto } = sacarUno(pendientes);
          clearInterval(ruleta);
          const fin = () => { nombreUno.textContent = elegido.nombre_completo; pendientes = resto; pasaron.push(elegido); nombreUno.classList.add('listo'); pintarUno(); bElegir.disabled = pendientes.length === 0; };
          nombreUno.classList.remove('listo');
          if (menosMov() || participan().length < 2) { fin(); return; }
          bElegir.disabled = true;
          const nombres = participan().map(e => e.nombre_completo);
          let n = 0;
          ruleta = setInterval(() => {
            nombreUno.textContent = nombres[Math.floor(Math.random() * nombres.length)];
            if (++n >= 12) { clearInterval(ruleta); fin(); }
          }, 70);
        });
      }

      // --- Orden de turnos ---
      const bSortear = $('#so-sortear', root);
      if (bSortear) bSortear.addEventListener('click', () => {
        if (sinNadie()) return;
        const orden = mezclar(participan());
        $('#so-orden', root).innerHTML = html`<ol class="so-turnos hoja">${orden.map(e => html`<li><span class="fila-nombre">${e.nombre_completo}</span></li>`)}</ol><p class="hint">Se sortearon ${plural(orden.length, 'turno', 'turnos')}. Toca el botón otra vez para sortear de nuevo.</p>`.toString();
        bSortear.textContent = 'Sortear de nuevo';
      });

      // --- Grupos ---
      const bArmar = $('#so-armar', root);
      if (bArmar) {
        const num = $('#so-num', root);
        const como = () => $$('input[name=so-como]', root).find(r => r.checked).value;
        $$('input[name=so-como]', root).forEach(r => r.addEventListener('change', () => {
          $('#so-num-l', root).textContent = como() === 'tam' ? 'Integrantes por grupo' : 'Cantidad de grupos';
          num.value = como() === 'tam' ? '4' : '4';
        }));
        bArmar.addEventListener('click', () => {
          if (sinNadie()) return;
          const gente = participan();
          const v = Math.max(1, parseInt(num.value, 10) || 1);
          const grupos = repartirGrupos(gente, como() === 'tam' ? { tam: v } : { grupos: v });
          $('#so-grupos', root).innerHTML = html`
            <p class="hint">${plural(grupos.length, 'grupo', 'grupos')} para ${plural(gente.length, 'estudiante', 'estudiantes')}.</p>
            <div class="so-cuadros">${grupos.map((g, i) => html`
              <section class="so-grupo" aria-labelledby="g${i}"><h3 id="g${i}">Grupo ${i + 1} <span class="hint">(${g.length})</span></h3>
                <ul>${g.map(e => html`<li>${e.nombre_completo}</li>`)}</ul></section>`)}</div>`.toString();
          bArmar.textContent = 'Volver a sortear';
        });
      }
    },
  };
}
