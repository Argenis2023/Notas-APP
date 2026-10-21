// Redacta con IA (Gemini y, si falla, Groq). Misma lógica que la función ia-redactor, en versión corta.
const esperar = ms => new Promise(r => setTimeout(r, ms));
const env = k => (typeof Deno !== 'undefined' ? Deno.env.get(k) : undefined) || '';

async function gemini(modelo, clave, sistema, datos, max) {
  const pensamientos = [{ thinkingConfig: { thinkingLevel: 'minimal' } }, { thinkingConfig: { thinkingBudget: 0 } }, { thinkingConfig: { thinkingLevel: 'low' } }, {}];
  let ultimo = 'gemini_400';
  for (const extra of pensamientos) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: 'user', parts: [{ text: datos }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: max + (Object.keys(extra).length ? 300 : 1500), ...extra },
      }),
    });
    if (r.status === 400) { ultimo = 'gemini_400'; continue; }
    if (!r.ok) throw new Error(`gemini_${r.status}`);
    const j = await r.json();
    const t = ((j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('').trim();
    if (!t) throw new Error('gemini_vacio');
    return t;
  }
  throw new Error(ultimo);
}

async function conGemini(sistema, datos, max) {
  const clave = env('GEMINI_API_KEY');
  if (!clave) throw new Error('sin_clave_gemini');
  const modelos = [...new Set([env('GEMINI_MODEL'), 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest'].filter(Boolean))];
  const fallos = [];
  for (const modelo of modelos) {
    for (let i = 0; i < 2; i++) {
      try { return await gemini(modelo, clave, sistema, datos, max); }
      catch (e) {
        fallos.push(`${modelo}:${e.message}`);
        if (/_(500|502|503)$/.test(e.message)) { await esperar(900); continue; }
        break;
      }
    }
  }
  throw new Error(fallos.join(' | '));
}

async function groq(modelo, clave, sistema, datos, max) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
    body: JSON.stringify({ model: modelo, temperature: 0.6, max_tokens: modelo.includes('gpt-oss') ? max + 1500 : max, messages: [{ role: 'system', content: sistema }, { role: 'user', content: datos }] }),
  });
  if (!r.ok) throw new Error(`groq_${r.status}`);
  const j = await r.json();
  const t = ((j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
  if (!t) throw new Error('groq_vacio');
  return t;
}

async function conGroq(sistema, datos, max) {
  const clave = env('GROQ_API_KEY');
  if (!clave) throw new Error('sin_clave_groq');
  const fallos = [];
  for (const modelo of [...new Set([env('GROQ_MODEL'), 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'].filter(Boolean))]) {
    try { return await groq(modelo, clave, sistema, datos, max); }
    catch (e) { fallos.push(`${modelo}:${e.message}`); if (/groq_40[13]/.test(e.message)) break; }
  }
  throw new Error(fallos.join(' | '));
}

export async function redactar(sistema, datos, max = 700) {
  try { return await conGemini(sistema, datos, max); } catch { /* respaldo */ }
  return await conGroq(sistema, datos, max);
}

export const SISTEMA_LECTURA = `Eres un asistente para una docente de educación primaria en Venezuela. Con los datos de la semana de su curso, escribe para ella una lectura breve (de 90 a 130 palabras) en español claro y cercano: cómo va el curso, qué llama la atención y 2 o 3 prioridades concretas para la próxima semana.
Usa solo los datos recibidos y no inventes cifras ni hechos. Puedes nombrar a los estudiantes con su código tal como aparece (por ejemplo "Estudiante 7"). No hagas diagnósticos médicos ni psicológicos.
Responde solo con el texto final, sin títulos, sin viñetas y sin comillas.`;
