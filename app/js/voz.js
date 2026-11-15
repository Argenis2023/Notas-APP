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

// ---------- ordenar el dictado con la IA ----------
// A la IA nunca van nombres: cada estudiante nombrado pasa a ser su código ("Estudiante 3").
const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const palabrasDe = nombre => sinTildes(nombre).split(/\s+/).filter(p => p.length >= 3);
const rxPalabra = p => new RegExp(`(?<![a-z0-9ñ])${escapar(p)}(?![a-z0-9ñ])`, 'g');

export function anonimizarDictado(texto, estudiantes) {
  const lista = (estudiantes || []).map((e, i) => ({ e, codigo: e.codigo_ia || `Estudiante ${i + 1}`, palabras: palabrasDe(e.nombre_completo) }));
  const mapa = {};
  // Se trabaja sobre el texto sin tildes ni mayúsculas, pero se reemplaza posición por posición en el original.
  let original = String(texto ?? '');
  const base = () => sinTildes(original);
  const reemplazar = (rx, destino) => {
    let m, out = '', ultimo = 0; const b = base();
    rx.lastIndex = 0;
    while ((m = rx.exec(b))) { out += original.slice(ultimo, m.index) + destino; ultimo = m.index + m[0].length; if (m[0].length === 0) rx.lastIndex++; }
    const hubo = ultimo > 0; original = out + original.slice(ultimo); return hubo;
  };
  // 1) nombres completos, 2) palabras que identifican a un solo estudiante, 3) palabras compartidas
  for (const x of lista) if (x.palabras.length > 1) { if (reemplazar(new RegExp(x.palabras.map(escapar).join('\\s+'), 'g'), x.codigo)) mapa[x.codigo] = x.e; }
  const cuenta = {};
  for (const x of lista) for (const p of new Set(x.palabras)) cuenta[p] = (cuenta[p] || 0) + 1;
  for (const x of lista) for (const p of x.palabras) {
    if (cuenta[p] === 1 && reemplazar(rxPalabra(p), x.codigo)) mapa[x.codigo] = x.e;
  }
  for (const p of Object.keys(cuenta)) if (cuenta[p] > 1) reemplazar(rxPalabra(p), 'otro estudiante');
  original = original.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[correo]').replace(/\+?\d[\d\s.-]{5,}\d/g, '[número]');
  return { texto: original.replace(/\s+/g, ' ').trim(), mapa };
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function datosDictado(texto, estudiantes, hoy = new Date()) {
  const { texto: anon, mapa } = anonimizarDictado(texto, estudiantes);
  const fecha = `Hoy es ${DIAS[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}.`;
  return { datos: `${fecha}\nDictado de la docente: ${anon}`, mapa };
}

const pad2 = n => String(n).padStart(2, '0');
export const sumarDias = (hoy, n) => { const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

// Convierte la respuesta de la IA en una propuesta. Si no se entiende, devuelve null.
export function interpretarDictado(respuesta, mapa, hoy = new Date()) {
  const campos = {};
  for (const linea of String(respuesta ?? '').split(/\r?\n/)) {
    const m = linea.match(/^\s*(Tipo|Subtipo|Estudiante|Titulo|Título|Texto|Dias|Días|Hora)\s*:\s*(.*)$/i);
    if (m) campos[sinTildes(m[1])] = m[2].trim();
  }
  if (!campos.texto) return null;
  const tipo = ['anotacion', 'incidencia', 'reunion'].includes(sinTildes(campos.tipo || '')) ? sinTildes(campos.tipo) : 'anotacion';
  const subtipo = ['nota', 'positivo', 'mejorar'].includes(sinTildes(campos.subtipo || '')) ? sinTildes(campos.subtipo) : 'nota';
  const restaurar = s => String(s || '').replace(/Estudiante\s+(\d+)/gi, (m, n) => {
    const e = mapa[`Estudiante ${n}`] || Object.values(mapa).find(x => x.codigo_ia === `Estudiante ${n}`);
    return e ? String(e.nombre_completo).trim().split(/\s+/)[0] : 'un estudiante';
  });
  const codigo = (campos.estudiante || '').match(/Estudiante\s+(\d+)/i);
  const est = codigo ? (mapa[`Estudiante ${codigo[1]}`] || null) : null;
  const dias = Number.parseInt(campos.dias, 10);
  const hora = /^\d{1,2}:\d{2}$/.test(campos.hora || '') ? campos.hora.padStart(5, '0') : '';
  return {
    tipo, subtipo,
    estudianteId: est ? est.id : null,
    titulo: restaurar(campos.titulo),
    texto: restaurar(campos.texto),
    fecha: sumarDias(hoy, Number.isFinite(dias) && dias >= 0 && dias <= 365 ? dias : 0),
    hora,
  };
}
