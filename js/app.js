// MultiPad: editor de código con pestañas, paneles y varias ventanas sincronizadas.
import * as CM from '../vendor/codemirror.js';
import { db } from './db.js';
import { LANGS, langById, langExtension, detectLang } from './langs.js';

/* ------------------------------------------------------------------ utilidades */

const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 10);
const SVG_NS = 'http://www.w3.org/2000/svg';
const TAB_MIME = 'application/x-multipad-tab';
const isTouch = () => matchMedia('(pointer: coarse)').matches;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function el(tag, attrs = {}, ...kids) {
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

function icon(d) {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  s.append(p);
  return s;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ------------------------------------------------------------------ avisos y modales */

function toast(msg, { action, onAction, timeout = 4500 } = {}) {
  const t = el('div', { class: 'toast' }, el('span', { text: msg }));
  if (action) {
    t.append(el('button', { text: action, onclick: () => { t.remove(); onAction?.(); } }));
    timeout = Math.max(timeout, 9000);
  }
  $('#toasts').append(t);
  setTimeout(() => t.remove(), timeout);
}

function openModal(content) {
  const layer = $('#modalLayer');
  layer.textContent = '';
  layer.append(content);
  layer.hidden = false;
  return () => { layer.hidden = true; layer.textContent = ''; };
}

function promptModal({ title, text, value = '', placeholder = '', okLabel = 'Aceptar' }) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', value, placeholder, autocomplete: 'off', spellcheck: 'false' });
    let close;
    const done = (v) => { close(); resolve(v); };
    const box = el('form', { class: 'modal', onsubmit: (e) => { e.preventDefault(); done(input.value.trim() || null); } },
      el('h2', { text: title }),
      text ? el('p', { text }) : null,
      input,
      el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'btn', text: 'Cancelar', onclick: () => done(null) }),
        el('button', { type: 'submit', class: 'btn primary', text: okLabel })));
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(null); });
    close = openModal(box);
    $('#modalLayer').onclick = (e) => { if (e.target.id === 'modalLayer') done(null); };
    input.focus();
    const dot = value.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : value.length);
  });
}

function confirmModal({ title, text, buttons = ['Cancelar', 'Aceptar'] }) {
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
    $('#modalLayer').onclick = (e) => { if (e.target.id === 'modalLayer') done(0); };
    box.querySelector('.btn.primary')?.focus();
  });
}

// Lista con filtro. items: [{label, hint, value}]
function pickModal({ title, items, placeholder = 'Filtrar…' }) {
  return new Promise((resolve) => {
    let close;
    let sel = 0;
    let shown = items;
    const done = (v) => { close(); resolve(v); };
    const input = el('input', { type: 'text', placeholder, autocomplete: 'off', spellcheck: 'false' });
    const list = el('div', { class: 'pick-list', role: 'listbox' });
    const draw = () => {
      list.textContent = '';
      shown.forEach((it, i) => {
        list.append(el('button', { class: 'pick-item' + (i === sel ? ' sel' : ''), type: 'button', onclick: () => done(it.value) },
          el('span', { text: it.label }), it.hint ? el('span', { class: 'hint', text: it.hint }) : null));
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
    $('#modalLayer').onclick = (e) => { if (e.target.id === 'modalLayer') done(null); };
    draw();
    (items.length > 6 ? input : list.querySelector('.pick-item'))?.focus();
  });
}

/* ------------------------------------------------------------------ menús */

let openMenuEl = null;
let openMenuBtn = null;

function closeMenu() {
  openMenuEl?.remove();
  openMenuEl = null;
  openMenuBtn?.classList.remove('open');
  openMenuBtn = null;
}

// items: [{label, kbd, action, checked, disabled}] | 'sep' | {title}
function showMenu(items, pos, btn = null) {
  closeMenu();
  const m = el('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (!it) continue;
    if (it === 'sep') { m.append(el('div', { class: 'menu-sep' })); continue; }
    if (it.title) { m.append(el('div', { class: 'menu-title', text: it.title })); continue; }
    m.append(el('button', {
      class: 'menu-item', role: 'menuitem', disabled: it.disabled || false,
      onclick: () => { closeMenu(); it.action?.(); },
    },
    el('span', { class: 'check', text: it.checked ? '✓' : '' }),
    el('span', { class: 'lbl', text: it.label }),
    it.kbd ? el('span', { class: 'kbd', text: it.kbd }) : null));
  }
  $('#menuLayer').append(m);
  const r = m.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.visualViewport?.height || window.innerHeight;
  m.style.left = Math.max(6, Math.min(pos.x, vw - r.width - 6)) + 'px';
  m.style.top = Math.max(6, Math.min(pos.y, vh - r.height - 6)) + 'px';
  openMenuEl = m;
  if (btn) { openMenuBtn = btn; btn.classList.add('open'); }
}

document.addEventListener('pointerdown', (e) => {
  if (openMenuEl && !openMenuEl.contains(e.target) && !e.target.closest('.menu-btn')) closeMenu();
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenuEl) closeMenu(); });

/* ------------------------------------------------------------------ ajustes */

const SETTINGS_KEY = 'multipad:settings';
const DEFAULTS = { theme: 'auto', fontSize: 14, wrap: window.innerWidth < 700, tabSize: 4, whitespace: false, autocomplete: true, mobileKeys: 'auto' };
const settings = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  bc.postMessage({ type: 'settings', settings, from: WID });
  applySettings();
}

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const resolvedTheme = () => (settings.theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : settings.theme);
darkQuery.addEventListener('change', () => settings.theme === 'auto' && applySettings());

const comp = {
  lang: new CM.Compartment(),
  theme: new CM.Compartment(),
  wrap: new CM.Compartment(),
  tab: new CM.Compartment(),
  ws: new CM.Compartment(),
  ac: new CM.Compartment(),
};

const themeExt = () => (resolvedTheme() === 'dark' ? CM.oneDark : []);
const wrapExt = () => (settings.wrap ? CM.EditorView.lineWrapping : []);
const tabExt = () => [CM.indentUnit.of(' '.repeat(settings.tabSize)), CM.EditorState.tabSize.of(settings.tabSize)];
const wsExt = () => (settings.whitespace ? [CM.highlightWhitespace(), CM.highlightTrailingWhitespace()] : []);
const acExt = () => (settings.autocomplete ? CM.autocompletion() : []);

function applySettings() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--editor-font', settings.fontSize + 'px');
  $('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#16191d' : '#e4e7ea');
  for (const v of allViews()) {
    v.dispatch({
      effects: [
        comp.theme.reconfigure(themeExt()),
        comp.wrap.reconfigure(wrapExt()),
        comp.tab.reconfigure(tabExt()),
        comp.ws.reconfigure(wsExt()),
        comp.ac.reconfigure(acExt()),
      ],
    });
    v.requestMeasure();
  }
  const showKeys = settings.mobileKeys === 'on' || (settings.mobileKeys === 'auto' && isTouch());
  $('#mobileKeys').hidden = !showKeys;
  updateStatus();
}

/* ------------------------------------------------------------------ identidad de la ventana */

const bc = new BroadcastChannel('multipad');
let WID = new URLSearchParams(location.search).get('w') || sessionStorage.getItem('multipad:wid') || 'main';

// Si otra ventana ya usa este id (pestaña duplicada, app abierta dos veces), se toma uno nuevo.
async function claimWindowId() {
  const taken = await new Promise((resolve) => {
    const onMsg = (e) => {
      if (e.data?.type === 'probe-taken' && e.data.wid === WID) { clearTimeout(timer); bc.removeEventListener('message', onMsg); resolve(true); }
    };
    const timer = setTimeout(() => { bc.removeEventListener('message', onMsg); resolve(false); }, 250);
    bc.addEventListener('message', onMsg);
    bc.postMessage({ type: 'probe', wid: WID });
  });
  if (taken) WID = 'w' + uid();
  sessionStorage.setItem('multipad:wid', WID);
  const url = new URL(location.href);
  url.searchParams.set('w', WID);
  history.replaceState(null, '', url);
}

const REG_KEY = 'multipad:windows';
const registry = () => JSON.parse(localStorage.getItem(REG_KEY) || '{}');

function ensureWindowName() {
  const reg = registry();
  if (!reg[WID]) {
    const used = Object.values(reg).map((r) => r.n || 0);
    let n = WID === 'main' ? 1 : 2;
    while (used.includes(n)) n++;
    reg[WID] = { n, name: 'Ventana ' + n };
    localStorage.setItem(REG_KEY, JSON.stringify(reg));
  }
}
const winName = (wid = WID) => registry()[wid]?.name || 'Ventana';

function renderWinLabel() {
  $('#winLabel').textContent = winName();
  updateTitle();
}

async function renameWindow() {
  const name = await promptModal({ title: 'Nombre de esta ventana', value: winName(), text: 'Sirve para reconocerla al mover pestañas entre ventanas o pantallas.' });
  if (!name) return;
  const reg = registry();
  reg[WID] = { ...(reg[WID] || {}), name };
  localStorage.setItem(REG_KEY, JSON.stringify(reg));
  renderWinLabel();
  announce();
}

/* ------------------------------------------------------------------ ventanas vivas */

const peers = new Map(); // wid -> {name, seen}

function announce(reply = false) {
  bc.postMessage({ type: 'hello', wid: WID, name: winName(), reply });
}

function livePeers() {
  const now = Date.now();
  for (const [wid, p] of peers) if (now - p.seen > 12000) peers.delete(wid);
  return [...peers.entries()].map(([wid, p]) => ({ wid, name: p.name }));
}

function layoutOf(wid) {
  if (wid === WID) return layout;
  try { return JSON.parse(localStorage.getItem('multipad:layout:' + wid) || 'null'); } catch { return null; }
}

function isOpenAnywhere(docId) {
  const wids = [WID, ...livePeers().map((p) => p.wid)];
  return wids.some((w) => layoutOf(w)?.panes?.some((p) => p.tabs.includes(docId)));
}

/* ------------------------------------------------------------------ distribución (paneles y pestañas) */

let layout = null;
const layoutKey = () => 'multipad:layout:' + WID;
const saveLayout = debounce(() => {
  layout.saved = Date.now();
  localStorage.setItem(layoutKey(), JSON.stringify(layout));
  bc.postMessage({ type: 'layout', from: WID });
}, 150);

const newPane = () => ({ id: 'p' + uid(), tabs: [], active: null, size: 1 });
const getPane = (id) => layout.panes.find((p) => p.id === id);
const focusedPane = () => getPane(layout.focused) || layout.panes[0];

/* ------------------------------------------------------------------ documentos */

const docs = new Map(); // id -> {rec, views: Map(paneId -> EditorView), dirty, saveTimer, stale}
const loading = new Map();
const hostOf = new WeakMap(); // view -> div contenedor
const paneOfView = new WeakMap(); // view -> paneId
const Remote = CM.Annotation.define();

function* allViews() {
  for (const d of docs.values()) yield* d.views.values();
}

const getText = (d) => {
  const v = d.views.values().next().value;
  return v ? v.state.doc.toString() : d.rec.content;
};

const normalize = (text) => text.replace(/\r\n?/g, '\n');

async function loadDoc(id) {
  if (docs.has(id)) return docs.get(id);
  if (!loading.has(id)) {
    loading.set(id, db.getDoc(id).then((rec) => {
      loading.delete(id);
      if (!rec) return null;
      const d = { rec, views: new Map(), dirty: rec.content !== (rec.savedContent ?? '') };
      docs.set(id, d);
      return d;
    }));
  }
  return loading.get(id);
}

async function persist(d) {
  clearTimeout(d.saveTimer);
  d.saveTimer = null;
  d.rec.content = getText(d);
  d.rec.updated = Date.now();
  try {
    await db.putDoc(d.rec);
  } catch (err) {
    toast('No se pudo guardar en el almacenamiento local: ' + err.message);
  }
  refreshDocList();
}

function schedulePersist(d) {
  clearTimeout(d.saveTimer);
  d.saveTimer = setTimeout(() => persist(d), 350);
}

function flushAll() {
  const pending = [];
  for (const d of docs.values()) if (d.saveTimer) pending.push(persist(d));
  return Promise.all(pending);
}

function updateDirty(d) {
  const dirty = getText(d) !== (d.rec.savedContent ?? '');
  if (dirty === d.dirty) return;
  d.dirty = dirty;
  document.querySelectorAll(`.tab[data-doc="${d.rec.id}"]`).forEach((t) => t.classList.toggle('dirty', dirty));
  updateTitle();
  refreshDocList();
}
const dirtyTimers = new Map();
function scheduleDirty(d) {
  clearTimeout(dirtyTimers.get(d.rec.id));
  dirtyTimers.set(d.rec.id, setTimeout(() => updateDirty(d), 120));
}

function broadcastMeta(d, keys) {
  const patch = {};
  for (const k of keys) patch[k] = d.rec[k];
  bc.postMessage({ type: 'meta', docId: d.rec.id, patch, from: WID });
}

async function createDoc({ name, content = '', savedContent = '', handle = null, lang }) {
  const text = normalize(content);
  const rec = {
    id: 'd' + uid() + Date.now().toString(36),
    name,
    lang: lang || detectLang(name),
    content: text,
    savedContent: normalize(savedContent),
    eol: /\r\n/.test(content) ? 'CRLF' : 'LF',
    handle,
    created: Date.now(),
    updated: Date.now(),
  };
  await db.putDoc(rec);
  bc.postMessage({ type: 'docs-changed', from: WID });
  return rec;
}

async function nextUntitledName() {
  const all = await db.allDocs();
  let n = 1;
  const names = new Set(all.map((r) => r.name));
  while (names.has('nuevo ' + n)) n++;
  return 'nuevo ' + n;
}

/* ------------------------------------------------------------------ vistas del editor */

function createView(d, paneId) {
  const view = new CM.EditorView({
    state: CM.EditorState.create({
      doc: getText(d),
      extensions: [
        CM.lineNumbers(),
        CM.highlightActiveLineGutter(),
        CM.highlightSpecialChars(),
        CM.history(),
        CM.foldGutter(),
        CM.drawSelection(),
        CM.dropCursor(),
        CM.EditorState.allowMultipleSelections.of(true),
        CM.indentOnInput(),
        CM.syntaxHighlighting(CM.defaultHighlightStyle, { fallback: true }),
        CM.bracketMatching(),
        CM.closeBrackets(),
        CM.rectangularSelection(),
        CM.crosshairCursor(),
        CM.highlightActiveLine(),
        CM.highlightSelectionMatches(),
        CM.search({ top: true }),
        CM.keymap.of([
          ...CM.closeBracketsKeymap,
          ...CM.defaultKeymap,
          ...CM.searchKeymap,
          ...CM.historyKeymap,
          ...CM.foldKeymap,
          ...CM.completionKeymap,
          CM.indentWithTab,
        ]),
        comp.lang.of(langExtension(d.rec.lang)),
        comp.theme.of(themeExt()),
        comp.wrap.of(wrapExt()),
        comp.tab.of(tabExt()),
        comp.ws.of(wsExt()),
        comp.ac.of(acExt()),
        CM.EditorView.contentAttributes.of({ autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' }),
        CM.EditorView.updateListener.of((u) => onViewUpdate(u, d)),
        CM.EditorView.domEventHandlers({ focus: (_e, v) => { setFocus(paneOfView.get(v)); } }),
      ],
    }),
  });
  const host = el('div', { class: 'editor-host' });
  host.append(view.dom);
  hostOf.set(view, host);
  paneOfView.set(view, paneId);
  d.views.set(paneId, view);
  paneEl(getPane(paneId)).editors.append(host);
  return view;
}

function onViewUpdate(u, d) {
  if (u.docChanged) {
    let local = false;
    for (const tr of u.transactions) {
      if (!tr.docChanged || tr.annotation(Remote)) continue;
      local = true;
      // Otras vistas del mismo documento en esta ventana (documento clonado en otro panel).
      for (const v of d.views.values()) {
        if (v !== u.view) v.dispatch({ changes: tr.changes, annotations: [Remote.of(true), CM.Transaction.addToHistory.of(false)] });
      }
      // Otras ventanas.
      bc.postMessage({ type: 'changes', docId: d.rec.id, changes: tr.changes.toJSON(), len: tr.startState.doc.length, from: WID });
    }
    if (local) schedulePersist(d);
    scheduleDirty(d);
  }
  if ((u.selectionSet || u.docChanged || u.focusChanged) && u.view === activeView()) updateStatus();
}

function destroyView(docId, paneId) {
  const d = docs.get(docId);
  if (!d) return;
  const v = d.views.get(paneId);
  if (v) {
    if (d.views.size === 1) d.rec.content = v.state.doc.toString();
    hostOf.get(v)?.remove();
    v.destroy();
    d.views.delete(paneId);
  }
}

function releaseDocIfUnused(docId) {
  const d = docs.get(docId);
  if (!d) return;
  if (layout.panes.some((p) => p.tabs.includes(docId))) return;
  if (d.saveTimer) persist(d);
  docs.delete(docId);
}

function activeView() {
  const pane = focusedPane();
  if (!pane?.active) return null;
  return docs.get(pane.active)?.views.get(pane.id) || null;
}

function activeDoc() {
  const pane = focusedPane();
  return pane?.active ? docs.get(pane.active) : null;
}

/* ------------------------------------------------------------------ paneles en pantalla */

const paneEls = new Map();

function paneEl(pane) {
  let p = paneEls.get(pane.id);
  if (p) return p;
  const paneId = pane.id;
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  const menuBtn = el('button', { class: 'icon-btn small', title: 'Opciones del panel', 'aria-label': 'Opciones del panel' }, icon('M12 5.5v.01 M12 12v.01 M12 18.5v.01'));
  menuBtn.addEventListener('click', () => {
    const r = menuBtn.getBoundingClientRect();
    showMenu(paneMenuItems(paneId), { x: r.right - 240, y: r.bottom + 4 });
  });
  const editors = el('div', { class: 'editors' });
  const empty = el('div', { class: 'empty-pane' },
    el('div', { text: 'Panel vacío' }),
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', text: 'Nuevo', onclick: () => { setFocus(paneId); cmds.new(); } }),
      el('button', { class: 'btn', text: 'Abrir…', onclick: () => { setFocus(paneId); cmds.open(); } }),
      el('button', { class: 'btn', text: 'Documentos', onclick: () => { setFocus(paneId); toggleSidebar(true); } })),
    el('div', { text: isTouch() ? 'Usa el menú ⋮ de cada pestaña para moverla aquí.' : 'También puedes arrastrar pestañas o archivos a este panel.' }));
  editors.append(empty);
  const root = el('section', { class: 'pane', dataset: { pane: paneId } },
    el('div', { class: 'tabbar' }, tabs, el('div', { class: 'pane-tools' }, menuBtn)),
    editors);
  root.addEventListener('pointerdown', () => setFocus(paneId), true);
  setupDropTarget(tabs, editors, paneId);
  p = { root, tabs, editors, empty };
  paneEls.set(paneId, p);
  return p;
}

function currentDir() {
  if (layout.panes.length > 1 && window.innerWidth < 700) return 'column';
  return layout.dir;
}

function renderPanes() {
  const host = $('#panes');
  for (const id of [...paneEls.keys()]) if (!getPane(id)) paneEls.delete(id);
  host.textContent = '';
  layout.panes.forEach((pane, i) => {
    if (i > 0) host.append(makeDivider(i - 1));
    const p = paneEl(pane);
    p.root.style.flexGrow = pane.size || 1;
    host.append(p.root);
    renderPane(pane);
  });
  host.classList.toggle('multi', layout.panes.length > 1);
  host.classList.toggle('column', currentDir() === 'column');
  markFocus();
}

function renderPane(pane) {
  const p = paneEl(pane);
  p.tabs.textContent = '';
  for (const docId of pane.tabs) {
    const d = docs.get(docId);
    if (d) p.tabs.append(makeTab(pane.id, d));
  }
  for (const [docId, d] of docs) {
    const v = d.views.get(pane.id);
    if (v) hostOf.get(v).hidden = docId !== pane.active;
  }
  p.empty.hidden = pane.tabs.length > 0;
  if (pane.active) {
    const d = docs.get(pane.active);
    if (d) {
      const v = d.views.get(pane.id) || createView(d, pane.id);
      hostOf.get(v).hidden = false;
      v.requestMeasure();
    }
  }
  p.tabs.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function rerenderTabsFor(docId) {
  for (const pane of layout.panes) if (pane.tabs.includes(docId)) renderPane(pane);
}

function markFocus() {
  for (const [id, p] of paneEls) p.root.classList.toggle('focused', id === layout.focused);
}

function setFocus(paneId) {
  if (!paneId || !getPane(paneId)) return;
  if (layout.focused !== paneId) {
    layout.focused = paneId;
    markFocus();
    saveLayout();
  }
  updateStatus();
}

function makeDivider(index) {
  const div = el('div', { class: 'divider', role: 'separator' });
  div.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    div.setPointerCapture(e.pointerId);
    div.classList.add('dragging');
    const a = layout.panes[index];
    const b = layout.panes[index + 1];
    const elA = paneEls.get(a.id).root;
    const elB = paneEls.get(b.id).root;
    const column = currentDir() === 'column';
    const rectA = elA.getBoundingClientRect();
    const rectB = elB.getBoundingClientRect();
    const totalPx = column ? rectA.height + rectB.height : rectA.width + rectB.width;
    const totalSize = (a.size || 1) + (b.size || 1);
    const start = column ? e.clientY : e.clientX;
    const startA = column ? rectA.height : rectA.width;
    const move = (ev) => {
      const delta = (column ? ev.clientY : ev.clientX) - start;
      const px = Math.max(80, Math.min(totalPx - 80, startA + delta));
      a.size = (px / totalPx) * totalSize;
      b.size = totalSize - a.size;
      elA.style.flexGrow = a.size;
      elB.style.flexGrow = b.size;
    };
    const up = () => {
      div.classList.remove('dragging');
      div.removeEventListener('pointermove', move);
      div.removeEventListener('pointerup', up);
      div.removeEventListener('pointercancel', up);
      saveLayout();
      for (const v of allViews()) v.requestMeasure();
    };
    div.addEventListener('pointermove', move);
    div.addEventListener('pointerup', up);
    div.addEventListener('pointercancel', up);
  });
  div.addEventListener('dblclick', () => {
    layout.panes.forEach((p) => { p.size = 1; });
    renderPanes();
    saveLayout();
  });
  return div;
}

/* ------------------------------------------------------------------ pestañas */

let lastLongPress = 0;

function makeTab(paneId, d) {
  const id = d.rec.id;
  const pane = getPane(paneId);
  const close = el('button', { class: 'x', title: 'Cerrar', 'aria-label': 'Cerrar pestaña', draggable: 'false' }, el('span', { text: '×' }));
  close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(paneId, id); });
  const tab = el('div', {
    class: 'tab' + (pane.active === id ? ' active' : '') + (d.dirty ? ' dirty' : ''),
    role: 'tab',
    draggable: 'true',
    title: d.rec.name + (d.rec.handle ? '' : ' · sin archivo en disco'),
    dataset: { doc: id },
  }, el('span', { class: 'label', text: d.rec.name }), close);

  tab.addEventListener('click', () => activateTab(paneId, id));
  tab.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(paneId, id); } });
  tab.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (Date.now() - lastLongPress < 900) return;
    showMenu(tabMenuItems(paneId, id), { x: e.clientX, y: e.clientY });
  });

  // Pulsación larga en pantallas táctiles: abre el menú de la pestaña.
  let lpTimer = null;
  let lpStart = null;
  tab.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    lpStart = { x: e.clientX, y: e.clientY };
    lpTimer = setTimeout(() => {
      lastLongPress = Date.now();
      showMenu(tabMenuItems(paneId, id), { x: lpStart.x, y: lpStart.y + 10 });
    }, 550);
  });
  const cancelLp = () => clearTimeout(lpTimer);
  tab.addEventListener('pointerup', cancelLp);
  tab.addEventListener('pointercancel', cancelLp);
  tab.addEventListener('pointermove', (e) => {
    if (lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > 10) cancelLp();
  });

  tab.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData(TAB_MIME, JSON.stringify({ docId: id, paneId, wid: WID }));
    e.dataTransfer.setData('text/plain', d.rec.name);
    e.dataTransfer.effectAllowed = 'copyMove';
  });
  return tab;
}

function activateTab(paneId, docId, focusEditor = true) {
  const pane = getPane(paneId);
  if (!pane) return;
  pane.active = docId;
  renderPane(pane);
  setFocus(paneId);
  saveLayout();
  const v = docs.get(docId)?.views.get(paneId);
  if (v && focusEditor && !isTouch()) v.focus();
  updateStatus();
}

async function openDocInPane(docId, paneId = focusedPane().id, { index = null, activate = true } = {}) {
  const pane = getPane(paneId);
  const d = await loadDoc(docId);
  if (!d || !pane) { toast('Ese documento ya no existe en el espacio de trabajo.'); return false; }
  if (d.stale) await refreshRec(d);
  if (!pane.tabs.includes(docId)) {
    if (index != null) pane.tabs.splice(index, 0, docId);
    else {
      const ai = pane.tabs.indexOf(pane.active);
      pane.tabs.splice(ai >= 0 ? ai + 1 : pane.tabs.length, 0, docId);
    }
  } else if (index != null) {
    const cur = pane.tabs.indexOf(docId);
    pane.tabs.splice(cur, 1);
    pane.tabs.splice(index > cur ? index - 1 : index, 0, docId);
  }
  if (activate || !pane.active) pane.active = docId;
  renderPane(pane);
  if (activate) activateTab(paneId, docId);
  saveLayout();
  refreshDocList();
  return true;
}

// Abre un documento: si ya está en un panel de esta ventana, lo activa ahí.
async function showDoc(docId) {
  const where = layout.panes.find((p) => p.tabs.includes(docId));
  if (where) { activateTab(where.id, docId); return; }
  await openDocInPane(docId);
}

function closeTab(paneId, docId, { keepPane = false } = {}) {
  const pane = getPane(paneId);
  if (!pane) return;
  const i = pane.tabs.indexOf(docId);
  if (i < 0) return;
  const d = docs.get(docId);
  const wasEmptyUntitled = d && !d.rec.handle && getText(d) === '' && /^nuevo \d+$/.test(d.rec.name);
  pane.tabs.splice(i, 1);
  if (pane.active === docId) pane.active = pane.tabs[i] ?? pane.tabs[i - 1] ?? null;
  destroyView(docId, paneId);
  if (!pane.tabs.length && layout.panes.length > 1 && !keepPane) {
    removePane(paneId);
  } else {
    renderPane(pane);
  }
  releaseDocIfUnused(docId);
  saveLayout();
  // Un "nuevo N" vacío que ya no está abierto en ninguna ventana se borra para no acumular basura.
  if (wasEmptyUntitled) {
    setTimeout(async () => {
      if (!isOpenAnywhere(docId)) {
        await db.deleteDoc(docId);
        bc.postMessage({ type: 'docs-changed', from: WID });
        refreshDocList();
      }
    }, 300);
  }
  refreshDocList();
  updateStatus();
}

function closeOthers(paneId, keepId) {
  const pane = getPane(paneId);
  for (const id of [...pane.tabs]) if (id !== keepId) closeTab(paneId, id, { keepPane: true });
}

function closeAllInPane(paneId) {
  const pane = getPane(paneId);
  for (const id of [...pane.tabs]) closeTab(paneId, id, { keepPane: true });
  if (layout.panes.length > 1) removePane(paneId);
}

/* ------------------------------------------------------------------ operaciones con paneles */

function addPane(afterId, dir) {
  if (layout.panes.length >= 4) {
    toast('Hasta 4 paneles por ventana. Para más, abre otra ventana.');
    return null;
  }
  if (dir) layout.dir = dir;
  const p = newPane();
  const i = layout.panes.findIndex((x) => x.id === afterId);
  layout.panes.splice(i + 1, 0, p);
  renderPanes();
  saveLayout();
  return p;
}

function removePane(paneId) {
  const idx = layout.panes.findIndex((p) => p.id === paneId);
  if (idx < 0 || layout.panes.length === 1) return;
  const pane = layout.panes[idx];
  for (const docId of [...pane.tabs]) destroyView(docId, paneId);
  const tabs = pane.tabs;
  layout.panes.splice(idx, 1);
  tabs.forEach(releaseDocIfUnused);
  if (layout.focused === paneId) layout.focused = (layout.panes[idx] || layout.panes[idx - 1]).id;
  renderPanes();
  saveLayout();
  updateStatus();
}

function otherPane(paneId, create = true) {
  if (layout.panes.length === 1) return create ? addPane(paneId, layout.dir) : null;
  const i = layout.panes.findIndex((p) => p.id === paneId);
  return layout.panes[(i + 1) % layout.panes.length];
}

// Mueve la vista existente (conserva historial de deshacer y posición).
function moveTab(docId, fromId, toId, index = null) {
  const from = getPane(fromId);
  const to = getPane(toId);
  if (!from || !to) return;
  if (fromId === toId) {
    const cur = from.tabs.indexOf(docId);
    if (index == null || cur < 0) return;
    from.tabs.splice(cur, 1);
    from.tabs.splice(index > cur ? index - 1 : index, 0, docId);
    renderPane(from);
    saveLayout();
    return;
  }
  const d = docs.get(docId);
  if (to.tabs.includes(docId)) {
    closeTab(fromId, docId);
    activateTab(toId, docId);
    return;
  }
  const v = d?.views.get(fromId);
  if (v) {
    d.views.delete(fromId);
    d.views.set(toId, v);
    paneOfView.set(v, toId);
    paneEl(to).editors.append(hostOf.get(v));
  }
  const i = from.tabs.indexOf(docId);
  from.tabs.splice(i, 1);
  if (from.active === docId) from.active = from.tabs[i] ?? from.tabs[i - 1] ?? null;
  if (index != null) to.tabs.splice(index, 0, docId);
  else to.tabs.push(docId);
  to.active = docId;
  if (!from.tabs.length && layout.panes.length > 1) removePane(fromId);
  else renderPane(from);
  renderPane(to);
  activateTab(toId, docId);
  saveLayout();
}

function moveToOtherPane(paneId, docId) {
  const target = otherPane(paneId);
  if (target) moveTab(docId, paneId, target.id);
}

async function cloneToOtherPane(paneId, docId) {
  const target = otherPane(paneId);
  if (!target) return;
  if (target.tabs.includes(docId)) { activateTab(target.id, docId); return; }
  await openDocInPane(docId, target.id);
}

/* ------------------------------------------------------------------ arrastrar y soltar */

function setupDropTarget(tabsEl, editorsEl, paneId) {
  const accepts = (e) => e.dataTransfer && (e.dataTransfer.types.includes(TAB_MIME) || e.dataTransfer.types.includes('Files'));
  const clearMarks = () => {
    tabsEl.querySelectorAll('.drop-before').forEach((t) => t.classList.remove('drop-before'));
    editorsEl.classList.remove('drop-target');
  };
  const indexAt = (e) => {
    const tabs = [...tabsEl.querySelectorAll('.tab')];
    const i = tabs.findIndex((t) => {
      const r = t.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2;
    });
    return i < 0 ? tabs.length : i;
  };

  tabsEl.addEventListener('dragover', (e) => {
    if (!accepts(e)) return;
    e.preventDefault();
    clearMarks();
    const tabs = tabsEl.querySelectorAll('.tab');
    const i = indexAt(e);
    if (tabs[i]) tabs[i].classList.add('drop-before');
  });
  editorsEl.addEventListener('dragover', (e) => {
    if (!accepts(e)) return;
    e.preventDefault();
    clearMarks();
    editorsEl.classList.add('drop-target');
  });
  for (const t of [tabsEl, editorsEl]) {
    t.addEventListener('dragleave', (e) => { if (!t.contains(e.relatedTarget)) clearMarks(); });
  }
  tabsEl.addEventListener('drop', (e) => { if (accepts(e)) { e.preventDefault(); clearMarks(); handleDrop(e, paneId, indexAt(e)); } });
  editorsEl.addEventListener('drop', (e) => { if (accepts(e)) { e.preventDefault(); clearMarks(); handleDrop(e, paneId, null); } });
}

function handleDrop(e, paneId, index) {
  const dt = e.dataTransfer;
  if (dt.types.includes(TAB_MIME)) {
    const data = JSON.parse(dt.getData(TAB_MIME) || '{}');
    if (!data.docId) return;
    if (data.wid === WID) {
      moveTab(data.docId, data.paneId, paneId, index);
    } else {
      // Pestaña que viene de otra ventana: se abre aquí y la otra la cierra.
      openDocInPane(data.docId, paneId, { index }).then((ok) => {
        if (ok) bc.postMessage({ type: 'tab-taken', wid: data.wid, paneId: data.paneId, docId: data.docId });
      });
    }
    return;
  }
  // Archivos del sistema operativo. Los handles hay que pedirlos antes de cualquier await.
  const entries = [...dt.items].filter((i) => i.kind === 'file').map((i) => ({
    file: i.getAsFile(),
    handle: i.getAsFileSystemHandle ? i.getAsFileSystemHandle() : null,
  }));
  setFocus(paneId);
  (async () => {
    for (const { file, handle } of entries) {
      const h = handle ? await handle.catch(() => null) : null;
      if (h?.kind === 'directory') { await addFolder(h); continue; }
      if (h?.kind === 'file') await openHandle(h, paneId);
      else if (file) await openFileObject(file, null, paneId);
    }
  })();
}

/* ------------------------------------------------------------------ archivos */

async function verifyPermission(handle, write) {
  const opts = { mode: write ? 'readwrite' : 'read' };
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

async function findDocByHandle(handle) {
  for (const d of docs.values()) {
    if (d.rec.handle && await d.rec.handle.isSameEntry?.(handle)) return d.rec.id;
  }
  const all = await db.allDocs();
  for (const r of all) {
    try { if (r.handle && await r.handle.isSameEntry(handle)) return r.id; } catch { /* handle viejo */ }
  }
  return null;
}

async function openFileObject(file, handle, paneId) {
  if (file.size > 8 * 1024 * 1024) {
    const ok = await confirmModal({ title: 'Archivo grande', text: `${file.name} pesa ${(file.size / 1048576).toFixed(1)} MB. Puede ir lento.`, buttons: ['Cancelar', 'Abrir igual'] });
    if (!ok) return;
  }
  const text = await file.text();
  if (/\u0000/.test(text.slice(0, 4000))) {
    toast(`${file.name} parece un archivo binario; no se abre.`);
    return;
  }
  const rec = await createDoc({ name: file.name, content: text, savedContent: text, handle });
  await openDocInPane(rec.id, paneId || focusedPane().id);
}

async function openHandle(handle, paneId) {
  const existing = await findDocByHandle(handle);
  if (existing) {
    const where = layout.panes.find((p) => p.tabs.includes(existing));
    if (where) activateTab(where.id, existing);
    else await openDocInPane(existing, paneId || focusedPane().id);
    return;
  }
  if (!(await verifyPermission(handle, false))) return;
  await openFileObject(await handle.getFile(), handle, paneId);
}

async function openFiles() {
  if (window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({ multiple: true });
      for (const h of handles) await openHandle(h);
    } catch (err) {
      if (err.name !== 'AbortError') toast(err.message);
    }
  } else {
    $('#fileInput').click();
  }
}

$('#fileInput').addEventListener('change', async (e) => {
  for (const f of [...e.target.files]) await openFileObject(f, null);
  e.target.value = '';
});

function outputText(d) {
  const text = getText(d);
  return d.rec.eol === 'CRLF' ? text.replace(/\n/g, '\r\n') : text;
}

async function markSaved(d, text) {
  d.rec.savedContent = text;
  await persist(d);
  broadcastMeta(d, ['savedContent', 'name', 'lang']);
  updateDirty(d);
  rerenderTabsFor(d.rec.id);
  updateStatus();
}

async function writeToHandle(handle, content) {
  const w = await handle.createWritable();
  await w.write(content);
  await w.close();
}

async function saveDoc(d, { as = false } = {}) {
  if (!d) return false;
  const text = getText(d);
  const out = outputText(d);
  if (!as && d.rec.handle) {
    try {
      if (await verifyPermission(d.rec.handle, true)) {
        await writeToHandle(d.rec.handle, out);
        await markSaved(d, text);
        toast(`Guardado: ${d.rec.name}`, { timeout: 1800 });
        return true;
      }
    } catch (err) {
      toast(`No se pudo escribir ${d.rec.name}: ${err.message}. Prueba "Guardar como".`);
      return false;
    }
  }
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: d.rec.name });
      await writeToHandle(handle, out);
      const renamed = handle.name !== d.rec.name;
      d.rec.handle = handle;
      d.rec.name = handle.name;
      if (renamed) setDocLang(d, detectLang(handle.name), false);
      await markSaved(d, text);
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') toast(err.message);
      return false;
    }
  }
  // Sin acceso al sistema de archivos (iPhone/iPad, Firefox, Safari): compartir o descargar.
  const file = new File([out], d.rec.name, { type: 'text/plain' });
  if (isIOS && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: d.rec.name });
      await markSaved(d, text);
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = el('a', { href: url, download: d.rec.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  await markSaved(d, text);
  toast(`Descargado: ${d.rec.name}`, { timeout: 2500 });
  return true;
}

async function saveAll() {
  let saved = 0;
  let pending = 0;
  for (const d of docs.values()) {
    if (!d.dirty) continue;
    if (d.rec.handle && await saveDoc(d)) saved++;
    else pending++;
  }
  toast(pending
    ? `Guardados ${saved}. ${pending} no tienen archivo en disco: usa "Guardar como" en cada uno.`
    : `Guardados ${saved} archivo(s).`);
}

async function newDoc(paneId) {
  const rec = await createDoc({ name: await nextUntitledName() });
  await openDocInPane(rec.id, paneId || focusedPane().id);
}

async function renameDoc(d) {
  if (!d) return;
  const name = await promptModal({ title: 'Renombrar', value: d.rec.name, okLabel: 'Renombrar' });
  if (!name || name === d.rec.name) return;
  if (d.rec.handle) {
    if (d.rec.handle.move) {
      try {
        await verifyPermission(d.rec.handle, true);
        await d.rec.handle.move(name);
      } catch (err) {
        toast('El archivo en disco conserva su nombre (' + err.message + '). Usa "Guardar como" si quieres otro archivo.');
      }
    } else {
      toast('Se renombró la pestaña. El archivo en disco conserva su nombre; usa "Guardar como" para crear otro.');
    }
  }
  const oldDetected = detectLang(d.rec.name);
  d.rec.name = name;
  if (d.rec.lang === oldDetected) setDocLang(d, detectLang(name), false);
  await persist(d);
  broadcastMeta(d, ['name', 'lang']);
  rerenderTabsFor(d.rec.id);
  updateTitle();
}

function setDocLang(d, lang, save = true) {
  d.rec.lang = lang;
  for (const v of d.views.values()) v.dispatch({ effects: comp.lang.reconfigure(langExtension(lang)) });
  if (save) { persist(d); broadcastMeta(d, ['lang']); }
  updateStatus();
}

async function refreshRec(d) {
  const rec = await db.getDoc(d.rec.id);
  if (rec) d.rec = rec;
  d.stale = false;
}

/* ------------------------------------------------------------------ carpetas (panel lateral) */

let folders = [];
const expanded = new Set();

async function saveFolders() {
  try { await db.set('folders', folders); } catch { /* el navegador no guarda handles */ }
}

async function addFolder(handle) {
  for (const f of folders) if (await f.handle.isSameEntry(handle)) { toggleSidebar(true); return; }
  folders.push({ id: uid(), handle, name: handle.name });
  expanded.add(folders[folders.length - 1].id);
  await saveFolders();
  toggleSidebar(true);
  renderTree();
}

async function openFolder() {
  if (!window.showDirectoryPicker) {
    toast('Este navegador no permite abrir carpetas completas. Usa Archivo → Abrir para elegir archivos.');
    return;
  }
  try {
    await addFolder(await window.showDirectoryPicker({ mode: 'readwrite' }));
  } catch (err) {
    if (err.name !== 'AbortError') toast(err.message);
  }
}

async function renderTree() {
  const root = $('#folderTree');
  root.textContent = '';
  if (!folders.length) {
    root.append(el('div', { class: 'tree-empty', text: window.showDirectoryPicker ? 'Ninguna carpeta abierta.' : 'Abrir carpetas requiere Chrome o Edge de escritorio.' }));
    return;
  }
  for (const f of folders) {
    const remove = el('button', { class: 'icon-btn small', title: 'Quitar carpeta de la lista', 'aria-label': 'Quitar carpeta' }, icon('M6 6l12 12 M18 6L6 18'));
    remove.addEventListener('click', async (e) => {
      e.stopPropagation();
      folders = folders.filter((x) => x !== f);
      await saveFolders();
      renderTree();
    });
    const node = el('div', { class: 'tree-item dir', style: 'padding-left:8px' },
      el('span', { class: 'caret', text: expanded.has(f.id) ? '▾' : '▸' }), el('span', { text: f.name, style: 'flex:1;overflow:hidden;text-overflow:ellipsis' }), remove);
    node.addEventListener('click', async () => {
      if (expanded.has(f.id)) expanded.delete(f.id);
      else {
        if (!(await verifyPermission(f.handle, false).catch(() => false))) { toast('Sin permiso para leer la carpeta.'); return; }
        expanded.add(f.id);
      }
      renderTree();
    });
    root.append(node);
    if (expanded.has(f.id)) {
      const box = el('div');
      root.append(box);
      renderDir(f.handle, box, 1, f.id).catch(() => {
        box.textContent = '';
        box.append(el('div', { class: 'tree-item file', style: 'padding-left:28px', text: 'Toca la carpeta para dar permiso' }));
        expanded.delete(f.id);
      });
    }
  }
}

async function renderDir(dirHandle, container, depth, key) {
  if ((await dirHandle.queryPermission?.({ mode: 'read' })) === 'prompt') throw new Error('permiso');
  const entries = [];
  for await (const [name, h] of dirHandle.entries()) entries.push([name, h]);
  entries.sort((a, b) => (a[1].kind === b[1].kind ? a[0].localeCompare(b[0]) : a[1].kind === 'directory' ? -1 : 1));
  container.textContent = '';
  for (const [name, h] of entries) {
    const k = key + '/' + name;
    const pad = `padding-left:${8 + depth * 14}px`;
    if (h.kind === 'directory') {
      const node = el('div', { class: 'tree-item dir', style: pad }, el('span', { class: 'caret', text: expanded.has(k) ? '▾' : '▸' }), el('span', { text: name }));
      const box = el('div');
      node.addEventListener('click', () => {
        if (expanded.has(k)) { expanded.delete(k); box.textContent = ''; node.firstChild.textContent = '▸'; }
        else { expanded.add(k); node.firstChild.textContent = '▾'; renderDir(h, box, depth + 1, k); }
      });
      container.append(node, box);
      if (expanded.has(k)) renderDir(h, box, depth + 1, k);
    } else {
      const node = el('div', { class: 'tree-item file', style: pad, title: name }, el('span', { class: 'caret' }), el('span', { text: name }));
      node.addEventListener('click', async () => {
        await openHandle(h);
        if (window.innerWidth < 700) toggleSidebar(false);
      });
      container.append(node);
    }
  }
}

/* ------------------------------------------------------------------ lista de documentos del espacio */

const refreshDocList = debounce(async () => {
  if ($('#sidebar').hidden) return;
  const all = (await db.allDocs()).sort((a, b) => b.updated - a.updated);
  const list = $('#docList');
  list.textContent = '';
  if (!all.length) {
    list.append(el('div', { class: 'tree-empty', text: 'No hay documentos.' }));
    return;
  }
  for (const r of all) {
    const live = docs.get(r.id);
    const content = live ? getText(live) : r.content;
    const dirty = content !== (r.savedContent ?? '');
    const del = el('button', { class: 'del', title: 'Quitar del espacio de trabajo', 'aria-label': 'Quitar del espacio' }, '×');
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteFromWorkspace(r.id, r.name, dirty); });
    const item = el('div', { class: 'doc-item', title: r.name + (r.handle ? '' : ' · solo en el espacio de trabajo') },
      el('span', { class: 'open-dot' + (isOpenAnywhere(r.id) ? '' : ' off') }),
      el('span', { class: 'name' }, dirty ? el('span', { class: 'dirty-mark', text: '● ' }) : null, r.name),
      del);
    item.addEventListener('click', async () => {
      await showDoc(r.id);
      if (window.innerWidth < 700) toggleSidebar(false);
    });
    list.append(item);
  }
}, 200);

async function deleteFromWorkspace(id, name, dirty) {
  const choice = await confirmModal({
    title: `Quitar "${name}"`,
    text: dirty
      ? 'Tiene cambios que no se guardaron en un archivo. Si lo quitas, esos cambios se pierden. El archivo en disco (si existe) no se toca.'
      : 'Se cierra en todas las ventanas. El archivo en disco (si existe) no se toca.',
    buttons: ['Cancelar', 'Quitar'],
  });
  if (!choice) return;
  closeDocEverywhereLocal(id);
  await db.deleteDoc(id);
  bc.postMessage({ type: 'deleted', docId: id, from: WID });
  refreshDocList();
}

function closeDocEverywhereLocal(docId) {
  for (const pane of [...layout.panes]) if (pane.tabs.includes(docId)) closeTab(pane.id, docId);
  docs.delete(docId);
}

function toggleSidebar(force) {
  const sb = $('#sidebar');
  const show = force ?? sb.hidden;
  sb.hidden = !show;
  layout.sidebar = show;
  saveLayout();
  if (show) { renderTree(); refreshDocList(); }
  for (const v of allViews()) v.requestMeasure();
}

/* ------------------------------------------------------------------ varias ventanas y pantallas */

function newWindow({ docId = null } = {}) {
  const wid = 'w' + uid();
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('w', wid);
  if (docId) url.searchParams.set('doc', docId);
  const w = Math.min(1200, screen.availWidth - 40);
  const h = Math.min(850, screen.availHeight - 40);
  const win = window.open(url.toString(), wid, `popup,width=${w},height=${h},left=${(window.screenX || 0) + 40},top=${(window.screenY || 0) + 40}`);
  if (!win) toast('El navegador bloqueó la ventana nueva. Permite ventanas emergentes para este sitio.');
  return win;
}

async function newWindowOnOtherScreen({ docId = null } = {}) {
  // La ventana se abre primero (mientras el clic todavía cuenta) y después se mueve.
  const win = newWindow({ docId });
  if (!win) return null;
  if (!('getScreenDetails' in window)) {
    toast('Este navegador no permite elegir la pantalla. Arrastra la ventana nueva al otro monitor.');
    return win;
  }
  try {
    const details = await window.getScreenDetails();
    const target = details.screens.find((s) => s !== details.currentScreen);
    if (!target) {
      toast('Solo se detecta una pantalla.');
      return win;
    }
    win.moveTo(target.availLeft, target.availTop);
    win.resizeTo(target.availWidth, target.availHeight);
  } catch {
    toast('Sin permiso de administración de ventanas. Arrastra la ventana nueva al otro monitor.');
  }
  return win;
}

async function sendTabToWindow(paneId, docId) {
  const others = livePeers();
  const items = [
    ...others.map((p) => ({ label: p.name, hint: 'abierta', value: { wid: p.wid } })),
    { label: 'Ventana nueva', value: { new: true } },
    { label: 'Ventana nueva en otra pantalla', value: { screen: true } },
  ];
  const choice = await pickModal({ title: 'Enviar pestaña a…', items });
  if (!choice) return;
  await flushAll();
  if (choice.wid) {
    bc.postMessage({ type: 'open-doc', target: choice.wid, docId, from: WID });
    closeTab(paneId, docId);
    toast(`Enviada a ${winName(choice.wid)}`, { timeout: 2000 });
  } else {
    const win = choice.screen ? await newWindowOnOtherScreen({ docId }) : newWindow({ docId });
    if (win) closeTab(paneId, docId);
  }
}

async function openTabInNewWindow(paneId, docId, otherScreen = false) {
  await flushAll();
  const win = otherScreen ? await newWindowOnOtherScreen({ docId }) : newWindow({ docId });
  if (win) closeTab(paneId, docId);
}

async function reopenSavedWindow() {
  const live = new Set([WID, ...livePeers().map((p) => p.wid)]);
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith('multipad:layout:')) continue;
    const wid = key.slice('multipad:layout:'.length);
    if (live.has(wid)) continue;
    const l = layoutOf(wid);
    const count = l?.panes?.reduce((n, p) => n + p.tabs.length, 0) || 0;
    items.push({ label: winName(wid), hint: `${count} pestaña(s)`, value: wid, saved: l?.saved || 0 });
  }
  items.sort((a, b) => b.saved - a.saved);
  if (!items.length) { toast('No hay ventanas cerradas para reabrir.'); return; }
  const wid = await pickModal({ title: 'Reabrir ventana', items });
  if (!wid) return;
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('w', wid);
  if (!window.open(url.toString(), wid, 'popup,width=1200,height=850')) toast('El navegador bloqueó la ventana. Permite ventanas emergentes.');
}

/* ------------------------------------------------------------------ mensajes entre ventanas */

bc.addEventListener('message', async (e) => {
  const m = e.data;
  if (!m || m.from === WID) return;
  switch (m.type) {
    case 'probe':
      if (m.wid === WID) bc.postMessage({ type: 'probe-taken', wid: WID });
      break;
    case 'hello':
      if (m.wid === WID) break;
      {
        const isNew = !peers.has(m.wid);
        peers.set(m.wid, { name: m.name, seen: Date.now() });
        if (isNew && !m.reply) announce(true);
        if (isNew) refreshDocList();
      }
      break;
    case 'bye':
      peers.delete(m.wid);
      refreshDocList();
      break;
    case 'layout':
    case 'docs-changed':
      refreshDocList();
      break;
    case 'changes': {
      const d = docs.get(m.docId);
      if (!d) break;
      const any = d.views.values().next().value;
      if (!any) { d.stale = true; break; }
      if (any.state.doc.length !== m.len) {
        // Se desincronizó (dos personas escribiendo a la vez): se recarga del almacenamiento.
        setTimeout(async () => {
          const rec = await db.getDoc(m.docId);
          if (!rec) return;
          for (const v of d.views.values()) {
            v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: rec.content }, annotations: [Remote.of(true), CM.Transaction.addToHistory.of(false)] });
          }
        }, 700);
        break;
      }
      const cs = CM.ChangeSet.fromJSON(m.changes);
      for (const v of d.views.values()) v.dispatch({ changes: cs, annotations: [Remote.of(true), CM.Transaction.addToHistory.of(false)] });
      break;
    }
    case 'meta': {
      const d = docs.get(m.docId);
      if (!d) break;
      const langChanged = m.patch.lang && m.patch.lang !== d.rec.lang;
      Object.assign(d.rec, m.patch);
      if (langChanged) setDocLang(d, m.patch.lang, false);
      d.dirty = null;
      updateDirty(d);
      rerenderTabsFor(m.docId);
      updateStatus();
      break;
    }
    case 'deleted':
      closeDocEverywhereLocal(m.docId);
      refreshDocList();
      break;
    case 'open-doc':
      if (m.target === WID) {
        await showDoc(m.docId);
        toast(`Recibida desde ${winName(m.from)}`, { timeout: 2000 });
      }
      break;
    case 'tab-taken':
      if (m.wid === WID && getPane(m.paneId)?.tabs.includes(m.docId)) closeTab(m.paneId, m.docId);
      break;
    case 'settings':
      Object.assign(settings, m.settings);
      applySettings();
      break;
  }
});

/* ------------------------------------------------------------------ comandos de edición */

function transformSelection(fn) {
  const v = activeView();
  if (!v) return;
  v.dispatch(v.state.changeByRange((r) => {
    if (r.empty) return { range: r };
    const text = fn(v.state.sliceDoc(r.from, r.to));
    return { changes: { from: r.from, to: r.to, insert: text }, range: CM.EditorSelection.range(r.from, r.from + text.length) };
  }));
  v.focus();
}

function linesOperation(fn) {
  const v = activeView();
  if (!v) return;
  const sel = v.state.selection.main;
  const doc = v.state.doc;
  const from = sel.empty ? 0 : doc.lineAt(sel.from).from;
  const to = sel.empty ? doc.length : doc.lineAt(sel.to).to;
  const text = fn(v.state.sliceDoc(from, to).split('\n')).join('\n');
  v.dispatch({ changes: { from, to, insert: text } });
  v.focus();
}

const runCM = (command) => () => {
  const v = activeView();
  if (v) { command(v); v.focus(); }
};

async function pickLanguage() {
  const d = activeDoc();
  if (!d) return;
  const lang = await pickModal({
    title: 'Lenguaje del documento',
    items: LANGS.map((l) => ({ label: l.label, hint: l.id === d.rec.lang ? 'actual' : l.ext.slice(0, 3).map((x) => '.' + x).join(' '), value: l.id })),
  });
  if (lang) setDocLang(d, lang);
}

async function pickTabSize() {
  const size = await pickModal({ title: 'Tamaño de la tabulación (espacios)', items: [2, 4, 8].map((n) => ({ label: `${n} espacios`, hint: n === settings.tabSize ? 'actual' : '', value: n })) });
  if (size) { settings.tabSize = size; saveSettings(); }
}

function toggleEol() {
  const d = activeDoc();
  if (!d) return;
  d.rec.eol = d.rec.eol === 'CRLF' ? 'LF' : 'CRLF';
  persist(d);
  broadcastMeta(d, ['eol']);
  updateStatus();
  toast(`Fin de línea: ${d.rec.eol}. Se aplica al guardar.`, { timeout: 2200 });
}

function zoom(delta) {
  settings.fontSize = delta === 0 ? DEFAULTS.fontSize : Math.max(9, Math.min(32, settings.fontSize + delta));
  saveSettings();
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

function showShortcuts() {
  const rows = [
    ['Nuevo documento', 'Alt+N'], ['Abrir archivos', 'Ctrl+O'], ['Guardar / Guardar como', 'Ctrl+S / Ctrl+Shift+S'],
    ['Cerrar pestaña', 'Alt+W'], ['Pestaña siguiente / anterior', 'Ctrl+Tab / Ctrl+Shift+Tab'], ['Ir a la pestaña N', 'Alt+1 … Alt+9'],
    ['Buscar / Reemplazar', 'Ctrl+F / Ctrl+H'], ['Ir a línea', 'Ctrl+G'], ['Comentar línea', 'Ctrl+/'],
    ['Duplicar línea', 'Shift+Alt+↓'], ['Mover línea', 'Alt+↑ / Alt+↓'], ['Selección múltiple', 'Ctrl+D (siguiente coincidencia)'],
    ['Dividir panel', 'Ctrl+\\'], ['Mover pestaña al otro panel', 'Alt+M'], ['Ventana nueva', 'Alt+Shift+N'],
    ['Panel lateral', 'Ctrl+B'], ['Tamaño de letra', 'Ctrl+= / Ctrl+- / Ctrl+0'], ['Ajuste de línea', 'Alt+Z'],
  ];
  const box = el('div', { class: 'modal' },
    el('h2', { text: 'Atajos de teclado' }),
    el('p', { text: 'En Mac usa Cmd en lugar de Ctrl. Dentro de una pestaña normal del navegador, Ctrl+N y Ctrl+W los toma el navegador; por eso los atajos usan Alt.' }),
    el('div', { class: 'pick-list' }, rows.map(([a, b]) => el('div', { class: 'pick-item' }, el('span', { text: a }), el('span', { class: 'hint', text: b })))),
    el('div', { class: 'actions' }, el('button', { class: 'btn primary', text: 'Cerrar', onclick: () => close() })));
  const close = openModal(box);
  $('#modalLayer').onclick = (e) => { if (e.target.id === 'modalLayer') close(); };
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

function showAbout() {
  const box = el('div', { class: 'modal' },
    el('h2', { text: 'MultiPad' }),
    el('p', { text: 'Editor de código para computadora, tablet y celular. Los documentos se guardan en este navegador (espacio de trabajo) y, cuando el navegador lo permite, directamente en tus archivos.' }),
    el('p', { text: 'Motor de edición: CodeMirror 6 (licencia MIT).' }),
    el('div', { class: 'actions' }, el('button', { class: 'btn primary', text: 'Cerrar', onclick: () => close() })));
  const close = openModal(box);
  $('#modalLayer').onclick = (e) => { if (e.target.id === 'modalLayer') close(); };
}

const cmds = {
  new: () => newDoc(),
  open: () => openFiles(),
  openFolder: () => openFolder(),
  save: () => saveDoc(activeDoc()),
  saveAs: () => saveDoc(activeDoc(), { as: true }),
  saveAll: () => saveAll(),
  rename: () => renameDoc(activeDoc()),
  closeTab: () => { const p = focusedPane(); if (p?.active) closeTab(p.id, p.active); },
  closeAll: () => { for (const p of [...layout.panes]) closeAllInPane(p.id); },
  splitRight: () => { const p = addPane(focusedPane().id, 'row'); if (p) setFocus(p.id); },
  splitDown: () => { const p = addPane(focusedPane().id, 'column'); if (p) setFocus(p.id); },
  toggleDir: () => { layout.dir = layout.dir === 'row' ? 'column' : 'row'; renderPanes(); saveLayout(); },
  closePane: () => { if (layout.panes.length > 1) closeAllInPane(focusedPane().id); },
  moveToOther: () => { const p = focusedPane(); if (p?.active) moveToOtherPane(p.id, p.active); },
  cloneToOther: () => { const p = focusedPane(); if (p?.active) cloneToOtherPane(p.id, p.active); },
  newWindow: () => newWindow(),
  otherScreen: () => newWindowOnOtherScreen(),
  sendToWindow: () => { const p = focusedPane(); if (p?.active) sendTabToWindow(p.id, p.active); },
  reopenWindow: () => reopenSavedWindow(),
  renameWindow: () => renameWindow(),
  fullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()),
  sidebar: () => toggleSidebar(),
  find: runCM(CM.openSearchPanel),
  gotoLine: runCM(CM.gotoLine),
  undo: runCM(CM.undo),
  redo: runCM(CM.redo),
  comment: runCM(CM.toggleComment),
  duplicateLine: runCM(CM.copyLineDown),
  deleteLine: runCM(CM.deleteLine),
  upper: () => transformSelection((t) => t.toUpperCase()),
  lower: () => transformSelection((t) => t.toLowerCase()),
  sortLines: () => linesOperation((lines) => [...lines].sort((a, b) => a.localeCompare(b))),
  trimTrailing: () => linesOperation((lines) => lines.map((l) => l.replace(/[ \t]+$/, ''))),
  language: () => pickLanguage(),
  tabSize: () => pickTabSize(),
  eol: () => toggleEol(),
  wrap: () => { settings.wrap = !settings.wrap; saveSettings(); },
  whitespace: () => { settings.whitespace = !settings.whitespace; saveSettings(); },
  autocomplete: () => { settings.autocomplete = !settings.autocomplete; saveSettings(); },
  mobileKeys: () => {
    const showing = !$('#mobileKeys').hidden;
    settings.mobileKeys = showing ? 'off' : 'on';
    saveSettings();
  },
  theme: (t) => { settings.theme = t; saveSettings(); },
  zoomIn: () => zoom(1),
  zoomOut: () => zoom(-1),
  zoomReset: () => zoom(0),
  install: async () => { if (installPrompt) { installPrompt.prompt(); installPrompt = null; } },
  shortcuts: () => showShortcuts(),
  about: () => showAbout(),
};

/* ------------------------------------------------------------------ definición de menús */

function tabMenuItems(paneId, docId) {
  const d = docs.get(docId);
  return [
    { label: 'Cerrar', kbd: 'Alt+W', action: () => closeTab(paneId, docId) },
    { label: 'Cerrar las demás', action: () => closeOthers(paneId, docId) },
    'sep',
    { label: 'Mover al otro panel', kbd: 'Alt+M', action: () => moveToOtherPane(paneId, docId) },
    { label: 'Clonar en el otro panel', action: () => cloneToOtherPane(paneId, docId) },
    'sep',
    { label: 'Enviar a otra ventana…', action: () => sendTabToWindow(paneId, docId) },
    { label: 'Abrir en ventana nueva', action: () => openTabInNewWindow(paneId, docId) },
    { label: 'Abrir en otra pantalla', action: () => openTabInNewWindow(paneId, docId, true) },
    'sep',
    { label: 'Guardar', action: () => saveDoc(d) },
    { label: 'Renombrar…', action: () => renameDoc(d) },
    { label: 'Lenguaje…', action: () => { activateTab(paneId, docId, false); pickLanguage(); } },
  ];
}

function paneMenuItems(paneId) {
  const pane = getPane(paneId);
  const items = [];
  if (pane?.active) {
    items.push({ title: docs.get(pane.active)?.rec.name || '' }, ...tabMenuItems(paneId, pane.active), 'sep');
  }
  items.push(
    { title: 'Panel' },
    { label: 'Dividir a la derecha', action: () => { setFocus(paneId); cmds.splitRight(); } },
    { label: 'Dividir abajo', action: () => { setFocus(paneId); cmds.splitDown(); } },
    { label: 'Cerrar todas las pestañas', disabled: !pane?.tabs.length, action: () => closeAllInPane(paneId) },
    { label: 'Cerrar panel', disabled: layout.panes.length < 2, action: () => closeAllInPane(paneId) },
  );
  return items;
}

const MENUS = {
  archivo: () => [
    { label: 'Nuevo', kbd: 'Alt+N', action: cmds.new },
    { label: 'Abrir…', kbd: 'Ctrl+O', action: cmds.open },
    { label: 'Abrir carpeta…', action: cmds.openFolder, disabled: !window.showDirectoryPicker },
    'sep',
    { label: 'Guardar', kbd: 'Ctrl+S', action: cmds.save, disabled: !activeDoc() },
    { label: 'Guardar como…', kbd: 'Ctrl+Shift+S', action: cmds.saveAs, disabled: !activeDoc() },
    { label: 'Guardar todo', action: cmds.saveAll },
    'sep',
    { label: 'Renombrar…', action: cmds.rename, disabled: !activeDoc() },
    { label: 'Cerrar pestaña', kbd: 'Alt+W', action: cmds.closeTab, disabled: !activeDoc() },
    { label: 'Cerrar todas', action: cmds.closeAll },
    installPrompt ? 'sep' : null,
    installPrompt ? { label: 'Instalar MultiPad en este dispositivo', action: cmds.install } : null,
  ],
  editar: () => [
    { label: 'Deshacer', kbd: 'Ctrl+Z', action: cmds.undo },
    { label: 'Rehacer', kbd: 'Ctrl+Y', action: cmds.redo },
    'sep',
    { label: 'Buscar y reemplazar', kbd: 'Ctrl+F', action: cmds.find },
    { label: 'Ir a línea…', kbd: 'Ctrl+G', action: cmds.gotoLine },
    'sep',
    { label: 'Comentar / descomentar', kbd: 'Ctrl+/', action: cmds.comment },
    { label: 'Duplicar línea', kbd: 'Shift+Alt+↓', action: cmds.duplicateLine },
    { label: 'Borrar línea', kbd: 'Ctrl+Shift+K', action: cmds.deleteLine },
    'sep',
    { label: 'MAYÚSCULAS', action: cmds.upper },
    { label: 'minúsculas', action: cmds.lower },
    { label: 'Ordenar líneas', action: cmds.sortLines },
    { label: 'Quitar espacios al final', action: cmds.trimTrailing },
  ],
  ver: () => [
    { label: 'Panel lateral', kbd: 'Ctrl+B', checked: !$('#sidebar').hidden, action: cmds.sidebar },
    'sep',
    { label: 'Dividir a la derecha', kbd: 'Ctrl+\\', action: cmds.splitRight },
    { label: 'Dividir abajo', action: cmds.splitDown },
    { label: 'Paneles en columna', checked: layout.dir === 'column', action: cmds.toggleDir, disabled: layout.panes.length < 2 },
    { label: 'Mover pestaña al otro panel', kbd: 'Alt+M', action: cmds.moveToOther, disabled: !activeDoc() },
    { label: 'Clonar pestaña en el otro panel', action: cmds.cloneToOther, disabled: !activeDoc() },
    { label: 'Cerrar panel', action: cmds.closePane, disabled: layout.panes.length < 2 },
    'sep',
    { label: 'Ajuste de línea', kbd: 'Alt+Z', checked: settings.wrap, action: cmds.wrap },
    { label: 'Mostrar espacios', checked: settings.whitespace, action: cmds.whitespace },
    { label: 'Autocompletar', checked: settings.autocomplete, action: cmds.autocomplete },
    { label: 'Teclas táctiles', checked: !$('#mobileKeys').hidden, action: cmds.mobileKeys },
    'sep',
    { label: 'Tema automático', checked: settings.theme === 'auto', action: () => cmds.theme('auto') },
    { label: 'Tema oscuro', checked: settings.theme === 'dark', action: () => cmds.theme('dark') },
    { label: 'Tema claro', checked: settings.theme === 'light', action: () => cmds.theme('light') },
    'sep',
    { label: 'Letra más grande', kbd: 'Ctrl+=', action: cmds.zoomIn },
    { label: 'Letra más chica', kbd: 'Ctrl+-', action: cmds.zoomOut },
    { label: `Tamaño normal (${DEFAULTS.fontSize}px)`, kbd: 'Ctrl+0', action: cmds.zoomReset },
    'sep',
    { label: 'Lenguaje…', action: cmds.language, disabled: !activeDoc() },
    { label: 'Tabulación…', action: cmds.tabSize },
  ],
  ventana: () => {
    const others = livePeers();
    return [
      { label: 'Ventana nueva', kbd: 'Alt+Shift+N', action: cmds.newWindow },
      { label: 'Ventana nueva en otra pantalla', action: cmds.otherScreen },
      { label: 'Enviar pestaña a otra ventana…', action: cmds.sendToWindow, disabled: !activeDoc() },
      { label: 'Reabrir ventana cerrada…', action: cmds.reopenWindow },
      'sep',
      { label: 'Renombrar esta ventana…', action: cmds.renameWindow },
      { label: 'Pantalla completa', kbd: 'F11', action: cmds.fullscreen, disabled: !document.documentElement.requestFullscreen },
      'sep',
      { title: `Abiertas: ${others.length + 1}` },
      { label: `${winName()} (esta)`, checked: true, disabled: true },
      ...others.map((p) => ({ label: p.name, disabled: true })),
    ];
  },
  ayuda: () => [
    { label: 'Atajos de teclado', action: cmds.shortcuts },
    { label: 'Acerca de MultiPad', action: cmds.about },
  ],
};

for (const btn of document.querySelectorAll('.menu-btn')) {
  const open = () => {
    const r = btn.getBoundingClientRect();
    showMenu(MENUS[btn.dataset.menu](), { x: r.left, y: r.bottom + 2 }, btn);
  };
  btn.addEventListener('click', () => (openMenuBtn === btn ? closeMenu() : open()));
  btn.addEventListener('pointerenter', (e) => { if (openMenuBtn && openMenuBtn !== btn && e.pointerType === 'mouse') open(); });
}

for (const btn of document.querySelectorAll('[data-cmd]')) {
  btn.addEventListener('click', () => cmds[btn.dataset.cmd]?.());
}
$('#btnSidebar').addEventListener('click', () => cmds.sidebar());
$('#winLabel').addEventListener('click', () => cmds.renameWindow());
$('#stLang').addEventListener('click', () => cmds.language());
$('#stEol').addEventListener('click', () => cmds.eol());
$('#stIndent').addEventListener('click', () => cmds.tabSize());

/* ------------------------------------------------------------------ teclado */

window.addEventListener('keydown', (e) => {
  if (!$('#modalLayer').hidden) return;
  const mod = e.ctrlKey || e.metaKey;
  const code = e.code;
  let handled = true;
  if (mod && !e.shiftKey && code === 'KeyS') cmds.save();
  else if (mod && e.shiftKey && code === 'KeyS') cmds.saveAs();
  else if (mod && code === 'KeyO') cmds.open();
  else if (e.altKey && e.shiftKey && code === 'KeyN') cmds.newWindow();
  else if ((e.altKey && code === 'KeyN') || (mod && !e.shiftKey && code === 'KeyN')) cmds.new();
  else if ((e.altKey && code === 'KeyW') || (mod && code === 'KeyW')) cmds.closeTab();
  else if (mod && code === 'Backslash') cmds.splitRight();
  else if (mod && code === 'KeyB') cmds.sidebar();
  else if (mod && code === 'KeyG') cmds.gotoLine();
  else if (mod && code === 'KeyH') cmds.find();
  else if (e.altKey && code === 'KeyM') cmds.moveToOther();
  else if (e.altKey && code === 'KeyZ') cmds.wrap();
  else if (mod && (code === 'Equal' || code === 'NumpadAdd')) cmds.zoomIn();
  else if (mod && (code === 'Minus' || code === 'NumpadSubtract')) cmds.zoomOut();
  else if (mod && (code === 'Digit0' || code === 'Numpad0')) cmds.zoomReset();
  else if (mod && code === 'Tab') cycleTab(e.shiftKey ? -1 : 1);
  else if (e.altKey && !mod && /^Digit[1-9]$/.test(code)) {
    const p = focusedPane();
    const id = p?.tabs[Number(code.slice(5)) - 1];
    if (id) activateTab(p.id, id);
  } else handled = false;
  if (handled) { e.preventDefault(); e.stopPropagation(); }
}, true);

function cycleTab(dir) {
  const p = focusedPane();
  if (!p || p.tabs.length < 2) return;
  const i = p.tabs.indexOf(p.active);
  activateTab(p.id, p.tabs[(i + dir + p.tabs.length) % p.tabs.length]);
}

/* ------------------------------------------------------------------ teclas táctiles */

$('#mobileKeys').addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
$('#mobileKeys').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  const v = activeView();
  if (!b || !v) return;
  if (b.dataset.ins) {
    const ins = b.dataset.ins;
    const pair = ins.length === 2;
    v.dispatch(v.state.changeByRange((r) => {
      if (pair && !r.empty) {
        const inner = v.state.sliceDoc(r.from, r.to);
        return { changes: { from: r.from, to: r.to, insert: ins[0] + inner + ins[1] }, range: CM.EditorSelection.range(r.from + 1, r.from + 1 + inner.length) };
      }
      return { changes: { from: r.from, to: r.to, insert: ins }, range: CM.EditorSelection.cursor(r.from + (pair ? 1 : ins.length)) };
    }));
  } else {
    const k = b.dataset.key;
    if (k === 'tab') {
      if (v.state.selection.ranges.some((r) => !r.empty)) CM.indentMore(v);
      else v.dispatch(v.state.replaceSelection(' '.repeat(settings.tabSize)));
    } else if (k === 'left') CM.cursorCharLeft(v);
    else if (k === 'right') CM.cursorCharRight(v);
    else if (k === 'up') CM.cursorLineUp(v);
    else if (k === 'down') CM.cursorLineDown(v);
    else if (k === 'undo') CM.undo(v);
    else if (k === 'redo') CM.redo(v);
    else if (k === 'find') CM.openSearchPanel(v);
  }
  if (b.dataset.key !== 'find') v.focus();
});

/* ------------------------------------------------------------------ barra de estado y título */

function updateTitle() {
  const d = activeDoc();
  document.title = d ? `${d.dirty ? '● ' : ''}${d.rec.name} — MultiPad · ${winName()}` : `MultiPad · ${winName()}`;
}

function updateStatus() {
  const v = activeView();
  const d = activeDoc();
  $('#stIndent').textContent = `Espacios: ${settings.tabSize}`;
  if (!v || !d) {
    $('#stPos').textContent = '—';
    $('#stSel').textContent = '';
    $('#stLang').textContent = '';
    $('#stEol').textContent = '';
    updateTitle();
    return;
  }
  const { state } = v;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  $('#stPos').textContent = `Ln ${line.number}, Col ${head - line.from + 1}`;
  const selected = state.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0);
  const cursors = state.selection.ranges.length;
  $('#stSel').textContent = (selected ? `Sel: ${selected}` : `${state.doc.lines} líneas`) + (cursors > 1 ? ` · ${cursors} cursores` : '');
  $('#stLang').textContent = langById(d.rec.lang).label;
  $('#stEol').textContent = d.rec.eol || 'LF';
  updateTitle();
}

/* ------------------------------------------------------------------ viewport en móviles */

function syncViewport() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--vvh', h + 'px');
}
window.visualViewport?.addEventListener('resize', syncViewport);
window.addEventListener('resize', () => {
  syncViewport();
  $('#panes').classList.toggle('column', currentDir() === 'column');
});

/* ------------------------------------------------------------------ service worker */

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let iClickedUpdate = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Hay una versión nueva de MultiPad.', {
            action: 'Actualizar',
            onAction: () => { iClickedUpdate = true; flushAll(); nw.postMessage('skip-waiting'); },
          });
        }
      });
    });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // primera instalación, no es una actualización
    if (iClickedUpdate) setTimeout(() => location.reload(), 300);
    else toast('MultiPad se actualizó. Recarga esta ventana cuando puedas.', { action: 'Recargar', onAction: () => location.reload() });
  });
}

/* ------------------------------------------------------------------ inicio */

const WELCOME = `# Bienvenido a MultiPad

Editor de código que funciona en computadora, tablet y celular.

## Paneles y ventanas
- Divide la ventana con el botón de dos columnas (o Ctrl+\\). Hasta 4 paneles.
- Arrastra una pestaña a otro panel, o usa el menú de la pestaña (clic derecho; en pantallas táctiles, mantén presionado o toca ⋮).
- "Ventana nueva" abre otra ventana de MultiPad con su propio contenido.
- "Ventana nueva en otra pantalla" la abre directamente en tu segundo monitor (Chrome/Edge).
- Un mismo archivo abierto en dos ventanas se sincroniza mientras escribes.
- Puedes arrastrar una pestaña de una ventana a otra.

## Archivos
- Ctrl+O abre archivos. En Chrome/Edge de escritorio, Ctrl+S guarda directo en el archivo original.
- En iPhone, iPad y Firefox, "Guardar" descarga el archivo o abre el menú Compartir.
- Todo lo que escribes queda guardado en este navegador aunque cierres la pestaña.
  Lo encuentras en el panel lateral (Ctrl+B), sección "Documentos del espacio".

## Atajos
Menú Ayuda → Atajos de teclado.

Puedes cerrar este documento cuando quieras.
`;

async function start() {
  await claimWindowId();
  ensureWindowName();

  try { layout = JSON.parse(localStorage.getItem(layoutKey()) || 'null'); } catch { layout = null; }
  if (!layout || !Array.isArray(layout.panes) || !layout.panes.length) {
    layout = { dir: 'row', panes: [newPane()], focused: null, sidebar: false };
  }
  // Se descartan pestañas cuyos documentos ya no existen.
  for (const pane of layout.panes) {
    const ok = [];
    for (const id of pane.tabs) if (await loadDoc(id)) ok.push(id);
    pane.tabs = ok;
    if (!ok.includes(pane.active)) pane.active = ok[0] || null;
  }
  if (layout.panes.length > 1) layout.panes = layout.panes.filter((p, i) => p.tabs.length || i === 0);
  if (!getPane(layout.focused)) layout.focused = layout.panes[0].id;

  try { folders = (await db.get('folders')) || []; } catch { folders = []; }

  syncViewport();
  applySettings();
  renderWinLabel();
  renderPanes();
  if (layout.sidebar) toggleSidebar(true);

  const params = new URLSearchParams(location.search);
  const docParam = params.get('doc');
  if (docParam) {
    await showDoc(docParam);
    const url = new URL(location.href);
    url.searchParams.delete('doc');
    history.replaceState(null, '', url);
  }

  if (WID === 'main' && !(await db.get('initialized'))) {
    await db.set('initialized', true);
    const rec = await createDoc({ name: 'Bienvenida.md', content: WELCOME, savedContent: WELCOME });
    await openDocInPane(rec.id);
  }

  // Archivos abiertos desde el sistema operativo con la app instalada ("Abrir con…").
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      for (const h of params.files || []) await openHandle(h);
    });
  }

  announce();
  setInterval(() => { announce(); livePeers(); }, 4000);
  updateStatus();
  saveLayout();
  registerSW();

  const v = activeView();
  if (v && !isTouch()) v.focus();
}

window.addEventListener('pagehide', () => {
  flushAll();
  localStorage.setItem(layoutKey(), JSON.stringify({ ...layout, saved: Date.now() }));
  bc.postMessage({ type: 'bye', wid: WID, from: WID });
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });

start().catch((err) => {
  console.error(err);
  toast('Error al iniciar: ' + err.message, { timeout: 15000 });
});
