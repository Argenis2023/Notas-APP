// Asistente de redacción: arma el texto que se envía a la IA, SIN datos personales.
// Regla de privacidad: la IA recibe códigos ("Estudiante 7"), notas, indicadores y porcentajes.
// Nunca recibe nombres, cédula, fecha de nacimiento, contactos ni los textos de necesidades educativas.
import { anotacionesDe, nombreTipo } from './anotaciones.js';
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
  const anots = anotacionesDe(s, estudiante.id, lapso).slice(0, 15).reverse();
  if (anots.length) {
    lineas.push('', 'Anotaciones de la docente en el lapso:');
    for (const a of anots) lineas.push(`- ${nombreTipo(a.tipo)}: ${anonimizarTexto(a.texto, s.estudiantes, estudiante)}`);
  }
  const nota = anonimizarTexto(extra, s.estudiantes, estudiante);
  if (nota) lineas.push('', `Observación adicional: ${nota}`);
  return lineas.join('\n');
}

// Texto para redactar un mensaje de WhatsApp al representante. Sin nombres: el estudiante va como código.
export function datosMensaje(s, estudiante, lapso, motivo, hechos = {}, extra = '') {
  const lineas = [
    `Motivo del mensaje: ${motivo}`,
    `Estudiante: ${estudiante.codigo_ia || 'Estudiante'}`,
    s.seccion.grado ? `Grado: ${s.seccion.grado}` : '',
    lapso ? `Lapso: ${lapso.numero}` : '',
  ].filter(Boolean);
  if (hechos.faltas !== undefined && hechos.faltas !== null) lineas.push(`Días de inasistencia en el lapso: ${hechos.faltas}`);
  if (hechos.promedio !== undefined && hechos.promedio !== null) lineas.push(`Promedio general del lapso: ${hechos.promedio} (escala 1 a 20, mínimo aprobatorio ${s.cfg.minimo_aprobatorio})`);
  const anots = lapso ? anotacionesDe(s, estudiante.id, lapso).slice(0, 5).reverse() : [];
  if (anots.length) {
    lineas.push('', 'Anotaciones de la docente:');
    for (const a of anots) lineas.push(`- ${nombreTipo(a.tipo)}: ${anonimizarTexto(a.texto, s.estudiantes, estudiante)}`);
  }
  const idea = anonimizarTexto(extra, s.estudiantes, estudiante);
  if (idea) lineas.push('', `Lo que la docente quiere decir: ${idea}`);
  return lineas.join('\n');
}

// Devuelve el texto de la IA listo para el representante: pone el nombre de pila y la firma.
export function completarMensaje(texto, estudiante, docente) {
  const pila = String(estudiante.nombre_completo || '').trim().split(/\s+/)[0] || 'su representado';
  let t = String(texto || '').trim().replace(/\[ESTUDIANTE\]/gi, pila);
  if (estudiante.codigo_ia) t = t.split(estudiante.codigo_ia).join(pila);
  return `${t}\n${docente ? `Saludos, ${docente}.` : 'Saludos.'}`;
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

// Cuando Gemini falla y el respaldo (Groq) también, hay que decir por qué falló Groq.
// Devuelve un texto o null si Groq no fue el problema.
export function explicarFallaGroq(detalle) {
  const d = String(detalle || '');
  if (!/groq/.test(d)) return null;
  const causa = /sin_clave_groq/.test(d) ? 'Supabase no encuentra la clave GROQ_API_KEY. Revisa que el nombre del secreto esté escrito igual, sin espacios, y vuelve a probar.'
    : /groq_401|groq_403/.test(d) ? 'Groq rechazó la clave. Crea una clave nueva en Groq y reemplaza el secreto GROQ_API_KEY.'
    : /groq_429/.test(d) ? 'Groq llegó a su límite gratuito por ahora. Espera unos minutos.'
    : /groq_400|groq_404/.test(d) ? 'Groq no encontró ninguno de los modelos con esa clave. Crea una clave nueva en console.groq.com y reemplaza el secreto GROQ_API_KEY.'
    : 'Groq no respondió.';
  return `Gemini no respondió y el respaldo de Groq también falló. ${causa} (${d})`;
}

export function mensajeIA(e) {
  const c = e && e.codigo ? e.codigo : String(e && e.message ? e.message : e).toLowerCase();
  if (c === 'sin_sesion' || c.includes('401')) return 'Tu sesión venció. Entra de nuevo desde Ajustes.';
  if (c === 'cuota') return 'La IA gratuita llegó a su límite por ahora. Inténtalo en unos minutos o escribe el texto tú.';
  if (c === 'datos_personales') return (e.detalle || 'El texto parece incluir un dato personal.') + ' Revisa lo que escribiste.';
  if (c === 'offline') return 'No hay conexión con internet.';
  if (c === 'no_desplegada') return 'La función de IA todavía no está instalada en Supabase.';
  if (c === 'ia_no_disponible' && explicarFallaGroq(e.detalle)) return explicarFallaGroq(e.detalle);
  if (c === 'ia_no_disponible' && /_503|_500|_502/.test(e.detalle || '')) return 'La IA de Google está saturada en este momento. Espera un minuto e inténtalo otra vez.';
  return 'No se pudo redactar con la IA. Puedes escribir el texto tú, o intentarlo otra vez.';
}

// Mensajes para el reporte semanal por correo.
export function mensajeReporte(e) {
  const c = e && e.codigo ? e.codigo : String(e && e.message ? e.message : e).toLowerCase();
  if (c === 'sin_sesion' || c.includes('401')) return 'Tu sesión venció. Entra de nuevo desde Ajustes.';
  if (c === 'no_autorizado') return 'Esta cuenta no tiene permiso para usar el reporte semanal.';
  if (c === 'offline') return 'No hay conexión con internet.';
  if (c === 'no_desplegada') return 'La función del reporte semanal todavía no está instalada en Supabase.';
  if (c === 'correo_no_configurado') return 'Falta configurar el servicio de correo en Supabase, así que todavía no se puede enviar.';
  if (c === 'correo_fallo') return 'No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.';
  if (c === 'limite_diario') return 'Llegaste al límite de envíos de hoy. Inténtalo mañana.';
  if (c === 'sin_cuaderno') return 'Todavía no hay un cuaderno respaldado en la nube. Respalda tus datos primero.';
  if (c === 'sin_estudiantes') return 'No hay estudiantes respaldados en la nube todavía. Agrega estudiantes y respalda tus datos.';
  return 'No se pudo enviar el reporte. Inténtalo otra vez.';
}
