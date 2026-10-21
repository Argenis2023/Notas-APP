// PDF del reporte semanal, con el mismo estilo del informe de estudiante (banda de institución, secciones, colores).
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import { MESES } from './datos.js';

const W = 612, H = 792, M = 42;
const hex = h => { const n = parseInt((/^#[0-9a-f]{6}$/i.test(h || '') ? h : '#0b6b5b').slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const GRIS = rgb(0.35, 0.4, 0.4), TINTA = rgb(0.08, 0.13, 0.12), LINEA = rgb(0.82, 0.86, 0.85), ROJO = rgb(0.7, 0.15, 0.12), VERDE = rgb(0.1, 0.42, 0.27), AMBAR = rgb(0.85, 0.65, 0.1), FONDO = rgb(0.94, 0.96, 0.95);

// Las fuentes estándar solo conocen el alfabeto latino: lo demás se cambia por algo parecido.
const limpiar = t => String(t ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[—]/g, '-').replace(/…/g, '...').replace(/[^\n\x20-\x7E\xA0-\xFF–·•]/g, '?').replace(/\r/g, '');

export async function crearPDF(r, lectura = '') {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Reporte semanal del curso');
  pdf.setCreator('Cuaderno docente');
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const acento = hex(r.institucion.color);
  let page, y;
  const nueva = () => { page = pdf.addPage([W, H]); y = H - M; };
  const hueco = n => { if (y - n < M + 18) nueva(); };
  const ancho = (t, tam, fuente = f) => fuente.widthOfTextAtSize(limpiar(t), tam);
  const texto = (t, x, yy, { tam = 10, fuente = f, color = TINTA } = {}) => page.drawText(limpiar(t), { x, y: yy, size: tam, font: fuente, color });
  const derecha = (t, xd, yy, o = {}) => texto(t, xd - ancho(t, o.tam || 10, o.fuente || f), yy, o);
  const lineas = (t, maxW, tam, fuente = f) => {
    const out = [];
    for (const parr of limpiar(t).split('\n')) {
      let cur = '';
      for (const p of parr.split(/\s+/).filter(Boolean)) {
        const prueba = cur ? `${cur} ${p}` : p;
        if (fuente.widthOfTextAtSize(prueba, tam) > maxW && cur) { out.push(cur); cur = p; } else cur = prueba;
      }
      out.push(cur);
    }
    return out;
  };
  const parrafo = (t, { x = M, maxW = W - 2 * M, tam = 10, fuente = f, color = TINTA, hl = 13.5 } = {}) => {
    for (const l of lineas(t, maxW, tam, fuente)) { hueco(hl); texto(l, x, y - tam, { tam, fuente, color }); y -= hl; }
  };
  const seccion = titulo => {
    hueco(48);
    y -= 12;
    texto(titulo, M, y - 12, { tam: 12.5, fuente: fb, color: acento });
    y -= 18;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: acento });
    y -= 8;
  };

  nueva();
  // ----- banda de la institución -----
  const inst = r.institucion;
  let xt = M;
  if (inst.logo) {
    try {
      const b64 = inst.logo.split(',')[1];
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const img = /^data:image\/png/.test(inst.logo) ? await pdf.embedPng(bytes) : /^data:image\/jpeg/.test(inst.logo) ? await pdf.embedJpg(bytes) : null;
      if (img) { const k = Math.min(46 / img.height, 70 / img.width); page.drawImage(img, { x: M, y: y - img.height * k, width: img.width * k, height: img.height * k }); xt = M + img.width * k + 12; }
    } catch { /* sin logo */ }
  }
  const cab = [inst.nombre || 'CUADERNO DOCENTE', inst.subtitulo, ...(inst.lineas || [])].filter(Boolean);
  let yy = y - 12;
  cab.slice(0, 4).forEach((l, i) => { texto(l, xt, yy, { tam: i === 0 ? 12.5 : 9, fuente: i === 0 ? fb : f, color: i === 0 ? TINTA : GRIS }); yy -= i === 0 ? 14 : 11; });
  y = Math.min(yy, y - 48) - 4;
  page.drawRectangle({ x: M, y, width: W - 2 * M, height: 3, color: acento });
  y -= 22;
  texto('REPORTE SEMANAL DEL CURSO', M, y, { tam: 17, fuente: fb, color: TINTA });
  y -= 15;
  const d1 = r.semana.desde, d2 = r.semana.hasta;
  const sem = d1.getMonth() === d2.getMonth() ? `${d1.getDate()} al ${d2.getDate()} de ${MESES[d2.getMonth()]} de ${d2.getFullYear()}` : `${d1.getDate()} de ${MESES[d1.getMonth()]} al ${d2.getDate()} de ${MESES[d2.getMonth()]} de ${d2.getFullYear()}`;
  texto(`Semana del ${sem}`, M, y, { tam: 10.5, color: GRIS });
  y -= 13;
  texto([r.curso.grado, r.curso.seccion && `Sección ${r.curso.seccion}`, r.curso.anio, r.lapso && `Lapso ${r.lapso.numero}`, `${r.curso.estudiantes} estudiantes`].filter(Boolean).join(' · '), M, y, { tam: 10.5, color: GRIS });
  y -= 6;

  // ----- lectura de la semana (IA) -----
  if (lectura) {
    seccion('Lectura de la semana');
    parrafo(lectura, { tam: 10.5, hl: 14.5 });
    parrafo('Redactado con ayuda de la IA a partir de los datos del cuaderno. Revísalo antes de usarlo.', { tam: 8, color: GRIS, hl: 11 });
  }

  // ----- el curso en el lapso -----
  seccion('El curso en el lapso');
  hueco(56);
  const ks = [
    { t: 'Promedio general', v: r.stats.promedio !== null ? String(r.stats.promedio) : 'sin notas', c: r.stats.promedio !== null && r.stats.promedio < r.stats.minimo ? ROJO : VERDE },
    { t: 'Aprueban', v: r.stats.conNota ? `${r.stats.aprobados} de ${r.stats.conNota}` : '-', c: TINTA },
    { t: 'En riesgo', v: String(r.stats.enRiesgo), c: r.stats.enRiesgo ? ROJO : TINTA },
    { t: 'Asistencia semanal', v: r.semana.pct !== null ? `${r.semana.pct}%` : 'sin lista', c: r.semana.pct !== null && r.semana.pct < 85 ? ROJO : TINTA },
  ];
  const kw = (W - 2 * M - 3 * 8) / 4;
  ks.forEach((k, i) => {
    const x = M + i * (kw + 8);
    page.drawRectangle({ x, y: y - 46, width: kw, height: 46, color: FONDO });
    texto(k.t, x + 8, y - 14, { tam: 8.5, color: GRIS });
    texto(k.v, x + 8, y - 37, { tam: 17, fuente: fb, color: k.c });
  });
  y -= 52;
  if (r.lapso && r.lapso.avance !== null) {
    parrafo(`Lapso ${r.lapso.numero}: ${r.lapso.avance}% transcurrido${r.lapso.diasRestantes !== null ? (r.lapso.diasRestantes >= 0 ? `, quedan ${r.lapso.diasRestantes} días.` : ', ya terminó.') : '.'}`, { tam: 9.5, color: GRIS });
  }

  // ----- asistencia de la semana -----
  seccion('Asistencia de la semana');
  hueco(100);
  const bw = 34, gap = (W - 2 * M - 5 * bw) / 4, alto = 56;
  r.semana.dias.forEach((d, i) => {
    const x = M + i * (bw + gap);
    page.drawRectangle({ x, y: y - alto, width: bw, height: alto, color: FONDO });
    if (d.n) {
      let base = y - alto;
      for (const [cant, color] of [[d.presentes, VERDE], [d.justificadas, AMBAR], [d.faltas, ROJO]]) {
        if (!cant) continue;
        const h = (alto * cant) / d.n;
        page.drawRectangle({ x, y: base, width: bw, height: h, color });
        base += h;
      }
    }
    const etiqueta = d.n ? `${d.faltas} falt.` : 'sin lista';
    texto(etiqueta, x + (bw - ancho(etiqueta, 8)) / 2, y - alto - 11, { tam: 8, color: GRIS });
    texto(d.letra, x + (bw - ancho(d.letra, 9, fb)) / 2, y - alto - 22, { tam: 9, fuente: fb });
  });
  y -= alto + 30;
  parrafo(r.semana.diasConLista ? `Cada barra es el día completo: verde asistió, amarillo falta justificada y rojo faltó. Esta semana hubo ${r.semana.faltas} faltas en ${r.semana.diasConLista} días con lista.` : 'Esta semana todavía no se pasó lista.', { tam: 9, color: GRIS });

  // ----- notas del curso -----
  if (r.stats.conNota) {
    seccion('Notas del curso');
    const max = Math.max(...r.distribucion.map(x => x.cantidad), 1);
    for (const x of r.distribucion) {
      hueco(18);
      texto(x.texto, M, y - 10, { tam: 9.5 });
      page.drawRectangle({ x: M + 60, y: y - 12, width: 300, height: 12, color: FONDO });
      if (x.cantidad) page.drawRectangle({ x: M + 60, y: y - 12, width: Math.max(3, (300 * x.cantidad) / max), height: 12, color: /^(1 a 9)$/.test(x.texto) ? ROJO : acento });
      texto(String(x.cantidad), M + 370, y - 10, { tam: 9.5, fuente: fb });
      y -= 17;
    }
    parrafo('Cuántos estudiantes tienen su promedio general en cada rango de nota.', { tam: 9, color: GRIS });
    if (r.porAsignatura.length) {
      y -= 4;
      parrafo(`Promedio por asignatura: ${r.porAsignatura.map(a => `${a.nombre} ${a.promedio}`).join(' · ')}`, { tam: 9.5 });
    }
  }

  // ----- estudiantes a seguir -----
  seccion('Para seguir de cerca');
  if (r.seguir.length) {
    for (const s of r.seguir) {
      hueco(18);
      texto(s.nombre, M, y - 10, { tam: 10, fuente: fb });
      texto(s.motivos.join(', '), M + 190, y - 10, { tam: 9.5, color: ROJO });
      y -= 16;
      page.drawLine({ start: { x: M, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 0.4, color: LINEA });
    }
  } else parrafo('Ningún estudiante está por debajo del mínimo ni con baja asistencia. Buen momento para reforzar lo logrado.', { tam: 10 });
  if (r.destacados.length) { y -= 4; parrafo(`Destacan este lapso: ${r.destacados.map(d => `${d.nombre} (${d.promedio})`).join(', ')}.`, { tam: 10 }); }

  // ----- debilidades -----
  seccion('Debilidades por abordar');
  if (r.debilidades.length) {
    for (const d of r.debilidades) {
      hueco(44);
      texto(`${d.clave}`, M, y - 10, { tam: 10, fuente: fb });
      derecha(`${d.asignatura} · ${d.pct}% de logro`, W - M, y - 10, { tam: 9.5, color: ROJO });
      y -= 14;
      parrafo(d.sugerencia, { tam: 9.5, color: GRIS, hl: 12.5 });
      y -= 3;
    }
  } else parrafo('Por ahora ningún tema del curso está por debajo del umbral de logro.', { tam: 10 });

  // ----- pendientes -----
  if (r.pendientes.length) {
    seccion('Pendiente por evaluar');
    for (const p of r.pendientes) { hueco(16); texto(`${p.evaluacion}${p.asignatura ? ` (${p.asignatura})` : ''}`, M, y - 10, { tam: 10 }); derecha(`${p.con} de ${p.total} con nota`, W - M, y - 10, { tam: 9.5, color: GRIS }); y -= 15; }
  }

  // ----- cumpleaños -----
  seccion('Próximos cumpleaños');
  if (r.cumpleanos.length) {
    for (const c of r.cumpleanos) { hueco(16); texto(c.nombre, M, y - 10, { tam: 10 }); derecha(`${c.dias === 0 ? 'Hoy' : c.dias === 1 ? 'Mañana' : `El ${c.fecha}`}${c.edad ? ` · cumple ${c.edad} años` : ''}`, W - M, y - 10, { tam: 9.5, color: GRIS }); y -= 15; }
  } else parrafo('No hay cumpleaños en los próximos 14 días (o faltan las fechas de nacimiento).', { tam: 10 });

  // ----- pie en todas las páginas -----
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    const t = `Generado con Cuaderno docente · ${r.generado}${inst.docente ? ` · ${inst.docente}` : ''}`;
    p.drawText(limpiar(t), { x: M, y: 24, size: 8, font: f, color: GRIS });
    const n = `${i + 1} de ${paginas.length}`;
    p.drawText(n, { x: W - M - f.widthOfTextAtSize(n, 8), y: 24, size: 8, font: f, color: GRIS });
  });
  return await pdf.save();
}
