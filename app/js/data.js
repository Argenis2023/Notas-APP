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
  const all = (await list('configuracion')).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
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

// =====================================================================
// Etapa 2: asignaturas, evaluaciones, indicadores, resultados y notas
// =====================================================================
import { calcularEvaluacion } from './calc.js';

// Id fijo para filas que son "un par" (indicador + estudiante, evaluación + estudiante):
// así dos dispositivos que marquen lo mismo escriben sobre la misma fila y no la duplican.
export function idPar(a, b) {
  const s = `${a}|${b}`;
  let h = [0x811c9dc5, 0x01000193, 0xdeadbeef, 0x9e3779b9];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h = h.map((x, k) => Math.imul(x ^ (c + k), 0x01000193 + 2 * k) >>> 0);
  }
  const hex = h.map(x => x.toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// Crea o reemplaza una fila con un id conocido, conservando created_at.
export async function guardarConId(table, id, data) {
  const cur = await db[table].get(id);
  const t = nowIso();
  const row = cur
    ? { ...cur, ...normalize(table, data), deleted: false, updated_at: t, _dirty: 1 }
    : { id, created_at: t, updated_at: t, deleted: false, _dirty: 1, ...normalize(table, data) };
  await db[table].put(row);
  changed([table]);
  return row;
}

const porOrden = (a, b) => (a.orden ?? 1e9) - (b.orden ?? 1e9) || (a.created_at || '').localeCompare(b.created_at || '');

export async function listAsignaturas(seccionId) {
  return (await listBy('asignaturas', 'seccion_id', seccionId)).sort(porOrden);
}
export async function addAsignatura(seccionId, nombre) {
  const otras = await listAsignaturas(seccionId);
  return create('asignaturas', { seccion_id: seccionId, nombre: nombre.trim(), orden: otras.length + 1 });
}
export async function listEvaluaciones(asignaturaId) {
  const l = await listBy('evaluaciones', 'asignatura_id', asignaturaId);
  return l.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.created_at || '').localeCompare(b.created_at || ''));
}
export async function listIndicadores(evaluacionId) {
  return (await listBy('indicadores', 'evaluacion_id', evaluacionId)).sort(porOrden);
}
export async function addIndicadores(evaluacionId, textos) {
  const actuales = await listIndicadores(evaluacionId);
  let orden = actuales.length;
  const creados = [];
  for (const t of textos) {
    const texto = t.trim();
    if (!texto) continue;
    orden += 1;
    creados.push(await create('indicadores', { evaluacion_id: evaluacionId, texto, orden, peso: 1 }));
  }
  if (creados.length) await recalcularEvaluacion(evaluacionId);
  return creados;
}

// Niveles marcados en una evaluación: { [estudiante_id]: { [indicador_id]: nivel } }
export async function nivelesDeEvaluacion(evaluacionId, indicadores) {
  const mapa = {};
  for (const ind of indicadores) {
    for (const r of await listBy('resultados', 'indicador_id', ind.id)) {
      if (!r.nivel) continue;
      (mapa[r.estudiante_id] ||= {})[ind.id] = r.nivel;
    }
  }
  return mapa;
}

export async function listNotas(evaluacionId) {
  return listBy('notas', 'evaluacion_id', evaluacionId);
}

// Marca (o desmarca, con nivel null) un indicador de un estudiante y actualiza su nota.
export async function setNivel(evaluacionId, indicadorId, estudianteId, nivel) {
  await guardarConId('resultados', idPar(indicadorId, estudianteId), { indicador_id: indicadorId, estudiante_id: estudianteId, nivel: nivel || null });
  await recalcularNota(evaluacionId, estudianteId);
}

// Marca el mismo nivel para todos los estudiantes (o todos los indicadores) de una vez.
export async function setNiveles(evaluacionId, pares, nivel) {
  for (const [indicadorId, estudianteId] of pares) {
    await guardarConId('resultados', idPar(indicadorId, estudianteId), { indicador_id: indicadorId, estudiante_id: estudianteId, nivel: nivel || null });
  }
  const ests = [...new Set(pares.map(p => p[1]))];
  for (const e of ests) await recalcularNota(evaluacionId, e);
}

export async function recalcularNota(evaluacionId, estudianteId) {
  const [inds, cfg] = [await listIndicadores(evaluacionId), await getConfig()];
  const niveles = {};
  for (const ind of inds) {
    const r = await db.resultados.get(idPar(ind.id, estudianteId));
    if (r && !r.deleted && r.nivel) niveles[ind.id] = r.nivel;
  }
  const calc = calcularEvaluacion(inds, niveles, cfg);
  const id = idPar(evaluacionId, estudianteId);
  const cur = await db.notas.get(id);
  if (calc.nota === null && (!cur || cur.deleted)) return calc;
  if (cur && !cur.deleted && cur.nota_calculada === calc.nota) return calc;
  await guardarConId('notas', id, { evaluacion_id: evaluacionId, estudiante_id: estudianteId, nota_calculada: calc.nota, nota_final: cur ? cur.nota_final : null, observacion: cur ? cur.observacion : null });
  return calc;
}

export async function recalcularEvaluacion(evaluacionId) {
  const inds = await listIndicadores(evaluacionId);
  const ids = new Set((await listNotas(evaluacionId)).map(n => n.estudiante_id));
  for (const ind of inds) for (const r of await listBy('resultados', 'indicador_id', ind.id)) ids.add(r.estudiante_id);
  for (const e of ids) await recalcularNota(evaluacionId, e);
}

// Corrección manual de la docente: null devuelve a la nota calculada.
export async function corregirNota(evaluacionId, estudianteId, notaFinal) {
  const id = idPar(evaluacionId, estudianteId);
  const cur = await db.notas.get(id);
  await guardarConId('notas', id, {
    evaluacion_id: evaluacionId, estudiante_id: estudianteId,
    nota_calculada: cur ? cur.nota_calculada : null, nota_final: notaFinal, observacion: cur ? cur.observacion : null,
  });
}

export async function eliminarIndicador(indicador) {
  for (const r of await listBy('resultados', 'indicador_id', indicador.id)) await remove('resultados', r.id);
  await remove('indicadores', indicador.id);
  await recalcularEvaluacion(indicador.evaluacion_id);
}
export async function eliminarEvaluacion(evaluacionId) {
  for (const ind of await listIndicadores(evaluacionId)) {
    for (const r of await listBy('resultados', 'indicador_id', ind.id)) await remove('resultados', r.id);
    await remove('indicadores', ind.id);
  }
  for (const n of await listNotas(evaluacionId)) await remove('notas', n.id);
  await remove('evaluaciones', evaluacionId);
}
export async function eliminarAsignatura(asignaturaId) {
  for (const ev of await listEvaluaciones(asignaturaId)) await eliminarEvaluacion(ev.id);
  await remove('asignaturas', asignaturaId);
}

// Cuando cambian los puntos por nivel hay que recalcular todas las notas.
export async function recalcularTodo(seccionId) {
  for (const a of await listAsignaturas(seccionId)) for (const ev of await listEvaluaciones(a.id)) await recalcularEvaluacion(ev.id);
}
