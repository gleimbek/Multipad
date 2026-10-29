// Multipad: editor de código con pestañas, paneles, varias ventanas sincronizadas y panel de ejecución.
import * as CM from '../vendor/codemirror.js';
import { db } from './db.js';
import { LANGS, langById, langExtension, detectLang } from './langs.js';
import { t, getLang, setLang, applyI18n, detectBrowserLang } from './i18n.js';
import { $, el, icon, uid, debounce, toast, openModal, promptModal, confirmModal, pickModal, infoModal } from './util.js';
import { createRunner, runKind } from './runner.js';

const TAB_MIME = 'application/x-multipad-tab';
const isTouch = () => matchMedia('(pointer: coarse)').matches;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const UNTITLED_RE = /^(nuevo|new) \d+$/;

const langLabel = (id) => (id === 'text' ? t('lang.text') : langById(id).label);

// Insignia de color por tipo de archivo (pestañas, lista de documentos y carpetas).
const BADGES = {
  html: ['<>', '#e8562a'], css: ['#', '#2f7bff'], javascript: ['JS', '#f4c430', '#1b1b1b'], jsx: ['JSX', '#f4c430', '#1b1b1b'],
  typescript: ['TS', '#3178c6'], tsx: ['TSX', '#3178c6'], json: ['{}', '#8a63ff'], php: ['php', '#7a86b8'],
  python: ['Py', '#3572a5'], java: ['J', '#e76f00'], kotlin: ['K', '#a97bff'], csharp: ['C#', '#68217a'],
  cpp: ['C', '#00599c'], rust: ['Rs', '#b7410e'], go: ['Go', '#00add8'], ruby: ['Rb', '#cc342d'], sql: ['SQL', '#0f8b8d'],
  markdown: ['M', '#4a9eff'], xml: ['<>', '#f08d24'], yaml: ['Y', '#cb171e'], shell: ['$', '#4eaa25'], powershell: ['PS', '#2671be'],
  text: ['≡', '#5b6680'],
};
function fileBadge(lang, name = '') {
  let [label, bg, fg = '#fff'] = BADGES[lang] || BADGES.text;
  if (lang === 'cpp' && /\.(cpp|hpp|cc|cxx)$/i.test(name)) label = 'C++';
  if (lang === 'xml' && /\.svg$/i.test(name)) { label = 'SVG'; bg = '#ff9a00'; }
  return el('span', { class: 'fi' + (label.length > 2 ? ' wide' : ''), style: `--fi-bg:${bg};--fi-fg:${fg}`, 'aria-hidden': 'true', text: label });
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
const DEFAULTS = {
  theme: 'auto', fontSize: 14, wrap: window.innerWidth < 700, tabSize: 4, whitespace: false, autocomplete: true, mobileKeys: 'auto',
  uiLang: detectBrowserLang(), judgeUrl: 'https://ce.judge0.com', judgeKey: '',
};
const settings = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
setLang(settings.uiLang);

const bc = new BroadcastChannel('multipad');

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
  phrases: new CM.Compartment(),
};

// Textos internos de CodeMirror (buscar, reemplazar, ir a línea).
const cmPhrases = () => (getLang() === 'es' ? CM.EditorState.phrases.of({
  'Find': 'Buscar', 'Replace': 'Reemplazar', 'next': 'siguiente', 'previous': 'anterior', 'all': 'todos',
  'match case': 'mayús/minús', 'by word': 'palabra completa', 'regexp': 'expresión regular', 'replace': 'reemplazar',
  'replace all': 'reemplazar todo', 'close': 'cerrar', 'Go to line': 'Ir a línea', 'go': 'ir',
  'current match': 'coincidencia actual', 'on line': 'en la línea', 'replaced match on line $': 'reemplazada en la línea $',
  'replaced $ matches': '$ reemplazos', 'Folded lines': 'Líneas plegadas', 'Unfolded lines': 'Líneas desplegadas',
  'Fold line': 'Plegar línea', 'Unfold line': 'Desplegar línea', 'folded code': 'código plegado', 'unfold': 'desplegar',
}) : []);

const themeExt = () => (resolvedTheme() === 'dark' ? CM.oneDark : []);
const wrapExt = () => (settings.wrap ? CM.EditorView.lineWrapping : []);
const tabExt = () => [CM.indentUnit.of(' '.repeat(settings.tabSize)), CM.EditorState.tabSize.of(settings.tabSize)];
const wsExt = () => (settings.whitespace ? [CM.highlightWhitespace(), CM.highlightTrailingWhitespace()] : []);
const acExt = () => (settings.autocomplete ? CM.autocompletion() : []);

let lastAppliedLang = null;
let lastAppliedTheme = null;

function applySettings() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--editor-font', settings.fontSize + 'px');
  $('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#0b1020' : '#f7f8fc');
  const langChanged = lastAppliedLang !== settings.uiLang;
  if (langChanged) {
    setLang(settings.uiLang);
    document.documentElement.lang = getLang();
    applyI18n(document);
  }
  for (const v of allViews()) {
    v.dispatch({
      effects: [
        comp.theme.reconfigure(themeExt()),
        comp.wrap.reconfigure(wrapExt()),
        comp.tab.reconfigure(tabExt()),
        comp.ws.reconfigure(wsExt()),
        comp.ac.reconfigure(acExt()),
        comp.phrases.reconfigure(cmPhrases()),
      ],
    });
    v.requestMeasure();
  }
  const showKeys = settings.mobileKeys === 'on' || (settings.mobileKeys === 'auto' && isTouch());
  $('#mobileKeys').hidden = !showKeys;
  $('#btnUiLang').textContent = getLang().toUpperCase();
  if (langChanged && layout) { renderPanes(); renderWinLabel(); refreshDocList(); renderTree(); }
  if (lastAppliedTheme && lastAppliedTheme !== theme) runner?.rethemeIfNeeded();
  lastAppliedLang = settings.uiLang;
  lastAppliedTheme = theme;
  updateStatus();
}

/* ------------------------------------------------------------------ identidad de la ventana */

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
    reg[WID] = { n };
    localStorage.setItem(REG_KEY, JSON.stringify(reg));
  }
}

// Las ventanas sin nombre propio se llaman "Ventana N" / "Window N" según el idioma.
function winName(wid = WID) {
  const r = registry()[wid];
  if (!r) return t('win.generic');
  const custom = r.name && !/^(Ventana|Window) \d+$/.test(r.name) ? r.name : null;
  return custom || t('win.default', { n: r.n || 1 });
}

function renderWinLabel() {
  $('#winLabel').textContent = winName();
  updateTitle();
}

async function renameWindow() {
  const name = await promptModal({ title: t('win.renameTitle'), value: winName(), text: t('win.renameText') });
  if (!name) return;
  const reg = registry();
  reg[WID] = { ...(reg[WID] || {}), name };
  localStorage.setItem(REG_KEY, JSON.stringify(reg));
  renderWinLabel();
  announce();
}

/* ------------------------------------------------------------------ ventanas vivas */

const peers = new Map(); // wid -> {seen}

function announce(reply = false) {
  bc.postMessage({ type: 'hello', wid: WID, reply });
}

function livePeers() {
  const now = Date.now();
  for (const [wid, p] of peers) if (now - p.seen > 12000) peers.delete(wid);
  return [...peers.keys()].map((wid) => ({ wid, name: winName(wid) }));
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
let runner = null;
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
const hostOf = new WeakMap(); // vista -> div contenedor
const paneOfView = new WeakMap(); // vista -> id del panel
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
    toast(t('err.localSave', { msg: err.message }));
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
  document.querySelectorAll(`.tab[data-doc="${d.rec.id}"]`).forEach((tab) => tab.classList.toggle('dirty', dirty));
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
  const base = t('doc.untitled');
  const names = new Set(all.map((r) => r.name));
  let n = 1;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

// Documentos con su texto actual (el de la vista si está abierto), para el panel de ejecución.
async function allDocTexts() {
  const all = await db.allDocs();
  return all.map((r) => {
    const live = docs.get(r.id);
    return { id: r.id, name: live?.rec.name || r.name, lang: live?.rec.lang || r.lang, text: live ? getText(live) : r.content };
  });
}

async function docTextById(id) {
  const live = docs.get(id);
  if (live) return { id, name: live.rec.name, lang: live.rec.lang, text: getText(live) };
  const r = await db.getDoc(id);
  return r ? { id, name: r.name, lang: r.lang, text: r.content } : null;
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
        comp.phrases.of(cmPhrases()),
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
    if (local) {
      schedulePersist(d);
      runner?.onDocChanged(d.rec.id, d.rec.lang);
    }
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
  const menuBtn = el('button', { class: 'icon-btn small', 'data-i18n-title': 'pane.options', 'data-i18n-aria-label': 'pane.options', title: t('pane.options'), 'aria-label': t('pane.options') },
    icon('M12 5.5v.01 M12 12v.01 M12 18.5v.01'));
  menuBtn.addEventListener('click', () => {
    const r = menuBtn.getBoundingClientRect();
    showMenu(paneMenuItems(paneId), { x: r.right - 240, y: r.bottom + 4 });
  });
  const editors = el('div', { class: 'editors' });
  const logo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  logo.setAttribute('class', 'empty-logo');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#mpLogo');
  logo.append(use);
  const empty = el('div', { class: 'empty-pane' },
    logo,
    el('div', { class: 'empty-title' }, 'Multi', el('b', { text: 'pad' })),
    el('div', { class: 'empty-tag', 'data-i18n': 'pane.tagline', text: t('pane.tagline') }),
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', 'data-i18n': 'cmd.new', text: t('cmd.new'), onclick: () => { setFocus(paneId); cmds.new(); } }),
      el('button', { class: 'btn', 'data-i18n': 'cmd.openShort', text: t('cmd.openShort'), onclick: () => { setFocus(paneId); cmds.open(); } }),
      el('button', { class: 'btn', 'data-i18n': 'pane.documents', text: t('pane.documents'), onclick: () => { setFocus(paneId); toggleSidebar(true); } })),
    el('div', { 'data-i18n': isTouch() ? 'pane.hintTouch' : 'pane.hintMouse', text: t(isTouch() ? 'pane.hintTouch' : 'pane.hintMouse') }));
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
  const close = el('button', { class: 'x', title: t('tab.close'), 'aria-label': t('tab.close'), draggable: 'false' }, el('span', { text: '×' }));
  close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(paneId, id); });
  const tab = el('div', {
    class: 'tab' + (pane.active === id ? ' active' : '') + (d.dirty ? ' dirty' : ''),
    role: 'tab',
    draggable: 'true',
    title: `${d.rec.name} · ${langLabel(d.rec.lang)}${d.rec.handle ? '' : ' · ' + t('tab.noFile')}`,
    dataset: { doc: id },
  }, fileBadge(d.rec.lang, d.rec.name), el('span', { class: 'label', text: d.rec.name }), close);

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
  if (!d || !pane) { toast(t('err.docGone')); return false; }
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
  const wasEmptyUntitled = d && !d.rec.handle && getText(d) === '' && UNTITLED_RE.test(d.rec.name);
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
    toast(t('err.maxPanes'));
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
    tabsEl.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before'));
    editorsEl.classList.remove('drop-target');
  };
  const indexAt = (e) => {
    const tabs = [...tabsEl.querySelectorAll('.tab')];
    const i = tabs.findIndex((x) => {
      const r = x.getBoundingClientRect();
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
  for (const target of [tabsEl, editorsEl]) {
    target.addEventListener('dragleave', (e) => { if (!target.contains(e.relatedTarget)) clearMarks(); });
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
    const ok = await confirmModal({ title: t('file.bigTitle'), text: t('file.bigText', { name: file.name, mb: (file.size / 1048576).toFixed(1) }), buttons: [t('ui.cancel'), t('file.openAnyway')] });
    if (!ok) return;
  }
  const text = await file.text();
  if (/\u0000/.test(text.slice(0, 4000))) {
    toast(t('file.binary', { name: file.name }));
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
        toast(t('file.saved', { name: d.rec.name }), { timeout: 1800 });
        return true;
      }
    } catch (err) {
      toast(t('file.writeFail', { name: d.rec.name, msg: err.message }));
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
  toast(t('file.downloaded', { name: d.rec.name }), { timeout: 2500 });
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
  toast(pending ? t('file.saveAllPartial', { saved, pending }) : t('file.saveAllDone', { saved }));
}

async function newDoc(paneId, lang) {
  const rec = await createDoc({ name: await nextUntitledName(), lang });
  await openDocInPane(rec.id, paneId || focusedPane().id);
}

async function renameDoc(d) {
  if (!d) return;
  const name = await promptModal({ title: t('doc.renameTitle'), value: d.rec.name, okLabel: t('doc.renameOk') });
  if (!name || name === d.rec.name) return;
  if (d.rec.handle) {
    if (d.rec.handle.move) {
      try {
        await verifyPermission(d.rec.handle, true);
        await d.rec.handle.move(name);
      } catch (err) {
        toast(t('doc.renameDiskFail', { msg: err.message }));
      }
    } else {
      toast(t('doc.renameTabOnly'));
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
  rerenderTabsFor(d.rec.id);
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
    toast(t('folder.unsupported'));
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
  if (!root || $('#sidebar').hidden) return;
  root.textContent = '';
  if (!folders.length) {
    root.append(el('div', { class: 'tree-empty', text: window.showDirectoryPicker ? t('folder.none') : t('folder.needChrome') }));
    return;
  }
  for (const f of folders) {
    const remove = el('button', { class: 'icon-btn small', title: t('folder.remove'), 'aria-label': t('folder.remove') }, icon('M6 6l12 12 M18 6L6 18'));
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
        if (!(await verifyPermission(f.handle, false).catch(() => false))) { toast(t('folder.noPermission')); return; }
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
        box.append(el('div', { class: 'tree-item file', style: 'padding-left:28px', text: t('folder.tapToAllow') }));
        expanded.delete(f.id);
      });
    }
  }
}

async function renderDir(dirHandle, container, depth, key) {
  if ((await dirHandle.queryPermission?.({ mode: 'read' })) === 'prompt') throw new Error('permission');
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
      const node = el('div', { class: 'tree-item file', style: pad, title: name }, el('span', { class: 'caret' }), fileBadge(detectLang(name), name), el('span', { text: name }));
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
    list.append(el('div', { class: 'tree-empty', text: t('docs.none') }));
    return;
  }
  for (const r of all) {
    const live = docs.get(r.id);
    const content = live ? getText(live) : r.content;
    const dirty = content !== (r.savedContent ?? '');
    const del = el('button', { class: 'del', title: t('docs.remove'), 'aria-label': t('docs.remove') }, '×');
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteFromWorkspace(r.id, r.name, dirty); });
    const item = el('div', { class: 'doc-item', title: r.name + (r.handle ? '' : ' · ' + t('docs.onlyWorkspace')) },
      fileBadge(r.lang, r.name),
      el('span', { class: 'name' }, dirty ? el('span', { class: 'dirty-mark', text: '● ' }) : null, r.name),
      el('span', { class: 'open-dot' + (isOpenAnywhere(r.id) ? '' : ' off') }),
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
    title: t('docs.removeTitle', { name }),
    text: dirty ? t('docs.removeDirty') : t('docs.removeClean'),
    buttons: [t('ui.cancel'), t('docs.removeOk')],
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
  syncActivity();
}

/* ------------------------------------------------------------------ varias ventanas y pantallas */

function openPopup(url, name) {
  const w = Math.min(1200, screen.availWidth - 40);
  const h = Math.min(850, screen.availHeight - 40);
  const win = window.open(url, name, `popup,width=${w},height=${h},left=${(window.screenX || 0) + 40},top=${(window.screenY || 0) + 40}`);
  if (!win) toast(t('win.blocked'));
  return win;
}

// La ventana se abre primero (mientras el clic todavía cuenta) y después se mueve a la otra pantalla.
async function moveToOtherScreen(win) {
  if (!('getScreenDetails' in window)) {
    toast(t('win.noScreenApi'));
    return;
  }
  try {
    const details = await window.getScreenDetails();
    const target = details.screens.find((s) => s !== details.currentScreen);
    if (!target) { toast(t('win.oneScreen')); return; }
    win.moveTo(target.availLeft, target.availTop);
    win.resizeTo(target.availWidth, target.availHeight);
  } catch {
    toast(t('win.noScreenPermission'));
  }
}

async function openWindowUrl(url, name, otherScreen) {
  const win = openPopup(url, name);
  if (win && otherScreen) await moveToOtherScreen(win);
  return win;
}

function editorWindowUrl(docId) {
  const wid = 'w' + uid();
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('w', wid);
  if (docId) url.searchParams.set('doc', docId);
  return { url: url.toString(), wid };
}

function newWindow({ docId = null } = {}) {
  const { url, wid } = editorWindowUrl(docId);
  return openPopup(url, wid);
}

async function newWindowOnOtherScreen({ docId = null } = {}) {
  const { url, wid } = editorWindowUrl(docId);
  return openWindowUrl(url, wid, true);
}

async function sendTabToWindow(paneId, docId) {
  const others = livePeers();
  const items = [
    ...others.map((p) => ({ label: p.name, hint: t('win.open'), value: { wid: p.wid } })),
    { label: t('cmd.newWindow'), value: { new: true } },
    { label: t('cmd.otherScreen'), value: { screen: true } },
  ];
  const choice = await pickModal({ title: t('win.sendTitle'), items });
  if (!choice) return;
  await flushAll();
  if (choice.wid) {
    bc.postMessage({ type: 'open-doc', target: choice.wid, docId, from: WID });
    closeTab(paneId, docId);
    toast(t('win.sent', { name: winName(choice.wid) }), { timeout: 2000 });
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
    items.push({ label: winName(wid), hint: t('win.tabCount', { n: count }), value: wid, saved: l?.saved || 0 });
  }
  items.sort((a, b) => b.saved - a.saved);
  if (!items.length) { toast(t('win.noneClosed')); return; }
  const wid = await pickModal({ title: t('win.reopenTitle'), items });
  if (!wid) return;
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('w', wid);
  openPopup(url.toString(), wid);
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
        peers.set(m.wid, { seen: Date.now() });
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
        // Se desincronizó (escritura simultánea en dos ventanas): se recarga del almacenamiento.
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
      runner?.onDocChanged(d.rec.id, d.rec.lang);
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
        toast(t('win.received', { name: winName(m.from) }), { timeout: 2000 });
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

// Dónde se ejecuta cada lenguaje, para la tabla de Ayuda y el menú Lenguaje.
function runWhere(lang) {
  const sample = langById(lang).ext[0] || '';
  const kind = runKind(lang, 'x.' + sample);
  if (lang === 'xml') return t('where.svg');
  return {
    web: t('where.web'), markdown: t('where.markdown'), js: t('where.js'), python: t('where.python'),
    sql: t('where.sql'), json: t('where.json'), remote: t('where.remote'),
  }[kind] || t('where.none');
}

async function pickLanguage() {
  const d = activeDoc();
  if (!d) { toast(t('lang.needDoc')); return; }
  const lang = await pickModal({
    title: t('lang.pickTitle', { name: d.rec.name }),
    items: LANGS.map((l) => ({ label: langLabel(l.id), hint: l.ext.slice(0, 3).map((x) => '.' + x).join(' '), value: l.id, current: l.id === d.rec.lang })),
  });
  if (lang) setDocLang(d, lang);
}

function showLanguagesTable() {
  const rows = LANGS.map((l) => el('tr', {},
    el('td', { text: langLabel(l.id) }),
    el('td', { class: 'mono', text: l.ext.slice(0, 4).map((x) => '.' + x).join(' ') }),
    el('td', { text: runWhere(l.id) })));
  infoModal(t('lang.tableTitle'),
    el('p', { text: t('lang.tableIntro') }),
    el('div', { class: 'table-wrap' }, el('table', { class: 'info-table' },
      el('thead', {}, el('tr', {}, el('th', { text: t('lang.colLang') }), el('th', { text: t('lang.colExt') }), el('th', { text: t('lang.colRun') }))),
      el('tbody', {}, rows))),
    el('p', { text: t('lang.tableNote') }));
}

async function pickTabSize() {
  const size = await pickModal({ title: t('tabsize.title'), items: [2, 4, 8].map((n) => ({ label: t('tabsize.n', { n }), value: n, current: n === settings.tabSize })) });
  if (size) { settings.tabSize = size; saveSettings(); }
}

function toggleEol() {
  const d = activeDoc();
  if (!d) return;
  d.rec.eol = d.rec.eol === 'CRLF' ? 'LF' : 'CRLF';
  persist(d);
  broadcastMeta(d, ['eol']);
  updateStatus();
  toast(t('eol.changed', { eol: d.rec.eol }), { timeout: 2200 });
}

function zoom(delta) {
  settings.fontSize = delta === 0 ? DEFAULTS.fontSize : Math.max(9, Math.min(32, settings.fontSize + delta));
  saveSettings();
}

function setUiLang(lang) {
  settings.uiLang = lang;
  saveSettings();
}

async function configureServer() {
  const form = el('form', { class: 'modal wide' });
  const urlInput = el('input', { type: 'text', value: settings.judgeUrl, placeholder: 'https://ce.judge0.com', spellcheck: 'false', autocomplete: 'off' });
  const keyInput = el('input', { type: 'text', value: settings.judgeKey, placeholder: t('server.keyPlaceholder'), spellcheck: 'false', autocomplete: 'off' });
  let close;
  form.append(
    el('h2', { text: t('server.title') }),
    el('p', { text: t('server.intro') }),
    el('label', { class: 'field-label', text: t('server.url') }), urlInput,
    el('label', { class: 'field-label', text: t('server.key') }), keyInput,
    el('p', { class: 'small', text: t('server.note') }),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'btn', text: t('server.reset'), onclick: () => { urlInput.value = DEFAULTS.judgeUrl; keyInput.value = ''; } }),
      el('button', { type: 'button', class: 'btn', text: t('ui.cancel'), onclick: () => close() }),
      el('button', { type: 'submit', class: 'btn primary', text: t('ui.save') })));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    settings.judgeUrl = urlInput.value.trim();
    settings.judgeKey = keyInput.value.trim();
    saveSettings();
    close();
    toast(t('server.saved'), { timeout: 2000 });
  });
  form.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  close = openModal(form);
  urlInput.focus();
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

function showShortcuts() {
  const rows = [
    ['sc.new', 'Alt+N'], ['sc.open', 'Ctrl+O'], ['sc.save', 'Ctrl+S / Ctrl+Shift+S'],
    ['sc.close', 'Alt+W'], ['sc.nextTab', 'Ctrl+Tab / Ctrl+Shift+Tab'], ['sc.tabN', 'Alt+1 … Alt+9'],
    ['sc.run', 'F5 / Ctrl+Enter'], ['sc.stop', 'Shift+F5'], ['sc.runPanel', 'Ctrl+Shift+P'],
    ['sc.find', 'Ctrl+F / Ctrl+H'], ['sc.goto', 'Ctrl+G'], ['sc.comment', 'Ctrl+/'],
    ['sc.dupLine', 'Shift+Alt+↓'], ['sc.moveLine', 'Alt+↑ / Alt+↓'], ['sc.multi', 'Ctrl+D'],
    ['sc.split', 'Ctrl+\\'], ['sc.moveTab', 'Alt+M'], ['sc.newWindow', 'Alt+Shift+N'],
    ['sc.sidebar', 'Ctrl+B'], ['sc.zoom', 'Ctrl+= / Ctrl+- / Ctrl+0'], ['sc.wrap', 'Alt+Z'], ['sc.language', 'Alt+L'],
  ];
  infoModal(t('sc.title'),
    el('p', { text: t('sc.intro') }),
    el('div', { class: 'pick-list' }, rows.map(([k, b]) => el('div', { class: 'pick-item' }, el('span', { text: t(k) }), el('span', { class: 'hint', text: b })))));
}

function showAbout() {
  infoModal('Multipad', el('p', { text: t('about.text') }), el('p', { text: t('about.credits') }));
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
  upper: () => transformSelection((s) => s.toUpperCase()),
  lower: () => transformSelection((s) => s.toLowerCase()),
  sortLines: () => linesOperation((lines) => [...lines].sort((a, b) => a.localeCompare(b))),
  trimTrailing: () => linesOperation((lines) => lines.map((l) => l.replace(/[ \t]+$/, ''))),
  language: () => pickLanguage(),
  languagesTable: () => showLanguagesTable(),
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
  theme: (th) => { settings.theme = th; saveSettings(); },
  zoomIn: () => zoom(1),
  zoomOut: () => zoom(-1),
  zoomReset: () => zoom(0),
  uiLang: () => setUiLang(getLang() === 'es' ? 'en' : 'es'),
  run: () => runner.run(),
  stop: () => runner.stop(),
  runPanel: () => runner.toggle(),
  previewWindow: () => runner.popout(false),
  previewScreen: () => runner.popout(true),
  runAuto: () => { const st = layout.run; st.auto = !st.auto; saveLayout(); runner.layout(); },
  server: () => configureServer(),
  install: async () => { if (installPrompt) { installPrompt.prompt(); installPrompt = null; } },
  shortcuts: () => showShortcuts(),
  about: () => showAbout(),
};

/* ------------------------------------------------------------------ definición de menús */

function tabMenuItems(paneId, docId) {
  const d = docs.get(docId);
  return [
    { label: t('tab.close'), kbd: 'Alt+W', action: () => closeTab(paneId, docId) },
    { label: t('tab.closeOthers'), action: () => closeOthers(paneId, docId) },
    'sep',
    { label: t('tab.moveOther'), kbd: 'Alt+M', action: () => moveToOtherPane(paneId, docId) },
    { label: t('tab.cloneOther'), action: () => cloneToOtherPane(paneId, docId) },
    'sep',
    { label: t('tab.sendWindow'), action: () => sendTabToWindow(paneId, docId) },
    { label: t('tab.newWindow'), action: () => openTabInNewWindow(paneId, docId) },
    { label: t('tab.otherScreen'), action: () => openTabInNewWindow(paneId, docId, true) },
    'sep',
    { label: t('cmd.run'), kbd: 'F5', action: () => { activateTab(paneId, docId, false); runner.run(); } },
    { label: t('cmd.save'), action: () => saveDoc(d) },
    { label: t('cmd.rename'), action: () => renameDoc(d) },
    { label: t('cmd.languageOf', { lang: langLabel(d?.rec.lang || 'text') }), action: () => { activateTab(paneId, docId, false); pickLanguage(); } },
  ];
}

function paneMenuItems(paneId) {
  const pane = getPane(paneId);
  const items = [];
  if (pane?.active) {
    items.push({ title: docs.get(pane.active)?.rec.name || '' }, ...tabMenuItems(paneId, pane.active), 'sep');
  }
  items.push(
    { title: t('pane.title') },
    { label: t('cmd.splitRight'), action: () => { setFocus(paneId); cmds.splitRight(); } },
    { label: t('cmd.splitDown'), action: () => { setFocus(paneId); cmds.splitDown(); } },
    { label: t('pane.closeAllTabs'), disabled: !pane?.tabs.length, action: () => closeAllInPane(paneId) },
    { label: t('cmd.closePane'), disabled: layout.panes.length < 2, action: () => closeAllInPane(paneId) },
  );
  return items;
}

const MENUS = {
  file: () => [
    { label: t('cmd.new'), kbd: 'Alt+N', action: cmds.new },
    { label: t('cmd.open'), kbd: 'Ctrl+O', action: cmds.open },
    { label: t('cmd.openFolder'), action: cmds.openFolder, disabled: !window.showDirectoryPicker },
    'sep',
    { label: t('cmd.save'), kbd: 'Ctrl+S', action: cmds.save, disabled: !activeDoc() },
    { label: t('cmd.saveAs'), kbd: 'Ctrl+Shift+S', action: cmds.saveAs, disabled: !activeDoc() },
    { label: t('cmd.saveAll'), action: cmds.saveAll },
    'sep',
    { label: t('cmd.rename'), action: cmds.rename, disabled: !activeDoc() },
    { label: t('cmd.closeTab'), kbd: 'Alt+W', action: cmds.closeTab, disabled: !activeDoc() },
    { label: t('cmd.closeAll'), action: cmds.closeAll },
    installPrompt ? 'sep' : null,
    installPrompt ? { label: t('cmd.install'), action: cmds.install } : null,
  ],
  edit: () => [
    { label: t('cmd.undo'), kbd: 'Ctrl+Z', action: cmds.undo },
    { label: t('cmd.redo'), kbd: 'Ctrl+Y', action: cmds.redo },
    'sep',
    { label: t('cmd.find'), kbd: 'Ctrl+F', action: cmds.find },
    { label: t('cmd.goto'), kbd: 'Ctrl+G', action: cmds.gotoLine },
    'sep',
    { label: t('cmd.comment'), kbd: 'Ctrl+/', action: cmds.comment },
    { label: t('cmd.dupLine'), kbd: 'Shift+Alt+↓', action: cmds.duplicateLine },
    { label: t('cmd.delLine'), kbd: 'Ctrl+Shift+K', action: cmds.deleteLine },
    'sep',
    { label: t('cmd.upper'), action: cmds.upper },
    { label: t('cmd.lower'), action: cmds.lower },
    { label: t('cmd.sortLines'), action: cmds.sortLines },
    { label: t('cmd.trim'), action: cmds.trimTrailing },
  ],
  view: () => [
    { label: t('cmd.sidebar'), kbd: 'Ctrl+B', checked: !$('#sidebar').hidden, action: cmds.sidebar },
    { label: t('cmd.runPanel'), kbd: 'Ctrl+Shift+P', checked: runner.isOpen(), action: cmds.runPanel },
    'sep',
    { label: t('cmd.splitRight'), kbd: 'Ctrl+\\', action: cmds.splitRight },
    { label: t('cmd.splitDown'), action: cmds.splitDown },
    { label: t('cmd.columnPanes'), checked: layout.dir === 'column', action: cmds.toggleDir, disabled: layout.panes.length < 2 },
    { label: t('cmd.moveOther'), kbd: 'Alt+M', action: cmds.moveToOther, disabled: !activeDoc() },
    { label: t('cmd.cloneOther'), action: cmds.cloneToOther, disabled: !activeDoc() },
    { label: t('cmd.closePane'), action: cmds.closePane, disabled: layout.panes.length < 2 },
    'sep',
    { label: t('cmd.wrap'), kbd: 'Alt+Z', checked: settings.wrap, action: cmds.wrap },
    { label: t('cmd.whitespace'), checked: settings.whitespace, action: cmds.whitespace },
    { label: t('cmd.autocomplete'), checked: settings.autocomplete, action: cmds.autocomplete },
    { label: t('cmd.mobileKeys'), checked: !$('#mobileKeys').hidden, action: cmds.mobileKeys },
    { label: t('cmd.tabSize'), action: cmds.tabSize },
    'sep',
    { label: t('cmd.themeAuto'), checked: settings.theme === 'auto', action: () => cmds.theme('auto') },
    { label: t('cmd.themeDark'), checked: settings.theme === 'dark', action: () => cmds.theme('dark') },
    { label: t('cmd.themeLight'), checked: settings.theme === 'light', action: () => cmds.theme('light') },
    'sep',
    { label: t('cmd.zoomIn'), kbd: 'Ctrl+=', action: cmds.zoomIn },
    { label: t('cmd.zoomOut'), kbd: 'Ctrl+-', action: cmds.zoomOut },
    { label: t('cmd.zoomReset', { n: DEFAULTS.fontSize }), kbd: 'Ctrl+0', action: cmds.zoomReset },
    'sep',
    { title: t('cmd.uiLanguage') },
    { label: 'Español', checked: getLang() === 'es', action: () => setUiLang('es') },
    { label: 'English', checked: getLang() === 'en', action: () => setUiLang('en') },
  ],
  // Igual que en Notepad++: la lista completa, con el lenguaje del documento activo marcado.
  language: () => {
    const d = activeDoc();
    return [
      { title: d ? t('lang.menuTitle', { name: d.rec.name }) : t('lang.menuTitleNone') },
      ...LANGS.map((l) => ({
        label: langLabel(l.id),
        kbd: runKind(l.id, 'x.' + (l.ext[0] || '')) ? '▶' : '',
        checked: d?.rec.lang === l.id,
        disabled: !d,
        action: () => setDocLang(d, l.id),
      })),
      'sep',
      { label: t('lang.whatRuns'), action: cmds.languagesTable },
    ];
  },
  run: () => [
    { label: t('cmd.run'), kbd: 'F5', action: cmds.run, disabled: !activeDoc() },
    { label: t('cmd.stop'), kbd: 'Shift+F5', action: cmds.stop },
    'sep',
    { label: t('cmd.runPanel'), kbd: 'Ctrl+Shift+P', checked: runner.isOpen(), action: cmds.runPanel },
    { label: t('cmd.runAuto'), checked: !!layout.run.auto, action: cmds.runAuto },
    { label: t('cmd.previewWindow'), action: cmds.previewWindow },
    { label: t('cmd.previewScreen'), action: cmds.previewScreen },
    'sep',
    { label: t('cmd.server'), action: cmds.server },
    { label: t('lang.whatRuns'), action: cmds.languagesTable },
  ],
  window: () => {
    const others = livePeers();
    return [
      { label: t('cmd.newWindow'), kbd: 'Alt+Shift+N', action: cmds.newWindow },
      { label: t('cmd.otherScreen'), action: cmds.otherScreen },
      { label: t('cmd.sendWindow'), action: cmds.sendToWindow, disabled: !activeDoc() },
      { label: t('cmd.reopenWindow'), action: cmds.reopenWindow },
      'sep',
      { label: t('cmd.renameWindow'), action: cmds.renameWindow },
      { label: t('cmd.fullscreen'), kbd: 'F11', action: cmds.fullscreen, disabled: !document.documentElement.requestFullscreen },
      'sep',
      { title: t('win.openCount', { n: others.length + 1 }) },
      { label: t('win.this', { name: winName() }), checked: true, disabled: true },
      ...others.map((p) => ({ label: p.name, disabled: true })),
    ];
  },
  help: () => [
    { label: t('lang.whatRuns'), action: cmds.languagesTable },
    { label: t('sc.title'), action: cmds.shortcuts },
    { label: t('about.menu'), action: cmds.about },
  ],
};

const MENU_ORDER = ['file', 'edit', 'view', 'language', 'run', 'window', 'help'];

function openTopMenu(btn) {
  const r = btn.getBoundingClientRect();
  showMenu(MENUS[btn.dataset.menu](), { x: r.left, y: r.bottom + 2 }, btn);
}

for (const btn of document.querySelectorAll('.menu-btn[data-menu]')) {
  btn.addEventListener('click', () => (openMenuBtn === btn ? closeMenu() : openTopMenu(btn)));
  btn.addEventListener('pointerenter', (e) => { if (openMenuBtn && openMenuBtn !== btn && e.pointerType === 'mouse') openTopMenu(btn); });
}

// En celulares los menús se agrupan en un solo botón.
$('#btnMenu').addEventListener('click', () => {
  const btn = $('#btnMenu');
  if (openMenuBtn === btn) { closeMenu(); return; }
  const r = btn.getBoundingClientRect();
  showMenu(MENU_ORDER.map((key) => ({
    label: t('menu.' + key) + '  ›',
    action: () => setTimeout(() => showMenu(MENUS[key](), { x: r.left, y: r.bottom + 2 }), 0),
  })), { x: r.left, y: r.bottom + 2 }, btn);
});

for (const btn of document.querySelectorAll('[data-cmd]')) {
  btn.addEventListener('click', () => cmds[btn.dataset.cmd]?.());
}
$('#btnSidebar').addEventListener('click', () => cmds.sidebar());
$('#actFiles').addEventListener('click', () => cmds.sidebar());
$('#actSearch').addEventListener('click', () => (activeView() ? cmds.find() : toast(t('lang.needDoc'))));
$('#actRun').addEventListener('click', () => cmds.runPanel());
$('#actSettings').addEventListener('click', () => {
  const r = $('#actSettings').getBoundingClientRect();
  showMenu([
    { title: t('set.title') },
    { label: t('cmd.themeAuto'), checked: settings.theme === 'auto', action: () => cmds.theme('auto') },
    { label: t('cmd.themeDark'), checked: settings.theme === 'dark', action: () => cmds.theme('dark') },
    { label: t('cmd.themeLight'), checked: settings.theme === 'light', action: () => cmds.theme('light') },
    'sep',
    { label: 'Español', checked: getLang() === 'es', action: () => setUiLang('es') },
    { label: 'English', checked: getLang() === 'en', action: () => setUiLang('en') },
    'sep',
    { label: t('cmd.zoomIn'), kbd: 'Ctrl+=', action: cmds.zoomIn },
    { label: t('cmd.zoomOut'), kbd: 'Ctrl+-', action: cmds.zoomOut },
    { label: t('cmd.wrap'), kbd: 'Alt+Z', checked: settings.wrap, action: cmds.wrap },
    { label: t('cmd.whitespace'), checked: settings.whitespace, action: cmds.whitespace },
    { label: t('cmd.autocomplete'), checked: settings.autocomplete, action: cmds.autocomplete },
    { label: t('cmd.tabSize'), action: cmds.tabSize },
    'sep',
    { label: t('cmd.server'), action: cmds.server },
  ], { x: r.right + 6, y: r.bottom - 360 });
});

function syncActivity() {
  $('#actFiles').classList.toggle('on', !$('#sidebar').hidden);
  $('#actRun').classList.toggle('on', !!runner?.isOpen());
}
$('#btnUiLang').addEventListener('click', () => cmds.uiLang());
$('#langBadge').addEventListener('click', () => cmds.language());
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
  if (code === 'F5' && e.shiftKey) cmds.stop();
  else if (code === 'F5' || (mod && code === 'Enter')) cmds.run();
  else if (mod && e.shiftKey && code === 'KeyP') cmds.runPanel();
  else if (mod && !e.shiftKey && code === 'KeyS') cmds.save();
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
  else if (e.altKey && code === 'KeyL') cmds.language();
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
  if (!b) return;
  if (b.dataset.key === 'run') { cmds.run(); return; }
  const v = activeView();
  if (!v) return;
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
  document.title = d ? `${d.dirty ? '● ' : ''}${d.rec.name} — Multipad · ${winName()}` : `Multipad · ${winName()}`;
}

function updateStatus() {
  const v = activeView();
  const d = activeDoc();
  $('#stIndent').textContent = t('status.spaces', { n: settings.tabSize });
  const badge = $('#langBadge');
  if (!v || !d) {
    $('#stPos').textContent = '—';
    $('#stSel').textContent = '';
    $('#stLang').textContent = '';
    $('#stEol').textContent = '';
    badge.hidden = true;
    $('#btnRun').disabled = true;
    updateTitle();
    return;
  }
  const { state } = v;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  $('#stPos').textContent = t('status.pos', { line: line.number, col: head - line.from + 1 });
  const selected = state.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0);
  const cursors = state.selection.ranges.length;
  $('#stSel').textContent = (selected ? t('status.sel', { n: selected }) : t('status.lines', { n: state.doc.lines })) + (cursors > 1 ? ' · ' + t('status.cursors', { n: cursors }) : '');
  const label = langLabel(d.rec.lang);
  $('#stLang').textContent = label;
  $('#stEol').textContent = d.rec.eol || 'LF';
  badge.hidden = false;
  badge.textContent = label;
  const runnable = !!runKind(d.rec.lang, d.rec.name);
  badge.classList.toggle('runnable', runnable);
  badge.title = t('lang.badgeTitle', { where: runWhere(d.rec.lang) });
  $('#btnRun').disabled = false;
  $('#btnRun').classList.toggle('muted', !runnable);
  updateTitle();
}

/* ------------------------------------------------------------------ viewport en móviles */

function syncViewport() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--vvh', h + 'px');
}
window.visualViewport?.addEventListener('resize', syncViewport);
window.addEventListener('resize', debounce(() => {
  syncViewport();
  $('#panes').classList.toggle('column', currentDir() === 'column');
  runner?.layout();
}, 80));

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
          toast(t('sw.newVersion'), {
            action: t('sw.update'),
            onAction: () => { iClickedUpdate = true; flushAll(); nw.postMessage('skip-waiting'); },
          });
        }
      });
    });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // primera instalación, no es una actualización
    if (iClickedUpdate) setTimeout(() => location.reload(), 300);
    else toast(t('sw.updated'), { action: t('sw.reload'), onAction: () => location.reload() });
  });
}

/* ------------------------------------------------------------------ inicio */

async function start() {
  await claimWindowId();
  ensureWindowName();

  try { layout = JSON.parse(localStorage.getItem(layoutKey()) || 'null'); } catch { layout = null; }
  if (!layout || !Array.isArray(layout.panes) || !layout.panes.length) {
    layout = { dir: 'row', panes: [newPane()], focused: null, sidebar: window.innerWidth >= 1000 };
  }
  layout.run = Object.assign({ open: false, size: 460, sizeV: 300, tab: 'preview', auto: true, stdin: false, stdinText: '' }, layout.run || {});
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

  runner = createRunner({
    wid: WID,
    runState: () => layout.run,
    saveState: () => saveLayout(),
    activeDoc: () => { const d = activeDoc(); return d ? { id: d.rec.id, name: d.rec.name, lang: d.rec.lang, text: getText(d) } : null; },
    getDoc: (id) => docTextById(id),
    allDocs: () => allDocTexts(),
    settings: () => settings,
    langLabel,
    isDark: () => resolvedTheme() === 'dark',
    uiLang: () => getLang(),
    toast,
    openWindow: (url, name, otherScreen) => openWindowUrl(url, name, otherScreen),
    onResize: () => { for (const v of allViews()) v.requestMeasure(); syncActivity(); },
    onRunning: (on) => { $('#btnRun').classList.toggle('running', on); },
  });

  syncViewport();
  applySettings();
  renderWinLabel();
  renderPanes();
  runner.layout();
  if (layout.sidebar) toggleSidebar(true);
  $('#runStdin').value = layout.run.stdinText || '';

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
    const welcome = t('welcome.doc');
    const rec = await createDoc({ name: t('welcome.name'), content: welcome, savedContent: welcome });
    await openDocInPane(rec.id);
  }

  // Archivos abiertos desde el sistema operativo con la app instalada ("Abrir con…").
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (p) => {
      for (const h of p.files || []) await openHandle(h);
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
  if (layout) localStorage.setItem(layoutKey(), JSON.stringify({ ...layout, saved: Date.now() }));
  bc.postMessage({ type: 'bye', wid: WID, from: WID });
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });

start().catch((err) => {
  console.error(err);
  toast(t('err.start', { msg: err.message }), { timeout: 15000 });
});
