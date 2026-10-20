// Utilidades de interfaz: plantillas seguras, fechas, íconos y mensajes.

export class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = s => new Safe(String(s));

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pieza(v) {
  if (v == null || v === false) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(pieza).join('');
  return esc(v);
}
// Plantilla que escapa todo lo que se inserte, salvo otras plantillas html``.
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += pieza(vals[i]); });
  return new Safe(out);
}

// ---------- fechas ----------
const fmtDia = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDiaAnio = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fechaCorta = iso => (iso ? fmtDia.format(new Date(iso + 'T00:00:00Z')) : '');
export const fechaLarga = iso => (iso ? fmtDiaAnio.format(new Date(iso + 'T00:00:00Z')) : '');

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
export function haceCuanto(iso) {
  if (!iso) return '';
  const seg = Math.round((Date.parse(iso) - Date.now()) / 1000);
  const a = Math.abs(seg);
  if (a < 45) return 'hace un momento';
  if (a < 3600) return rtf.format(Math.round(seg / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(seg / 3600), 'hour');
  return rtf.format(Math.round(seg / 86400), 'day');
}

// ---------- íconos (trazo, 24x24) ----------
const P = {
  inicio: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  personas: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.4-3.4 3-5.3 6-5.3s5.6 1.9 6 5.3"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M18 14.6c1.8.7 2.9 2.3 3.1 4.4"/>',
  ajustes: '<path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  subir: '<path d="M12 16V5"/><path d="m7.5 9.5 4.5-4.5 4.5 4.5"/><path d="M5 19h14"/>',
  bajar: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 19h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  atras: '<path d="m14.5 6-6 6 6 6"/>',
};
export const icon = (name, size = 22) =>
  raw(`<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`);

// ---------- mensajes ----------
let toastTimer;
export function toast(texto, tipo = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.className = `toast ${tipo}`;
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, tipo === 'error' ? 7000 : 3500);
}

// ---------- estado de sincronización ----------
export function infoEstado(state, { configurado, sesion }) {
  if (!configurado) return { clase: 'local', texto: 'Solo en este celular' };
  if (!sesion) return { clase: 'error', texto: 'Falta iniciar sesión' };
  const p = state.pending || 0;
  switch (state.status) {
    case 'syncing': return { clase: 'sync', texto: 'Respaldando' };
    case 'offline': return { clase: 'offline', texto: p ? `Sin conexión, ${p} por respaldar` : 'Sin conexión' };
    case 'error': return { clase: 'error', texto: 'No se pudo respaldar' };
    default:
      if (p) return { clase: 'sync', texto: `${p} por respaldar` };
      return { clase: 'ok', texto: 'Respaldado' };
  }
}

// Traduce errores de Supabase a mensajes que entienda la docente.
export function mensajeError(e) {
  const m = (e && e.message ? e.message : String(e)).toLowerCase();
  if (m.includes('invalid login')) return 'El correo o la contraseña no son correctos.';
  if (m.includes('email not confirmed')) return 'Falta confirmar el correo de esta cuenta.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'No hay conexión con internet.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera unos minutos e inténtalo otra vez.';
  return 'No se pudo entrar. Revisa tus datos e inténtalo otra vez.';
}
