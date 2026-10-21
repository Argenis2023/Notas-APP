// Análisis de rendimiento. Todo son funciones puras sobre una "foto" (snapshot) de los datos,
// para poder probarlas sin base de datos. `cargarSnapshot` arma la foto desde IndexedDB.
import { list } from './data.js';
import { puntosDe, promedio, notaVigente, aprueba, CONFIG_BASE } from './calc.js';
import { desdeConfig } from './institucion.js';

export const UMBRAL_FUERTE = 80; // % desde el cual un indicador se considera dominado

export const claveIndicador = i => (i.etiqueta && i.etiqueta.trim() ? i.etiqueta.trim() : i.texto.trim());
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const TABLAS_SNAPSHOT = ['estudiantes', 'asignaturas', 'evaluaciones', 'indicadores', 'resultados', 'notas', 'lapsos', 'configuracion', 'reportes', 'recomendaciones', 'asistencia'];

export async function cargarSnapshot(seccion) {
  const filas = await Promise.all(TABLAS_SNAPSHOT.map(list));
  return armarSnapshot(seccion, Object.fromEntries(TABLAS_SNAPSHOT.map((t, i) => [t, filas[i]])));
}

// Arma la foto a partir de las filas de cada tabla (sirve igual con datos del celular o de la nube).
export function armarSnapshot(seccion, t) {
  const { estudiantes, asignaturas, evaluaciones, indicadores, resultados, notas, lapsos, configuracion: cfgs, reportes, recomendaciones, asistencia: asistenciaTodas } = t;
  const est = estudiantes.filter(e => e.seccion_id === seccion.id).sort((a, b) => (a.numero_lista ?? 1e9) - (b.numero_lista ?? 1e9) || (a.nombre_completo || '').localeCompare(b.nombre_completo || '', 'es'));
  const asig = asignaturas.filter(a => a.seccion_id === seccion.id).sort((a, b) => (a.orden ?? 1e9) - (b.orden ?? 1e9));
  const asigIds = new Set(asig.map(a => a.id));
  const evs = evaluaciones.filter(e => asigIds.has(e.asignatura_id));
  const evIds = new Set(evs.map(e => e.id));
  const inds = indicadores.filter(i => evIds.has(i.evaluacion_id)).sort((a, b) => (a.orden ?? 1e9) - (b.orden ?? 1e9));
  const indIds = new Set(inds.map(i => i.id));
  const niveles = {};
  const indEval = new Map(inds.map(i => [i.id, i.evaluacion_id]));
  const actividad = {}; // última marca por evaluación
  for (const r of resultados) if (indIds.has(r.indicador_id) && r.nivel) {
    niveles[`${r.indicador_id}|${r.estudiante_id}`] = r.nivel;
    const ev = indEval.get(r.indicador_id), t = String(r.updated_at || '');
    if (t > (actividad[ev] || '')) actividad[ev] = t;
  }
  const nota = {};
  for (const n of notas) if (evIds.has(n.evaluacion_id)) nota[`${n.evaluacion_id}|${n.estudiante_id}`] = notaVigente(n);
  return {
    seccion,
    inst: desdeConfig([...cfgs].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0] || {}),
    cfg: { ...CONFIG_BASE, ...Object.fromEntries(Object.entries(cfgs[0] || {}).filter(([, v]) => v !== null && v !== undefined)) },
    lapsos: lapsos.filter(l => l.seccion_id === seccion.id).sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0)),
    estudiantes: est, asignaturas: asig, evaluaciones: evs, indicadores: inds, niveles, nota, actividad,
    reportes: reportes.filter(r => r.seccion_id === seccion.id),
    recomendaciones,
    asistencia: asistenciaTodas.filter(a => a.estado && est.some(e => e.id === a.estudiante_id)),
  };
}

const evalsDe = (s, asigId, lapsoId) => s.evaluaciones.filter(e => e.asignatura_id === asigId && e.lapso_id === lapsoId);

// Nota del estudiante en una asignatura durante un lapso (promedio de sus evaluaciones con nota)
export function notaAsignatura(s, asigId, lapsoId, estId) {
  return promedio(evalsDe(s, asigId, lapsoId).map(e => s.nota[`${e.id}|${estId}`]));
}
// Promedio general del estudiante en el lapso (promedio de las notas por asignatura)
export function promedioGeneral(s, lapsoId, estId) {
  return promedio(s.asignaturas.map(a => notaAsignatura(s, a.id, lapsoId, estId)));
}

const pctNivel = (nivel, cfg) => {
  const p = puntosDe(nivel, cfg);
  if (p === null) return null;
  return (p / (puntosDe('logrado', cfg) || 1)) * 100;
};

// Logro del estudiante por indicador (agrupado por tema/clave) en una asignatura y lapso.
// Devuelve [{ clave, pct, n }] ordenado de más débil a más fuerte.
export function logroEstudiante(s, asigId, lapsoId, estId) {
  const grupos = new Map();
  for (const ev of evalsDe(s, asigId, lapsoId)) {
    for (const ind of s.indicadores.filter(i => i.evaluacion_id === ev.id)) {
      const p = pctNivel(s.niveles[`${ind.id}|${estId}`], s.cfg);
      if (p === null) continue;
      const k = claveIndicador(ind);
      const g = grupos.get(norm(k)) || { clave: k, suma: 0, n: 0 };
      g.suma += p; g.n += 1;
      grupos.set(norm(k), g);
    }
  }
  return [...grupos.values()].map(g => ({ clave: g.clave, pct: Math.round(g.suma / g.n), n: g.n })).sort((a, b) => a.pct - b.pct || a.clave.localeCompare(b.clave, 'es'));
}

// Logro del curso por indicador (agrupado) en una asignatura y lapso.
export function logroCurso(s, asigId, lapsoId) {
  const grupos = new Map();
  for (const ev of evalsDe(s, asigId, lapsoId)) {
    for (const ind of s.indicadores.filter(i => i.evaluacion_id === ev.id)) {
      const k = claveIndicador(ind);
      const g = grupos.get(norm(k)) || { clave: k, suma: 0, n: 0, estudiantes: new Set() };
      for (const e of s.estudiantes) {
        const p = pctNivel(s.niveles[`${ind.id}|${e.id}`], s.cfg);
        if (p === null) continue;
        g.suma += p; g.n += 1; g.estudiantes.add(e.id);
      }
      grupos.set(norm(k), g);
    }
  }
  return [...grupos.values()].filter(g => g.n > 0)
    .map(g => ({ clave: g.clave, pct: Math.round(g.suma / g.n), estudiantes: g.estudiantes.size }))
    .sort((a, b) => a.pct - b.pct || a.clave.localeCompare(b.clave, 'es'));
}

export const esDebil = (pct, s) => pct < (s.cfg.umbral_indicador_debil ?? 50);
export const esFuerte = pct => pct >= UMBRAL_FUERTE;

// Estudiantes con promedio general o alguna asignatura por debajo del mínimo en el lapso.
export function enRiesgo(s, lapsoId) {
  const out = [];
  for (const e of s.estudiantes) {
    const bajas = s.asignaturas.filter(a => {
      const n = notaAsignatura(s, a.id, lapsoId, e.id);
      return n !== null && !aprueba(n, s.cfg);
    });
    const prom = promedioGeneral(s, lapsoId, e.id);
    if (bajas.length || (prom !== null && !aprueba(prom, s.cfg))) out.push({ estudiante: e, promedio: prom, asignaturas: bajas });
  }
  return out;
}

export const RANGOS = [
  { id: 'r1', texto: '1 a 9', min: 1, max: 9 },
  { id: 'r2', texto: '10 a 12', min: 10, max: 12 },
  { id: 'r3', texto: '13 a 15', min: 13, max: 15 },
  { id: 'r4', texto: '16 a 18', min: 16, max: 18 },
  { id: 'r5', texto: '19 a 20', min: 19, max: 20 },
];
export function distribucion(notas) {
  const v = notas.filter(n => typeof n === 'number');
  return RANGOS.map(r => ({ ...r, cantidad: v.filter(n => n >= r.min && n <= r.max).length }));
}

// ---------- recomendaciones ----------
// El banco guarda recomendaciones por asignatura y tema. Si no hay, se ofrece una sugerencia general.
export function buscarRecomendacion(s, asigId, clave) {
  const k = norm(clave);
  return s.recomendaciones.find(r => r.asignatura_id === asigId && norm(r.indicador_etiqueta) === k) || null;
}
export const sugerenciaGeneral = clave => `Reforzar "${clave}" con ejercicios guiados en clase, material concreto y práctica breve en casa. Volver a evaluarlo en unas semanas.`;

// ---------- texto descriptivo (borrador sin IA) ----------
const lista = arr => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} y ${arr[arr.length - 1]}`);
const minus = t => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

export function borradorDescriptivo(s, estudiante, lapsoId) {
  const nombre = (estudiante.nombre_completo || '').trim().split(/\s+/)[0] || 'El estudiante';
  const partes = [];
  for (const a of s.asignaturas) {
    const nota = notaAsignatura(s, a.id, lapsoId, estudiante.id);
    if (nota === null) continue;
    const logro = logroEstudiante(s, a.id, lapsoId, estudiante.id);
    const fuertes = logro.filter(l => esFuerte(l.pct)).map(l => minus(l.clave)).slice(-3).reverse();
    const debiles = logro.filter(l => esDebil(l.pct, s)).map(l => minus(l.clave)).slice(0, 3);
    let t = `En ${a.nombre} obtuvo ${nota} puntos.`;
    if (fuertes.length) t += ` Muestra buen dominio en: ${lista(fuertes)}.`;
    if (debiles.length) t += ` Necesita reforzar: ${lista(debiles)}.`;
    if (!fuertes.length && !debiles.length) t += ' Va avanzando de forma regular en los indicadores trabajados.';
    partes.push(t);
  }
  if (!partes.length) return '';
  const prom = promedioGeneral(s, lapsoId, estudiante.id);
  const cierre = prom === null ? '' : aprueba(prom, s.cfg)
    ? ` En general, ${nombre} alcanza los aprendizajes esperados del lapso con un promedio de ${prom} puntos.`
    : ` En general, ${nombre} aún no alcanza los aprendizajes esperados del lapso (promedio ${prom} puntos) y requiere acompañamiento y apoyo en casa.`;
  return `${partes.join(' ')}${cierre}`;
}

// ---------- asistencia ----------
export const ESTADOS_ASIST = [
  { id: 'presente', letra: 'A', nombre: 'Asistió' },
  { id: 'ausente', letra: 'I', nombre: 'Faltó' },
  { id: 'justificado', letra: 'J', nombre: 'Falta justificada' },
];
const enLapso = (l, f) => !l || ((!l.fecha_inicio || f >= l.fecha_inicio) && (!l.fecha_fin || f <= l.fecha_fin));
// Días en que se pasó lista dentro del lapso, y asistencia de cada estudiante.
export function resumenAsistencia(s, lapso, estId) {
  const filas = s.asistencia.filter(a => enLapso(lapso, a.fecha));
  const dias = new Set(filas.map(a => a.fecha)).size;
  const mias = filas.filter(a => a.estudiante_id === estId);
  const faltas = mias.filter(a => a.estado === 'ausente').length;
  const justificadas = mias.filter(a => a.estado === 'justificado').length;
  const presentes = mias.filter(a => a.estado === 'presente').length;
  const marcados = presentes + faltas + justificadas;
  return { dias, presentes, faltas, justificadas, marcados, pct: marcados ? Math.round((100 * presentes) / marcados) : null };
}
