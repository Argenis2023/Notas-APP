// Piezas de formulario compartidas por las pantallas.
import { html, raw } from './ui.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function campo({ id, label, value = '', type = 'text', hint = '', required = false, extra = '' }) {
  return html`<div class="field">
    <label for="${id}">${label}${required ? html` <span class="oblig">obligatorio</span>` : ''}</label>
    <input id="${id}" name="${id}" type="${type}" value="${value ?? ''}" ${raw(extra)}>
    ${hint ? html`<p class="hint">${hint}</p>` : ''}
  </div>`;
}
export function areaTexto({ id, label, value = '', hint = '', rows = 3 }) {
  return html`<div class="field">
    <label for="${id}">${label}</label>
    <textarea id="${id}" name="${id}" rows="${rows}">${value ?? ''}</textarea>
    ${hint ? html`<p class="hint">${hint}</p>` : ''}
  </div>`;
}
export const errorBox = id => html`<p class="error" id="${id}" role="alert" hidden></p>`;
export function mostrarError(root, id, texto) {
  const el = $('#' + id, root);
  if (!el) return;
  el.textContent = texto;
  el.hidden = !texto;
  if (texto) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

