// Avisos para la docente: lo que conviene mirar hoy (faltas, notas bajas, felicitaciones, recordatorios).
// Se calculan al vuelo con los datos del cuaderno. Solo se guarda cuáles descartó ("Entendido").
import { list, guardarConId, idPar, remove } from './data.js';
import { lapsoActual } from './data.js';
import { promedioGeneral, enRiesgo, resumenAsistencia, cambioEnLapso, CAMBIO_BAJA, CAMBIO_SUBE } from './analisis.js';
import { aprueba } from './calc.js';
import { proximos, etiquetaDia } from './agenda.js';

const DIA = 86400000;
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const utc = f => Date.parse(f + 'T00:00:00Z');
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const TIPOS_AVISO = {
  atencion: { orden: 0, titulo: 'Necesitan tu atención', icono: 'alerta' },
  recordatorio: { orden: 1, titulo: 'Recordatorios', icono: 'evaluar' },
  felicitar: { orden: 2, titulo: 'Para felicitar', icono: 'check' },
};
const PREFIJO = 'descartado:';

export function calcularAvisos(s, { hoy = new Date(), ultimoRespaldo = null, conRespaldo = false } = {}) {
  const out = [];
  const hoyIso = iso(hoy);
  const hoyUtc = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const lapso = lapsoActual(s.lapsos, hoy);
  const nEst = s.estudiantes.length;
  if (!nEst) return out;
  const nombre = e => e.nombre_completo;
  const add = a => out.push(a);

  if (lapso) {
    const rangoOk = f => (!lapso.fecha_inicio || f >= lapso.fecha_inicio) && (!lapso.fecha_fin || f <= lapso.fecha_fin);

    // ----- inasistencias -----
    const dias = [...new Set(s.asistencia.filter(a => rangoOk(a.fecha)).map(a => a.fecha))].sort().reverse();
    for (const e of s.estudiantes) {
      const estado = f => s.asistencia.find(a => a.estudiante_id === e.id && a.fecha === f)?.estado;
      let racha = 0;
      for (const f of dias) { if (estado(f) === 'ausente') racha++; else break; }
      const r = resumenAsistencia(s, lapso, e.id);
      if (racha >= 2) add({ id: `racha:${e.id}:${dias[0]}`, tipo: 'atencion', titulo: `${nombre(e)} lleva ${racha} días seguidos sin asistir`, texto: 'Puede ser buen momento para comunicarte con su representante.', href: `#/asistencia?f=${dias[0]}` });
      else if (r.marcados >= 5 && r.pct < 80) add({ id: `asis:${e.id}:${lapso.numero}`, tipo: 'atencion', titulo: `${nombre(e)} tiene ${r.pct}% de asistencia`, texto: `${plural(r.faltas, 'falta', 'faltas')}${r.justificadas ? ` y ${plural(r.justificadas, 'justificada', 'justificadas')}` : ''} en ${plural(r.dias, 'día', 'días')} con lista.`, href: `#/asistencia/resumen?l=${lapso.numero}` });
      if (r.marcados >= 10 && r.pct === 100 && r.justificadas === 0) add({ id: `perfecta:${e.id}:${lapso.numero}`, tipo: 'felicitar', titulo: `${nombre(e)} no ha faltado en el lapso ${lapso.numero}`, texto: `Asistencia perfecta en ${plural(r.dias, 'día', 'días')} con lista.`, href: `#/asistencia/resumen?l=${lapso.numero}` });
    }

    // ----- notas -----
    for (const x of enRiesgo(s, lapso.id)) {
      const e = x.estudiante;
      const nombres = x.asignaturas.map(a => a.nombre);
      const detalle = nombres.length ? `Por debajo del mínimo en ${nombres.join(', ')}.` : `Promedio general ${x.promedio}, el mínimo es ${s.cfg.minimo_aprobatorio ?? 10}.`;
      add({ id: `riesgo:${e.id}:${lapso.numero}:${x.asignaturas.map(a => a.id).sort().join('-')}`, tipo: 'atencion', titulo: `${nombre(e)} necesita apoyo`, texto: detalle, href: `#/reportes/e/${e.id}?l=${lapso.numero}` });
    }
    const enApoyo = new Set(enRiesgo(s, lapso.id).map(x => x.estudiante.id));
    for (const e of s.estudiantes) {
      const c = cambioEnLapso(s, e.id, lapso.id);
      if (c && c.diff <= -CAMBIO_BAJA && !enApoyo.has(e.id)) add({ id: `baja:${e.id}:${lapso.numero}`, tipo: 'atencion', titulo: `El promedio de ${nombre(e)} bajó ${plural(-c.diff, 'punto', 'puntos')}`, texto: `Pasó de ${c.anterior} en el lapso ${c.lapsoAnterior.numero} a ${c.actual} en el lapso ${lapso.numero}.`, href: `#/reportes/e/${e.id}?l=${lapso.numero}` });
      if (c && c.diff >= CAMBIO_SUBE && c.actual < 18) add({ id: `sube:${e.id}:${lapso.numero}`, tipo: 'felicitar', titulo: `${nombre(e)} subió ${plural(c.diff, 'punto', 'puntos')} su promedio`, texto: `Pasó de ${c.anterior} en el lapso ${c.lapsoAnterior.numero} a ${c.actual} en el lapso ${lapso.numero}.`, href: `#/reportes/e/${e.id}?l=${lapso.numero}` });
    }
    for (const e of s.estudiantes) {
      const p = promedioGeneral(s, lapso.id, e.id);
      if (p !== null && p >= 18) add({ id: `alto:${e.id}:${lapso.numero}`, tipo: 'felicitar', titulo: `Felicita a ${nombre(e)}`, texto: `Promedio ${p} en el lapso ${lapso.numero}.`, href: `#/reportes/e/${e.id}?l=${lapso.numero}` });
    }

    // ----- recordatorios -----
    const diaHabil = ![0, 6].includes(hoy.getDay());
    if (diaHabil && rangoOk(hoyIso) && !s.asistencia.some(a => a.fecha === hoyIso)) add({ id: `lista:${hoyIso}`, tipo: 'recordatorio', titulo: 'Todavía no has pasado lista hoy', texto: '', href: `#/asistencia?f=${hoyIso}` });
    for (const ev of s.evaluaciones.filter(x => x.lapso_id === lapso.id && x.fecha && utc(x.fecha) <= hoyUtc - 7 * DIA)) {
      const nInd = s.indicadores.filter(i => i.evaluacion_id === ev.id).length;
      if (!nInd) continue;
      const hechos = s.estudiantes.filter(e => typeof s.nota[`${ev.id}|${e.id}`] === 'number').length;
      if (hechos < nEst) add({ id: `cotejo:${ev.id}`, tipo: 'recordatorio', titulo: `Falta evaluar a ${plural(nEst - hechos, 'estudiante', 'estudiantes')} en ${ev.nombre}`, texto: 'La evaluación es de hace más de una semana.', href: `#/evaluar/e/${ev.id}/cotejo` });
    }
    if (lapso.fecha_fin) {
      const dias2 = Math.ceil((utc(lapso.fecha_fin) - hoyUtc) / DIA);
      if (dias2 >= 0 && dias2 <= 7) add({ id: `cierre:${lapso.numero}`, tipo: 'recordatorio', titulo: dias2 === 0 ? `Hoy termina el lapso ${lapso.numero}` : `Quedan ${plural(dias2, 'día', 'días')} del lapso ${lapso.numero}`, texto: 'Revisa que todas las evaluaciones tengan nota y prepara los informes.', href: `#/reportes?l=${lapso.numero}` });
    }
  }

  // ----- agenda: lo de hoy y mañana -----
  for (const e of proximos(s, hoyIso, 1)) {
    add({ id: `agenda:${e.id}:${e.fecha}`, tipo: 'recordatorio', titulo: `${etiquetaDia(e.fecha, hoyIso)}: ${e.titulo}`, texto: [e.hora, e.nota].filter(Boolean).join(' · '), href: e.href || '#/agenda' });
  }

  // ----- cumpleaños (de hoy a 3 días) -----
  for (const e of s.estudiantes) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.fecha_nacimiento || '');
    if (!m) continue;
    for (let k = 0; k <= 3; k++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + k);
      if (d.getMonth() + 1 === +m[2] && d.getDate() === +m[3]) {
        const edad = d.getFullYear() - +m[1];
        const cuando = k === 0 ? 'Hoy' : k === 1 ? 'Mañana' : `El ${DIAS[d.getDay()]}`;
        add({ id: `cumple:${e.id}:${d.getFullYear()}`, tipo: 'felicitar', titulo: `${cuando} cumple años ${nombre(e)}`, texto: edad > 0 && edad < 25 ? `Cumple ${edad} años.` : '', href: `#/estudiantes/${e.id}` });
      }
    }
  }

  // ----- respaldo -----
  if (conRespaldo && ultimoRespaldo) {
    const dias3 = Math.floor((hoy.getTime() - Date.parse(ultimoRespaldo)) / DIA);
    if (dias3 >= 3) add({ id: `respaldo:${hoyIso}`, tipo: 'recordatorio', titulo: `Hace ${dias3} días que no se respalda tu cuaderno`, texto: 'Conéctate a internet para que se guarde en la nube.', href: '#/ajustes' });
  }

  return out.sort((a, b) => TIPOS_AVISO[a.tipo].orden - TIPOS_AVISO[b.tipo].orden);
}

// ---------- avisos descartados ("Entendido") ----------
export async function descartados() {
  return new Set((await list('avisos')).filter(a => String(a.tipo || '').startsWith(PREFIJO) && a.enviado).map(a => a.tipo.slice(PREFIJO.length)));
}
const avisarCambio = () => { try { document.dispatchEvent(new CustomEvent('avisos:cambio')); } catch { /* sin documento */ } };
export async function descartarAviso(id) {
  await guardarConId('avisos', idPar('aviso', id), { tipo: PREFIJO + id, fecha_programada: new Date().toISOString(), enviado: true });
  avisarCambio();
}
export async function restaurarAvisos() {
  for (const a of await list('avisos')) if (String(a.tipo || '').startsWith(PREFIJO)) await remove('avisos', a.id);
  avisarCambio();
}
