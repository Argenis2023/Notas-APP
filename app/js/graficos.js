// Gráficos y estadísticas del Inicio. Son funciones puras: reciben la "foto" de los datos y devuelven HTML.
// Los gráficos son HTML y SVG simples (sin librerías), para que funcionen sin internet y se vean nítidos al imprimir.
import { distribucion, resumenAsistencia, promedioGeneral, evolucionEstudiante, cambioEnLapso } from './analisis.js';
import { promedio, aprueba } from './calc.js';
import { html } from './ui.js';

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const pad = n => String(n).padStart(2, '0');
const isoDe = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const LETRAS = ['L', 'M', 'M', 'J', 'V'];
const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];

// Lunes a viernes de la semana de hoy (si es fin de semana, la semana que acaba de pasar).
export function diasDeLaSemana(hoy) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const dow = d.getDay(); // 0 domingo
  const haciaLunes = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + haciaLunes);
  return [0, 1, 2, 3, 4].map(i => { const x = new Date(d); x.setDate(d.getDate() + i); return isoDe(x); });
}

export function semanaAsistencia(s, hoy) {
  const hoyIso = isoDe(hoy);
  const dias = diasDeLaSemana(hoy).map((iso, i) => {
    const filas = s.asistencia.filter(a => a.fecha === iso);
    const p = filas.filter(a => a.estado === 'presente').length;
    const f = filas.filter(a => a.estado === 'ausente').length;
    const j = filas.filter(a => a.estado === 'justificado').length;
    const n = p + f + j;
    return { iso, i, p, f, j, n, hoy: iso === hoyIso, pct: n ? Math.round((100 * p) / n) : 0, clase: !n ? 'vacio' : f ? 'mal' : j ? 'ambar' : 'bien' };
  });
  const hubo = dias.some(d => d.n);
  return html`
    <section aria-labelledby="sem-t">
      <h2 id="sem-t">Asistencia de la semana</h2>
      <a class="sem" href="#/asistencia">
        <ol class="sem-dias">${dias.map(d => html`
          <li class="sem-dia ${d.hoy ? 'hoy' : ''}">
            <span class="sem-barra" role="img" aria-label="${NOMBRES_DIA[d.i]}: ${d.n ? `${d.pct}% asistió, ${plural(d.f, 'falta', 'faltas')}` : 'sin lista'}"><span class="sem-rel ${d.clase}" style="height:${d.pct}%"></span></span>
            <span class="sem-num">${d.n ? d.f : '–'}</span>
            <span class="sem-let" aria-hidden="true">${LETRAS[d.i]}</span>
          </li>`)}
        </ol>
      </a>
      <p class="hint">${hubo ? 'El alto de la barra es el porcentaje que asistió y el número de abajo, las faltas del día.' : 'Todavía no has pasado lista esta semana.'}</p>
    </section>`;
}

export function notasDelCurso(proms, minimo) {
  if (!proms.length) return '';
  const dist = distribucion(proms);
  const max = Math.max(...dist.map(r => r.cantidad), 1);
  return html`
    <section aria-labelledby="dist-t">
      <h2 id="dist-t">Notas del curso</h2>
      <ul class="dist">${dist.map(r => html`
        <li><span class="dist-r">${r.texto}</span>
          <span class="dist-pista" role="img" aria-label="${plural(r.cantidad, 'estudiante', 'estudiantes')} con promedio de ${r.texto}"><span class="dist-rel ${r.max < minimo ? 'mal' : 'bien'}" style="width:${Math.round((100 * r.cantidad) / max)}%"></span></span>
          <span class="dist-n">${r.cantidad}</span></li>`)}
      </ul>
      <p class="hint">Cuántos estudiantes tienen su promedio general en cada rango de nota.</p>
    </section>`;
}

export function evolucionPromedio(s, lapso, minimo) {
  if (!lapso) return '';
  const evs = s.evaluaciones.filter(e => e.lapso_id === lapso.id)
    .sort((a, b) => String(a.fecha || a.created_at || '').localeCompare(String(b.fecha || b.created_at || '')));
  if (!evs.length) return '';
  const puntos = evs.map(ev => {
    const notas = s.estudiantes.map(e => s.nota[`${ev.id}|${e.id}`]).filter(n => typeof n === 'number');
    return notas.length ? { nombre: ev.nombre, valor: promedio(notas) } : null;
  }).filter(Boolean).slice(-8);
  if (puntos.length < 2) {
    return html`
      <section aria-labelledby="evo-t">
        <h2 id="evo-t">Evolución del promedio</h2>
        <p class="hint">Aparecerá cuando tengas notas en al menos 2 evaluaciones del lapso.</p>
      </section>`;
  }
  const W = 300, H = 120, L = 26, R = 10, T = 10, B = 14;
  const x = i => L + (i * (W - L - R)) / (puntos.length - 1);
  const y = v => T + (1 - Math.max(0, Math.min(20, v)) / 20) * (H - T - B);
  const linea = puntos.map((p, i) => `${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  const resumen = puntos.map(p => `${p.nombre}: ${p.valor}`).join('; ');
  const sube = puntos[puntos.length - 1].valor - puntos[0].valor;
  return html`
    <section aria-labelledby="evo-t">
      <h2 id="evo-t">Evolución del promedio</h2>
      <svg class="evo" viewBox="0 0 ${W} ${H}" role="img" aria-label="Promedio del curso por evaluación. ${resumen}" preserveAspectRatio="xMidYMid meet">
        <line class="evo-eje" x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}"/>
        <line class="evo-min" x1="${L}" y1="${y(minimo).toFixed(1)}" x2="${W - R}" y2="${y(minimo).toFixed(1)}"/>
        <text class="evo-txt" x="${L - 4}" y="${(y(minimo) + 3).toFixed(1)}" text-anchor="end">${minimo}</text>
        <text class="evo-txt" x="${L - 4}" y="${(y(20) + 3).toFixed(1)}" text-anchor="end">20</text>
        <polyline class="evo-linea" pathLength="1" points="${linea}"/>
        ${puntos.map((p, i) => html`<circle class="evo-pto" cx="${x(i).toFixed(1)}" cy="${y(p.valor).toFixed(1)}" r="3.6"><title>${p.nombre}: ${p.valor}</title></circle>`)}
        <text class="evo-val" x="${x(puntos.length - 1).toFixed(1)}" y="${(y(puntos[puntos.length - 1].valor) - 8).toFixed(1)}" text-anchor="end">${puntos[puntos.length - 1].valor}</text>
      </svg>
      <p class="hint">Promedio del curso en cada evaluación, de la más antigua a la más reciente. ${Math.abs(sube) < 1 ? 'Se mantiene estable.' : sube > 0 ? `Sube ${Math.round(sube)} ${Math.round(sube) === 1 ? 'punto' : 'puntos'} desde la primera.` : `Baja ${Math.round(-sube)} ${Math.round(-sube) === 1 ? 'punto' : 'puntos'} desde la primera.`} La línea punteada es la nota mínima para aprobar.</p>
    </section>`;
}

// Estudiantes que conviene seguir de cerca y los que destacan, según promedio y asistencia del lapso.
export function seguirYDestacados(s, lapso, nombrePropio = x => x) {
  if (!lapso) return '';
  const filas = s.estudiantes.map(e => {
    const prom = promedioGeneral(s, lapso.id, e.id);
    const r = resumenAsistencia(s, lapso, e.id);
    return { e, prom, r };
  });
  const motivo = f => {
    const m = [];
    if (f.prom !== null && !aprueba(f.prom, s.cfg)) m.push(`promedio ${f.prom}`);
    if (f.r.marcados >= 5 && f.r.pct < 80) m.push(`${f.r.pct}% de asistencia`);
    return m;
  };
  const seguir = filas.filter(f => motivo(f).length).sort((a, b) => (a.prom ?? 99) - (b.prom ?? 99)).slice(0, 3);
  const destacados = filas.filter(f => f.prom !== null && f.prom >= 18).sort((a, b) => b.prom - a.prom).slice(0, 3);
  const lista = (titulo, id, items, texto) => html`
    <section aria-labelledby="${id}">
      <h2 id="${id}">${titulo}</h2>
      <ul class="hoja">${items.map(f => html`
        <li><a class="fila" href="#/reportes/e/${f.e.id}?l=${lapso.numero}">
          <span class="margen">${f.prom ?? '–'}</span>
          <span class="fila-texto"><span class="fila-nombre">${f.e.nombre_completo}</span><span class="fila-sub">${texto(f)}</span></span>
        </a></li>`)}</ul>
    </section>`;
  return html`${seguir.length ? lista('Para seguir de cerca', 'seg-t', seguir, f => motivo(f).join(', ')) : ''}${destacados.length ? lista('Destacados del lapso', 'des-t', destacados, f => `promedio ${f.prom}${f.r.pct !== null && f.r.marcados >= 5 ? `, ${f.r.pct}% de asistencia` : ''}`) : ''}`;
}

// ----- Evolución de un estudiante entre lapsos -----
const flecha = d => (d > 0 ? html`<span class="cambio sube" aria-label="sube ${d}">▲ ${d}</span>` : d < 0 ? html`<span class="cambio baja" aria-label="baja ${-d}">▼ ${-d}</span>` : html`<span class="cambio igual" aria-label="se mantiene">=</span>`);

export function evolucionLapsos(s, estId, minimo) {
  const evo = evolucionEstudiante(s, estId);
  if (evo.length < 2) {
    return html`
      <section class="no-print" aria-labelledby="evl-t">
        <h3 class="informe-h" id="evl-t">Evolución entre lapsos</h3>
        <p class="hint">Aparecerá cuando el estudiante tenga notas en al menos 2 lapsos.</p>
      </section>`;
  }
  const W = 300, H = 130, L = 26, R = 14, T = 14, B = 22;
  const x = i => L + (i * (W - L - R)) / (evo.length - 1);
  const y = v => T + (1 - Math.max(0, Math.min(20, v)) / 20) * (H - T - B);
  const linea = evo.map((p, i) => `${x(i).toFixed(1)},${y(p.promedio).toFixed(1)}`).join(' ');
  const resumen = evo.map(p => `Lapso ${p.lapso.numero}: ${p.promedio}`).join('; ');
  const dif = evo[evo.length - 1].promedio - evo[0].promedio;
  const ultimo = evo[evo.length - 1].promedio - evo[evo.length - 2].promedio;
  const frase = ultimo === 0 ? 'Se mantiene igual que en el lapso anterior.' : ultimo > 0 ? `Subió ${plural(ultimo, 'punto', 'puntos')} respecto al lapso anterior.` : `Bajó ${plural(-ultimo, 'punto', 'puntos')} respecto al lapso anterior.`;
  const asigs = s.asignaturas.filter(a => evo.some(p => p.asig[a.id] !== undefined));
  return html`
    <section class="no-print" aria-labelledby="evl-t">
      <h3 class="informe-h" id="evl-t">Evolución entre lapsos</h3>
      <svg class="evo evo-lapsos" viewBox="0 0 ${W} ${H}" role="img" aria-label="Promedio general por lapso. ${resumen}" preserveAspectRatio="xMidYMid meet">
        <line class="evo-eje" x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}"/>
        <line class="evo-min" x1="${L}" y1="${y(minimo).toFixed(1)}" x2="${W - R}" y2="${y(minimo).toFixed(1)}"/>
        <text class="evo-txt" x="${L - 4}" y="${(y(minimo) + 3).toFixed(1)}" text-anchor="end">${minimo}</text>
        <text class="evo-txt" x="${L - 4}" y="${(y(20) + 3).toFixed(1)}" text-anchor="end">20</text>
        <polyline class="evo-linea" pathLength="1" points="${linea}"/>
        ${evo.map((p, i) => html`
          <circle class="evo-pto" cx="${x(i).toFixed(1)}" cy="${y(p.promedio).toFixed(1)}" r="3.6"><title>Lapso ${p.lapso.numero}: ${p.promedio}</title></circle>
          <text class="evo-val" x="${x(i).toFixed(1)}" y="${(y(p.promedio) - 8).toFixed(1)}" text-anchor="middle">${p.promedio}</text>
          <text class="evo-txt" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">Lapso ${p.lapso.numero}</text>`)}
      </svg>
      <p class="hint">${frase}${evo.length > 2 ? ` En total ${dif === 0 ? 'queda igual' : dif > 0 ? `sube ${plural(dif, 'punto', 'puntos')}` : `baja ${plural(-dif, 'punto', 'puntos')}`} desde el lapso ${evo[0].lapso.numero}.` : ''} La línea punteada es la nota mínima para aprobar.</p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th scope="col">Asignatura</th>${evo.map(p => html`<th scope="col">Lapso ${p.lapso.numero}</th>`)}<th scope="col">Cambio</th></tr></thead>
        <tbody>${asigs.map(a => {
          const vals = evo.map(p => p.asig[a.id]);
          const conNota = vals.filter(v => v !== undefined);
          const d = conNota.length >= 2 ? conNota[conNota.length - 1] - conNota[conNota.length - 2] : null;
          return html`<tr><th scope="row">${a.nombre}</th>${vals.map(v => html`<td>${v === undefined ? '–' : v}</td>`)}<td>${d === null ? '–' : flecha(d)}</td></tr>`;
        })}</tbody>
        <tfoot><tr><th scope="row">Promedio general</th>${evo.map(p => html`<td><strong>${p.promedio}</strong></td>`)}<td>${flecha(ultimo)}</td></tr></tfoot>
      </table></div>
    </section>`;
}

// Quiénes suben y quiénes bajan su promedio general respecto al lapso anterior (los 3 mayores cambios de cada lado).
export function cambiosDelCurso(s, lapso) {
  if (!lapso) return '';
  const filas = s.estudiantes.map(e => ({ e, c: cambioEnLapso(s, e.id, lapso.id) })).filter(f => f.c && f.c.diff !== 0);
  const suben = filas.filter(f => f.c.diff > 0).sort((a, b) => b.c.diff - a.c.diff).slice(0, 3);
  const bajan = filas.filter(f => f.c.diff < 0).sort((a, b) => a.c.diff - b.c.diff).slice(0, 3);
  if (!suben.length && !bajan.length) return '';
  const lista = (titulo, id, items) => html`
    <section aria-labelledby="${id}">
      <h2 id="${id}">${titulo}</h2>
      <ul class="hoja">${items.map(({ e, c }) => html`
        <li><a class="fila" href="#/reportes/e/${e.id}?l=${lapso.numero}">
          <span class="margen">${c.actual}</span>
          <span class="fila-texto"><span class="fila-nombre">${e.nombre_completo}</span><span class="fila-sub">${flecha(c.diff)} desde ${c.anterior} en el lapso ${c.lapsoAnterior.numero}</span></span>
        </a></li>`)}</ul>
    </section>`;
  return html`${suben.length ? lista('Suben respecto al lapso anterior', 'cam-sube', suben) : ''}${bajan.length ? lista('Bajan respecto al lapso anterior', 'cam-baja', bajan) : ''}`;
}
