// Bloqueo opcional con PIN. Es un candado de pantalla para que nadie abra el cuaderno si toma el celular:
// no cifra los datos guardados. El PIN no sale del celular (se guarda solo su huella, nunca el número).
import { getMeta, setMeta, db } from './data.js';
import { html } from './ui.js';
import { $, campo, errorBox, mostrarError } from './form.js';

const ITER = 150000;
const MIN_OCULTA_MS = 60000; // vuelve a pedir el PIN si la app estuvo fuera de pantalla más de un minuto
const FALLOS_POR_TANDA = 5;
const ESPERA_MS = 60000;

export const soportado = () => !!(globalThis.crypto && crypto.subtle && crypto.getRandomValues);
export const pinValido = p => /^\d{4,6}$/.test(String(p));
export async function hayPin() { return !!(await getMeta('pin')); }

const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function derivar(pin, salt, iter) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, k, 256));
}

export async function crearPin(pin) {
  if (!soportado()) throw new Error('Este navegador no permite activar el PIN.');
  if (!pinValido(pin)) throw new Error('El PIN debe tener de 4 a 6 números.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(pin, salt, ITER);
  await setMeta('pin', { salt: b64(salt), hash: b64(hash), iter: ITER });
  await setMeta('pin-fallos', { n: 0, hasta: 0 });
}

export async function quitarPin() {
  await db.meta.delete('pin');
  await db.meta.delete('pin-fallos');
}

// Devuelve true si el PIN es correcto; si no, lanza un Error con el mensaje para la persona.
export async function verificarPin(pin) {
  const guardado = await getMeta('pin');
  if (!guardado) return true;
  const f = (await getMeta('pin-fallos')) || { n: 0, hasta: 0 };
  const ahora = Date.now();
  if (f.hasta > ahora) throw new Error(`Demasiados intentos. Espera ${Math.ceil((f.hasta - ahora) / 1000)} segundos.`);
  let ok = false;
  if (pinValido(pin)) {
    const h = await derivar(pin, unb64(guardado.salt), guardado.iter || ITER);
    const real = unb64(guardado.hash);
    let dif = h.length ^ real.length;
    for (let i = 0; i < h.length; i++) dif |= h[i] ^ (real[i] || 0);
    ok = dif === 0;
  }
  if (ok) { await setMeta('pin-fallos', { n: 0, hasta: 0 }); return true; }
  const n = f.n + 1;
  const espera = n % FALLOS_POR_TANDA === 0;
  await setMeta('pin-fallos', { n, hasta: espera ? ahora + ESPERA_MS : 0 });
  throw new Error(espera ? 'PIN incorrecto. Espera un minuto antes de volver a intentar.' : 'El PIN no es correcto.');
}

// ---------- pantalla de bloqueo ----------
let supaRef = null;
let abierta = null;

export function bloquear() {
  if (abierta) return abierta;
  abierta = new Promise(resolve => {
    const root = document.createElement('div');
    root.id = 'lock';
    root.className = 'lock';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Cuaderno bloqueado');
    root.innerHTML = html`
      <main class="login">
        <section class="portada" aria-label="Cuaderno docente">
          <p class="portada-titulo">CUADERNO DOCENTE</p>
          <p class="portada-sub">Escribe tu PIN para entrar.</p>
        </section>
        <form id="f-pin" class="stack" novalidate autocomplete="off">
          ${campo({ id: 'lock_pin', label: 'PIN', type: 'password', extra: 'inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off"' })}
          ${errorBox('e-pin')}
          <button class="btn primary" type="submit" id="b-pin">Entrar</button>
          <button class="btn secondary" type="button" id="b-olvide">Olvidé mi PIN</button>
        </form>
        <form id="f-olvide" class="stack" hidden novalidate autocomplete="off">
          <p>Para quitar el PIN, escribe la clave de tu cuenta. Tus datos no se borran.</p>
          ${campo({ id: 'lock_clave', label: 'Clave de tu cuenta', type: 'password', extra: 'autocomplete="current-password"' })}
          ${errorBox('e-olvide')}
          <button class="btn primary" type="submit" id="b-olvide-si">Quitar PIN</button>
          <button class="btn secondary" type="button" id="b-olvide-no">Volver</button>
        </form>
      </main>`.toString();
    document.body.appendChild(root);
    document.body.classList.add('bloqueada');
    const fPin = $('#f-pin', root), fOlv = $('#f-olvide', root);
    const abrir = () => { root.remove(); document.body.classList.remove('bloqueada'); abierta = null; resolve(); };
    $('#lock_pin', root).focus();

    fPin.addEventListener('submit', async ev => {
      ev.preventDefault();
      const b = $('#b-pin', root); b.disabled = true;
      try { await verificarPin($('#lock_pin', root).value.trim()); abrir(); }
      catch (err) { b.disabled = false; $('#lock_pin', root).value = ''; mostrarError(root, 'e-pin', err.message); $('#lock_pin', root).focus(); }
    });
    $('#b-olvide', root).addEventListener('click', () => { fPin.hidden = true; fOlv.hidden = false; $('#lock_clave', root).focus(); });
    $('#b-olvide-no', root).addEventListener('click', () => { fOlv.hidden = true; fPin.hidden = false; mostrarError(root, 'e-olvide', ''); $('#lock_pin', root).focus(); });
    fOlv.addEventListener('submit', async ev => {
      ev.preventDefault();
      const clave = $('#lock_clave', root).value;
      if (!clave) { mostrarError(root, 'e-olvide', 'Escribe la clave de tu cuenta.'); return; }
      const b = $('#b-olvide-si', root); b.disabled = true;
      try {
        if (!supaRef) throw new Error('Esta opción necesita la cuenta con respaldo en la nube. Sin cuenta no se puede recuperar el PIN.');
        if (navigator.onLine === false) throw new Error('Necesitas internet para comprobar la clave.');
        try { await supaRef.auth.verify(clave); }
        catch (e) { throw new Error(/invalid login/i.test(e && e.message) ? 'La clave no es correcta.' : 'No se pudo comprobar la clave. Inténtalo otra vez.'); }
        await quitarPin();
        abrir();
      } catch (err) { b.disabled = false; mostrarError(root, 'e-olvide', err.message); }
    });
  });
  return abierta;
}

// Pide el PIN al abrir la app y cada vez que vuelve a primer plano tras un rato fuera.
export async function iniciarBloqueo(supa) {
  supaRef = supa || null;
  if (await hayPin()) await bloquear();
  let oculta = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') { oculta = Date.now(); return; }
    if (oculta && Date.now() - oculta >= MIN_OCULTA_MS && (await hayPin())) bloquear();
    oculta = 0;
  });
}

// ---------- bloque de Ajustes ----------
export function bloqueAjustes(activo) {
  const pin = (id, label, auto = 'new-password') => campo({ id, label, type: 'password', extra: `inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="${auto}"` });
  return html`
    <section class="bloque" aria-labelledby="t-pin">
      <h2 id="t-pin">Bloqueo con PIN</h2>
      ${!soportado() ? html`<p>Este navegador no permite activar el PIN.</p>` : html`
      <p>${activo ? 'El cuaderno pide tu PIN al abrirlo y cuando vuelves a él después de un rato.' : 'Pide un PIN de 4 a 6 números al abrir el cuaderno, para que nadie más lo vea si toma tu celular.'} El PIN no cifra los datos y solo se guarda en este celular.</p>
      <div class="acciones" id="pin-botones">
        ${activo ? html`<button class="btn secondary" type="button" id="b-pin-cambiar">Cambiar PIN</button><button class="btn secondary" type="button" id="b-pin-quitar">Quitar PIN</button>`
          : html`<button class="btn secondary" type="button" id="b-pin-activar">Activar PIN</button>`}
      </div>
      <form id="f-pin-ajuste" class="stack" hidden novalidate autocomplete="off">
        <div id="pin-actual-w">${pin('pin_actual', 'PIN actual', 'off')}</div>
        <div id="pin-nuevo-w">${pin('pin_nuevo', 'PIN nuevo (4 a 6 números)')}${pin('pin_nuevo2', 'Repite el PIN nuevo')}</div>
        ${errorBox('e-pin-ajuste')}
        <div class="acciones">
          <button class="btn primary" type="submit" id="b-pin-ok">Guardar</button>
          <button class="btn secondary" type="button" id="b-pin-no">Cancelar</button>
        </div>
      </form>`}
    </section>`;
}

export function montarBloqueoAjustes(root, { activo, alCambiar }) {
  const f = $('#f-pin-ajuste', root);
  if (!f) return;
  let modo = '';
  const mostrar = m => {
    modo = m;
    $('#pin-botones', root).hidden = true;
    f.hidden = false;
    $('#pin-actual-w', root).hidden = m === 'activar';
    $('#pin-nuevo-w', root).hidden = m === 'quitar';
    $('#b-pin-ok', root).textContent = m === 'quitar' ? 'Quitar PIN' : 'Guardar';
    $(m === 'activar' ? '#pin_nuevo' : '#pin_actual', root).focus();
  };
  const cerrar = () => {
    f.hidden = true; $('#pin-botones', root).hidden = false; f.reset(); mostrarError(root, 'e-pin-ajuste', '');
  };
  const a = $('#b-pin-activar', root), c = $('#b-pin-cambiar', root), q = $('#b-pin-quitar', root);
  if (a) a.addEventListener('click', () => mostrar('activar'));
  if (c) c.addEventListener('click', () => mostrar('cambiar'));
  if (q) q.addEventListener('click', () => mostrar('quitar'));
  $('#b-pin-no', root).addEventListener('click', cerrar);
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const val = id => $(id, root).value.trim();
    const b = $('#b-pin-ok', root);
    try {
      if (modo !== 'activar') await verificarPin(val('#pin_actual'));
      if (modo !== 'quitar') {
        if (!pinValido(val('#pin_nuevo'))) throw new Error('El PIN debe tener de 4 a 6 números.');
        if (val('#pin_nuevo') !== val('#pin_nuevo2')) throw new Error('Los dos PIN no coinciden.');
      }
      b.disabled = true;
      if (modo === 'quitar') await quitarPin(); else await crearPin(val('#pin_nuevo'));
      alCambiar(modo);
    } catch (err) { b.disabled = false; mostrarError(root, 'e-pin-ajuste', err.message); }
  });
}
