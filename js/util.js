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

// ZIP sin compresión (método "store"): suficiente para empaquetar archivos de texto.
// files: [{ path, text }] o [{ path: 'carpeta/', dir: true }]
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function makeZip(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.path);
    const data = f.dir ? new Uint8Array(0) : enc.encode(f.text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(local, name, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, date, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(38, f.dir ? 0x10 : 0, true);
    entry.setUint32(42, offset, true);
    central.push(entry, name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
