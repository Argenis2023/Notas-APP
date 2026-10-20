// Pantalla de avisos y tarjeta reutilizable para el Inicio.
import { getSeccion } from './data.js';
import { cargarSnapshot } from './analisis.js';
import { calcularAvisos, descartados, descartarAviso, restaurarAvisos, TIPOS_AVISO } from './avisos.js';
import { html, icon, toast } from './ui.js';
import { $ } from './form.js';

export const tarjetaAviso = a => html`
  <li class="aviso aviso-${a.tipo}" data-aviso="${a.id}">
    <a class="aviso-cuerpo" href="${a.href}">
      <span class="aviso-ico">${icon(TIPOS_AVISO[a.tipo].icono, 20)}</span>
      <span class="fila-texto"><span class="fila-nombre">${a.titulo}</span>${a.texto ? html`<span class="fila-sub">${a.texto}</span>` : ''}</span>
    </a>
    <button type="button" class="aviso-ok" data-descartar="${a.id}" aria-label="Entendido: ${a.titulo}">Entendido</button>
  </li>`;

// Un solo escuchador por pantalla: descarta el aviso y deja que la pantalla se redibuje.
export function montarAvisos(root) {
  root.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-descartar]');
    if (!b) return;
    b.closest('.aviso').hidden = true;
    await descartarAviso(b.dataset.descartar);
  });
}

export async function avisosPendientes(s, ctx) {
  const est = ctx.syncState();
  const todos = calcularAvisos(s, { ultimoRespaldo: est.lastSync, conRespaldo: !!(ctx.configurado && ctx.sesion) });
  const ocultos = await descartados();
  return { visibles: todos.filter(a => !ocultos.has(a.id)), ocultos: todos.filter(a => ocultos.has(a.id)).length };
}

export async function avisos(ctx) {
  const seccion = await getSeccion();
  if (!seccion) return { title: 'Avisos', html: html`<p class="vacio">Primero crea tu sección en <a href="#/">Inicio</a>.</p>` };
  const s = await cargarSnapshot(seccion);
  const { visibles, ocultos } = await avisosPendientes(s, ctx);
  const grupos = Object.entries(TIPOS_AVISO).sort((a, b) => a[1].orden - b[1].orden).map(([id, t]) => ({ id, t, items: visibles.filter(a => a.tipo === id) })).filter(g => g.items.length);
  return {
    title: 'Avisos',
    live: true,
    html: html`
      <p><a class="volver" href="#/">${icon('atras', 18)} Inicio</a></p>
      ${grupos.length ? grupos.map(g => html`
        <section aria-labelledby="av-${g.id}">
          <h2 id="av-${g.id}">${g.t.titulo}</h2>
          <ul class="avisos">${g.items.map(tarjetaAviso)}</ul>
        </section>`)
        : html`<p class="vacio"><strong>No hay avisos por ahora.</strong></p><p class="hint">Aquí aparecen las faltas seguidas, las notas bajas, los cumpleaños y lo que conviene recordar.</p>`}
      ${ocultos ? html`<p class="hint">${ocultos === 1 ? 'Descartaste 1 aviso' : `Descartaste ${ocultos} avisos`}. <button type="button" class="enlace" id="b-restaurar-avisos">Volver a mostrarlos</button></p>` : ''}`,
    mount(root) {
      montarAvisos(root);
      const r = $('#b-restaurar-avisos', root);
      if (r) r.addEventListener('click', async () => { await restaurarAvisos(); toast('Avisos restaurados'); });
    },
  };
}
