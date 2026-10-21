// Función de Supabase: reporte semanal del curso (PDF) enviado por correo al docente.
//
// Acciones (POST con { accion }):
//   prefs           devuelve la configuración del envío automático y el correo de la cuenta
//   prefs_guardar   { activo, dia (1=lunes..7=domingo), hora (0-23, hora de Venezuela) }
//   enviar_ahora    arma y envía el reporte con los datos que haya en la nube en ese momento
//   cron            lo llama el programador cada hora (pide el encabezado x-cron-secret)
//
// El reporte SIEMPRE va al correo de la cuenta de quien lo pide: esta función no sirve para escribirle a otras personas.
//
// Secretos: BREVO_API_KEY, BREVO_SENDER_EMAIL (remitente verificado en Brevo), BREVO_SENDER_NAME (opcional),
//           GEMINI_API_KEY (y GROQ_API_KEY opcional), ALLOWED_EMAIL (opcional, varios con coma), ALLOWED_ORIGIN (opcional).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { armarSnapshot, armarReporte, datosParaIA, hoyCaracas, isoDe, fechaLarga } from './datos.js';
import { crearPDF } from './pdf.js';
import { redactar, SISTEMA_LECTURA } from './ia.js';

const TABLAS = ['estudiantes', 'asignaturas', 'evaluaciones', 'indicadores', 'resultados', 'notas', 'lapsos', 'configuracion', 'reportes', 'recomendaciones', 'asistencia', 'secciones'];
const MAX_MANUALES_DIA = 10;
const env = k => Deno.env.get(k) || '';
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const base64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

const admin = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

async function filasDe(db, tabla, uid) {
  const out = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from(tabla).select('*').eq('user_id', uid).eq('deleted', false).range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

async function armarParaUsuario(db, uid, hoy) {
  const t = {};
  for (const tabla of TABLAS) t[tabla] = await filasDe(db, tabla, uid);
  const seccion = t.secciones.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
  if (!seccion) throw new Error('sin_cuaderno');
  const s = armarSnapshot(seccion, t);
  if (!s.estudiantes.length) throw new Error('sin_estudiantes');
  const codigos = new Map(s.estudiantes.map((e, i) => [e.id, e.codigo_ia || `Estudiante ${e.numero_lista || i + 1}`]));
  const r = armarReporte(s, hoy);
  // La IA recibe solo códigos; al volver, los códigos se cambian por los nombres reales (el correo es para la docente).
  let lectura = '';
  try {
    lectura = await redactar(SISTEMA_LECTURA, datosParaIA(r, id => codigos.get(id) || 'Estudiante'));
    for (const [id, codigo] of [...codigos.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const e = s.estudiantes.find(x => x.id === id);
      lectura = lectura.split(codigo).join(e.nombre_completo);
    }
  } catch { lectura = ''; }
  return { r, lectura, s };
}

async function enviarCorreo(para, nombreDocente, r, pdf, fechaIso) {
  const clave = env('BREVO_API_KEY'), remite = env('BREVO_SENDER_EMAIL');
  if (!clave || !remite) throw new Error('correo_no_configurado');
  const d1 = r.semana.desde, d2 = r.semana.hasta;
  const filas = [
    ['Promedio general', r.stats.promedio !== null ? r.stats.promedio : 'sin notas'],
    ['Aprueban', r.stats.conNota ? `${r.stats.aprobados} de ${r.stats.conNota}` : '-'],
    ['En riesgo', r.stats.enRiesgo],
    ['Asistencia de la semana', r.semana.pct !== null ? `${r.semana.pct}%` : 'sin lista'],
  ];
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#14211f;max-width:520px">
    <h2 style="margin:0 0 4px">Reporte semanal del curso</h2>
    <p style="margin:0 0 14px;color:#4a5b58">${esc([r.curso.grado, r.curso.seccion && `Sección ${r.curso.seccion}`].filter(Boolean).join(' · '))} · semana del ${d1.getDate()}/${d1.getMonth() + 1} al ${d2.getDate()}/${d2.getMonth() + 1}</p>
    ${nombreDocente ? `<p>Hola, ${esc(nombreDocente)}. Este es el resumen de tu curso.</p>` : '<p>Este es el resumen de tu curso.</p>'}
    <table style="border-collapse:collapse;width:100%">${filas.map(([a, b]) => `<tr><td style="padding:6px 0;border-bottom:1px solid #d9e1df">${esc(a)}</td><td style="padding:6px 0;border-bottom:1px solid #d9e1df;text-align:right"><strong>${esc(b)}</strong></td></tr>`).join('')}</table>
    <p>El informe completo, con asistencia, notas, debilidades por abordar y cumpleaños, va en el PDF adjunto.</p>
    <p style="color:#4a5b58;font-size:12px">Enviado por Cuaderno docente. Contiene datos de estudiantes: no lo reenvíes a personas que no deban verlo.</p></div>`;
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': clave, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: env('BREVO_SENDER_NAME') || 'Cuaderno docente', email: remite },
      to: [{ email: para }],
      subject: `Reporte semanal del curso · semana del ${d1.getDate()}/${d1.getMonth() + 1} al ${d2.getDate()}/${d2.getMonth() + 1}`,
      htmlContent: html,
      attachment: [{ name: `reporte-semanal-${fechaIso}.pdf`, content: base64(pdf) }],
    }),
  });
  if (!resp.ok) { let d = ''; try { d = (await resp.text()).slice(0, 200); } catch { /* sin detalle */ } throw new Error(`correo_${resp.status}${d ? `: ${d}` : ''}`); }
}

async function enviarReporte(db, uid, email, hoy) {
  const { r, lectura, s } = await armarParaUsuario(db, uid, hoy);
  const pdf = await crearPDF(r, lectura);
  await enviarCorreo(email, (s.inst && s.inst.docente) || '', r, pdf, isoDe(hoy));
  return { semana: fechaLarga(r.semana.hasta), conIA: !!lectura };
}

const prefDe = async (db, uid) => {
  const { data } = await db.from('reporte_semanal_pref').select('*').eq('user_id', uid).maybeSingle();
  return data || { user_id: uid, activo: false, dia: 5, hora: 16, ultimo_envio: null, ultimo_error: null, manuales_fecha: null, manuales_n: 0 };
};

const json = (cuerpo, status, cors) => new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  const cors = {
    'Access-Control-Allow-Origin': env('ALLOWED_ORIGIN') || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'metodo' }, 405, cors);
  let cuerpo = {};
  try { cuerpo = await req.json(); } catch { return json({ error: 'cuerpo' }, 400, cors); }
  const accion = String(cuerpo.accion || '');
  const db = admin();

  // ----- programador: envía a quien le toca ahora (hora de Venezuela) -----
  if (accion === 'cron') {
    // El secreto del programador vive en la base de datos (tabla reporte_semanal_cron), no en los secretos de la función.
    const { data: fila } = await db.from('reporte_semanal_cron').select('secreto').maybeSingle();
    const dado = req.headers.get('x-cron-secret') || '';
    if (!fila || !fila.secreto || dado !== fila.secreto) return json({ error: 'no_autorizado' }, 403, cors);
    const c = new Date(Date.now() - 4 * 3600000);
    const dow = c.getUTCDay() || 7, hora = c.getUTCHours();
    const { data: lista } = await db.from('reporte_semanal_pref').select('*').eq('activo', true).eq('dia', dow).eq('hora', hora);
    const permitidos = env('ALLOWED_EMAIL').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    const resumen = [];
    for (const p of lista || []) {
      if (p.ultimo_envio && Date.now() - Date.parse(p.ultimo_envio) < 5 * 86400000) continue;
      try {
        const { data: u } = await db.auth.admin.getUserById(p.user_id);
        const email = u && u.user && u.user.email;
        if (!email || (permitidos.length && !permitidos.includes(email.toLowerCase()))) continue;
        await enviarReporte(db, p.user_id, email, hoyCaracas());
        await db.from('reporte_semanal_pref').update({ ultimo_envio: new Date().toISOString(), ultimo_error: null }).eq('user_id', p.user_id);
        resumen.push('ok');
      } catch (e) {
        await db.from('reporte_semanal_pref').update({ ultimo_error: String(e.message || e).slice(0, 300) }).eq('user_id', p.user_id);
        resumen.push('error');
      }
    }
    return json({ procesados: resumen.length }, 200, cors);
  }

  // ----- acciones de una persona con sesión -----
  const auth = req.headers.get('Authorization') || '';
  const supa = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return json({ error: 'sin_sesion' }, 401, cors);
  const permitidos = env('ALLOWED_EMAIL').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (permitidos.length && !permitidos.includes((user.email || '').toLowerCase())) return json({ error: 'no_autorizado' }, 403, cors);

  if (accion === 'prefs') {
    const p = await prefDe(db, user.id);
    return json({ activo: p.activo, dia: p.dia, hora: p.hora, ultimo_envio: p.ultimo_envio, ultimo_error: p.ultimo_error, email: user.email, correo_listo: !!(env('BREVO_API_KEY') && env('BREVO_SENDER_EMAIL')) }, 200, cors);
  }
  if (accion === 'prefs_guardar') {
    const dia = Number(cuerpo.dia), hora = Number(cuerpo.hora);
    if (!Number.isInteger(dia) || dia < 1 || dia > 7 || !Number.isInteger(hora) || hora < 0 || hora > 23) return json({ error: 'datos' }, 400, cors);
    const { error } = await db.from('reporte_semanal_pref').upsert({ user_id: user.id, activo: !!cuerpo.activo, dia, hora }, { onConflict: 'user_id' });
    if (error) return json({ error: 'guardar', detalle: error.message }, 500, cors);
    return json({ ok: true }, 200, cors);
  }
  if (accion === 'enviar_ahora') {
    const p = await prefDe(db, user.id);
    const hoyIso = isoDe(hoyCaracas());
    const n = p.manuales_fecha === hoyIso ? p.manuales_n : 0;
    if (n >= MAX_MANUALES_DIA) return json({ error: 'limite_diario' }, 429, cors);
    try {
      const res = await enviarReporte(db, user.id, user.email, hoyCaracas());
      await db.from('reporte_semanal_pref').upsert({ user_id: user.id, manuales_fecha: hoyIso, manuales_n: n + 1 }, { onConflict: 'user_id' });
      return json({ ok: true, email: user.email, ...res }, 200, cors);
    } catch (e) {
      const m = String(e.message || e);
      const codigo = m.startsWith('correo_no_configurado') ? 'correo_no_configurado' : m.startsWith('sin_') ? m : m.startsWith('correo_') ? 'correo_fallo' : 'error';
      return json({ error: codigo, detalle: m.slice(0, 300) }, codigo === 'error' || codigo === 'correo_fallo' ? 502 : 400, cors);
    }
  }
  return json({ error: 'accion' }, 400, cors);
});
