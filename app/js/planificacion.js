// Planificación diaria de aula: etiquetas, lectura de la respuesta de la IA y texto para enviarle.
import { anonimizarTexto } from './ia.js';

export const SECCIONES = [
  ['tejido', 'Tejido temático', 'Tejido temático'],
  ['intencion', 'Intencionalidad pedagógica', 'Intencionalidad pedagógica'],
  ['inicio', 'Inicio', 'Inicio'],
  ['desarrollo', 'Desarrollo', 'Desarrollo'],
  ['cierre', 'Cierre', 'Cierre'],
  ['evaluacion', 'Criterios de evaluación', 'Criterios de evaluación'],
];

const quitaMarcas = t => String(t).replace(/\*\*/g, '').replace(/^#+\s*/gm, '');

// Separa la respuesta de la IA por etiquetas. Devuelve { tejido, intencion, inicio, desarrollo, cierre, evaluacion }.
export function leerPlanificacion(texto) {
  const limpio = quitaMarcas(texto);
  const out = {};
  const marcas = SECCIONES.map(([clave, etiqueta]) => {
    const m = new RegExp(`^\\s*${etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:?[ \\t]*$|^\\s*${etiqueta}\\s*:\\s*(.+)$`, 'im').exec(limpio);
    return m ? { clave, i: m.index, largo: m[0].length, resto: m[1] || '' } : null;
  }).filter(Boolean).sort((a, b) => a.i - b.i);
  marcas.forEach((m, k) => {
    const fin = k + 1 < marcas.length ? marcas[k + 1].i : limpio.length;
    const cuerpo = (m.resto ? m.resto + '\n' : '') + limpio.slice(m.i + m.largo, fin);
    out[m.clave] = cuerpo.split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/^\n+|\n+$/g, '');
  });
  return out;
}

export const completa = out => SECCIONES.every(([k]) => out[k]);

// Texto que se envía a la IA: sin datos de estudiantes. Si la docente escribe un nombre, se cambia por "otro estudiante".
export function datosPlanificacion(s, d) {
  const lineas = [
    s.seccion.grado ? `Grado: ${s.seccion.grado}` : '',
    d.area ? `Área de formación: ${d.area}` : '',
    d.tema ? `Tema generador: ${d.tema}` : '',
    d.proyecto ? `Proyecto de aprendizaje: ${d.proyecto}` : '',
    d.lineas ? `Líneas de investigación: ${anonimizarTexto(d.lineas, s.estudiantes, null).replace(/\n+/g, ' / ')}` : '',
  ].filter(Boolean);
  const idea = anonimizarTexto(d.idea || '', s.estudiantes, null);
  if (idea) lineas.push('', `Lo que la docente quiere trabajar: ${idea}`);
  return lineas.join('\n');
}
