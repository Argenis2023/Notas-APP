// Función de Supabase: redacta textos para la docente con IA.
//
// - Solo responde a usuarios con sesión iniciada (se valida el token en cada llamada).
// - La clave de la IA vive aquí como secreto y nunca llega a la app.
// - Recibe SOLO texto ya anonimizado por la app ("Estudiante 7"). Aun así rechaza lo que parezca
//   un dato personal (correos o números largos como cédulas y teléfonos).
// - Usa Gemini y, si falla, Groq (opcional).
//
// Secretos (Edge Functions > Secrets):
//   GEMINI_API_KEY   obligatorio
//   GEMINI_MODEL     opcional, por defecto "gemini-flash-latest"
//   GROQ_API_KEY     opcional (respaldo)
//   GROQ_MODEL       opcional, por defecto "llama-3.3-70b-versatile"
//   ALLOWED_EMAIL    opcional: si lo pones, solo ese correo puede usar la función
//   ALLOWED_ORIGIN   opcional: por ejemplo https://argenis2023.github.io

import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_DATOS = 4000;

const BASE = `Eres un asistente de redacción para una docente de educación primaria en Venezuela.
Escribe en español claro y cálido, con tono profesional, pensado para que lo lean representantes.
Reglas:
- Usa únicamente los datos recibidos. No inventes notas, hechos ni conductas.
- No menciones nombres ni códigos de estudiantes: habla del estudiante en tercera persona sin marcar género (por ejemplo "Muestra...", "Logra...", "Necesita...").
- No hagas diagnósticos médicos ni psicológicos ni etiquetes al estudiante.
- La escala de notas va de 1 a 20. Si no se dice otra cosa, la nota mínima aprobatoria es 10.
- Responde solo con el texto final, sin títulos, sin viñetas y sin comillas.`;

const TIPOS: Record<string, { sistema: string; max: number }> = {
  descripcion_estudiante: {
    sistema: `${BASE}\nTarea: escribe la descripción del rendimiento del estudiante en el lapso, de 90 a 140 palabras: logros, aspectos por reforzar y, al final, una o dos acciones concretas para el aula y para el hogar.`,
    max: 1500,
  },
  recomendacion_tema: {
    sistema: `${BASE}\nTarea: sugiere de 2 a 3 actividades concretas, simples y de bajo costo para reforzar el tema indicado, una parte para el aula y otra para el hogar. Entre 60 y 100 palabras.`,
    max: 1200,
  },
  prueba: { sistema: 'Responde únicamente con la palabra: listo', max: 100 },
};

const json = (cuerpo: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function conGemini(sistema: string, datos: string, max: number): Promise<string> {
  const clave = Deno.env.get('GEMINI_API_KEY');
  if (!clave) throw new Error('sin_clave_gemini');
  const modelo = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: 'user', parts: [{ text: datos }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: max + 1500 },
    }),
  });
  if (!r.ok) throw new Error(`gemini_${r.status}`);
  const j = await r.json();
  const texto = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim();
  if (!texto) throw new Error('gemini_vacio');
  return texto;
}

async function conGroq(sistema: string, datos: string, max: number): Promise<string> {
  const clave = Deno.env.get('GROQ_API_KEY');
  if (!clave) throw new Error('sin_clave_groq');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
    body: JSON.stringify({
      model: Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile',
      temperature: 0.6,
      max_tokens: max,
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: datos }],
    }),
  });
  if (!r.ok) throw new Error(`groq_${r.status}`);
  const j = await r.json();
  const texto = (j?.choices?.[0]?.message?.content ?? '').trim();
  if (!texto) throw new Error('groq_vacio');
  return texto;
}

Deno.serve(async (req: Request) => {
  const permitido = Deno.env.get('ALLOWED_ORIGIN') || '*';
  const cors = {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'metodo' }, 405, cors);

  // 1. Solo usuarios con sesión (la clave anon sola no basta)
  const auth = req.headers.get('Authorization') ?? '';
  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return json({ error: 'sin_sesion' }, 401, cors);
  const unico = Deno.env.get('ALLOWED_EMAIL');
  if (unico && user.email?.toLowerCase() !== unico.toLowerCase()) return json({ error: 'no_autorizado' }, 403, cors);

  // 2. Validar lo recibido
  let cuerpo: { tipo?: string; datos?: string };
  try { cuerpo = await req.json(); } catch { return json({ error: 'cuerpo' }, 400, cors); }
  const tipo = String(cuerpo.tipo ?? '');
  const datos = String(cuerpo.datos ?? '');
  const cfg = TIPOS[tipo];
  if (!cfg) return json({ error: 'tipo' }, 400, cors);
  if (tipo !== 'prueba' && (datos.length < 10 || datos.length > MAX_DATOS)) return json({ error: 'tamano' }, 400, cors);
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(datos) || /\d{7,}/.test(datos.replace(/[\s.-]/g, ''))) {
    return json({ error: 'datos_personales', detalle: 'El texto parece incluir un correo o un número largo. No se envió a la IA.' }, 422, cors);
  }

  // 3. Redactar: Gemini primero, Groq de respaldo
  const entrada = tipo === 'prueba' ? 'Prueba de conexión.' : datos;
  const fallos: string[] = [];
  try {
    return json({ texto: await conGemini(cfg.sistema, entrada, cfg.max), proveedor: 'gemini' }, 200, cors);
  } catch (e) { fallos.push((e as Error).message); }
  try {
    return json({ texto: await conGroq(cfg.sistema, entrada, cfg.max), proveedor: 'groq' }, 200, cors);
  } catch (e) { fallos.push((e as Error).message); }

  const cuota = fallos.some(f => f.endsWith('_429'));
  return json({ error: cuota ? 'cuota' : 'ia_no_disponible', detalle: fallos.join(', ') }, cuota ? 429 : 502, cors);
});
