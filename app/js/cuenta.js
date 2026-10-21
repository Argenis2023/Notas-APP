// Un celular guarda los datos de UNA cuenta. Si alguien entra con otro correo en el mismo celular,
// los datos locales de la cuenta anterior no se deben mezclar ni subirse a la cuenta nueva.
import { getMeta, setMeta, countPending, borrarTodoLocal, getSeccion } from './data.js';
import { html } from './ui.js';
import { $ } from './form.js';

const norm = e => String(e || '').trim().toLowerCase();

// Devuelve 'igual' (nada que hacer), 'nuevo' (celular vacío: se registró la cuenta), 'otra' (hay datos de otra cuenta)
// o 'desconocida' (hay datos, pero de antes de que el celular guardara de quién son: hay que preguntar).
export async function revisarDueno(email) {
  const actual = norm(email);
  const dueno = await getMeta('cuenta');
  if (!dueno) {
    if (await getSeccion()) return 'desconocida';
    await setMeta('cuenta', actual);
    return 'nuevo';
  }
  return dueno === actual ? 'igual' : 'otra';
}

export async function tomarCelular(email) {
  await borrarTodoLocal();
  await setMeta('cuenta', norm(email));
}

// Pantalla que bloquea hasta decidir. Resuelve true si se puede seguir (se borraron los datos locales o se confirmó que son
// de esta cuenta) y false si se eligió salir.
export async function pedirCambioDeCuenta(email, caso = 'otra') {
  const anterior = await getMeta('cuenta');
  const pendientes = await countPending();
  const desconocida = caso === 'desconocida';
  const gate = $('#gate');
  gate.hidden = false;
  gate.innerHTML = html`
    <main class="login">
      <section class="portada" aria-label="Cuaderno docente"><p class="portada-titulo">CUADERNO DOCENTE</p></section>
      <div class="stack">
        ${desconocida ? html`
          <h2>Este celular ya tiene datos guardados</h2>
          <p>Estás entrando como <strong>${norm(email)}</strong>, pero estos datos se guardaron antes de que el celular anotara de quién son. Si son de otra persona, se mezclarían con tu cuaderno.</p>
          <p>Si son tuyos, sigue. Si no, bórralos: los de la otra persona no se tocan en la nube y se recuperan entrando con su correo.</p>`
        : html`
          <h2>Este celular tiene datos de otra cuenta</h2>
          <p>Los datos guardados aquí son de <strong>${anterior}</strong>. Estás entrando como <strong>${norm(email)}</strong>.</p>
          <p>Para que no se mezclen, hay que borrar los datos de este celular antes de seguir. Los de la otra cuenta no se tocan en la nube: se recuperan entrando otra vez con su correo.</p>`}
        ${pendientes ? html`<p class="error" role="alert">Atención: hay ${pendientes} cambios que todavía no se respaldaron en la nube, y se perderían si los borras.</p>` : ''}
        ${desconocida ? html`<button class="btn primary" type="button" id="b-cambio-mios">Son mis datos, seguir</button>` : ''}
        <button class="btn ${desconocida ? 'secondary' : 'primary'}" type="button" id="b-cambio-si">Borrar datos de este celular y entrar</button>
        <button class="btn secondary" type="button" id="b-cambio-no">Salir</button>
      </div>
    </main>`.toString();
  return new Promise(resolve => {
    const cerrar = () => { gate.hidden = true; gate.innerHTML = ''; };
    const mios = $('#b-cambio-mios', gate);
    if (mios) mios.addEventListener('click', async () => { mios.disabled = true; await setMeta('cuenta', norm(email)); cerrar(); resolve(true); });
    $('#b-cambio-si', gate).addEventListener('click', async () => {
      $('#b-cambio-si', gate).disabled = true;
      await tomarCelular(email);
      cerrar();
      resolve(true);
    });
    $('#b-cambio-no', gate).addEventListener('click', () => resolve(false));
  });
}
