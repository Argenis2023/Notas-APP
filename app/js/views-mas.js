// Pantalla "Más": todo lo que no cabe en las cinco pestañas, ordenado por para qué se usa.
import { html, icon } from './ui.js';

const GRUPOS = [
  { id: 'aula', titulo: 'Para el aula', filas: [
    ['diccionario', 'Diccionario', 'Buscar el significado de una palabra', '#/aula/diccionario'],
    ['pausa', 'Pausa activa', 'Movimiento de unos minutos entre actividades', '#/aula/pausas'],
    ['sorteo', 'Sorteo y grupos', 'Elegir a quién le toca o formar equipos', '#/aula/sorteo'],
  ] },
  { id: 'dia', titulo: 'Mi día a día', filas: [
    ['calendario', 'Agenda', 'Reuniones, entregas y evaluaciones', '#/agenda'],
    ['libro', 'Planificación diaria', 'Preparar y guardar la clase del día', '#/planificacion'],
    ['campana', 'Avisos', 'Lo que conviene atender', '#/avisos'],
  ] },
  { id: 'estudiantes', titulo: 'Estudiantes', filas: [
    ['nota', 'Anotaciones', 'Observaciones, incidencias y reuniones', '#/anotaciones'],
    ['personas', 'Representantes', 'Contacto de las familias', '#/representantes'],
  ] },
  { id: 'cuenta', titulo: 'Cuaderno', filas: [
    ['ajustes', 'Ajustes', 'Colegio, notas, respaldo y cuenta', '#/ajustes'],
  ] },
];

// Una fila de lista con ícono, título, apoyo y flecha: se usa en Más y en Reportes.
export const filaMas = (ic, nombre, sub, href) => html`
  <li><a class="mas-fila" href="${href}">
    <span class="mas-ico" aria-hidden="true">${icon(ic, 20)}</span>
    <span class="mas-txt"><span class="mas-nombre">${nombre}</span>${sub ? html`<span class="mas-sub">${sub}</span>` : ''}</span>
    <span class="mas-flecha" aria-hidden="true">${icon('chevron', 18)}</span>
  </a></li>`;

export async function mas() {
  return {
    title: 'Más',
    html: html`
      ${GRUPOS.map(g => html`
        <section class="mas-grupo" aria-labelledby="mas-${g.id}">
          <h2 id="mas-${g.id}" class="mas-t">${g.titulo}</h2>
          <ul class="mas-lista">${g.filas.map(([ic, nombre, sub, href]) => filaMas(ic, nombre, sub, href))}</ul>
        </section>`)}`,
  };
}
