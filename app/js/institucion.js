// "Mi institución": nombre, logo, color y encabezado de los informes.
// Nada de esto viene escrito en la app: cada docente pone el de su colegio y se guarda con su respaldo.
import { getConfig, list, update } from './data.js';

export const COLOR_BASE = '#0b6b5b';

// ---------- lectura y guardado ----------
export function desdeConfig(c = {}) {
  return {
    nombre: c.institucion_nombre || '',
    subtitulo: c.institucion_subtitulo || '',
    encabezado: c.institucion_encabezado || '',
    color: hexValido(c.institucion_color) ? c.institucion_color.toLowerCase() : '',
    logo: logoValido(c.institucion_logo) ? c.institucion_logo : '',
    docente: c.docente_nombre || '',
  };
}
export async function leerInstitucion() {
  // Solo lee: no crea la fila de configuración (eso lo hace guardar o crear la sección).
  const filas = (await list('configuracion')).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return desdeConfig(filas[0] || {});
}
export async function guardarInstitucion(d) {
  const c = await getConfig();
  await update('configuracion', c.id, {
    institucion_nombre: d.nombre, institucion_subtitulo: d.subtitulo, institucion_encabezado: d.encabezado,
    institucion_color: hexValido(d.color) ? d.color.toLowerCase() : '', institucion_logo: d.logo || '', docente_nombre: d.docente,
  });
}
export const lineasEncabezado = inst => String(inst.encabezado || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

export const hexValido = h => /^#[0-9a-f]{6}$/i.test(h || '');
// Solo se aceptan imágenes en data URL (las que crea procesarLogo), nunca direcciones externas.
export const logoValido = u => typeof u === 'string' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(u);

// ---------- color ----------
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const aRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const aHex = rgb => '#' + rgb.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
function aHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function deHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
const hsl = (h, s, l) => aHex(deHsl(h, clamp(s, 0, 1), clamp(l, 0, 1)));
function luminancia([r, g, b]) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contraste(a, b) {
  const x = luminancia(aRgb(a)), y = luminancia(aRgb(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const mezclar = (a, b, p) => { const x = aRgb(a), y = aRgb(b); return aHex(x.map((v, i) => v * p + y[i] * (1 - p))); };

// Oscurece (o aclara) un color hasta que tenga el contraste pedido contra todos los fondos dados.
function ajustar(hex, fondos, minimo, sentido) {
  let [h, s, l] = aHsl(aRgb(hex));
  const paso = sentido === 'oscurecer' ? -0.01 : 0.01;
  for (let i = 0; i < 100; i++) {
    const c = hsl(h, s, l);
    if (fondos.every(f => contraste(c, f) >= minimo)) return c;
    l = clamp(l + paso, 0, 1);
  }
  return hsl(h, s, l);
}

// Toda la paleta a partir de un solo color, con el contraste cuidado en modo claro y oscuro.
export function paleta(hex) {
  const [h, s0] = aHsl(aRgb(hex));
  const s = clamp(s0, 0.25, 0.85);
  // claro
  const papel = hsl(h, 0.1, 0.96), hoja = '#ffffff', linea = hsl(h, 0.1, 0.87);
  let acento = ajustar(hex, [hoja, papel], 5, 'oscurecer');
  let suave = mezclar(acento, hoja, 0.12);
  if (contraste(acento, suave) < 4.7) { acento = ajustar(acento, [hoja, papel, suave], 4.7, 'oscurecer'); suave = mezclar(acento, hoja, 0.12); }
  const claro = {
    papel, hoja, linea, fondoSuave: hsl(h, 0.1, 0.92), tinta: hsl(h, 0.3, 0.09), tintaSuave: hsl(h, 0.12, 0.3),
    acento, acentoSuave: suave, cabecera: ajustar(hsl(h, s * 0.9, 0.22), ['#ffffff'], 7.5, 'oscurecer'), sobreAcento: '#ffffff',
  };
  // oscuro
  const dPapel = hsl(h, 0.14, 0.07), dHoja = hsl(h, 0.14, 0.11);
  let dAcento = ajustar(hex, [dHoja, dPapel], 5.5, 'aclarar');
  let dSuave = mezclar(dAcento, dHoja, 0.2);
  if (contraste(dAcento, dSuave) < 4.7) { dAcento = ajustar(dAcento, [dHoja, dPapel, dSuave], 4.7, 'aclarar'); dSuave = mezclar(dAcento, dHoja, 0.2); }
  const sobreOscuro = contraste('#07110f', dAcento) >= contraste('#ffffff', dAcento) ? '#07110f' : '#ffffff';
  const oscuro = {
    papel: dPapel, hoja: dHoja, linea: hsl(h, 0.1, 0.2), fondoSuave: hsl(h, 0.12, 0.14), tinta: hsl(h, 0.15, 0.92), tintaSuave: hsl(h, 0.1, 0.7),
    acento: dAcento, acentoSuave: dSuave, cabecera: hsl(h, s * 0.6, 0.14), sobreAcento: sobreOscuro,
  };
  return { claro, oscuro };
}
const reglas = p => `--papel:${p.papel};--hoja:${p.hoja};--linea:${p.linea};--fondo-suave:${p.fondoSuave};--tinta:${p.tinta};--tinta-suave:${p.tintaSuave};--acento:${p.acento};--acento-suave:${p.acentoSuave};--cabecera:${p.cabecera};--sobre-acento:${p.sobreAcento};`;

export function cssTema(hex) {
  if (!hexValido(hex)) return '';
  const { claro, oscuro } = paleta(hex);
  return `:root{${reglas(claro)}}@media (prefers-color-scheme: dark){:root{${reglas(oscuro)}}}@media print{:root{--acento:${claro.acento};--acento-suave:${claro.acentoSuave};--cabecera:${claro.cabecera};}}`;
}

// ---------- logo ----------
const MAX_LADO = 320;
const MAX_BYTES = 8 * 1024 * 1024;
const cargarImagen = src => new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('imagen')); i.src = src; });

// Reduce la imagen a un tamaño de logo (máx. 320 px) para que el respaldo sea liviano.
export async function procesarLogo(file) {
  if (!file || !/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(file.type)) throw new Error('Elige una imagen PNG, JPG o WebP.');
  if (file.size > MAX_BYTES) throw new Error('La imagen pesa demasiado. Elige una de menos de 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await cargarImagen(url);
    const k = Math.min(1, MAX_LADO / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    let salida = cv.toDataURL('image/png');
    if (salida.length > 150000) salida = cv.toDataURL('image/webp', 0.85);
    if (!logoValido(salida)) salida = cv.toDataURL('image/jpeg', 0.85);
    return salida;
  } catch (e) {
    throw new Error(e.message === 'imagen' ? 'No se pudo leer esa imagen. Prueba con otra.' : e.message);
  } finally { URL.revokeObjectURL(url); }
}

// Colores más presentes en el logo (sin blancos, grises ni casi negros), para que la docente elija uno.
export async function coloresDelLogo(dataUrl, cuantos = 5) {
  if (!logoValido(dataUrl)) return [];
  const img = await cargarImagen(dataUrl);
  const n = 64, cv = document.createElement('canvas');
  cv.width = n; cv.height = n;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, n, n);
  const px = cx.getImageData(0, 0, n, n).data;
  const grupos = new Map();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    const [h, s, l] = aHsl([px[i], px[i + 1], px[i + 2]]);
    if (s < 0.3 || l < 0.12 || l > 0.9) continue;
    const k = Math.round(h / 24) % 15;
    const g = grupos.get(k) || { peso: 0, r: 0, g: 0, b: 0 };
    const w = s * (1 - Math.abs(2 * l - 1));
    g.peso += w; g.r += px[i] * w; g.g += px[i + 1] * w; g.b += px[i + 2] * w;
    grupos.set(k, g);
  }
  return [...grupos.values()].filter(g => g.peso > 0.5).sort((a, b) => b.peso - a.peso).slice(0, cuantos)
    .map(g => aHex([g.r / g.peso, g.g / g.peso, g.b / g.peso]));
}

// ---------- aplicar en la pantalla ----------
let firma = null;
export function aplicarInstitucion(inst) {
  const clave = JSON.stringify([inst.color, inst.nombre, inst.logo.length, inst.logo.slice(-24)]);
  if (clave === firma) return;
  firma = clave;
  let st = document.getElementById('tema-institucion');
  if (!st) { st = document.createElement('style'); st.id = 'tema-institucion'; document.head.appendChild(st); }
  st.textContent = cssTema(inst.color);
  const cab = inst.color ? paleta(inst.color).claro.cabecera : '#0b4f44';
  const meta = document.querySelector('meta[name="theme-color"][media*="light"]');
  if (meta) meta.setAttribute('content', cab);
  const logo = document.getElementById('top-logo');
  if (logo) {
    if (inst.logo) { logo.src = inst.logo; logo.alt = inst.nombre ? `Logo de ${inst.nombre}` : 'Logo de la institución'; logo.hidden = false; } else { logo.removeAttribute('src'); logo.hidden = true; }
  }
  const nom = document.getElementById('top-inst');
  if (nom) { nom.textContent = inst.nombre; nom.hidden = !inst.nombre; }
}
