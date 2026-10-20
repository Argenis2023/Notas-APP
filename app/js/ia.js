// Asistente de redacción: arma el texto que se envía a la IA, SIN datos personales.
// Regla de privacidad: la IA recibe códigos ("Estudiante 7"), notas, indicadores y porcentajes.
// Nunca recibe nombres, cédula, fecha de nacimiento, contactos ni los textos de necesidades educativas.
import { notaAsignatura, promedioGeneral, logroEstudiante, esDebil, esFuerte } from './analisis.js';

const quitarAcentos = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const VOCALES = { a: 'aáàäâ', e: 'eéèëê', i: 'iíìïî', o: 'oóòöô', u: 'uúùüû' };
const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Palabra completa, sin importar mayúsculas ni tildes
function rxPalabra(w) {
  const base = quitarAcentos(w).toLowerCase();
  const patron = [...base].map(ch => (VOCALES[ch] ? `[${VOCALES[ch]}${ch.toUpperCase()}]` : escapar(ch))).join('');
  return new RegExp(`(?<![\\p{L}\\p{N}])${patron}(?![\\p{L}\\p{N}])`, 'giu');
}
const palabras = nombre => quitarAcentos(nombre).split(/\s+/).filter(p => p.length >= 3);

// Reemplaza en un texto escrito por la docente los nombres de estudiantes y representantes.
// El estudiante del informe pasa a ser su código; los demás, "otro estudiante".
export function anonimizarTexto(texto, estudiantes, actual) {
  let t = String(texto ?? '');
  const reemplazos = [];
  for (const e of estudiantes) {
    const destino = actual && e.id === actual.id ? (actual.codigo_ia || 'el estudiante') : 'otro estudiante';
    if (e.nombre_completo) {
      reemplazos.push([new RegExp(escapar(e.nombre_completo.trim()).replace(/\s+/g, '\\s+'), 'giu'), destino]);
      for (const p of palabras(e.nombre_completo)) reemplazos.push([rxPalabra(p), destino]);
    }
    if (e.representante_nombre) for (const p of palabras(e.representante_nombre)) reemplazos.push([rxPalabra(p), 'su representante']);
  }
  // Primero lo más largo, para no dejar restos de un nombre completo
  reemplazos.sort((a, b) => b[0].source.length - a[0].source.length);
  for (const [rx, destino] of reemplazos) t = t.replace(rx, destino);
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[correo]');
  t = t.replace(/\+?\d[\d\s.-]{5,}\d/g, '[número]');
  return t.trim();
}

const etiqueta = (pct, s) => (esDebil(pct, s) ? 'por reforzar' : esFuerte(pct) ? 'dominado' : 'en desarrollo');

// Texto que se envía para redactar la descripción del lapso de un estudiante.
export function datosDescripcion(s, estudiante, lapso, extra = '') {
  const lineas = [
    `Estudiante: ${estudiante.codigo_ia || 'Estudiante'}`,
    s.seccion.grado ? `Grado: ${s.seccion.grado}` : '',
    `Lapso: ${lapso.numero}`,
    `Escala de notas: 1 a 20. Nota mínima aprobatoria: ${s.cfg.minimo_aprobatorio}.`,
  ].filter(Boolean);
  const prom = promedioGeneral(s, lapso.id, estudiante.id);
  if (prom !== null) lineas.push(`Promedio general del lapso: ${prom}`);
  for (const a of s.asignaturas) {
    const nota = notaAsignatura(s, a.id, lapso.id, estudiante.id);
    if (nota === null) continue;
    lineas.push('', `${a.nombre}: nota ${nota}`);
    for (const l of logroEstudiante(s, a.id, lapso.id, estudiante.id)) lineas.push(`- ${l.clave}: ${l.pct}% (${etiqueta(l.pct, s)})`);
  }
  const nota = anonimizarTexto(extra, s.estudiantes, estudiante);
  if (nota) lineas.push('', `Observación de la docente: ${nota}`);
  return lineas.join('\n');
}

// Texto para sugerir actividades de refuerzo de un tema. No incluye nada de estudiantes.
export function datosRecomendacion(s, asignatura, tema, pct, alcance) {
  return [
    s.seccion.grado ? `Grado: ${s.seccion.grado}` : '',
    `Asignatura: ${asignatura.nombre}`,
    `Tema o indicador a reforzar: ${tema}`,
    `Logro ${alcance === 'curso' ? 'del curso' : 'del estudiante'} en este tema: ${pct}%`,
  ].filter(Boolean).join('\n');
}

export function mensajeIA(e) {
  const c = e && e.codigo ? e.codigo : String(e && e.message ? e.message : e).toLowerCase();
  if (c === 'sin_sesion' || c.includes('401')) return 'Tu sesión venció. Entra de nuevo desde Ajustes.';
  if (c === 'cuota') return 'La IA gratuita llegó a su límite por ahora. Inténtalo en unos minutos o escribe el texto tú.';
  if (c === 'datos_personales') return (e.detalle || 'El texto parece incluir un dato personal.') + ' Revisa lo que escribiste.';
  if (c === 'offline') return 'No hay conexión con internet.';
  if (c === 'no_desplegada') return 'La función de IA todavía no está instalada en Supabase.';
  return 'No se pudo redactar con la IA. Puedes escribir el texto tú, o intentarlo otra vez.';
}
