// Panel de ejecución: vista previa (HTML, CSS, Markdown, SVG) y consola (JavaScript, Python, SQL y lenguajes compilados).
import { $, el, debounce } from './util.js';
import { t } from './i18n.js';

const PYODIDE_URL = 'https://cdn.jsdelivr.net/npm/pyodide@314.0.7/';
const SQLJS_URL = 'https://cdn.jsdelivr.net/npm/sql.js@1.15.2/dist/';

// Identificadores de lenguaje en Judge0 CE.
const JUDGE0_IDS = { java: 62, kotlin: 78, csharp: 51, c: 50, cpp: 54, rust: 73, go: 60, ruby: 72, php: 68, shell: 46, typescript: 74 };
const REMOTE_LANGS = ['java', 'kotlin', 'csharp', 'cpp', 'rust', 'go', 'ruby', 'php', 'shell', 'typescript'];
const PREVIEW_KINDS = new Set(['web', 'markdown', 'svg']);

export function runKind(lang, name = '') {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (lang === 'html' || lang === 'css') return 'web';
  if (lang === 'markdown') return 'markdown';
  if (lang === 'xml' && ext === 'svg') return 'svg';
  if (lang === 'javascript') return 'js';
  if (lang === 'python') return 'python';
  if (lang === 'sql') return 'sql';
  if (lang === 'json') return 'json';
  if (REMOTE_LANGS.includes(lang)) return 'remote';
  return null;
}

const judgeId = (lang, name) => (lang === 'cpp' ? (/\.(c|h)$/i.test(name) ? JUDGE0_IDS.c : JUDGE0_IDS.cpp) : JUDGE0_IDS[lang]);

const baseName = (path) => path.split(/[?#]/)[0].split(/[\\/]/).pop().toLowerCase();
const isExternal = (url) => /^([a-z]+:)?\/\//i.test(url) || /^data:/i.test(url);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function referencesFile(html, name) {
  return new RegExp(`(href|src)\\s*=\\s*["'](?:[^"']*[\\\\/])?${escapeRe(name)}(?:[?#][^"']*)?["']`, 'i').test(html);
}

// Script que se inyecta en cada vista previa para mandar console.log y errores al panel.
function consoleHook() {
  const err = t('run.line');
  return `<script>(function(){var send=function(level,args){try{parent.postMessage({__multipad:1,level:level,args:Array.prototype.map.call(args,function(a){if(typeof a==='string')return a;if(a instanceof Error)return a.stack||String(a);try{var s=JSON.stringify(a,null,2);return s===undefined?String(a):s}catch(e){return String(a)}})},'*')}catch(e){}};['log','info','warn','error','debug','table'].forEach(function(l){var o=console[l]||console.log;console[l]=function(){send(l==='table'?'log':l,arguments);return o.apply(console,arguments)}});addEventListener('error',function(e){send('error',[e.message+(e.lineno?' (${err} '+e.lineno+')':'')])});addEventListener('unhandledrejection',function(e){var r=e.reason;send('error',['Promise: '+(r&&r.message||r)])});})();<\/script>`;
}

function injectHook(html) {
  const hook = consoleHook();
  const m = html.match(/^\s*<!doctype[^>]*>/i);
  return m ? m[0] + hook + html.slice(m[0].length) : hook + html;
}

function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function b64ToUtf8(b64) {
  if (!b64) return '';
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(t('run.downloadFail', { url: src })));
    document.head.append(s);
  });
}

const MD_CSS = (dark) => `
  :root{color-scheme:${dark ? 'dark' : 'light'}}
  body{margin:0;padding:24px 28px 48px;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    background:${dark ? '#1b1e22' : '#fff'};color:${dark ? '#d6dbe0' : '#1f2328'};max-width:820px}
  h1,h2,h3{line-height:1.25;margin:1.4em 0 .5em}h1{font-size:1.9em;border-bottom:1px solid ${dark ? '#2e343b' : '#d8dce0'};padding-bottom:.3em}
  h2{font-size:1.45em;border-bottom:1px solid ${dark ? '#2e343b' : '#d8dce0'};padding-bottom:.25em}
  a{color:${dark ? '#5fd0a4' : '#1f8a63'}}
  code{font:.9em ui-monospace,Consolas,monospace;background:${dark ? '#252a30' : '#f0f2f4'};padding:.15em .35em;border-radius:4px}
  pre{background:${dark ? '#252a30' : '#f0f2f4'};padding:14px;border-radius:8px;overflow:auto}pre code{background:none;padding:0}
  blockquote{margin:0;padding:0 1em;border-left:4px solid ${dark ? '#3fb68b' : '#1f8a63'};color:${dark ? '#8b949e' : '#5d6670'}}
  table{border-collapse:collapse}td,th{border:1px solid ${dark ? '#2e343b' : '#d8dce0'};padding:6px 12px}img{max-width:100%}`;

export function createRunner(api) {
  const panel = $('#runPanel');
  const divider = $('#runDivider');
  const frame = $('#runFrame');
  const out = $('#runConsole');
  const stdinBox = $('#runStdin');
  const sourceEl = $('#runSource');
  const autoBox = $('#runAuto');
  const errBadge = $('#runErrCount');
  const previewBc = new BroadcastChannel('multipad-preview');

  let current = null; // {id, kind}
  let lastRender = null; // {html, title}
  let worker = null;
  let workerReady = false;
  let pending = null; // {resolve} de la ejecución de Python en curso
  let abortRemote = null;
  let errors = 0;
  let SQL = null;

  const state = () => api.runState();

  /* ---------------- panel ---------------- */

  const previewWrap = $('#previewWrap');
  const term = $('#term');
  const termDivider = $('#termDivider');

  function layoutPanel() {
    const st = state();
    const main = $('#main');
    const bottom = window.innerWidth < 700;
    main.classList.toggle('run-bottom', bottom && st.open);
    panel.hidden = !st.open;
    divider.hidden = !st.open;
    if (bottom) {
      panel.style.width = '';
      panel.style.height = Math.min(st.sizeV || 320, window.innerHeight * 0.7) + 'px';
    } else {
      panel.style.height = '';
      panel.style.width = Math.min(st.size || 480, window.innerWidth - 300) + 'px';
    }
    autoBox.checked = !!st.auto;
    stdinBox.hidden = !st.stdin;
    $('#runStdinBtn').classList.toggle('on', !!st.stdin);
    showTab(st.tab || 'preview');
    api.onResize();
  }

  // "preview": navegador arriba y consola abajo. "console": solo la consola (Python, SQL, Java…).
  function showTab(tab) {
    const st = state();
    st.tab = tab;
    const consoleOnly = tab === 'console';
    panel.classList.toggle('console-only', consoleOnly);
    previewWrap.hidden = consoleOnly;
    term.classList.toggle('collapsed', !consoleOnly && !!st.termCollapsed);
    termDivider.hidden = consoleOnly || !!st.termCollapsed;
    term.style.height = consoleOnly ? '' : (st.termCollapsed ? '' : (st.termSize || 170) + 'px');
    $('#runTitle').textContent = t(consoleOnly ? 'run.output' : 'run.preview');
    if (!termHidden()) { errors = 0; updateBadge(); }
  }

  const termHidden = () => !panel.classList.contains('console-only') && term.classList.contains('collapsed');

  function updateBadge() {
    errBadge.textContent = errors ? String(errors) : '';
    errBadge.hidden = !errors;
  }

  function setTermCollapsed(collapsed) {
    state().termCollapsed = collapsed;
    api.saveState();
    showTab(state().tab);
  }

  function open() {
    if (!state().open) { state().open = true; api.saveState(); layoutPanel(); }
  }

  function close() {
    state().open = false;
    api.saveState();
    layoutPanel();
  }

  function toggle() {
    if (state().open) close(); else open();
  }

  $('#runClose').addEventListener('click', close);
  $('#runStop').addEventListener('click', () => stop());
  $('#runAgain').addEventListener('click', () => run());
  $('#runPopout').addEventListener('click', () => popout(false));
  $('#runStdinBtn').addEventListener('click', () => { state().stdin = !state().stdin; api.saveState(); layoutPanel(); if (state().stdin) stdinBox.focus(); });
  autoBox.addEventListener('change', () => { state().auto = autoBox.checked; api.saveState(); });
  stdinBox.addEventListener('input', debounce(() => { state().stdinText = stdinBox.value; api.saveState(); }, 400));
  $('#termToggle').addEventListener('click', () => { if (!panel.classList.contains('console-only')) setTermCollapsed(!state().termCollapsed); });
  $('#termHead').addEventListener('dblclick', (e) => { if (!e.target.closest('button')) $('#termToggle').click(); });
  $('#termClear').addEventListener('click', () => clearConsole());

  termDivider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    termDivider.setPointerCapture(e.pointerId);
    termDivider.classList.add('dragging');
    const start = e.clientY;
    const startH = term.getBoundingClientRect().height;
    const max = panel.getBoundingClientRect().height - 120;
    frame.style.pointerEvents = 'none';
    const move = (ev) => {
      const h = Math.max(70, Math.min(max, startH + (start - ev.clientY)));
      state().termSize = h;
      term.style.height = h + 'px';
    };
    const up = () => {
      termDivider.classList.remove('dragging');
      frame.style.pointerEvents = '';
      termDivider.removeEventListener('pointermove', move);
      termDivider.removeEventListener('pointerup', up);
      api.saveState();
    };
    termDivider.addEventListener('pointermove', move);
    termDivider.addEventListener('pointerup', up);
  });

  divider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    divider.setPointerCapture(e.pointerId);
    divider.classList.add('dragging');
    const bottom = window.innerWidth < 700;
    const rect = panel.getBoundingClientRect();
    const start = bottom ? e.clientY : e.clientX;
    const startSize = bottom ? rect.height : rect.width;
    frame.style.pointerEvents = 'none';
    const move = (ev) => {
      const delta = start - (bottom ? ev.clientY : ev.clientX);
      const size = Math.max(160, startSize + delta);
      if (bottom) { state().sizeV = size; panel.style.height = size + 'px'; } else { state().size = size; panel.style.width = size + 'px'; }
    };
    const up = () => {
      divider.classList.remove('dragging');
      frame.style.pointerEvents = '';
      divider.removeEventListener('pointermove', move);
      divider.removeEventListener('pointerup', up);
      divider.removeEventListener('pointercancel', up);
      api.saveState();
      api.onResize();
    };
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', up);
    divider.addEventListener('pointercancel', up);
  });

  /* ---------------- consola ---------------- */

  function clearConsole() {
    out.textContent = '';
    errors = 0;
    updateBadge();
  }

  function log(level, text) {
    const line = el('div', { class: 'cl ' + level, text });
    out.append(line);
    if (level === 'error') {
      if (termHidden()) errors++;
      updateBadge();
    }
    out.scrollTop = out.scrollHeight;
    return line;
  }

  function logNode(node) {
    out.append(node);
    out.scrollTop = out.scrollHeight;
  }

  function header(text) {
    clearConsole();
    log('head', text);
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || !m.__multipad || e.source !== frame.contentWindow) return;
    log(m.level === 'log' || m.level === 'debug' ? 'out' : m.level, m.args.join(' '));
  });

  previewBc.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.wid !== api.wid) return;
    if (m.type === 'need' && lastRender) previewBc.postMessage({ type: 'render', wid: api.wid, ...lastRender });
    if (m.type === 'console') log(m.level === 'log' || m.level === 'debug' ? 'out' : m.level, '⧉ ' + m.args.join(' '));
  });

  /* ---------------- vista previa ---------------- */

  function render(html, title, tab = 'preview') {
    lastRender = { html, title, dark: api.isDark() };
    sourceEl.textContent = title || '';
    frame.srcdoc = html;
    previewBc.postMessage({ type: 'render', wid: api.wid, ...lastRender });
    if (tab) showTab(tab);
  }

  function inlineAssets(html, byName, missing) {
    html = html.replace(/<link\b[^>]*>/gi, (tag) => {
      if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
      const m = tag.match(/href\s*=\s*["']([^"']+)["']/i);
      if (!m || isExternal(m[1])) return tag;
      const doc = byName.get(baseName(m[1]));
      if (!doc) { missing.push(m[1]); return tag; }
      return `<style data-file="${escapeHtml(doc.name)}">\n${doc.text}\n</style>`;
    });
    html = html.replace(/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (all, a, src, b) => {
      if (isExternal(src)) return all;
      const doc = byName.get(baseName(src));
      if (!doc) { missing.push(src); return all; }
      return `<script${a}${b} data-file="${escapeHtml(doc.name)}">\n${doc.text.replace(/<\/script/gi, '<\\/script')}\n</script>`;
    });
    return html;
  }

  async function runWeb(doc) {
    const all = await api.allDocs();
    let host = doc;
    let note = '';
    if (doc.lang !== 'html') {
      const name = doc.name.toLowerCase();
      host = all.find((x) => x.lang === 'html' && referencesFile(x.text, name));
      if (host) note = t('run.usingHost', { host: host.name, file: doc.name });
    }
    if (!host) {
      // Hoja de estilos sin HTML que la use: página de muestra.
      header(t('run.headPreview', { name: doc.name }));
      log('warn', t('run.cssNoHost', { file: doc.name }));
      render(injectHook(`<!doctype html><html><head><meta charset="utf-8"><style>${doc.text}</style></head><body>
<h1>${t('run.sample.h1')}</h1><p>${t('run.sample.p')} <a href="#">${t('run.sample.link')}</a>.</p>
<ul><li>${t('run.sample.item')} 1</li><li>${t('run.sample.item')} 2</li></ul>
<button>${t('run.sample.button')}</button> <input placeholder="${t('run.sample.input')}">
<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table></body></html>`), doc.name);
      return;
    }
    const byName = new Map(all.map((x) => [x.name.toLowerCase(), x]));
    const missing = [];
    const html = inlineAssets(host.text, byName, missing);
    header(t('run.headPreview', { name: host.name }));
    if (note) log('info', note);
    for (const f of missing) log('warn', t('run.missing', { file: f }));
    render(injectHook(html), host.name);
  }

  async function runMarkdown(doc) {
    const { renderMarkdown } = await import('../vendor/markdown.js');
    header(t('run.headPreview', { name: doc.name }));
    const dark = api.isDark();
    render(`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${MD_CSS(dark)}</style></head><body>${renderMarkdown(doc.text)}</body></html>`, doc.name);
  }

  function runSvg(doc) {
    header(t('run.headPreview', { name: doc.name }));
    render(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}body{display:grid;place-items:center;background:#fff repeating-conic-gradient(#e9ecef 0 25%,#fff 0 50%) 0 0/20px 20px}svg{max-width:96%;max-height:96vh}</style></head><body>${doc.text}</body></html>`, doc.name);
  }

  function runJs(doc) {
    header(t('run.headRun', { name: doc.name, where: t('run.whereBrowser') }));
    const code = doc.text.replace(/<\/script/gi, '<\\/script');
    render(injectHook(`<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px system-ui,sans-serif;margin:12px;color:#222;background:#fff}</style></head><body><script>\n${code}\n</script></body></html>`), doc.name, 'console');
  }

  function runJson(doc) {
    header(t('run.headCheck', { name: doc.name }));
    try {
      const value = JSON.parse(doc.text);
      const kind = Array.isArray(value) ? t('run.jsonArray', { n: value.length }) : value && typeof value === 'object' ? t('run.jsonObject', { n: Object.keys(value).length }) : typeof value;
      log('ok', t('run.jsonOk', { kind }));
      log('out', JSON.stringify(value, null, 2));
    } catch (err) {
      const m = String(err.message).match(/position (\d+)/);
      if (m) {
        const pos = Number(m[1]);
        const before = doc.text.slice(0, pos);
        const line = before.split('\n').length;
        const col = pos - before.lastIndexOf('\n');
        log('error', t('run.jsonErrAt', { msg: err.message, line, col }));
      } else {
        log('error', err.message);
      }
    }
    showTab('console');
  }

  /* ---------------- Python (Pyodide en un worker) ---------------- */

  function getWorker() {
    if (worker) return worker;
    worker = new Worker('js/py-worker.js', { type: 'module' });
    workerReady = false;
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'loading') log('info', t('run.pyLoading'));
      else if (m.type === 'ready') { if (!workerReady) log('info', t('run.pyReady')); workerReady = true; }
      else if (m.type === 'out') log('out', m.text);
      else if (m.type === 'err') log('error', m.text);
      else if (m.type === 'done') { log('ok', t('run.finished', { ms: m.ms })); finish(); }
      else if (m.type === 'error') { log('error', cleanTraceback(m.text, pyName)); if (/EOFError/.test(m.text)) log('info', t('run.needStdin')); finish(); }
    };
    worker.onerror = (e) => { log('error', e.message || t('run.pyFail')); finish(); worker?.terminate(); worker = null; };
    return worker;
  }

  function finish() {
    setRunning(false);
    pending?.();
    pending = null;
  }

  // Quita de los errores de Python las líneas internas de Pyodide y deja las del programa.
  function cleanTraceback(text, name) {
    const lines = text.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^\s+File "\/lib\/python/.test(lines[i])) {
        while (i + 1 < lines.length && /^\s{3,}\S/.test(lines[i + 1]) && !/^\s+File /.test(lines[i + 1])) i++;
        continue;
      }
      out.push(lines[i].replace('File "<exec>"', `File "${name}"`));
    }
    return out.join('\n').trim();
  }

  let pyName = '';

  function runPython(doc) {
    pyName = doc.name;
    header(t('run.headRun', { name: doc.name, where: t('run.whereBrowser') }));
    showTab('console');
    maybeHintStdin(doc.text);
    setRunning(true);
    return new Promise((resolve) => {
      pending = resolve;
      getWorker().postMessage({ code: doc.text, stdin: stdinBox.value, indexURL: PYODIDE_URL });
    });
  }

  /* ---------------- SQL (sql.js) ---------------- */

  async function runSql(doc) {
    header(t('run.headRun', { name: doc.name, where: t('run.whereSqlite') }));
    showTab('console');
    try {
      if (!SQL) {
        log('info', t('run.sqlLoading'));
        if (!window.initSqlJs) await loadScript(SQLJS_URL + 'sql-wasm.js');
        SQL = await window.initSqlJs({ locateFile: (f) => SQLJS_URL + f });
      }
      const db = new SQL.Database();
      const t0 = performance.now();
      const results = db.exec(doc.text);
      const changes = db.getRowsModified();
      db.close();
      if (!results.length) log('ok', t('run.sqlNoRows', { n: changes }));
      for (const r of results) {
        const table = el('table', { class: 'res' },
          el('thead', {}, el('tr', {}, r.columns.map((c) => el('th', { text: c })))),
          el('tbody', {}, r.values.map((row) => el('tr', {}, row.map((v) => el('td', { text: v === null ? 'NULL' : String(v) }))))));
        logNode(el('div', { class: 'cl table' }, table));
        log('info', t('run.sqlRows', { n: r.values.length }));
      }
      log('ok', t('run.finished', { ms: Math.round(performance.now() - t0) }));
    } catch (err) {
      log('error', err.message);
    }
  }

  /* ---------------- Lenguajes compilados (Judge0) ---------------- */

  async function runRemote(doc) {
    const s = api.settings();
    const id = judgeId(doc.lang, doc.name);
    header(t('run.headRun', { name: doc.name, where: t('run.whereRemote', { host: safeHost(s.judgeUrl) }) }));
    showTab('console');
    if (!s.judgeUrl) { log('error', t('run.noServer')); return; }
    maybeHintStdin(doc.text);
    if (doc.lang === 'java' && /public\s+class\s+(?!Main\b)\w+/.test(doc.text)) log('warn', t('run.javaMain'));
    setRunning(true);
    log('info', t('run.sending'));
    const ctrl = new AbortController();
    abortRemote = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 40000);
    try {
      const url = s.judgeUrl.replace(/\/+$/, '') + '/submissions?base64_encoded=true&wait=true';
      const headers = { 'Content-Type': 'application/json' };
      if (s.judgeKey) {
        const host = new URL(s.judgeUrl).host;
        if (/rapidapi\.com$/i.test(host)) { headers['X-RapidAPI-Key'] = s.judgeKey; headers['X-RapidAPI-Host'] = host; }
        else headers['X-Auth-Token'] = s.judgeKey;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers,
        signal: ctrl.signal,
        body: JSON.stringify({ language_id: id, source_code: utf8ToB64(doc.text), stdin: utf8ToB64(stdinBox.value || '') }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const r = await res.json();
      const compile = b64ToUtf8(r.compile_output);
      const stdout = b64ToUtf8(r.stdout);
      const stderr = b64ToUtf8(r.stderr);
      if (compile) log('error', compile);
      if (stdout) log('out', stdout);
      if (stderr) log('error', stderr);
      const status = r.status?.description || '';
      const ok = r.status?.id === 3;
      log(ok ? 'ok' : 'warn', `${status}${r.time ? ` · ${r.time} s` : ''}${r.memory ? ` · ${Math.round(r.memory / 1024)} MB` : ''}`);
    } catch (err) {
      if (err.name === 'AbortError') log('warn', t('run.stopped'));
      else {
        log('error', t('run.remoteFail', { msg: err.message }));
        log('info', t('run.remoteHint'));
      }
    } finally {
      clearTimeout(timer);
      abortRemote = null;
      setRunning(false);
    }
  }

  function safeHost(url) {
    try { return new URL(url).host; } catch { return '—'; }
  }

  function maybeHintStdin(code) {
    if (stdinBox.value.trim()) return;
    if (/\binput\s*\(|Scanner\s*\(|\bcin\s*>>|readLine|scanf\s*\(|gets\b|fgets|STDIN|Console\.Read|read_line/.test(code)) {
      log('info', t('run.stdinHint'));
    }
  }

  /* ---------------- control ---------------- */

  function setRunning(on) {
    panel.classList.toggle('running', on);
    $('#runStop').hidden = !on;
    api.onRunning(on);
  }

  function stop() {
    if (worker && panel.classList.contains('running')) {
      worker.terminate();
      worker = null;
      log('warn', t('run.stopped'));
      finish();
    }
    if (abortRemote) abortRemote.abort();
  }

  async function run(target) {
    const doc = target || api.activeDoc();
    if (!doc) { api.toast(t('run.noDoc')); return; }
    let kind = runKind(doc.lang, doc.name);
    open();
    sourceEl.textContent = doc.name;
    if (!kind) {
      header(doc.name);
      log('warn', t('run.notRunnable', { lang: api.langLabel(doc.lang) }));
      log('info', t('run.seeTable'));
      showTab('console');
      current = null;
      return;
    }
    if (panel.classList.contains('running')) stop();
    // Un .js que usa una página HTML se ve dentro de esa página (necesita su DOM).
    if (kind === 'js') {
      const name = doc.name.toLowerCase();
      const all = await api.allDocs();
      if (all.some((x) => x.lang === 'html' && referencesFile(x.text, name))) kind = 'web';
    }
    current = { id: doc.id, kind };
    stdinBox.value = state().stdinText || stdinBox.value;
    try {
      if (kind === 'web') await runWeb(doc);
      else if (kind === 'markdown') await runMarkdown(doc);
      else if (kind === 'svg') runSvg(doc);
      else if (kind === 'js') runJs(doc);
      else if (kind === 'json') runJson(doc);
      else if (kind === 'python') await runPython(doc);
      else if (kind === 'sql') await runSql(doc);
      else if (kind === 'remote') await runRemote(doc);
    } catch (err) {
      log('error', err.message);
      setRunning(false);
    }
  }

  // Auto-actualizar: cuando cambia el documento en vista previa (o una hoja de estilos / script que use).
  const autoRerun = debounce(async () => {
    if (!current) return;
    const doc = await api.getDoc(current.id);
    if (doc) run(doc);
  }, 600);

  function onDocChanged(docId, lang) {
    const st = state();
    if (!st.open || !st.auto || !current || !PREVIEW_KINDS.has(current.kind)) return;
    if (docId === current.id || ['css', 'javascript', 'html'].includes(lang)) autoRerun();
  }

  async function popout(otherScreen) {
    const url = new URL('preview.html', location.href);
    url.searchParams.set('wid', api.wid);
    url.searchParams.set('lang', api.uiLang());
    const win = await api.openWindow(url.toString(), 'mp-preview-' + api.wid, otherScreen);
    if (win && !lastRender && current == null) api.toast(t('run.popoutHint'));
  }

  function rethemeIfNeeded() {
    if (current?.kind === 'markdown' && lastRender) autoRerun();
  }

  return { run, stop, toggle, open, close, popout, onDocChanged, layout: layoutPanel, rethemeIfNeeded, isOpen: () => !!state().open };
}
