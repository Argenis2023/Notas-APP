// Un celular guarda los datos de UNA cuenta. Si alguien entra con otro correo en el mismo celular,
// los datos locales de la cuenta anterior no se deben mezclar ni subirse a la cuenta nueva.
import { db, getMeta, setMeta, countPending, borrarTodoLocal } from './data.js';
import { html } from './ui.js';
import { $ } from './form.js';

const norm = e => String(e || '').trim().toLowerCase();

// Devuelve 'igual' (nada que hacer), 'nuevo' (se registró la cuenta) o 'otra' (hay datos de otra cuenta).
export async function revisarDueno(email) {
  const actual = norm(email);
  const dueno = await getMeta('cuenta');
  if (!dueno) { await setMeta('cuenta', actual); return 'nuevo'; }
  return dueno === actual ? 'igual' : 'otra';
}

export async function tomarCelular(email) {
  await borrarTodoLocal();
  await setMeta('cuenta', norm(email));
}

// Pantalla que bloquea hasta decidir. Resuelve true si se borraron los datos locales y se puede seguir, false si se eligió salir.
export async function pedirCambioDeCuenta(email) {
  const anterior = await getMeta('cuenta');
  const pendientes = await countPending();
  const gate = $('#gate');
  gate.hidden = false;
  gate.innerHTML = html`
    <main class="login">
      <section class="portada" aria-label="Cuaderno docente"><p class="portada-titulo">CUADERNO DOCENTE</p></section>
      <div class="stack">
        <h2>Este celular tiene datos de otra cuenta</h2>
        <p>Los datos guardados aquí son de <strong>${anterior}</strong>. Estás entrando como <strong>${norm(email)}</strong>.</p>
        <p>Para que no se mezclen, hay que borrar los datos de este celular antes de seguir. Los de la otra cuenta no se tocan en la nube: se recuperan entrando otra vez con su correo.</p>
        ${pendientes ? html`<p class="error" role="alert">Atención: hay ${pendientes} cambios de la otra cuenta que todavía no se respaldaron, y se perderían.</p>` : ''}
        <button class="btn primary" type="button" id="b-cambio-si">Borrar datos de este celular y entrar</button>
        <button class="btn secondary" type="button" id="b-cambio-no">Salir</button>
      </div>
    </main>`.toString();
  return new Promise(resolve => {
    $('#b-cambio-si', gate).addEventListener('click', async () => {
      $('#b-cambio-si', gate).disabled = true;
      await tomarCelular(email);
      gate.hidden = true; gate.innerHTML = '';
      resolve(true);
    });
    $('#b-cambio-no', gate).addEventListener('click', () => resolve(false));
  });
}
