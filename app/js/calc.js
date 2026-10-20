// Cálculo de notas. Funciones puras, sin acceso a la base de datos, para poder probarlas solas.
//
// Regla acordada (se puede cambiar en Ajustes):
//   Logrado = 1 punto, En proceso = 0,5, No logrado = 0.
//   Porcentaje de logro = puntos obtenidos / puntos posibles (con el peso de cada indicador).
//   Nota (1 a 20, entera) = 20 × porcentaje, redondeada, nunca menos de 1.
//   La nota solo se calcula cuando todos los indicadores tienen un nivel marcado.

export const NIVELES = [
  { id: 'logrado', nombre: 'Logrado', corto: 'Logrado' },
  { id: 'proceso', nombre: 'En proceso', corto: 'En proceso' },
  { id: 'no_logrado', nombre: 'No logrado', corto: 'No logrado' },
];
export const nombreNivel = id => NIVELES.find(n => n.id === id)?.nombre || '';

export const CONFIG_BASE = {
  puntos_logrado: 1,
  puntos_en_proceso: 0.5,
  puntos_no_logrado: 0,
  minimo_aprobatorio: 10,
  umbral_indicador_debil: 50,
};

const num = (v, d) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export function puntosDe(nivel, cfg = {}) {
  const c = { ...CONFIG_BASE, ...Object.fromEntries(Object.entries(cfg).filter(([, v]) => v !== null && v !== undefined)) };
  if (nivel === 'logrado') return num(c.puntos_logrado, 1);
  if (nivel === 'proceso') return num(c.puntos_en_proceso, 0.5);
  if (nivel === 'no_logrado') return num(c.puntos_no_logrado, 0);
  return null;
}

// indicadores: [{id, peso}], niveles: { [indicador_id]: 'logrado' | 'proceso' | 'no_logrado' }
// Devuelve { porcentaje, nota, marcados, total, completo }
export function calcularEvaluacion(indicadores, niveles, cfg = {}) {
  const total = indicadores.length;
  let marcados = 0, obtenidos = 0, posibles = 0;
  const maximo = puntosDe('logrado', cfg);
  for (const ind of indicadores) {
    const peso = num(ind.peso, 1) > 0 ? num(ind.peso, 1) : 1;
    posibles += peso * maximo;
    const p = puntosDe(niveles[ind.id], cfg);
    if (p !== null) { marcados += 1; obtenidos += peso * p; }
  }
  const completo = total > 0 && marcados === total;
  const porcentaje = completo && posibles > 0 ? Math.max(0, Math.min(100, (obtenidos / posibles) * 100)) : null;
  return { porcentaje, nota: porcentaje === null ? null : notaDesdePorcentaje(porcentaje), marcados, total, completo };
}

export function notaDesdePorcentaje(pct) {
  return Math.max(1, Math.min(20, Math.round((pct / 100) * 20)));
}

// La nota que vale es la corregida por la docente, si la hay.
export const notaVigente = n => (n && (n.nota_final ?? n.nota_calculada)) ?? null;

export function promedio(notas) {
  const v = notas.filter(n => typeof n === 'number');
  if (!v.length) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}

export const aprueba = (nota, cfg = {}) => nota !== null && nota >= num(cfg.minimo_aprobatorio, 10);

// Porcentaje de logro de un indicador en un grupo: niveles = lista de niveles marcados (sin los vacíos).
export function logroDeIndicador(niveles, cfg = {}) {
  const marcados = niveles.filter(n => puntosDe(n, cfg) !== null);
  if (!marcados.length) return null;
  const max = puntosDe('logrado', cfg) || 1;
  const suma = marcados.reduce((a, n) => a + puntosDe(n, cfg), 0);
  return Math.round((suma / (marcados.length * max)) * 100);
}
