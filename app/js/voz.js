// Dictado por voz: usa el reconocimiento de voz del navegador (sin servidores propios).
// Las funciones puras (limpiar, detectar estudiante y tipo) se pueden probar sin pantalla.

const sinTildes = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function vozDisponible(w = globalThis) {
  return !!(w && (w.SpeechRecognition || w.webkitSpeechRecognition));
}

// Deja el texto dictado listo para leer: espacios, primera letra en mayúscula y punto final.
export function limpiarDictado(texto) {
  let t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?…]$/.test(t)) t += '.';
  return t;
}

// Une lo que ya estaba escrito con lo dictado, sin pegar las palabras ni repetir espacios.
export function unirTexto(previo, dictado) {
  const a = String(previo ?? '').trimEnd();
  const b = String(dictado ?? '').trim();
  if (!b) return a;
  return a ? `${a} ${b}` : b;
}

// Si la docente nombra a un estudiante, devuelve su id. Solo si es uno solo: ante la duda, null.
export function detectarEstudiante(texto, estudiantes) {
  const t = ` ${sinTildes(texto).replace(/[^a-z0-9ñ]+/g, ' ')} `;
  const aciertos = [];
  for (const e of estudiantes || []) {
    const partes = sinTildes(e.nombre_completo).split(/\s+/).filter(p => p.length >= 3);
    const nombres = partes.length > 1 ? [partes[0], partes.join(' ')] : partes;
    if (nombres.some(p => t.includes(` ${p} `))) aciertos.push(e);
  }
  if (aciertos.length === 1) return aciertos[0].id;
  // Varios con el mismo nombre de pila: se queda con quien tenga el nombre completo dicho
  const completos = aciertos.filter(e => t.includes(` ${sinTildes(e.nombre_completo).split(/\s+/).filter(p => p.length >= 3).join(' ')} `));
  return completos.length === 1 ? completos[0].id : null;
}

const POSITIVO = /\b(ayudo|ayudó|felicit|excelente|destac|mejoro|mejoró|logro|logró|participo bien|participó bien|muy bien|buen trabajo|colabor)/;
const MEJORAR = /\b(no trajo|no entrego|no entregó|no hizo|se distrae|distrae|conversa|molest|pelea|pele[oó]|sin tarea|no cumpli|necesita mejorar|falta de|llego tarde|llegó tarde)/;

// Sugiere el tipo de anotación por palabras clave; si no está claro, 'nota'.
export function detectarTipo(texto) {
  const t = sinTildes(texto);
  const pos = POSITIVO.test(t) || POSITIVO.test(String(texto).toLowerCase());
  const mej = MEJORAR.test(t) || MEJORAR.test(String(texto).toLowerCase());
  if (pos && !mej) return 'positivo';
  if (mej && !pos) return 'mejorar';
  return 'nota';
}

export function mensajeVoz(codigo) {
  switch (codigo) {
    case 'not-allowed': case 'service-not-allowed': return 'Falta permiso para usar el micrófono. Actívalo en los ajustes del navegador.';
    case 'no-speech': return 'No se escuchó nada. Acerca el celular e inténtalo otra vez.';
    case 'audio-capture': return 'No se encontró un micrófono.';
    case 'network': return 'El dictado necesita internet.';
    default: return 'No se pudo dictar. Puedes escribir el texto.';
  }
}

// Controla un dictado. alTexto(final, parcial) se llama cada vez que llegan palabras.
export function crearDictado({ alTexto, alEstado, alError, idioma = 'es-VE' }, w = globalThis) {
  const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Rec) return null;
  const rec = new Rec();
  rec.lang = idioma; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
  let final = '', activo = false, pidioParar = false;
  rec.onresult = ev => {
    let parcial = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) final += `${r[0].transcript} `; else parcial += r[0].transcript;
    }
    alTexto(final.trim(), parcial.trim());
  };
  rec.onerror = ev => { alError && alError(ev.error); };
  rec.onend = () => {
    // Chrome corta solo tras unos segundos de silencio: si la docente no pidió parar, termina limpio.
    activo = false; alEstado && alEstado(false, pidioParar);
  };
  return {
    get activo() { return activo; },
    iniciar() { final = ''; pidioParar = false; try { rec.start(); activo = true; alEstado && alEstado(true, false); } catch { /* ya estaba iniciado */ } },
    parar() { pidioParar = true; try { rec.stop(); } catch { /* ya estaba detenido */ } },
  };
}
