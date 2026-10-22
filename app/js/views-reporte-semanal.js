// Reporte semanal por correo: botón en Reportes y configuración del envío automático en Ajustes.
import { mensajeReporte } from './ia.js';
import { html, toast } from './ui.js';
import { $, errorBox, mostrarError } from './form.js';

const DIAS = [[1, 'lunes'], [2, 'martes'], [3, 'miércoles'], [4, 'jueves'], [5, 'viernes'], [6, 'sábado'], [7, 'domingo']];
const horaTexto = h => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'a. m.' : 'p. m.'}`;

// La pantalla de Reportes se redibuja sola cuando cambian los datos (por ejemplo al respaldar). Este estado
// vive fuera de la pantalla para que la confirmación no se cierre a mitad del envío.
const estadoEnvio = { correo: null, enviando: false, error: '' };

// Repinta la pantalla que esté a la vista (puede ser otra copia del DOM si se redibujó).
function pintarVivo() {
  const b = document.getElementById('b-rs'), panel = document.getElementById('rs-confirma');
  if (!b || !panel) return;
  const si = document.getElementById('b-rs-si'), texto = document.getElementById('rs-texto'), e = document.getElementById('e-rs');
  panel.hidden = !estadoEnvio.correo;
  b.disabled = !!estadoEnvio.correo;
  if (estadoEnvio.correo) texto.textContent = `Se enviará a ${estadoEnvio.correo} con los datos que tengas respaldados en este momento.`;
  si.disabled = estadoEnvio.enviando;
  si.textContent = estadoEnvio.enviando ? 'Enviando, puede tardar unos segundos…' : 'Enviar ahora';
  e.textContent = estadoEnvio.error;
  e.hidden = !estadoEnvio.error;
}


// ----- Ayuda para que el reporte no caiga en spam: instrucciones para que el docente revise su correo -----
function ayudaSpam() {
  return html`
    <div class="ayuda-spam" role="note" id="ay-spam">
      <p><strong>Si no ves el reporte en tu correo, revisa spam</strong></p>
      <p>Los reportes salen del correo <strong id="ay-correo">${correoGuardado() || 'de la app'}</strong>. Como es un remitente nuevo, Gmail puede mandarlos a spam y no verás que llegaron. Para recibirlos en tu bandeja:</p>
      <ol>
        <li>Abre la carpeta <strong>Spam</strong> de tu correo y busca el reporte.</li>
        <li>Ábrelo y toca <strong>No es spam</strong>.</li>
        <li>Guarda ese correo en tus contactos, por ejemplo desde la app de Contactos de tu celular, con el nombre <strong>Cuaderno docente</strong>.</li>
        <li>Opcional: elige <strong>Filtrar mensajes como estos</strong> y marca <strong>No enviar nunca a spam</strong>.</li>
      </ol>
    </div>`;
}

// La ayuda se ve al instante; la dirección exacta se guarda en el celular para mostrarla sin esperar.
const CLAVE_REMITENTE = 'cuaderno-remitente';
function correoGuardado() { try { return localStorage.getItem(CLAVE_REMITENTE) || ''; } catch { return ''; } }
function montarAyudaSpam(root, ctx) {
  const caja = $('#ay-spam', root);
  if (!caja) return;
  ctx.reporte('prefs').then(p => {
    if (!p || !p.remitente) return;
    $('#ay-correo', root).textContent = p.remitente;
    try { localStorage.setItem(CLAVE_REMITENTE, p.remitente); } catch { /* sin almacenamiento */ }
  }).catch(() => { /* sin sesión o sin conexión: la ayuda simplemente no se muestra */ });
}

// ----- Reportes: botón "Enviar reporte semanal" -----
export function bloqueEnvioSemanal(ctx) {
  const disponible = ctx.reporteDisponible && ctx.reporteDisponible();
  return {
    html: html`
      <section aria-labelledby="rs-t" class="bloque">
        <h2 id="rs-t">Reporte semanal</h2>
        ${disponible ? html`
          <p>Te llega por correo un PDF con la asistencia de la semana, el estado del curso, las debilidades por abordar y los próximos cumpleaños.</p>
          <div class="acciones"><button type="button" class="btn secondary" id="b-rs">Enviar reporte semanal</button></div>
          <div id="rs-confirma" hidden class="stack">
            <p id="rs-texto"></p>
            <div class="acciones">
              <button type="button" class="btn primary" id="b-rs-si">Enviar ahora</button>
              <button type="button" class="btn secondary" id="b-rs-no">Cancelar</button>
            </div>
          </div>
          ${errorBox('e-rs')}
          ${ayudaSpam()}`
          : html`<p>Para recibir el reporte por correo necesitas la cuenta con respaldo en la nube.</p>
          <div class="acciones"><a class="btn secondary" href="#/ajustes?c=cuenta">Activar la cuenta</a></div>`}
      </section>`,
    mount(root) {
      const b = $('#b-rs', root);
      if (!b) return;
      montarAyudaSpam(root, ctx);
      const panel = $('#rs-confirma', root), texto = $('#rs-texto', root), si = $('#b-rs-si', root);
      const pintar = () => {
        panel.hidden = !estadoEnvio.correo;
        b.disabled = !!estadoEnvio.correo;
        if (estadoEnvio.correo) texto.textContent = `Se enviará a ${estadoEnvio.correo} con los datos que tengas respaldados en este momento.`;
        si.disabled = estadoEnvio.enviando;
        si.textContent = estadoEnvio.enviando ? 'Enviando, puede tardar unos segundos…' : 'Enviar ahora';
        mostrarError(root, 'e-rs', estadoEnvio.error);
      };
      pintar();
      b.addEventListener('click', async () => {
        estadoEnvio.error = '';
        b.disabled = true;
        try {
          const p = await ctx.reporte('prefs');
          estadoEnvio.correo = p.email;
        } catch (e) { estadoEnvio.error = mensajeReporte(e); }
        const vivo = document.getElementById('b-rs');
        if (vivo) { vivo.disabled = false; }
        pintarVivo();
        if (estadoEnvio.correo) { const s2 = document.getElementById('b-rs-si'); if (s2) s2.focus(); }
      });
      $('#b-rs-no', root).addEventListener('click', () => { estadoEnvio.correo = null; estadoEnvio.error = ''; pintarVivo(); });
      si.addEventListener('click', async () => {
        estadoEnvio.enviando = true; estadoEnvio.error = ''; pintarVivo();
        try {
          // Primero se respaldan los datos, para que el reporte incluya lo último que anotaste.
          const r = await ctx.syncNow();
          if (r && (r.status === 'offline' || r.status === 'error')) throw Object.assign(new Error('sync'), { codigo: r.status === 'offline' ? 'offline' : 'sync' });
          const res = await ctx.reporte('enviar_ahora');
          toast(`Reporte enviado a ${res.email}`);
          estadoEnvio.correo = null;
        } catch (e) { estadoEnvio.error = e && e.codigo === 'sync' ? 'No se pudieron respaldar tus datos, así que no se envió. Revisa Ajustes e inténtalo otra vez.' : mensajeReporte(e); }
        estadoEnvio.enviando = false;
        pintarVivo();
      });
    },
  };
}

// ----- Ajustes: envío automático cada semana -----
export function bloqueProgramacion(ctx) {
  const disponible = ctx.reporteDisponible && ctx.reporteDisponible();
  return {
    html: html`
      <section class="bloque" aria-labelledby="rp-t">
        <h2 id="rp-t">Reporte semanal automático</h2>
        ${disponible ? html`
          <p>Recibe cada semana el reporte del curso en tu correo, sin tener que abrir la app. Se envía con los datos que tengas respaldados en la nube.</p>
          <form id="f-rp" class="stack" novalidate>
            <label class="check"><input type="checkbox" id="rp-activo"> <span>Enviarme el reporte cada semana</span></label>
            <div class="field"><label for="rp-dia">Día</label><select id="rp-dia">${DIAS.map(([v, t]) => html`<option value="${v}" ${v === 5 ? 'selected' : ''}>${t}</option>`)}</select></div>
            <div class="field"><label for="rp-hora">Hora (de Venezuela)</label><select id="rp-hora">${Array.from({ length: 24 }, (_, h) => html`<option value="${h}" ${h === 16 ? 'selected' : ''}>${horaTexto(h)}</option>`)}</select></div>
            <p class="hint" id="rp-estado" role="status">Cargando…</p>
            ${errorBox('e-rp')}
            <button class="btn secondary" type="submit" id="b-rp">Guardar</button>
          </form>
          ${ayudaSpam()}`
          : html`<p>Necesitas la cuenta con respaldo en la nube para recibir el reporte por correo.</p>
          <div class="acciones"><a class="btn secondary" href="#/ajustes?c=cuenta">Activar la cuenta</a></div>`}
      </section>`,
    mount(root) {
      const f = $('#f-rp', root);
      if (!f) return;
      montarAyudaSpam(root, ctx);
      const estado = $('#rp-estado', root);
      const pintar = p => {
        $('#rp-activo', root).checked = !!p.activo;
        $('#rp-dia', root).value = String(p.dia);
        $('#rp-hora', root).value = String(p.hora);
        const partes = [`Llega a ${p.email}.`];
        if (!p.correo_listo) partes.push('Falta configurar el servicio de correo en Supabase.');
        if (p.ultimo_envio) partes.push(`Último envío automático: ${new Date(p.ultimo_envio).toLocaleDateString('es-VE', { day: 'numeric', month: 'long' })}.`);
        if (p.ultimo_error) partes.push('El último intento automático falló. Se reintentará la próxima semana.');
        estado.textContent = partes.join(' ');
      };
      ctx.reporte('prefs').then(pintar).catch(e => { estado.textContent = ''; mostrarError(root, 'e-rp', mensajeReporte(e)); });
      f.addEventListener('submit', async ev => {
        ev.preventDefault();
        const b = $('#b-rp', root); b.disabled = true;
        mostrarError(root, 'e-rp', '');
        try {
          await ctx.reporte('prefs_guardar', { activo: $('#rp-activo', root).checked, dia: Number($('#rp-dia', root).value), hora: Number($('#rp-hora', root).value) });
          toast($('#rp-activo', root).checked ? 'Reporte semanal programado' : 'Reporte semanal desactivado');
        } catch (e) { mostrarError(root, 'e-rp', mensajeReporte(e)); }
        b.disabled = false;
      });
    },
  };
}
