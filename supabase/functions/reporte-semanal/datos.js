// Datos del reporte semanal del curso. Son funciones puras sobre la "foto" (snapshot) de los datos,
// así se prueban sin base de datos y sirven igual en el servidor.
import { armarSnapshot, promedioGeneral, notaAsignatura, enRiesgo, logroCurso, esDebil, resumenAsistencia, distribucion, buscarRecomendacion, sugerenciaGeneral } from '../../../app/js/analisis.js';
import { lapsoActual } from '../../../app/js/data.js';
import { promedio, aprueba } from '../../../app/js/calc.js';
import { lineasEncabezado } from '../../../app/js/institucion.js';

export { armarSnapshot };

const pad = n => String(n).padStart(2, '0');
export const isoDe = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DIA_MS = 86400000;
const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const fechaLarga = d => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

// "Hoy" en Venezuela (UTC-4, sin horario de verano), como una fecha local sin hora.
export function hoyCaracas(ahora = new Date()) {
  const c = new Date(ahora.getTime() - 4 * 3600000);
  return new Date(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate());
}

// Lunes a viernes de la semana de hoy (si es fin de semana, la que acaba de pasar).
export function diasDeLaSemana(hoy) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return [0, 1, 2, 3, 4].map(i => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i));
}

const nombreCorto = e => String(e.nombre_completo || '').trim();

export function armarReporte(s, hoy, { nombreDe = nombreCorto } = {}) {
  const lapso = lapsoActual(s.lapsos, hoy) || s.lapsos[0] || null;
  const lapsoId = lapso ? lapso.id : null;
  const dias = diasDeLaSemana(hoy);
  const semana = dias.map((d, i) => {
    const iso = isoDe(d);
    const filas = s.asistencia.filter(a => a.fecha === iso);
    return {
      iso, dia: NOMBRES_DIA[i], letra: ['L', 'M', 'M', 'J', 'V'][i], n: filas.length,
      presentes: filas.filter(a => a.estado === 'presente').length,
      faltas: filas.filter(a => a.estado === 'ausente').length,
      justificadas: filas.filter(a => a.estado === 'justificado').length,
    };
  });
  const conLista = semana.filter(d => d.n);
  const tot = conLista.reduce((a, d) => ({ p: a.p + d.presentes, n: a.n + d.n, f: a.f + d.faltas }), { p: 0, n: 0, f: 0 });

  const proms = lapsoId ? s.estudiantes.map(e => promedioGeneral(s, lapsoId, e.id)).filter(n => n !== null && n !== undefined) : [];
  const promCurso = proms.length ? promedio(proms) : null;
  const riesgo = lapsoId ? enRiesgo(s, lapsoId) : [];

  const seguir = [];
  const destacados = [];
  if (lapsoId) for (const e of s.estudiantes) {
    const prom = promedioGeneral(s, lapsoId, e.id);
    const r = resumenAsistencia(s, lapso, e.id);
    const motivos = [];
    const bajas = s.asignaturas.filter(a => { const n = notaAsignatura(s, a.id, lapsoId, e.id); return n !== null && !aprueba(n, s.cfg); }).map(a => a.nombre);
    if (prom !== null && !aprueba(prom, s.cfg)) motivos.push(`promedio ${prom}`);
    if (bajas.length) motivos.push(`bajo el mínimo en ${bajas.slice(0, 3).join(', ')}`);
    if (r.marcados >= 5 && r.pct < 80) motivos.push(`${r.pct}% de asistencia`);
    if (motivos.length) seguir.push({ id: e.id, nombre: nombreDe(e), promedio: prom, motivos });
    if (prom !== null && prom >= 18) destacados.push({ id: e.id, nombre: nombreDe(e), promedio: prom });
  }
  seguir.sort((a, b) => (a.promedio ?? 99) - (b.promedio ?? 99));
  destacados.sort((a, b) => b.promedio - a.promedio);

  const debilidades = [];
  const porAsignatura = [];
  if (lapsoId) for (const a of s.asignaturas) {
    for (const l of logroCurso(s, a.id, lapsoId).filter(x => esDebil(x.pct, s)).slice(0, 2)) {
      const rec = buscarRecomendacion(s, a.id, l.clave);
      debilidades.push({ asignatura: a.nombre, clave: l.clave, pct: l.pct, sugerencia: rec && rec.recomendacion ? rec.recomendacion : sugerenciaGeneral(l.clave) });
    }
    const ns = s.estudiantes.map(e => notaAsignatura(s, a.id, lapsoId, e.id)).filter(n => n !== null && n !== undefined);
    if (ns.length) porAsignatura.push({ nombre: a.nombre, promedio: promedio(ns) });
  }
  debilidades.sort((a, b) => a.pct - b.pct);

  const cumpleanos = [];
  for (const e of s.estudiantes) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.fecha_nacimiento || '');
    if (!m) continue;
    for (let k = 0; k <= 14; k++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + k);
      if (d.getMonth() + 1 === +m[2] && d.getDate() === +m[3]) {
        const edad = d.getFullYear() - +m[1];
        cumpleanos.push({ nombre: nombreDe(e), dias: k, fecha: `${d.getDate()} de ${MESES[d.getMonth()]}`, edad: edad > 0 && edad < 25 ? edad : null });
        break;
      }
    }
  }
  cumpleanos.sort((a, b) => a.dias - b.dias);

  const pendientes = [];
  if (lapsoId) for (const ev of s.evaluaciones.filter(x => x.lapso_id === lapsoId)) {
    const con = s.estudiantes.filter(e => typeof s.nota[`${ev.id}|${e.id}`] === 'number').length;
    if (s.estudiantes.length && con < s.estudiantes.length) {
      const asig = s.asignaturas.find(a => a.id === ev.asignatura_id);
      pendientes.push({ evaluacion: ev.nombre, asignatura: asig ? asig.nombre : '', con, total: s.estudiantes.length });
    }
  }

  const ini = lapso && lapso.fecha_inicio ? Date.parse(lapso.fecha_inicio) : NaN;
  const fin = lapso && lapso.fecha_fin ? Date.parse(lapso.fecha_fin) : NaN;
  const hoyMs = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const lapsoInfo = lapso ? {
    numero: lapso.numero,
    avance: Number.isNaN(ini) || Number.isNaN(fin) || fin <= ini ? null : Math.max(0, Math.min(100, Math.round((100 * (hoyMs - ini)) / (fin - ini)))),
    diasRestantes: Number.isNaN(fin) ? null : Math.ceil((fin - hoyMs) / DIA_MS),
  } : null;

  return {
    generado: fechaLarga(hoy),
    institucion: { ...(s.inst || {}), lineas: lineasEncabezado(s.inst || {}) },
    curso: { grado: s.seccion.grado || '', seccion: s.seccion.nombre || '', anio: s.seccion.anio_escolar || '', estudiantes: s.estudiantes.length },
    semana: { desde: dias[0], hasta: dias[4], dias: semana, pct: tot.n ? Math.round((100 * tot.p) / tot.n) : null, faltas: tot.f, diasConLista: conLista.length },
    lapso: lapsoInfo,
    stats: { promedio: promCurso, aprobados: proms.filter(n => aprueba(n, s.cfg)).length, conNota: proms.length, enRiesgo: riesgo.length, minimo: s.cfg.minimo_aprobatorio },
    distribucion: distribucion(proms).map(r => ({ texto: r.texto, cantidad: r.cantidad })),
    seguir: seguir.slice(0, 6), destacados: destacados.slice(0, 3), debilidades: debilidades.slice(0, 5), porAsignatura,
    cumpleanos, pendientes: pendientes.slice(0, 6),
  };
}

// Texto que se envía a la IA: sin nombres, solo códigos ("Estudiante 7").
export function datosParaIA(r, codigoDe) {
  const L = [];
  L.push(`Grado: ${r.curso.grado || 'sin indicar'}. Estudiantes: ${r.curso.estudiantes}.`);
  if (r.lapso) L.push(`Lapso ${r.lapso.numero}${r.lapso.avance !== null ? `, ${r.lapso.avance}% transcurrido` : ''}${r.lapso.diasRestantes !== null ? `, quedan ${r.lapso.diasRestantes} días` : ''}.`);
  L.push(r.stats.promedio !== null ? `Promedio del curso: ${r.stats.promedio} (mínimo aprobatorio ${r.stats.minimo}). Aprueban ${r.stats.aprobados} de ${r.stats.conNota}. En riesgo: ${r.stats.enRiesgo}.` : 'Todavía no hay notas cargadas en el lapso.');
  L.push(r.semana.pct !== null ? `Asistencia de la semana: ${r.semana.pct}%, ${r.semana.faltas} faltas en ${r.semana.diasConLista} días con lista.` : 'Esta semana no se pasó lista.');
  if (r.debilidades.length) L.push(`Temas más débiles: ${r.debilidades.map(d => `${d.clave} en ${d.asignatura} (${d.pct}% de logro)`).join('; ')}.`);
  if (r.seguir.length) L.push(`Estudiantes a seguir de cerca: ${r.seguir.map(x => `${codigoDe(x.id)} (${x.motivos.join(', ')})`).join('; ')}.`);
  if (r.pendientes.length) L.push(`Evaluaciones con notas pendientes: ${r.pendientes.map(p => `${p.evaluacion} (${p.con} de ${p.total})`).join('; ')}.`);
  return L.join('\n');
}
