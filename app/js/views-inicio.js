// Panel del Inicio: fichas de acceso con información al día, pendientes y alertas.
import { lapsoActual } from './data.js';
import { aprueba, promedio } from './calc.js';
import { cargarSnapshot, promedioGeneral, enRiesgo, logroCurso, esDebil } from './analisis.js';
import { barra } from './views-reportes.js';
import { html, icon, fechaCorta, infoEstado, haceCuanto } from './ui.js';

const DIA = 86400000;
const utc = iso => Date.parse(iso + 'T00:00:00Z');
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function saludo(d = new Date()) {
  const h = d.getHours();
  const t = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const f = new Intl.DateTimeFormat('es-VE', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return { t, f };
}

export async function panelInicio(ctx, seccion, completo) {
  const s = await cargarSnapshot(seccion);
  const lapso = lapsoActual(s.lapsos);
  const hoy = new Date();
  const hoyUtc = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const nEst = s.estudiantes.length;

  // Lapso en curso
  let lapsoInfo = null;
  if (lapso && lapso.fecha_inicio && lapso.fecha_fin) {
    const ini = utc(lapso.fecha_inicio), fin = utc(lapso.fecha_fin);
    const total = Math.max(1, fin - ini);
    const pct = Math.max(0, Math.min(100, Math.round(((hoyUtc - ini) / total) * 100)));
    const dias = Math.ceil((fin - hoyUtc) / DIA);
    lapsoInfo = { pct, texto: hoyUtc < ini ? `Empieza el ${fechaCorta(lapso.fecha_inicio)}` : dias < 0 ? 'Lapso terminado' : dias === 0 ? 'Termina hoy' : `Quedan ${plural(dias, 'día', 'días')}` };
  }

  // Evaluaciones del lapso y cuáles falta pasar a la lista de cotejo
  const evalsLapso = lapso ? s.evaluaciones.filter(e => e.lapso_id === lapso.id) : [];
  const pendientes = [];
  for (const ev of evalsLapso) {
    const asig = s.asignaturas.find(a => a.id === ev.asignatura_id);
    const nInd = s.indicadores.filter(i => i.evaluacion_id === ev.id).length;
    const hechos = s.estudiantes.filter(e => typeof s.nota[`${ev.id}|${e.id}`] === 'number').length;
    if (!nInd) pendientes.push({ ev, asig, texto: 'Falta escribir los indicadores', href: `#/evaluar/e/${ev.id}`, marca: '!' });
    else if (nEst && hechos < nEst) pendientes.push({ ev, asig, texto: `${hechos} de ${nEst} estudiantes evaluados`, href: `#/evaluar/e/${ev.id}/cotejo`, marca: `${hechos}/${nEst}` });
  }

  // Notas y apoyo
  const proms = lapso ? s.estudiantes.map(e => promedioGeneral(s, lapso.id, e.id)).filter(n => n !== null) : [];
  const promCurso = promedio(proms);
  const aprobados = proms.filter(n => aprueba(n, s.cfg)).length;
  const riesgo = lapso ? enRiesgo(s, lapso.id) : [];

  // Lo más débil del curso
  const debiles = [];
  if (lapso) for (const a of s.asignaturas) for (const l of logroCurso(s, a.id, lapso.id)) if (esDebil(l.pct, s)) debiles.push({ ...l, asig: a.nombre });
  debiles.sort((x, y) => x.pct - y.pct);

  const estado = infoEstado(ctx.syncState(), { configurado: ctx.configurado, sesion: ctx.sesion });
  const g = saludo(hoy);
  const ultimo = ctx.syncState().lastSync;

  return html`
    <section aria-labelledby="menu-t">
      <h2 id="menu-t" class="saludo">${g.t}<span class="saludo-fecha">${g.f}</span></h2>
      <div class="fichas">
        ${lapso ? html`
        <a class="ficha ficha-ancha" href="#/ajustes">
          <span class="ficha-tit">Lapso ${lapso.numero}</span>
          ${lapsoInfo ? html`
            <span class="ficha-sub">${fechaCorta(lapso.fecha_inicio)} al ${fechaCorta(lapso.fecha_fin)} · ${lapsoInfo.texto}</span>
            <span class="avance" role="img" aria-label="${lapsoInfo.pct}% del lapso transcurrido"><span style="width:${lapsoInfo.pct}%"></span></span>`
            : html`<span class="ficha-sub">Pon las fechas del lapso en Ajustes para ver cuánto falta.</span>`}
        </a>` : ''}

        <a class="ficha" href="#/estudiantes">
          <span class="ficha-ico">${icon('personas', 22)}</span>
          <span class="ficha-tit">Estudiantes</span>
          <span class="ficha-num">${nEst}</span>
          <span class="ficha-sub">${nEst ? 'Lista, fichas e importar de Excel' : 'Agrega o importa tu lista'}</span>
        </a>
        <a class="ficha" href="#/evaluar">
          <span class="ficha-ico">${icon('evaluar', 22)}</span>
          <span class="ficha-tit">Evaluar</span>
          <span class="ficha-num">${evalsLapso.length}</span>
          <span class="ficha-sub">${s.asignaturas.length ? `${plural(evalsLapso.length, 'evaluación', 'evaluaciones')} en el lapso, ${plural(s.asignaturas.length, 'asignatura', 'asignaturas')}` : 'Empieza agregando asignaturas'}</span>
        </a>
        <a class="ficha" href="#/reportes${lapso ? `?l=${lapso.numero}` : ''}">
          <span class="ficha-ico">${icon('reportes', 22)}</span>
          <span class="ficha-tit">Reportes</span>
          <span class="ficha-num ${promCurso === null ? '' : aprueba(promCurso, s.cfg) ? 'bien' : 'mal'}">${promCurso ?? '–'}</span>
          <span class="ficha-sub">${proms.length ? `Promedio del curso, ${aprobados} de ${proms.length} aprueban` : 'Aparecen cuando haya notas'}</span>
        </a>
        <a class="ficha ${riesgo.length ? 'ficha-alerta' : ''}" href="${riesgo.length && lapso ? `#/reportes/curso?l=${lapso.numero}` : '#/reportes'}">
          <span class="ficha-ico">${icon('alerta', 22)}</span>
          <span class="ficha-tit">Apoyo</span>
          <span class="ficha-num ${riesgo.length ? 'mal' : ''}">${riesgo.length}</span>
          <span class="ficha-sub">${riesgo.length ? 'Necesitan apoyo: ' + riesgo.slice(0, 2).map(r => r.estudiante.nombre_completo.split(/\s+/)[0]).join(', ') + (riesgo.length > 2 ? ` y ${riesgo.length - 2} más` : '') : proms.length ? 'Nadie bajo el mínimo' : 'Sin notas todavía'}</span>
        </a>
        <a class="ficha ficha-ancha" href="#/reportes/banco">
          <span class="ficha-ico">${icon('libro', 22)}</span>
          <span class="ficha-tit">Mis recomendaciones</span>
          <span class="ficha-sub"><strong>${plural(s.recomendaciones.length, 'guardada', 'guardadas')}</strong> · qué recomendar cuando un tema sale débil</span>
        </a>
        <a class="ficha ficha-ancha ficha-respaldo ${estado.clase}" href="#/ajustes">
          <span class="ficha-ico">${icon('nube', 22)}</span>
          <span class="ficha-tit">Respaldo</span>
          <span class="ficha-sub"><strong>${estado.texto}</strong>${ultimo && ctx.configurado ? ` · último respaldo ${haceCuanto(ultimo)}` : ''}</span>
        </a>
      </div>
    </section>

    ${pendientes.length ? html`
      <section aria-labelledby="pend-t">
        <h2 id="pend-t">Para continuar</h2>
        <ol class="hoja">${pendientes.slice(0, 4).map(p => html`
          <li><a class="fila" href="${p.href}">
            <span class="margen">${p.marca}</span>
            <span class="fila-texto"><span class="fila-nombre">${p.ev.nombre}</span><span class="fila-sub">${[p.asig?.nombre, p.texto].filter(Boolean).join(', ')}</span></span>
          </a></li>`)}</ol>
        ${pendientes.length > 4 ? html`<p class="hint">Y ${pendientes.length - 4} más en <a href="#/evaluar">Evaluar</a>.</p>` : ''}
      </section>` : ''}

    ${debiles.length ? html`
      <section aria-labelledby="deb-t">
        <h2 id="deb-t">Lo más débil del curso</h2>
        <ul class="barras">${debiles.slice(0, 3).map(d => barra(`${d.clave} (${d.asig})`, d.pct, s))}</ul>
        <p><a href="#/reportes/curso?l=${lapso.numero}">Ver el informe del curso</a></p>
      </section>` : ''}`;
}
