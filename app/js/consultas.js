// Respuestas del chat de consultas. Son funciones puras sobre la "foto" de los datos (snapshot):
// cada respuesta sale de los datos del cuaderno, nunca de una IA, y trae las fuentes de donde se sacó.
import { lapsoActual } from './data.js';
import { resumenAsistencia, promedioGeneral, notaAsignatura, logroEstudiante, esDebil, enRiesgo } from './analisis.js';
import { aprueba } from './calc.js';
import { fechaCorta, fechaLarga } from './ui.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const NOMBRE_ESTADO = { presente: 'Asistió', ausente: 'Faltó', justificado: 'Falta justificada' };
export const primerNombre = e => (String(e.nombre_completo || 'el estudiante').trim().split(/\s+/)[0]) || 'el estudiante';
const recorta = (t, n = 220) => { const x = String(t).replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const isoHoy = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const PREGUNTAS = [
  { id: 'faltas_mes', texto: n => `¿Cuántas veces ha faltado ${n} este mes?`, corta: 'Faltas del mes' },
  { id: 'asistencia_lapso', texto: n => `¿Cómo va ${n} de asistencia en el lapso?`, corta: 'Asistencia del lapso' },
  { id: 'notas', texto: n => `¿Cómo va ${n} de notas?`, corta: 'Cómo va de notas' },
  { id: 'debil', texto: n => `¿En qué indicadores está más débil ${n}?`, corta: 'Indicadores más débiles' },
  { id: 'riesgo', texto: n => `¿Está ${n} en riesgo de reprobar?`, corta: 'Riesgo de reprobar' },
  { id: 'observaciones', texto: n => `¿Tiene ${n} observaciones registradas?`, corta: 'Observaciones registradas' },
  { id: 'representante', texto: n => `¿Cómo contacto al representante de ${n}?`, corta: 'Contacto del representante' },
  { id: 'cumple', texto: n => `¿Cuándo cumple años ${n}?`, corta: 'Cumpleaños' },
];

const lapsoDe = (s, hoy) => lapsoActual(s.lapsos, hoy) || s.lapsos[0] || null;

const RESPUESTAS = {
  faltas_mes(s, e, { hoy }) {
    const n = primerNombre(e);
    const ym = isoHoy(hoy).slice(0, 7);
    const mes = MESES[hoy.getMonth()];
    const marcas = s.asistencia.filter(a => a.estudiante_id === e.id && String(a.fecha).startsWith(ym)).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const enlace = { href: `#/asistencia/calendario?e=${e.id}&m=${ym}`, texto: 'Abrir el calendario del mes' };
    if (!marcas.length) return { texto: `Todavía no hay asistencia registrada para ${n} en ${mes}.`, fuentes: [{ titulo: `Asistencia de ${mes}`, lineas: ['Sin días marcados en este mes.'], enlace }] };
    const f = marcas.filter(a => a.estado === 'ausente').length;
    const j = marcas.filter(a => a.estado === 'justificado').length;
    const p = marcas.filter(a => a.estado === 'presente').length;
    const partes = [f ? `${n} ha faltado ${plural(f, 'vez', 'veces')} en ${mes}` : `${n} no ha faltado en ${mes}`];
    if (j) partes.push(`y tiene ${plural(j, 'falta justificada', 'faltas justificadas')}`);
    return {
      texto: `${partes.join(' ')}. Asistió ${p} de ${plural(marcas.length, 'día con lista', 'días con lista')}.`,
      fuentes: [{ titulo: `Asistencia de ${mes}`, lineas: marcas.map(a => `${fechaCorta(a.fecha)}: ${NOMBRE_ESTADO[a.estado] || a.estado}`), enlace }],
    };
  },

  asistencia_lapso(s, e, { hoy }) {
    const n = primerNombre(e);
    const lapso = lapsoDe(s, hoy);
    if (!lapso) return { texto: 'Todavía no hay lapsos creados en Ajustes.', fuentes: [] };
    const r = resumenAsistencia(s, lapso, e.id);
    const enlace = { href: `#/asistencia/resumen?l=${lapso.numero}`, texto: 'Abrir el resumen de asistencia' };
    if (!r.marcados) return { texto: `Todavía no hay asistencia registrada para ${n} en el lapso ${lapso.numero}.`, fuentes: [{ titulo: `Lapso ${lapso.numero}`, lineas: ['Sin días marcados.'], enlace }] };
    const aviso = r.pct < 80 ? ' Está por debajo del 80%.' : '';
    return {
      texto: `${n} lleva ${r.pct}% de asistencia en el lapso ${lapso.numero}: ${plural(r.faltas, 'falta', 'faltas')} y ${plural(r.justificadas, 'justificada', 'justificadas')}.${aviso}`,
      fuentes: [{ titulo: `Lapso ${lapso.numero}`, lineas: [`Días con lista marcados para ${n}: ${r.marcados}`, `Asistió: ${r.presentes}`, `Faltó: ${r.faltas}`, `Justificadas: ${r.justificadas}`, `Asistencia = ${r.presentes} de ${r.marcados} = ${r.pct}%`], enlace }],
    };
  },

  notas(s, e, { hoy }) {
    const n = primerNombre(e);
    const lapso = lapsoDe(s, hoy);
    if (!lapso) return { texto: 'Todavía no hay lapsos creados en Ajustes.', fuentes: [] };
    const enlace = { href: `#/reportes/e/${e.id}?l=${lapso.numero}`, texto: 'Abrir su informe' };
    const filas = s.asignaturas.map(a => {
      const evs = s.evaluaciones.filter(ev => ev.asignatura_id === a.id && ev.lapso_id === lapso.id)
        .map(ev => ({ ev, nota: s.nota[`${ev.id}|${e.id}`] })).filter(x => x.nota !== null && x.nota !== undefined);
      return { a, evs, nota: notaAsignatura(s, a.id, lapso.id, e.id) };
    }).filter(x => x.nota !== null);
    if (!filas.length) return { texto: `Todavía no hay notas de ${n} en el lapso ${lapso.numero}.`, fuentes: [{ titulo: `Lapso ${lapso.numero}`, lineas: ['Ninguna evaluación tiene nota para este estudiante.'], enlace }] };
    const prom = promedioGeneral(s, lapso.id, e.id);
    const min = s.cfg.minimo_aprobatorio ?? 10;
    const bajas = filas.filter(x => !aprueba(x.nota, s.cfg));
    const mejor = [...filas].sort((x, y) => y.nota - x.nota)[0];
    const detalle = bajas.length ? ` Está por debajo del mínimo (${min}) en ${bajas.map(x => x.a.nombre).join(', ')}.` : ` Aprueba todas las asignaturas con nota (mínimo ${min}). Su mejor nota es ${mejor.nota} en ${mejor.a.nombre}.`;
    return {
      texto: `${n} tiene un promedio general de ${prom} sobre 20 en el lapso ${lapso.numero}.${detalle}`,
      fuentes: [{
        titulo: `Notas del lapso ${lapso.numero}`,
        lineas: [...filas.map(x => `${x.a.nombre}: ${x.nota}${x.evs.length ? ` (${x.evs.map(v => `${v.ev.nombre} ${v.nota}`).join(', ')})` : ''}`), `Promedio general = promedio de las notas por asignatura = ${prom}`],
        enlace,
      }],
    };
  },

  debil(s, e, { hoy }) {
    const n = primerNombre(e);
    const lapso = lapsoDe(s, hoy);
    if (!lapso) return { texto: 'Todavía no hay lapsos creados en Ajustes.', fuentes: [] };
    const todos = [];
    for (const a of s.asignaturas) for (const l of logroEstudiante(s, a.id, lapso.id, e.id)) todos.push({ asig: a.nombre, ...l });
    const enlace = { href: `#/reportes/e/${e.id}?l=${lapso.numero}`, texto: 'Abrir su informe' };
    if (!todos.length) return { texto: `Todavía no hay indicadores marcados para ${n} en el lapso ${lapso.numero}.`, fuentes: [{ titulo: `Lapso ${lapso.numero}`, lineas: ['Sin marcas en las listas de cotejo.'], enlace }] };
    todos.sort((a, b) => a.pct - b.pct || a.clave.localeCompare(b.clave, 'es'));
    const debiles = todos.filter(x => esDebil(x.pct, s));
    const umbral = s.cfg.umbral_indicador_debil ?? 50;
    const lista = (debiles.length ? debiles : todos.slice(0, 3)).slice(0, 5);
    return {
      texto: debiles.length
        ? `Lo más débil de ${n} en el lapso ${lapso.numero}: ${lista.map(x => `${x.clave} (${x.asig}, ${x.pct}%)`).join('; ')}.`
        : `${n} no tiene indicadores por debajo del ${umbral}% en el lapso ${lapso.numero}. Lo más bajo es ${lista.map(x => `${x.clave} (${x.asig}, ${x.pct}%)`).join('; ')}.`,
      fuentes: [{ titulo: `Logro por indicador, lapso ${lapso.numero}`, lineas: [...todos.slice(0, 8).map(x => `${x.asig}, ${x.clave}: ${x.pct}% (${plural(x.n, 'marca', 'marcas')})`), `Se considera débil por debajo de ${umbral}%.`], enlace }],
    };
  },

  riesgo(s, e, { hoy }) {
    const n = primerNombre(e);
    const lapso = lapsoDe(s, hoy);
    if (!lapso) return { texto: 'Todavía no hay lapsos creados en Ajustes.', fuentes: [] };
    const min = s.cfg.minimo_aprobatorio ?? 10;
    const prom = promedioGeneral(s, lapso.id, e.id);
    const enlace = { href: `#/reportes/e/${e.id}?l=${lapso.numero}`, texto: 'Abrir su informe' };
    if (prom === null) return { texto: `Todavía no hay notas de ${n} para saber si está en riesgo.`, fuentes: [{ titulo: `Lapso ${lapso.numero}`, lineas: ['Sin notas en el lapso.'], enlace }] };
    const r = enRiesgo(s, lapso.id).find(x => x.estudiante.id === e.id);
    const lineas = [`Promedio general: ${prom}`, `Mínimo aprobatorio: ${min}`];
    if (r) {
      for (const a of r.asignaturas) lineas.push(`${a.nombre}: ${notaAsignatura(s, a.id, lapso.id, e.id)} (bajo el mínimo)`);
      const motivo = r.asignaturas.length ? `está por debajo de ${min} en ${r.asignaturas.map(a => a.nombre).join(', ')}` : `su promedio general (${prom}) está por debajo de ${min}`;
      return { texto: `Sí, ${n} está en riesgo en el lapso ${lapso.numero}: ${motivo}.`, fuentes: [{ titulo: 'Cómo se calculó', lineas, enlace }] };
    }
    return { texto: `No, ${n} no está en riesgo por ahora: su promedio es ${prom} y ninguna asignatura con nota está por debajo de ${min}.`, fuentes: [{ titulo: 'Cómo se calculó', lineas, enlace }] };
  },

  observaciones(s, e) {
    const n = primerNombre(e);
    const enlace = { href: `#/estudiantes/${e.id}`, texto: 'Abrir su ficha' };
    const fuentes = [];
    const hay = [];
    if (e.observaciones_conducta && e.observaciones_conducta.trim()) { hay.push('observaciones de conducta'); fuentes.push({ titulo: 'Observaciones de conducta (ficha)', lineas: [recorta(e.observaciones_conducta)], enlace }); }
    if (e.necesidades_educativas && e.necesidades_educativas.trim()) { hay.push('necesidades educativas anotadas'); fuentes.push({ titulo: 'Necesidades educativas (ficha)', lineas: [recorta(e.necesidades_educativas)], enlace }); }
    const descs = s.reportes.filter(r => r.estudiante_id === e.id && r.texto && r.texto.trim());
    for (const r of descs) {
      const l = s.lapsos.find(x => x.id === r.lapso_id);
      hay.push(`la descripción del informe${l ? ` del lapso ${l.numero}` : ''}`);
      fuentes.push({ titulo: `Descripción del informe${l ? `, lapso ${l.numero}` : ''}`, lineas: [recorta(r.texto)], enlace: { href: `#/reportes/e/${e.id}${l ? `?l=${l.numero}` : ''}`, texto: 'Abrir su informe' } });
    }
    if (!hay.length) {
      return { texto: `${n} no tiene observaciones registradas. En el cuaderno no hay actas como tal: las observaciones se anotan en la ficha del estudiante.`, fuentes: [{ titulo: 'Dónde se revisó', lineas: ['Ficha: observaciones de conducta y necesidades educativas', 'Informes: descripción del lapso'], enlace }] };
    }
    return { texto: `${n} tiene ${hay.join(', ')}. No hay actas como tal en el cuaderno; esto es lo que está anotado.`, fuentes };
  },

  representante(s, e) {
    const n = primerNombre(e);
    const enlace = { href: `#/estudiantes/${e.id}`, texto: 'Abrir su ficha' };
    const nom = (e.representante_nombre || '').trim(), con = (e.representante_contacto || '').trim();
    if (!nom && !con) return { texto: `No hay representante anotado para ${n}. Puedes agregarlo en su ficha.`, fuentes: [{ titulo: 'Ficha', lineas: ['Representante y contacto sin llenar.'], enlace }] };
    return { texto: `El representante de ${n} es ${nom || 'una persona sin nombre anotado'}${con ? `, contacto: ${con}` : ', sin contacto anotado'}.`, fuentes: [{ titulo: 'Ficha del estudiante', lineas: [`Representante: ${nom || 'sin nombre'}`, `Contacto: ${con || 'sin contacto'}`], enlace }] };
  },

  cumple(s, e, { hoy }) {
    const n = primerNombre(e);
    const enlace = { href: `#/estudiantes/${e.id}`, texto: 'Abrir su ficha' };
    const f = e.fecha_nacimiento;
    if (!f || Number.isNaN(Date.parse(f + 'T00:00:00Z'))) return { texto: `No hay fecha de nacimiento anotada para ${n}. Puedes agregarla en su ficha.`, fuentes: [{ titulo: 'Ficha', lineas: ['Fecha de nacimiento sin llenar.'], enlace }] };
    const [y, m, d] = f.split('-').map(Number);
    const t0 = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    let prox = Date.UTC(hoy.getFullYear(), m - 1, d);
    if (prox < t0) prox = Date.UTC(hoy.getFullYear() + 1, m - 1, d);
    const dias = Math.round((prox - t0) / 86400000);
    const edad = new Date(prox).getUTCFullYear() - y;
    const cuando = dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`;
    return { texto: `${n} cumple ${edad} años ${cuando}, el ${d} de ${MESES[m - 1]}.`, fuentes: [{ titulo: 'Ficha del estudiante', lineas: [`Fecha de nacimiento: ${fechaLarga(f)}`], enlace }] };
  },
};

// Devuelve { texto, fuentes: [{ titulo, lineas: [], enlace?: { href, texto } }] }.
export function responder(id, s, estudiante, { hoy = new Date() } = {}) {
  const fn = RESPUESTAS[id];
  if (!fn) return { texto: 'No tengo esa consulta.', fuentes: [] };
  return fn(s, estudiante, { hoy });
}
