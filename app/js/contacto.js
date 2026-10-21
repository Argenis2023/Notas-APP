// Contacto con representantes por WhatsApp: funciones puras. Nada se envía desde la app:
// se abre WhatsApp con el mensaje escrito y la docente lo revisa y lo manda ella.

// Deja solo dígitos y agrega el código de país. Por defecto Venezuela (58): 0412 123 4567 -> 584121234567.
export function normalizarTelefono(raw, pais = '58') {
  let d = String(raw ?? '').replace(/[^\d+]/g, '');
  const conMas = d.startsWith('+');
  d = d.replace(/\D/g, '');
  if (!d) return '';
  if (conMas) return d.length >= 10 && d.length <= 15 ? d : '';
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = pais + d.slice(1);
  else if (d.length === 10) d = pais + d;
  return d.length >= 10 && d.length <= 15 ? d : '';
}

export const urlWhatsApp = (tel, mensaje) => (tel ? `https://wa.me/${tel}?text=${encodeURIComponent(mensaje || '')}` : '');

export const MOTIVOS = [
  ['faltas', 'Inasistencias'],
  ['rendimiento', 'Rendimiento'],
  ['reunion', 'Pedir una reunión'],
  ['felicitar', 'Felicitar'],
  ['libre', 'Mensaje libre'],
];

const primerNombre = n => String(n || '').trim().split(/\s+/)[0] || 'su representado';
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

// Texto de partida; la docente lo edita antes de abrir WhatsApp.
export function mensajeBase(motivo, { estudiante, docente, lapso, faltas = 0, promedio = null }) {
  const nombre = primerNombre(estudiante && estudiante.nombre_completo);
  const firma = docente ? `\nSaludos, ${docente}.` : '\nSaludos.';
  const hola = 'Buen día. Le escribo desde la escuela';
  switch (motivo) {
    case 'faltas':
      return `${hola} para informarle sobre la asistencia de ${nombre}. ${faltas ? `En el lapso ${lapso} ha faltado ${plural(faltas, 'día', 'días')}.` : `En el lapso ${lapso} no ha tenido inasistencias.`} ¿Hay algo en lo que podamos apoyar?${firma}`;
    case 'rendimiento':
      return `${hola} para conversar sobre el rendimiento de ${nombre} en el lapso ${lapso}.${promedio !== null ? ` Su promedio general va en ${promedio}.` : ''} Me gustaría contarle cómo podemos apoyarle. ¿Cuándo le queda bien hablar?${firma}`;
    case 'reunion':
      return `${hola} para coordinar una reunión sobre ${nombre}. ¿Qué día y a qué hora le queda mejor?${firma}`;
    case 'felicitar':
      return `${hola} para felicitar a ${nombre} por su esfuerzo y buen trabajo en el lapso ${lapso}. ¡Sigan así!${firma}`;
    default:
      return `Buen día. Le escribo sobre ${nombre}. `;
  }
}
