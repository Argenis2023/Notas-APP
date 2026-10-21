// Anotaciones rápidas por estudiante: funciones puras (sin pantalla) para filtrar y ordenar.
export const TIPOS = [['nota', 'Nota'], ['positivo', 'Logro o aspecto positivo'], ['mejorar', 'Por mejorar']];
export const tipoValido = t => (TIPOS.some(x => x[0] === t) ? t : 'nota');
export const nombreTipo = t => (TIPOS.find(x => x[0] === t) || TIPOS[0])[1];

// Anotaciones de un estudiante dentro del lapso (todas si el lapso no tiene fechas), de la más reciente a la más antigua.
export function anotacionesDe(s, estId, lapso) {
  const ini = lapso && lapso.fecha_inicio, fin = lapso && lapso.fecha_fin;
  return (s.anotaciones || [])
    .filter(a => a.estudiante_id === estId && !a.deleted && a.texto)
    .filter(a => !(ini && fin) || (a.fecha >= ini && a.fecha <= fin))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.created_at).localeCompare(String(a.created_at)));
}
