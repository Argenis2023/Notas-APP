// Capa de datos: todo se guarda primero en el celular (IndexedDB).
// Cada cambio marca la fila como pendiente (_dirty = 1) para que la sincronización la suba.
import Dexie from '../vendor/dexie.js';
import { TABLES, TABLE_NAMES, normalize, allCols, coerce } from './schema.js';

export { TABLES, TABLE_NAMES };

export const db = new Dexie('cuaderno-docente');
const stores = { meta: 'key' };
for (const [name, t] of Object.entries(TABLES)) {
  stores[name] = ['id', 'updated_at', '_dirty', ...(t.idx ? t.idx.split(',').map(s => s.trim()) : [])].join(', ');
}
db.version(1).stores(stores);

// Avisos de cambios para refrescar pantallas y programar la sincronización
export const bus = new EventTarget();
let quiet = 0; // mientras sea > 0 no se emiten avisos (por ejemplo, al aplicar datos del servidor)
export function changed(tables = []) {
  if (quiet) return;
  bus.dispatchEvent(new CustomEvent('change', { detail: { tables } }));
}
// Datos que llegaron del servidor: refrescan las pantallas, pero no disparan otra subida.
export function emitPulled(tables) {
  bus.dispatchEvent(new CustomEvent('change', { detail: { tables, fromRemote: true } }));
}

export const uid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

// ---------- metadatos ----------
export async function getMeta(key, fallback = null) {
  const r = await db.meta.get(key);
  return r ? r.value : fallback;
}
export async function setMeta(key, value) {
  await db.meta.put({ key, value });
}

// ---------- operaciones genéricas ----------
export async function create(table, data) {
  const t = nowIso();
  const row = { id: uid(), created_at: t, updated_at: t, deleted: false, _dirty: 1, ...normalize(table, data) };
  await db[table].put(row);
  changed([table]);
  return row;
}

export async function update(table, id, patch) {
  const cur = await db[table].get(id);
  if (!cur) throw new Error(`No existe ${table}/${id}`);
  const row = { ...cur, ...normalize(table, patch), updated_at: nowIso(), _dirty: 1 };
  await db[table].put(row);
  changed([table]);
  return row;
}

export async function remove(table, id) {
  const cur = await db[table].get(id);
  if (!cur) return;
  await db[table].put({ ...cur, deleted: true, updated_at: nowIso(), _dirty: 1 });
  changed([table]);
}

export const get = (table, id) => db[table].get(id);

export async function list(table) {
  return (await db[table].toArray()).filter(r => !r.deleted);
}

export async function listBy(table, index, value) {
  return (await db[table].where(index).equals(value).toArray()).filter(r => !r.deleted);
}

export function countPending() {
  // Fuera de cualquier transacción abierta: se llama desde avisos de cambio que pueden dispararse dentro de una.
  return Dexie.ignoreTransaction(async () => {
    let n = 0;
    for (const t of TABLE_NAMES) n += await db[t].where('_dirty').equals(1).count();
    return n;
  });
}

// ---------- sección y lapsos ----------
export async function getSeccion() {
  const all = await list('secciones');
  all.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return all[0] || null;
}

export async function getConfig() {
  const all = await list('configuracion');
  if (all.length) return all[0];
  return create('configuracion', {});
}

export function anioEscolarActual(d = new Date()) {
  const y = d.getFullYear();
  return d.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export async function crearSeccion({ nombre, grado, anio_escolar }) {
  let seccion;
  await db.transaction('rw', db.secciones, db.lapsos, db.configuracion, async () => {
    seccion = await create('secciones', { nombre, grado, anio_escolar, siguiente_codigo: 1 });
    for (const numero of [1, 2, 3]) await create('lapsos', { seccion_id: seccion.id, numero, cerrado: false });
  });
  await getConfig();
  return seccion;
}

export async function getLapsos(seccionId) {
  const l = await listBy('lapsos', 'seccion_id', seccionId);
  return l.sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
}

const dayOnly = s => (s ? Date.parse(s + 'T00:00:00Z') : NaN);
// Lapso en curso según la fecha; si no hay ninguno en curso, el próximo o el último con fechas.
export function lapsoActual(lapsos, hoy = new Date()) {
  const t = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const con = lapsos.filter(l => !Number.isNaN(dayOnly(l.fecha_inicio)) && !Number.isNaN(dayOnly(l.fecha_fin)));
  const en = con.find(l => dayOnly(l.fecha_inicio) <= t && t <= dayOnly(l.fecha_fin));
  if (en) return en;
  const proximo = con.filter(l => dayOnly(l.fecha_inicio) > t).sort((a, b) => dayOnly(a.fecha_inicio) - dayOnly(b.fecha_inicio))[0];
  if (proximo) return proximo;
  return con.sort((a, b) => dayOnly(b.fecha_fin) - dayOnly(a.fecha_fin))[0] || null;
}

// ---------- estudiantes ----------
export async function listEstudiantes(seccionId) {
  const l = await listBy('estudiantes', 'seccion_id', seccionId);
  return l.sort((a, b) => (a.numero_lista ?? 1e9) - (b.numero_lista ?? 1e9) || (a.nombre_completo || '').localeCompare(b.nombre_completo || '', 'es'));
}

// Crea un estudiante: asigna el código para la IA (Estudiante N, nunca se reutiliza)
// y el siguiente número de lista si no se indicó.
export async function addEstudiante(seccionId, data) {
  let row;
  await db.transaction('rw', db.secciones, db.estudiantes, async () => {
    row = (await addMany(seccionId, [data]))[0];
  });
  return row;
}

export async function addMany(seccionId, items) {
  const seccion = await db.secciones.get(seccionId);
  if (!seccion) throw new Error('La sección no existe');
  const existentes = (await listBy('estudiantes', 'seccion_id', seccionId));
  let siguienteNumero = Math.max(0, ...existentes.map(e => e.numero_lista || 0)) + 1;
  let codigo = seccion.siguiente_codigo || 1;
  const creados = [];
  for (const item of items) {
    const numero = coerce('int', item.numero_lista);
    const fila = await create('estudiantes', {
      ...item,
      seccion_id: seccionId,
      numero_lista: numero ?? siguienteNumero,
      codigo_ia: `Estudiante ${codigo}`,
    });
    codigo += 1;
    if (numero == null) siguienteNumero += 1;
    else if (numero >= siguienteNumero) siguienteNumero = numero + 1;
    creados.push(fila);
  }
  await update('secciones', seccionId, { siguiente_codigo: codigo });
  return creados;
}

export async function importEstudiantes(seccionId, items) {
  let creados = [];
  await db.transaction('rw', db.secciones, db.estudiantes, async () => {
    creados = await addMany(seccionId, items);
  });
  return creados.length;
}

// ---------- copia de seguridad ----------
export const BACKUP_VERSION = 1;

export async function exportAll() {
  const tables = {};
  for (const t of TABLE_NAMES) {
    const rows = (await db[t].toArray()).filter(r => !r.deleted);
    if (rows.length) {
      tables[t] = rows.map(r => {
        const o = {};
        for (const k of Object.keys(allCols(t))) if (k in r) o[k] = r[k];
        return o;
      });
    }
  }
  return { app: 'cuaderno-docente', version: BACKUP_VERSION, exported_at: nowIso(), tables };
}

export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || obj.app !== 'cuaderno-docente' || !obj.tables || typeof obj.tables !== 'object') {
    throw new Error('Este archivo no es una copia de seguridad del Cuaderno docente.');
  }
  if (obj.version > BACKUP_VERSION) throw new Error('La copia viene de una versión más nueva de la app. Actualiza la app e inténtalo otra vez.');
  const resumen = {};
  for (const [t, rows] of Object.entries(obj.tables)) {
    if (!TABLES[t]) continue;
    if (!Array.isArray(rows) || rows.some(r => !r || typeof r.id !== 'string')) throw new Error(`La copia está dañada en la tabla ${t}.`);
    resumen[t] = rows.length;
  }
  return resumen;
}

// Mezcla la copia con los datos actuales: lo que está en la copia gana y se vuelve a subir.
export async function restoreAll(obj) {
  validateBackup(obj);
  const t = nowIso();
  let total = 0;
  const hechas = [];
  await db.transaction('rw', TABLE_NAMES.map(n => db[n]), async () => {
    for (const [name, rows] of Object.entries(obj.tables)) {
      if (!TABLES[name]) continue;
      const limpias = rows.map(r => {
        const o = { id: r.id, created_at: r.created_at || t };
        for (const [k, type] of Object.entries(TABLES[name].cols)) if (k in r) o[k] = coerce(type, r[k]);
        return { ...o, deleted: false, updated_at: t, _dirty: 1 };
      });
      await db[name].bulkPut(limpias);
      total += limpias.length;
      hechas.push(name);
    }
  });
  changed(hechas);
  return total;
}
