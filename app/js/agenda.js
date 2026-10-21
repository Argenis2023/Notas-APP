// Agenda del aula: funciones puras. Junta los eventos que la docente anota con las fechas de sus evaluaciones.
export const TIPOS_EVENTO = [['evento', 'Evento'], ['actividad', 'Actividad'], ['reunion', 'Reunión'], ['entrega', 'Entrega'], ['recordatorio', 'Recordatorio']];
export const tipoEvento = t => (TIPOS_EVENTO.some(x => x[0] === t) ? t : 'evento');
export const nombreTipoEvento = t => (TIPOS_EVENTO.find(x => x[0] === t) || TIPOS_EVENTO[0])[1];

const utc = f => Date.parse(f + 'T00:00:00Z');
const DIA = 86400000;
export const diasHasta = (fecha, hoyIso) => Math.round((utc(fecha) - utc(hoyIso)) / DIA);
const fmt = new Intl.DateTimeFormat('es-VE', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function etiquetaDia(fecha, hoyIso) {
  const d = diasHasta(fecha, hoyIso);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d === -1) return 'Ayer';
  return fmt.format(new Date(fecha + 'T00:00:00Z'));
}

export function rango(fecha, hoyIso) {
  const d = diasHasta(fecha, hoyIso);
  if (d < 0) return 'pasado';
  if (d === 0) return 'hoy';
  if (d === 1) return 'manana';
  if (d <= 7) return 'semana';
  return 'despues';
}

// Eventos de la agenda y evaluaciones con fecha, de más cercano a más lejano.
export function todosLosEventos(s, hoyIso) {
  const manuales = (s.agenda || []).filter(a => a.fecha && a.titulo).map(a => ({
    id: a.id, origen: 'agenda', fecha: a.fecha, hora: a.hora || '', titulo: a.titulo, tipo: tipoEvento(a.tipo), nota: a.nota || '', hecho: !!a.hecho,
  }));
  const evals = (s.evaluaciones || []).filter(e => e.fecha).map(e => {
    const asig = (s.asignaturas || []).find(a => a.id === e.asignatura_id);
    return { id: `ev:${e.id}`, origen: 'evaluacion', fecha: e.fecha, hora: '', titulo: `Evaluación: ${e.nombre}`, tipo: 'evaluacion', nota: asig ? asig.nombre : '', hecho: false, href: `#/evaluar/e/${e.id}` };
  });
  return [...manuales, ...evals].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora) || a.titulo.localeCompare(b.titulo, 'es'));
}

export const proximos = (s, hoyIso, dias = 7) => todosLosEventos(s, hoyIso).filter(e => !e.hecho && diasHasta(e.fecha, hoyIso) >= 0 && diasHasta(e.fecha, hoyIso) <= dias);
