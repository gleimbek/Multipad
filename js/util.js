// Utilidades de interfaz compartidas: DOM, avisos y ventanas modales.
import { t } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const uid = () => Math.random().toString(36).slice(2, 10);
const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

export function icon(d) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  s.append(p);
  return s;
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

export function toast(msg, { action, onAction, timeout = 4500 } = {}) {
  const box = el('div', { class: 'toast' }, el('span', { text: msg }));
  if (action) {
    box.append(el('button', { text: action, onclick: () => { box.remove(); onAction?.(); } }));
    timeout = Math.max(timeout, 9000);
  }
  $('#toasts').append(box);
  setTimeout(() => box.remove(), timeout);
}

export function openModal(content) {
  const layer = $('#modalLayer');
  layer.textContent = '';
  layer.append(content);
  layer.hidden = false;
  return () => { layer.hidden = true; layer.textContent = ''; };
}

function bindBackdrop(done) {
  $('#modalLayer').onclick = (e) => { if (e.target.id === 'modalLayer') done(); };
}

export function promptModal({ title, text, value = '', placeholder = '', okLabel }) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', value, placeholder, autocomplete: 'off', spellcheck: 'false' });
    let close;
    const done = (v) => { close(); resolve(v); };
    const box = el('form', { class: 'modal', onsubmit: (e) => { e.preventDefault(); done(input.value.trim() || null); } },
      el('h2', { text: title }),
      text ? el('p', { text }) : null,
      input,
      el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'btn', text: t('ui.cancel'), onclick: () => done(null) }),
        el('button', { type: 'submit', class: 'btn primary', text: okLabel || t('ui.ok') })));
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(null); });
    close = openModal(box);
    bindBackdrop(() => done(null));
    input.focus();
    const dot = value.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : value.length);
  });
}

export function confirmModal({ title, text, buttons }) {
  buttons = buttons || [t('ui.cancel'), t('ui.ok')];
  return new Promise((resolve) => {
    let close;
    const done = (i) => { close(); resolve(i); };
    const box = el('div', { class: 'modal', tabindex: '-1' },
      el('h2', { text: title }),
      text ? el('p', { text }) : null,
      el('div', { class: 'actions' },
        buttons.map((b, i) => el('button', { class: 'btn' + (i === buttons.length - 1 ? ' primary' : ''), text: b, onclick: () => done(i) }))));
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(0); });
    close = openModal(box);
    bindBackdrop(() => done(0));
    box.querySelector('.btn.primary')?.focus();
  });
}

// Lista con filtro. items: [{label, hint, value}]
export function pickModal({ title, items, placeholder }) {
  return new Promise((resolve) => {
    let close;
    let sel = Math.max(0, items.findIndex((it) => it.current));
    let shown = items;
    const done = (v) => { close(); resolve(v); };
    const input = el('input', { type: 'text', placeholder: placeholder || t('ui.filter'), autocomplete: 'off', spellcheck: 'false' });
    const list = el('div', { class: 'pick-list', role: 'listbox' });
    const draw = () => {
      list.textContent = '';
      shown.forEach((it, i) => {
        list.append(el('button', { class: 'pick-item' + (i === sel ? ' sel' : ''), type: 'button', onclick: () => done(it.value) },
          el('span', { text: (it.current ? '✓ ' : '') + it.label }), it.hint ? el('span', { class: 'hint', text: it.hint }) : null));
      });
      list.children[sel]?.scrollIntoView({ block: 'nearest' });
    };
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      shown = items.filter((it) => (it.label + ' ' + (it.hint || '')).toLowerCase().includes(q));
      sel = 0;
      draw();
    });
    const box = el('div', { class: 'modal' }, el('h2', { text: title }), items.length > 6 ? input : null, list);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') done(null);
      else if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); done(shown[sel].value); }
    });
    close = openModal(box);
    bindBackdrop(() => done(null));
    draw();
    (items.length > 6 ? input : list.querySelector('.pick-item.sel') || list.querySelector('.pick-item'))?.focus();
  });
}

// Ventana informativa con contenido libre y botón de cerrar.
export function infoModal(title, ...content) {
  let close;
  const box = el('div', { class: 'modal wide' },
    el('h2', { text: title }),
    ...content,
    el('div', { class: 'actions' }, el('button', { class: 'btn primary', text: t('ui.close'), onclick: () => close() })));
  close = openModal(box);
  bindBackdrop(() => close());
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  box.querySelector('.btn.primary').focus();
  return close;
}
