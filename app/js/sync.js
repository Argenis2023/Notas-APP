// Sincronización entre el celular (IndexedDB) y la nube (Supabase).
//
// Reglas:
//  - Subir: toda fila con _dirty = 1 se envía. Si el envío falla, queda pendiente y se reintenta.
//  - Bajar: se traen las filas cambiadas en el servidor desde la última vez.
//  - Conflicto: gana la fila con updated_at más reciente (última modificación).
//  - Borrar es "borrado lógico" (deleted = true), para que el cambio también viaje.
//
// El servidor se abstrae como `remote` con pull(table, sinceIso) y push(table, rows),
// así la lógica se puede probar sin Supabase.
import { db, TABLE_NAMES, getMeta, setMeta, countPending, emitPulled, bus } from './data.js';
import { toRemote } from './schema.js';

const CHUNK = 200;
const OVERLAP_MS = 5000; // se pide un poco antes de la última marca para no perder filas

const ts = s => Date.parse(s);

export function createSync({ remote, onStatus = () => {} }) {
  let running = null;
  let again = false;
  let timer = null;
  let state = { status: remote ? 'idle' : 'disabled', pending: 0, lastSync: null, error: null };

  const set = async patch => {
    state = { ...state, ...patch, pending: await countPending() };
    onStatus(state);
  };

  async function pullTable(table) {
    const last = await getMeta(`lastPull:${table}`);
    const since = last ? new Date(ts(last) - OVERLAP_MS).toISOString() : null;
    const rows = await remote.pull(table, since);
    if (!rows.length) return 0;
    let max = last;
    let aplicadas = 0;
    await db.transaction('rw', db[table], async () => {
      for (const r of rows) {
        if (r.server_updated_at && (!max || ts(r.server_updated_at) > ts(max))) max = r.server_updated_at;
        const local = await db[table].get(r.id);
        const remotoGana = !local || !local._dirty || ts(r.updated_at) >= ts(local.updated_at);
        if (remotoGana) {
          await db[table].put({ ...r, _dirty: 0 });
          aplicadas += 1;
        }
      }
    });
    if (max) await setMeta(`lastPull:${table}`, max);
    return aplicadas;
  }

  async function pushTable(table) {
    const dirty = await db[table].where('_dirty').equals(1).toArray();
    for (let i = 0; i < dirty.length; i += CHUNK) {
      const lote = dirty.slice(i, i + CHUNK);
      await remote.push(table, lote.map(r => toRemote(table, r)));
      // Solo se marca como subida si la fila no cambió mientras se enviaba
      await db.transaction('rw', db[table], async () => {
        for (const r of lote) {
          const cur = await db[table].get(r.id);
          if (cur && cur.updated_at === r.updated_at) await db[table].update(r.id, { _dirty: 0 });
        }
      });
    }
    return dirty.length;
  }

  async function run() {
    if (!remote) { await set({ status: 'disabled' }); return state; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { await set({ status: 'offline' }); return state; }
    await set({ status: 'syncing', error: null });
    try {
      const cambiadas = [];
      for (const t of TABLE_NAMES) if ((await pullTable(t)) > 0) cambiadas.push(t);
      for (const t of TABLE_NAMES) await pushTable(t);
      if (cambiadas.length) emitPulled(cambiadas);
      await setMeta('lastSync', new Date().toISOString());
      await set({ status: 'ok', lastSync: await getMeta('lastSync'), error: null });
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      await set({ status: offline ? 'offline' : 'error', error: e && e.message ? e.message : String(e) });
    }
    return state;
  }

  // Una sola sincronización a la vez; si llegan cambios mientras corre, se repite al terminar.
  let parado = false;
  async function detener() { parado = true; clearTimeout(timer); if (running) { try { await running; } catch { /* da igual */ } } }
  const reanudar = () => { parado = false; };
  function syncNow() {
    if (parado) return Promise.resolve({ status: 'disabled' });
    if (running) { again = true; return running; }
    running = (async () => {
      try {
        let r = await run();
        while (again) { again = false; r = await run(); }
        return r;
      } finally { running = null; }
    })();
    return running;
  }

  function schedule(ms = 4000) {
    if (!remote) return;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow(), ms);
  }

  async function init() {
    state.lastSync = await getMeta('lastSync');
    await set({});
    bus.addEventListener('change', e => {
      // Los datos que llegan del servidor no deben disparar otra subida
      if (e.detail && e.detail.fromRemote) return;
      set({}).then(() => schedule());
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => syncNow());
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
    }
  }

  return { init, syncNow, schedule, detener, reanudar, get state() { return state; }, enabled: !!remote };
}
