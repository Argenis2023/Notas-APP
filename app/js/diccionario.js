// Diccionario para el aula: la IA explica una palabra con lenguaje para niños. Es lógica pura (sin pantalla).
export const MAX_PALABRA = 40;

// Deja solo letras, espacios, guion y apóstrofo. Devuelve '' si no queda nada.
export function limpiarPalabra(texto) {
  return String(texto || '').normalize('NFC').replace(/[^\p{L}' -]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_PALABRA);
}
export const claveDePalabra = p => limpiarPalabra(p).toLocaleLowerCase('es');

export function datosDiccionario(palabra, grado) {
  const g = String(grado || '').replace(/[^\p{L}\p{N}°º. -]+/gu, '').slice(0, 30).trim();
  return `Palabra: ${limpiarPalabra(palabra)}${g ? `\nGrado: ${g}` : ''}`;
}

// Convierte la respuesta de la IA en partes. Si no tiene el formato esperado, se muestra todo como "significado".
export function leerRespuesta(texto) {
  const t = String(texto || '').trim();
  if (/^no encontr[eé]/i.test(t)) return { noEncontrada: true, sugerencia: t.replace(/^no encontr[eé]\s*:?\s*/i, '').trim() };
  const out = { significado: '', ejemplo: '', sinonimo: '', otro: '' };
  const claves = { significado: 'significado', ejemplo: 'ejemplo', 'sinónimo': 'sinonimo', sinonimo: 'sinonimo', 'otro significado': 'otro' };
  let actual = null;
  for (const linea of t.split(/\r?\n/)) {
    const m = linea.match(/^\s*(significado|ejemplo|sin[oó]nimos?|otro significado)\s*:\s*(.*)$/i);
    if (m) {
      const k = m[1].toLowerCase().replace('sinónimos', 'sinónimo').replace('sinonimos', 'sinonimo');
      actual = claves[k]; out[actual] = m[2].trim();
    } else if (actual && linea.trim()) out[actual] += ` ${linea.trim()}`;
  }
  if (!out.significado) out.significado = t;
  return out;
}

export const enlaceRAE = palabra => `https://dle.rae.es/${encodeURIComponent(limpiarPalabra(palabra))}`;
