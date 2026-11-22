// Modo aula: el docente crea un ejercicio y lo comparte por enlace o archivo .mpaula;
// el alumno lo resuelve, lo comprueba con las pruebas y entrega un .zip; el docente revisa las entregas.
// No hay servidor: el ejercicio viaja dentro del enlace (después del #, que el navegador no envía)
// y la entrega es un archivo que el alumno sube a Canvas, Classroom o donde indique el docente.
import { $, el, uid, toast, openModal, promptModal, confirmModal, makeZip, readZip } from './util.js';
import { t } from './i18n.js';
import { db } from './db.js';

export const TEST_TYPES = ['exists', 'count', 'text', 'style', 'attr', 'click', 'console', 'noerror', 'js'];
const FIELDS = {
  exists: ['selector'],
  count: ['selector', 'n'],
  text: ['selector', 'value'],
  style: ['selector', 'prop', 'value'],
  attr: ['selector', 'attr', 'value'],
  click: ['selector', 'target', 'value'],
  console: ['value'],
  noerror: [],
  js: ['code'],
};
const LIMITS = { title: 200, instructions: 50000, files: 20, fileName: 100, fileSize: 500000, tests: 60, field: 2000 };
const HASH_KEY = 'aula=';
const ACTIVE_KEY = 'aula:active';
const MINE_KEY = 'aula:mine';
const NAME_KEY = 'aula:name';

let api = null;
let active = null; // { ex, folder, docIds: {name: id}, name, startedAt, activeMs, events: [], lastResults, submittedAt }
let lastCopy = null; // { text, docId }: lo último que se copió desde un editor de Multipad
let allowedExternalPaste = false;
let saveSoon = null;

/* ---------------- utilidades ---------------- */

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ejercicio';
const cleanName = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, LIMITS.fileName);
const cleanFolder = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 60) || 'Ejercicio';
const normText = (s) => String(s || '').replace(/\r\n?/g, '\n');
const fmtMin = (ms) => (ms > 0 ? Math.max(1, Math.round(ms / 60000)) : 0);
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—');

function b64u(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function deflate(str) {
  const stream = new Blob([new TextEncoder().encode(str)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
// Descomprime con un tope de tamaño, para que un enlace manipulado no llene la memoria.
async function inflate(bytes, max = 8 * 1024 * 1024) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { reader.cancel(); throw new Error('too-big'); }
    parts.push(value);
  }
  return new TextDecoder().decode(await new Blob(parts).arrayBuffer());
}
async function sha256(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------------- formato del ejercicio ---------------- */

// Revisa y limpia un ejercicio que llega de un enlace o archivo (puede venir de cualquiera).
function validate(raw) {
  if (!raw || raw.mp !== 'aula' || typeof raw.title !== 'string') throw new Error('format');
  const str = (v, max) => String(v ?? '').slice(0, max);
  const files = (Array.isArray(raw.files) ? raw.files : []).slice(0, LIMITS.files)
    .map((f) => ({ name: cleanName(f?.name), content: normText(str(f?.content, LIMITS.fileSize)) }))
    .filter((f) => f.name);
  const tests = (Array.isArray(raw.tests) ? raw.tests : []).slice(0, LIMITS.tests)
    .filter((x) => x && TEST_TYPES.includes(x.type))
    .map((x) => {
      const test = { type: x.type };
      for (const k of FIELDS[x.type]) test[k] = str(x[k], LIMITS.field);
      if (x.label) test.label = str(x.label, 300);
      return test;
    });
  return {
    mp: 'aula',
    v: 1,
    id: str(raw.id, 40) || uid(),
    title: str(raw.title, LIMITS.title).trim() || 'Ejercicio',
    instructions: str(raw.instructions, LIMITS.instructions),
    files,
    tests,
    exam: !!raw.exam,
    // Ejercicios de la versión 1.5 no traen esta opción: ahí solo el examen bloqueaba el pegado.
    blockPaste: raw.blockPaste === undefined ? !!raw.exam : (!!raw.blockPaste || !!raw.exam),
    showResults: raw.showResults !== false,
    salt: str(raw.salt, 40),
  };
}

const publicExercise = (ex) => validate({ ...ex, mp: 'aula' });

export async function exerciseToLink(ex) {
  const data = b64u(await deflate(JSON.stringify(publicExercise(ex))));
  return `${location.origin}${location.pathname}#${HASH_KEY}${data}`;
}

async function exerciseFromHash(hash) {
  const i = hash.indexOf(HASH_KEY);
  if (i < 0) return null;
  return validate(JSON.parse(await inflate(unb64u(hash.slice(i + HASH_KEY.length)))));
}

export function describeTest(x) {
  if (x.label) return x.label;
  return t('aula.desc.' + x.type, { selector: x.selector, n: x.n || 1, value: x.value, prop: x.prop, attr: x.attr, target: x.target, code: x.code })
    + (x.type === 'attr' && x.value ? ` = "${x.value}"` : '');
}

/* ---------------- pruebas ---------------- */

function harness(tests, key) {
  const T = JSON.stringify(tests).replace(/</g, '\\u003c');
  return `<script>(function(){var T=${T};var K=${JSON.stringify(key)};var logs=[],errs=[];
['log','info','warn','error','debug'].forEach(function(l){var o=console[l]||console.log;console[l]=function(){try{logs.push(Array.prototype.map.call(arguments,function(a){if(typeof a==='string')return a;try{return JSON.stringify(a)}catch(e){return String(a)}}).join(' '))}catch(e){}return o.apply(console,arguments)}});
addEventListener('error',function(e){errs.push(e.message||'Error')});
addEventListener('unhandledrejection',function(e){var r=e.reason;errs.push('Promise: '+(r&&r.message||r))});
var clean=function(s){return String(s==null?'':s).replace(/\\s+/g,' ').trim()};
var low=function(s){return clean(s).toLowerCase()};
var short=function(s){s=clean(s);return s.length>80?s.slice(0,77)+'...':s};
var all=function(sel){try{return Array.prototype.slice.call(document.querySelectorAll(sel))}catch(e){throw new Error('selector: '+sel)}};
var norm=function(prop,val){var d=document.createElement('div');d.style.setProperty(prop,val);if(!d.style.getPropertyValue(prop))return low(val);d.style.position='absolute';d.style.visibility='hidden';document.body.appendChild(d);var c=getComputedStyle(d).getPropertyValue(prop);d.remove();return low(c)};
var has=function(a,b){return low(a).indexOf(low(b))>=0};
var wait=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
function one(t){var els,i,got;
switch(t.type){
case 'exists':els=all(t.selector);return {ok:els.length>0,got:els.length?'':'0'};
case 'count':els=all(t.selector);return {ok:els.length>=(+t.n||1),got:String(els.length)};
case 'text':els=all(t.selector);if(!els.length)return {ok:false,got:'-'};for(i=0;i<els.length;i++)if(has(els[i].textContent,t.value))return {ok:true};return {ok:false,got:short(els[0].textContent)};
case 'style':els=all(t.selector);if(!els.length)return {ok:false,got:'-'};var want=norm(t.prop,t.value);for(i=0;i<els.length;i++){got=low(getComputedStyle(els[i]).getPropertyValue(t.prop));if(got===want||(t.prop==='font-family'&&has(got,String(t.value).replace(/["']/g,''))))return {ok:true}}return {ok:false,got:low(getComputedStyle(els[0]).getPropertyValue(t.prop))};
case 'attr':els=all(t.selector);if(!els.length)return {ok:false,got:'-'};for(i=0;i<els.length;i++){var v=els[i].getAttribute(t.attr);if(v!=null&&(!t.value||has(v,t.value)))return {ok:true}}got=els[0].getAttribute(t.attr);return {ok:false,got:got==null?'-':short(got)};
case 'console':return {ok:has(logs.join('\\n'),t.value),got:short(logs[logs.length-1]||'-')};
case 'noerror':return {ok:errs.length===0,got:short(errs[0]||'')};
case 'click':var b=all(t.selector)[0];if(!b)return {ok:false,got:'-'};b.click();return wait(300).then(function(){var tg=all(t.target);if(!tg.length)return {ok:false,got:'-'};for(var j=0;j<tg.length;j++)if(has(tg[j].textContent,t.value)||has(tg[j].value,t.value))return {ok:true};return {ok:false,got:short(tg[0].textContent||tg[0].value)}});
case 'js':return Promise.resolve((new Function('return ('+t.code+'\\n)'))()).then(function(r){return {ok:!!r,got:short(String(r))}});
}return {ok:false,got:'?'}}
addEventListener('load',function(){setTimeout(function(){var out=[],i=0;(function next(){if(i>=T.length){parent.postMessage({__aula:K,results:out},'*');return}
var r;try{r=one(T[i++])}catch(e){r={ok:false,got:short(e&&e.message||e)}}
Promise.resolve(r).then(function(x){out.push(x);next()},function(e){out.push({ok:false,got:short(e&&e.message||e)});next()})})()},300)});
})();<\/script>`;
}

// Corre las pruebas sobre una página armada con estos archivos: [{name, text, id?}].
// La página corre en un iframe aislado (sin acceso a los datos de Multipad).
export async function runTests(files, tests) {
  if (!tests.length) return [];
  const host = files.find((f) => /\.html?$/i.test(f.name));
  if (!host) return tests.map(() => ({ ok: false, got: t('aula.noHtml') }));
  const { html } = await api.buildPage(host, files);
  const key = uid() + uid();
  const doctype = html.match(/^\s*<!doctype[^>]*>/i);
  const page = doctype ? doctype[0] + harness(tests, key) + html.slice(doctype[0].length) : harness(tests, key) + html;
  return new Promise((resolve) => {
    const frame = el('iframe', { class: 'aula-test-frame', sandbox: 'allow-scripts', tabindex: '-1', 'aria-hidden': 'true' });
    let done = false;
    const finish = (results) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      frame.remove();
      resolve(tests.map((_, i) => ({ ok: !!results[i]?.ok, got: String(results[i]?.got ?? '').slice(0, 200) })));
    };
    const onMsg = (e) => {
      if (e.source !== frame.contentWindow || !e.data || e.data.__aula !== key) return;
      finish(Array.isArray(e.data.results) ? e.data.results : []);
    };
    window.addEventListener('message', onMsg);
    setTimeout(() => finish(tests.map(() => ({ ok: false, got: t('aula.timeout') }))), 12000);
    document.body.append(frame);
    frame.srcdoc = page;
  });
}

function resultsList(tests, results) {
  const list = el('ol', { class: 'aula-results' });
  tests.forEach((x, i) => {
    const r = results[i] || {};
    const li = el('li', { class: r.ok ? 'ok' : 'fail' },
      el('span', { class: 'mark', 'aria-label': r.ok ? t('aula.passed') : t('aula.failed'), text: r.ok ? '✓' : '✗' }),
      el('span', { class: 'what', text: describeTest(x) }));
    if (!r.ok && r.got) li.append(el('span', { class: 'got', text: t('aula.got', { got: r.got }) }));
    list.append(li);
  });
  return list;
}

const score = (results) => results.filter((r) => r.ok).length;

/* ---------------- alumno: abrir un ejercicio ---------------- */

async function saveActive() {
  clearTimeout(saveSoon);
  saveSoon = null;
  if (active) await db.set(ACTIVE_KEY, active); else await db.set(ACTIVE_KEY, null);
}
const saveActiveSoon = () => { if (!saveSoon) saveSoon = setTimeout(saveActive, 4000); };

async function askName(force = false) {
  let name = (await db.get(NAME_KEY)) || '';
  if (name && !force) return name;
  name = await promptModal({ title: t('aula.nameTitle'), text: t('aula.nameText'), value: name, placeholder: t('aula.namePh') });
  if (!name) return null;
  name = name.slice(0, 80);
  await db.set(NAME_KEY, name);
  return name;
}

async function startExercise(ex) {
  if (active && active.ex.id !== ex.id) {
    const ok = await confirmModal({ title: t('aula.switchTitle'), text: t('aula.switchText', { old: active.ex.title, title: ex.title }), buttons: [t('ui.cancel'), t('aula.switchOk')] });
    if (!ok) return;
  }
  if (!active || active.ex.id !== ex.id) {
    const ok = await confirmModal({
      title: t('aula.openTitle', { title: ex.title }),
      text: t('aula.openText', { n: ex.files.length, tests: ex.tests.length }) + (ex.blockPaste ? ' ' + t('aula.openBlock') : '') + (ex.exam ? ' ' + t('aula.openExam') : ''),
      buttons: [t('ui.cancel'), t('aula.openOk')],
    });
    if (!ok) return;
  }
  const prev = (await db.get(ACTIVE_KEY));
  const same = prev && prev.ex?.id === ex.id ? prev : null;
  const name = (same?.name) || await askName();
  if (!name) { toast(t('aula.needName')); return; }
  active = same || {
    ex,
    folder: 'Aula/' + cleanFolder(ex.title),
    docIds: {},
    name,
    startedAt: Date.now(),
    activeMs: 0,
    events: [],
    lastResults: null,
    submittedAt: null,
    history: { events: [], truncated: false },
  };
  active.ex = ex;
  // Crea los archivos iniciales que falten (si ya los tenía, se conserva su trabajo).
  // Si ya hay archivos de este ejercicio en su carpeta (por ejemplo, salió y volvió a entrar), se reutilizan.
  const inFolder = (await api.allDocs()).filter((d) => (d.folder || '') === active.folder);
  for (const f of ex.files) {
    const id = active.docIds[f.name];
    if (id && await api.docText(id)) continue;
    const prevDoc = inFolder.find((d) => d.name === f.name);
    if (prevDoc) { active.docIds[f.name] = prevDoc.id; continue; }
    const rec = await api.createDoc({ name: f.name, content: f.content, savedContent: '', folder: active.folder });
    active.docIds[f.name] = rec.id;
  }
  await saveActive();
  api.refreshDocList();
  // En examen se cierran las pestañas de otros documentos.
  if (ex.exam) api.closeTabsExcept(Object.values(active.docIds));
  // Abre todos los archivos del ejercicio en pestañas y deja activo el HTML.
  for (const f of ex.files) await api.showDoc(active.docIds[f.name]);
  const first = ex.files.find((f) => /\.html?$/i.test(f.name)) || ex.files[0];
  if (first) await api.showDoc(active.docIds[first.name]);
  renderBar();
  openDrawer('instructions');
}

async function openFromHash() {
  if (!api) return false;
  if (!location.hash.includes(HASH_KEY)) return false;
  let ex;
  try {
    ex = await exerciseFromHash(location.hash);
  } catch {
    toast(t('aula.badLink'), { timeout: 10000 });
  }
  history.replaceState(null, '', location.pathname + location.search);
  if (ex) await startExercise(ex);
  return true;
}

export async function openExerciseFile(file) {
  try {
    const ex = validate(JSON.parse(await file.text()));
    await startExercise(ex);
  } catch {
    toast(t('aula.badFile', { name: file.name }), { timeout: 8000 });
  }
}

function pickFiles(accept, multiple, onFiles) {
  const input = el('input', { type: 'file', accept, hidden: true });
  input.multiple = multiple;
  input.addEventListener('change', () => { const files = [...input.files]; input.remove(); if (files.length) onFiles(files); });
  document.body.append(input);
  input.click();
}

/* ---------------- alumno: barra, instrucciones, comprobar, entregar ---------------- */

async function studentFiles() {
  const out = [];
  for (const f of active.ex.files) {
    const d = await api.docText(active.docIds[f.name]);
    out.push({ name: f.name, text: d ? d.text : '', id: d?.id });
  }
  return out;
}

function renderBar() {
  const bar = $('#aulaBar');
  bar.hidden = !active;
  document.body.classList.toggle('aula-exam', !!active?.ex.exam);
  if (!active) { closeDrawer(); api.onLayout(); return; }
  $('#aulaTitle').textContent = active.ex.title;
  $('#aulaExamBadge').hidden = !active.ex.exam;
  $('#aulaStudent').textContent = active.name;
  $('#aulaTime').textContent = t('aula.minutes', { n: fmtMin(active.activeMs) });
  const r = active.lastResults;
  const s = $('#aulaScore');
  s.hidden = !r || !active.ex.showResults || !active.ex.tests.length;
  if (r) s.textContent = t('aula.score', { ok: score(r), total: active.ex.tests.length });
  s.classList.toggle('all', !!r && score(r) === active.ex.tests.length);
  $('#aulaSubmitted').hidden = !active.submittedAt;
  if (active.submittedAt) $('#aulaSubmitted').textContent = t('aula.submittedAt', { time: fmtTime(active.submittedAt) });
  api.onLayout();
}

let drawerTab = 'instructions';
async function openDrawer(tab = drawerTab) {
  if (!active) return;
  drawerTab = tab;
  const drawer = $('#aulaDrawer');
  const body = $('#aulaDrawerBody');
  body.textContent = '';
  drawer.hidden = false;
  $('#aulaBtnInstr').classList.toggle('on', tab === 'instructions');
  $('#aulaBtnCheck').classList.toggle('on', tab === 'results');
  if (tab === 'instructions') {
    $('#aulaDrawerTitle').textContent = t('aula.instructions');
    const { renderMarkdown } = await import('../vendor/markdown.js');
    const dark = document.documentElement.dataset.theme !== 'light';
    const frame = el('iframe', { class: 'aula-instr', sandbox: 'allow-popups allow-popups-to-escape-sandbox', title: t('aula.instructions') });
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
body{margin:0;padding:14px 16px;font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:${dark ? '#dbe3f4' : '#172036'};background:${dark ? '#0f1529' : '#f6f8fc'}}
h1,h2,h3{line-height:1.25;margin:1em 0 .4em}h1{font-size:20px}h2{font-size:17px}h3{font-size:15px}
code,pre{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;background:${dark ? '#18213b' : '#e1e7f3'};border-radius:5px}
code{padding:1px 4px}pre{padding:10px;overflow:auto}pre code{padding:0;background:none}
a{color:${dark ? '#6ea2ff' : '#1f63e6'}}img{max-width:100%}li{margin:.2em 0}
</style></head><body>${renderMarkdown(active.ex.instructions || t('aula.noInstructions'))}</body></html>`;
    body.append(frame);
    if (active.ex.tests.length) {
      body.append(el('p', { class: 'aula-hint', text: active.ex.showResults ? t('aula.hintCheck', { n: active.ex.tests.length }) : t('aula.hintHidden') }));
    }
    if (active.ex.blockPaste) body.append(el('p', { class: 'aula-hint', text: t('aula.hintBlock') }));
  } else {
    $('#aulaDrawerTitle').textContent = t('aula.results');
    if (!active.ex.tests.length) body.append(el('p', { class: 'aula-hint', text: t('aula.noTests') }));
    else if (!active.ex.showResults) body.append(el('p', { class: 'aula-hint', text: t('aula.hintHidden') }));
    else if (!active.lastResults) body.append(el('p', { class: 'aula-hint', text: t('aula.checking') }));
    else {
      const ok = score(active.lastResults);
      const total = active.ex.tests.length;
      body.append(el('p', { class: 'aula-summary' + (ok === total ? ' all' : ''), text: ok === total ? t('aula.allPassed') : t('aula.score', { ok, total }) }));
      body.append(resultsList(active.ex.tests, active.lastResults));
    }
  }
  api.onLayout();
}
function closeDrawer() {
  $('#aulaDrawer').hidden = true;
  $('#aulaBtnInstr')?.classList.remove('on');
  $('#aulaBtnCheck')?.classList.remove('on');
  api?.onLayout();
}
function toggleDrawer(tab) {
  if (!$('#aulaDrawer').hidden && drawerTab === tab) closeDrawer(); else openDrawer(tab);
}

async function check({ quiet = false } = {}) {
  if (!active) return null;
  if (!active.ex.tests.length) { if (!quiet) toast(t('aula.noTests')); return []; }
  if (!quiet) { active.lastResults = null; openDrawer('results'); }
  const results = await runTests(await studentFiles(), active.ex.tests);
  active.lastResults = results;
  await saveActive();
  renderBar();
  if (!quiet) openDrawer('results');
  return results;
}

async function submit() {
  if (!active) return;
  const name = active.name || await askName();
  if (!name) return;
  const files = await studentFiles();
  const zipName = `${slug(active.ex.title)}-${slug(name)}.zip`;
  const ok = await confirmModal({
    title: t('aula.submitTitle'),
    text: t('aula.submitText', { name, file: zipName, n: files.length }),
    buttons: [t('ui.cancel'), t('aula.submitOk')],
  });
  if (!ok) return;
  const results = active.ex.tests.length ? await runTests(files, active.ex.tests) : [];
  active.lastResults = results;
  active.submittedAt = Date.now();
  const leaves = active.events.filter((e) => e.type === 'leave');
  const meta = {
    mp: 'aula-entrega',
    v: 1,
    exercise: publicExercise(active.ex),
    student: name,
    startedAt: active.startedAt,
    submittedAt: active.submittedAt,
    activeMinutes: fmtMin(active.activeMs),
    tests: { passed: score(results), total: active.ex.tests.length, results },
    exam: active.ex.exam ? {
      leaves: leaves.length,
      awaySeconds: Math.round(leaves.reduce((s, e) => s + (e.ms || 0), 0) / 1000),
      pastesBlocked: active.events.filter((e) => e.type === 'paste').length,
      events: active.events.slice(-200),
    } : null,
    files: files.map((f) => f.name),
    writing: writingStats(),
    history: { files: active.ex.files.map((f) => f.name), truncated: !!active.history?.truncated, events: active.history?.events || [] },
  };
  meta.fingerprint = await fingerprint(meta, files);
  const zip = makeZip([...files.map((f) => ({ path: f.name, text: f.text })), { path: 'entrega.json', text: JSON.stringify(meta, null, 2) }]);
  api.downloadBlob(zip, zipName);
  await saveActive();
  renderBar();
  toast(t('aula.submitted', { file: zipName }), { timeout: 12000 });
}

// Huella de la entrega: detecta cambios hechos a mano en el .zip. No es una firma: quien conozca
// el formato puede recalcularla.
function fingerprint(meta, files) {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const parts = [meta.exercise.salt, meta.exercise.id, meta.student, meta.submittedAt, meta.tests.passed,
    meta.exam ? [meta.exam.leaves, meta.exam.pastesBlocked] : null, sorted.map((f) => [f.name, normText(f.text)])];
  // Desde la versión 1.6 la huella cubre también el historial de escritura.
  if (meta.writing) parts.push(meta.writing, meta.history?.events || []);
  return sha256(JSON.stringify(parts));
}

async function leaveExercise() {
  if (!active) return;
  const ok = await confirmModal({ title: t('aula.leaveTitle'), text: t('aula.leaveText', { folder: active.folder }), buttons: [t('ui.cancel'), t('aula.leaveOk')] });
  if (!ok) return;
  active = null;
  await saveActive();
  renderBar();
  api.refreshDocList();
}

/* ---------------- bloqueo de pegado e historial de escritura ---------------- */

const exerciseDocIds = () => (active ? Object.values(active.docIds) : []);
const isExerciseDoc = (docId) => exerciseDocIds().includes(docId);
const blocks = () => !!active && (active.ex.blockPaste || active.ex.exam);
const blocksDoc = (docId) => blocks() && isExerciseDoc(docId);
const BULK = 30; // caracteres que entran de una sola vez sin pegar: un teclado de celular que pega por su cuenta, un programa que escribe solo…

// Durante un ejercicio con bloqueo no se crean ni se abren otros archivos: por ahí podría entrar código de afuera.
export function filesLocked() {
  if (!blocks()) return false;
  toast(t('aula.filesLocked'));
  return true;
}

function logEvent(type, extra = {}) {
  if (!active) return;
  active.events.push({ type, at: Date.now(), ...extra });
  if (active.events.length > 500) active.events.splice(0, active.events.length - 500);
  saveActiveSoon();
}

// Lo que se copia en un editor de Multipad. Solo eso se puede volver a pegar en un ejercicio con bloqueo,
// y solo si salió de los archivos del propio ejercicio.
export function onCopy(view, docId) {
  const st = view.state;
  const ranges = st.selection.ranges;
  const text = ranges.every((r) => r.empty)
    ? ranges.map((r) => st.doc.lineAt(r.head).text + '\n').join('')
    : ranges.filter((r) => !r.empty).map((r) => st.sliceDoc(r.from, r.to)).join(st.lineBreak);
  lastCopy = { text, docId };
}

// Devuelve true si el pegado se bloqueó.
export function onPaste(e, docId) {
  allowedExternalPaste = false;
  if (!isExerciseDoc(docId)) return false;
  const text = normText(e.clipboardData?.getData('text/plain') || '').trim();
  if (!text) return false;
  const internal = lastCopy && isExerciseDoc(lastCopy.docId) && normText(lastCopy.text).trim() === text;
  if (internal) return false;
  if (!blocks()) { allowedExternalPaste = true; return false; }
  e.preventDefault();
  logEvent('paste', { chars: text.length });
  toast(t('aula.pasteBlocked'));
  return true;
}
export function onDrop(e, docId) {
  if (!blocksDoc(docId)) return false;
  if (e.dataTransfer?.types?.includes('text/plain') && !e.dataTransfer.types.includes('application/x-multipad-tab')) {
    e.preventDefault();
    logEvent('paste', { drop: true });
    toast(t('aula.pasteBlocked'));
    return true;
  }
  return false;
}

// Filtro de transacciones: un bloque largo que entra "tecleado" de una vez (sin evento de pegar) también se bloquea.
// Devuelve true para descartar la transacción.
export function rejectInsert(docId, tr, userEvent) {
  if (!blocksDoc(docId) || !tr.docChanged || !/^input\.type/.test(userEvent || '')) return false;
  let big = false;
  tr.changes.iterChanges((_fa, _ta, _fb, _tb, ins) => { if (ins.length >= BULK) big = true; });
  if (!big) return false;
  logEvent('paste', { chars: tr.changes.newLength - tr.changes.length, typed: true });
  toast(t('aula.pasteBlocked'));
  return true;
}

// Clase de cambio: t tecleado, c autocompletado, p pegado de dentro del ejercicio, x pegado de fuera,
// b bloque grande sin pegar, d borrado, u deshacer o rehacer, o otro comando (duplicar línea, ordenar…).
function kindOf(userEvent, inserted, deleted) {
  const ue = userEvent || '';
  if (/^(undo|redo)/.test(ue)) return 'u';
  if (/^input\.paste|^input\.drop/.test(ue)) { const k = allowedExternalPaste ? 'x' : 'p'; allowedExternalPaste = false; return k; }
  if (/^input\.complete/.test(ue)) return 'c';
  if (/^input\.type/.test(ue)) return inserted >= BULK ? 'b' : 't';
  if (/^delete/.test(ue) || (!inserted && deleted)) return 'd';
  return 'o';
}

// Cada cambio de un archivo del ejercicio queda en el historial: [ms desde el inicio, archivo, clase, [[desde, hasta, texto]…]].
export function onEdit(docId, tr, userEvent) {
  if (!active || !tr.docChanged) return;
  const fileIdx = active.ex.files.findIndex((f) => active.docIds[f.name] === docId);
  if (fileIdx < 0) return;
  const h = active.history || (active.history = { events: [], truncated: false });
  if (h.truncated) return;
  const changes = [];
  let inserted = 0, deleted = 0;
  tr.changes.iterChanges((fa, ta, _fb, _tb, ins) => { const text = ins.toString(); changes.push([fa, ta, text]); inserted += text.length; deleted += ta - fa; });
  const kind = kindOf(userEvent, inserted, deleted);
  const now = Date.now() - active.startedAt;
  const last = h.events[h.events.length - 1];
  // Escritura seguida en el mismo lugar: se junta en un solo evento para que el historial no crezca de más.
  if (last && kind === 't' && last[2] === 't' && last[1] === fileIdx && changes.length === 1 && last[3].length === 1
      && changes[0][0] === changes[0][1] && changes[0][0] === last[3][0][0] + last[3][0][2].length && last[3][0][0] === last[3][0][1]
      && last[3][0][2].length < 24 && now - (last[4] ?? last[0]) < 2000) {
    last[3][0][2] += changes[0][2];
    last[4] = now;
  } else {
    h.events.push([now, fileIdx, kind, changes]);
  }
  if (h.events.length > 30000) h.truncated = true;
  saveActiveSoon();
}

function statsFrom(events, pastesBlocked) {
  const st = { typed: 0, moved: 0, external: 0, deleted: 0, bulkEvents: 0, pastesBlocked };
  for (const ev of events || []) {
    const ins = ev[3].reduce((n, c) => n + c[2].length, 0);
    st.deleted += ev[3].reduce((n, c) => n + (c[1] - c[0]), 0);
    if (ev[2] === 't' || ev[2] === 'c') st.typed += ins;
    else if (ev[2] === 'p' || ev[2] === 'o') st.moved += ins;
    else if (ev[2] === 'x' || ev[2] === 'b') { st.external += ins; if (ins >= BULK) st.bulkEvents++; }
  }
  st.handPct = st.typed + st.external ? Math.round((100 * st.typed) / (st.typed + st.external)) : 100;
  return st;
}
function writingStats() {
  return { ...statsFrom(active.history?.events, active.events.filter((e) => e.type === 'paste').length), truncated: !!active.history?.truncated };
}

// En examen, la lista del panel lateral muestra solo los archivos del examen.
export function hiddenInList(rec) {
  if (!active?.ex.exam) return false;
  return !Object.values(active.docIds).includes(rec.id);
}

let awaySince = 0;
function markAway() {
  if (!active?.ex.exam || awaySince) return;
  awaySince = Date.now();
}
function markBack() {
  if (!awaySince) return;
  const ms = Date.now() - awaySince;
  awaySince = 0;
  if (ms >= 1500) {
    logEvent('leave', { ms });
    toast(t('aula.leftWindow', { s: Math.round(ms / 1000) }));
  }
}

/* ---------------- docente: crear ejercicio ---------------- */

async function loadMine() { return (await db.get(MINE_KEY)) || []; }
async function saveMine(list) { await db.set(MINE_KEY, list); }

function field(label, input, hint) {
  return el('label', { class: 'aula-field' }, el('span', { class: 'lbl', text: label }), input, hint ? el('span', { class: 'hint', text: hint }) : null);
}

async function editor(existing = null) {
  const all = (await api.allDocs()).sort((a, b) => ((a.folder || '') + '/' + a.name).localeCompare((b.folder || '') + '/' + b.name));
  const ex = existing ? structuredClone(existing) : {
    mp: 'aula', v: 1, id: uid() + Date.now().toString(36), title: '', instructions: '', files: [], tests: [],
    exam: false, blockPaste: true, showResults: true, salt: uid() + uid(), srcIds: {},
  };
  ex.srcIds = ex.srcIds || {};

  const title = el('input', { type: 'text', value: ex.title, placeholder: t('aula.ed.titlePh'), maxlength: String(LIMITS.title) });
  const instr = el('textarea', { rows: '7', placeholder: t('aula.ed.instrPh'), spellcheck: 'true' });
  instr.value = ex.instructions;

  // Archivos iniciales: se guarda su contenido al marcarlos.
  const fileList = el('div', { class: 'aula-files' });
  const drawFiles = () => {
    fileList.textContent = '';
    if (!all.length) { fileList.append(el('p', { class: 'hint', text: t('aula.ed.noDocs') })); return; }
    for (const d of all) {
      const chosen = ex.files.find((f) => ex.srcIds[f.name] === d.id);
      const box = el('input', { type: 'checkbox' });
      box.checked = !!chosen;
      box.addEventListener('change', () => {
        ex.files = ex.files.filter((f) => ex.srcIds[f.name] !== d.id);
        if (box.checked) {
          if (ex.files.some((f) => f.name === d.name)) { box.checked = false; toast(t('aula.ed.dupName', { name: d.name })); return; }
          ex.files.push({ name: d.name, content: d.text });
          ex.srcIds[d.name] = d.id;
        }
        drawFiles();
      });
      const row = el('label', { class: 'aula-file' + (chosen ? ' on' : '') }, box,
        el('span', { class: 'nm', text: (d.folder ? d.folder + '/' : '') + d.name }));
      if (chosen) {
        const changed = normText(chosen.content) !== normText(d.text);
        row.append(el('span', { class: 'st', text: changed ? t('aula.ed.changed') : t('aula.ed.saved') }));
        if (changed) {
          const upd = el('button', { type: 'button', class: 'link-btn', text: t('aula.ed.update') });
          upd.addEventListener('click', (e) => { e.preventDefault(); chosen.content = d.text; drawFiles(); });
          row.append(upd);
        }
      }
      fileList.append(row);
    }
  };
  drawFiles();

  // Pruebas
  const testList = el('div', { class: 'aula-tests' });
  const testResults = new Map();
  const drawTests = () => {
    testList.textContent = '';
    if (!ex.tests.length) testList.append(el('p', { class: 'hint', text: t('aula.ed.noTests') }));
    ex.tests.forEach((x, i) => {
      const type = el('select', { 'aria-label': t('aula.ed.type') }, ...TEST_TYPES.map((k) => el('option', { value: k, text: t('aula.type.' + k) })));
      type.value = x.type;
      type.addEventListener('change', () => {
        const next = { type: type.value, label: x.label };
        for (const k of FIELDS[type.value]) next[k] = x[k] ?? '';
        ex.tests[i] = next;
        testResults.clear();
        drawTests();
      });
      const del = el('button', { type: 'button', class: 'icon-x', title: t('aula.ed.delTest'), 'aria-label': t('aula.ed.delTest'), text: '×' });
      del.addEventListener('click', () => { ex.tests.splice(i, 1); testResults.clear(); drawTests(); });
      const r = testResults.get(i);
      const head = el('div', { class: 'aula-test-head' }, el('span', { class: 'num', text: String(i + 1) }), type,
        r ? el('span', { class: 'res ' + (r.ok ? 'ok' : 'fail'), text: r.ok ? '✓ ' + t('aula.passed') : '✗ ' + (r.got ? t('aula.got', { got: r.got }) : t('aula.failed')) }) : null, del);
      const grid = el('div', { class: 'aula-test-grid' });
      for (const k of FIELDS[x.type]) {
        const input = el(k === 'code' ? 'textarea' : 'input', k === 'code' ? { rows: '2', spellcheck: 'false' } : { type: k === 'n' ? 'number' : 'text', min: '1', spellcheck: 'false', autocomplete: 'off' });
        input.value = x[k] ?? '';
        input.placeholder = t('aula.ph.' + (x.type === 'style' && k === 'value' ? 'styleValue' : x.type === 'attr' && k === 'value' ? 'attrValue' : k));
        input.addEventListener('input', () => { x[k] = input.value; });
        grid.append(field(t('aula.f.' + (x.type === 'click' && k === 'selector' ? 'clickSelector' : k)), input));
      }
      const label = el('input', { type: 'text', placeholder: t('aula.ph.label'), value: x.label || '' });
      label.addEventListener('input', () => { x.label = label.value; });
      grid.append(field(t('aula.f.label'), label));
      testList.append(el('div', { class: 'aula-test' }, head, grid));
    });
  };
  drawTests();
  const addTest = el('button', { type: 'button', class: 'btn', text: '+ ' + t('aula.ed.addTest') });
  addTest.addEventListener('click', () => { ex.tests.push({ type: 'exists', selector: '' }); drawTests(); testList.lastElementChild?.querySelector('input')?.focus(); });

  const tryBtn = el('button', { type: 'button', class: 'btn', text: t('aula.ed.try') });
  const trySummary = el('span', { class: 'aula-try' });
  tryBtn.addEventListener('click', async () => {
    if (!ex.tests.length) { toast(t('aula.ed.noTests')); return; }
    const docs = [];
    for (const f of ex.files) {
      const d = await api.docText(ex.srcIds[f.name]);
      docs.push({ name: f.name, text: d ? d.text : f.content, id: d?.id });
    }
    trySummary.textContent = t('aula.checking');
    const results = await runTests(docs, ex.tests.map((x) => validate({ mp: 'aula', title: 'x', tests: [x] }).tests[0]));
    testResults.clear();
    results.forEach((r, i) => testResults.set(i, r));
    trySummary.textContent = t('aula.score', { ok: score(results), total: results.length });
    drawTests();
  });

  const blockPaste = el('input', { type: 'checkbox' });
  blockPaste.checked = ex.blockPaste !== false;
  const exam = el('input', { type: 'checkbox' });
  exam.checked = ex.exam;
  // El examen siempre bloquea el pegado.
  const syncBlock = () => { if (exam.checked) blockPaste.checked = true; blockPaste.disabled = exam.checked; };
  exam.addEventListener('change', syncBlock);
  syncBlock();
  const showRes = el('input', { type: 'checkbox' });
  showRes.checked = ex.showResults;

  const collect = () => {
    ex.title = title.value.trim();
    ex.instructions = instr.value;
    ex.exam = exam.checked;
    ex.blockPaste = blockPaste.checked || exam.checked;
    ex.showResults = showRes.checked;
    // Se descartan las pruebas con campos obligatorios vacíos (en "atributo" el valor es opcional).
    ex.tests = ex.tests.filter((x) => FIELDS[x.type].every((k) => (x.type === 'attr' && k === 'value') || String(x[k] ?? '').trim() !== ''));
  };
  const ready = () => {
    collect();
    if (!ex.title) { toast(t('aula.ed.needTitle')); title.focus(); return false; }
    if (!ex.files.length) { toast(t('aula.ed.needFiles')); return false; }
    return true;
  };
  const store = async () => {
    const list = (await loadMine()).filter((x) => x.id !== ex.id);
    list.unshift({ ...structuredClone(ex), savedAt: Date.now() });
    await saveMine(list.slice(0, 100));
  };

  const linkOut = el('div', { class: 'aula-link', hidden: true });
  const copyLink = el('button', { type: 'button', class: 'btn primary', text: t('aula.ed.copyLink') });
  copyLink.addEventListener('click', async () => {
    if (!ready()) return;
    await store();
    const link = await exerciseToLink(ex);
    linkOut.hidden = false;
    linkOut.textContent = '';
    const input = el('input', { type: 'text', value: link, readonly: true });
    input.addEventListener('focus', () => input.select());
    linkOut.append(input);
    if (link.length > 12000) linkOut.append(el('p', { class: 'hint warn', text: t('aula.ed.longLink', { n: Math.round(link.length / 1000) }) }));
    linkOut.scrollIntoView({ block: 'nearest' });
    try { await navigator.clipboard.writeText(link); toast(t('aula.ed.copied')); } catch { input.focus(); }
  });
  const fileBtn = el('button', { type: 'button', class: 'btn', text: t('aula.ed.download') });
  fileBtn.addEventListener('click', async () => {
    if (!ready()) return;
    await store();
    api.downloadBlob(new Blob([JSON.stringify(publicExercise(ex), null, 2)], { type: 'application/json' }), slug(ex.title) + '.mpaula');
  });
  const saveBtn = el('button', { type: 'button', class: 'btn', text: t('ui.save') });
  saveBtn.addEventListener('click', async () => { collect(); if (!ex.title) { toast(t('aula.ed.needTitle')); return; } await store(); toast(t('aula.ed.savedMine')); });
  const closeBtn = el('button', { type: 'button', class: 'btn', text: t('ui.close') });

  const box = el('div', { class: 'modal wide aula-editor', role: 'dialog', 'aria-label': t('aula.ed.title') },
    el('h2', { text: existing ? t('aula.ed.editTitle') : t('aula.ed.title') }),
    el('div', { class: 'aula-scroll' },
      el('section', {}, el('h3', { text: '1. ' + t('aula.ed.s1') }),
        field(t('aula.ed.name'), title),
        field(t('aula.ed.instr'), instr, t('aula.ed.instrHint'))),
      el('section', {}, el('h3', { text: '2. ' + t('aula.ed.s2') }),
        el('p', { class: 'hint', text: t('aula.ed.filesHint') }), fileList),
      el('section', {}, el('h3', { text: '3. ' + t('aula.ed.s3') }),
        el('p', { class: 'hint', text: t('aula.ed.testsHint') }), testList,
        el('div', { class: 'row' }, addTest, tryBtn, trySummary)),
      el('section', {}, el('h3', { text: '4. ' + t('aula.ed.s4') }),
        el('label', { class: 'aula-check' }, blockPaste, el('span', {}, el('b', { text: t('aula.ed.blockPaste') }), el('span', { class: 'hint', text: t('aula.ed.blockPasteHint') }))),
        el('label', { class: 'aula-check' }, exam, el('span', {}, el('b', { text: t('aula.ed.exam') }), el('span', { class: 'hint', text: t('aula.ed.examHint') }))),
        el('label', { class: 'aula-check' }, showRes, el('span', {}, el('b', { text: t('aula.ed.showRes') }), el('span', { class: 'hint', text: t('aula.ed.showResHint') })))),
      el('section', {}, el('h3', { text: '5. ' + t('aula.ed.s5') }),
        el('p', { class: 'hint', text: t('aula.ed.shareHint') }),
        el('div', { class: 'row' }, copyLink, fileBtn), linkOut)),
    el('div', { class: 'actions' }, saveBtn, closeBtn));
  const close = openModal(box);
  closeBtn.addEventListener('click', async () => { collect(); if (ex.title) await store(); close(); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.target.tagName !== 'SELECT') closeBtn.click(); });
  title.focus();
}

async function myExercises() {
  const list = await loadMine();
  if (!list.length) { toast(t('aula.mine.none')); return; }
  const box = el('div', { class: 'modal wide' }, el('h2', { text: t('aula.mine.title') }));
  const wrap = el('div', { class: 'aula-mine' });
  let close;
  for (const ex of list) {
    const open = el('button', { type: 'button', class: 'btn', text: t('aula.mine.edit') });
    open.addEventListener('click', () => { close(); editor(ex); });
    const del = el('button', { type: 'button', class: 'btn', text: t('docs.removeOk') });
    del.addEventListener('click', async () => {
      const ok = await confirmModal({ title: t('aula.mine.delTitle', { title: ex.title }), text: t('aula.mine.delText') });
      if (!ok) { myExercises(); return; }
      await saveMine((await loadMine()).filter((x) => x.id !== ex.id));
      myExercises();
    });
    wrap.append(el('div', { class: 'aula-mine-row' },
      el('div', {}, el('b', { text: ex.title || '—' }), el('span', { class: 'hint', text: t('aula.mine.meta', { files: ex.files.length, tests: ex.tests.length, date: fmtTime(ex.savedAt) }) + (ex.exam ? ' · ' + t('aula.examShort') : '') })),
      el('div', { class: 'row' }, open, del)));
  }
  const closeBtn = el('button', { class: 'btn primary', text: t('ui.close') });
  box.append(wrap, el('div', { class: 'actions' }, closeBtn));
  close = openModal(box);
  closeBtn.addEventListener('click', () => close());
}

/* ---------------- docente: revisar entregas ---------------- */

async function parseSubmissions(files) {
  const found = [];
  const bad = [];
  const dec = new TextDecoder();
  const visit = async (blob, label, depth) => {
    let entries;
    try { entries = await readZip(blob); } catch { bad.push(label); return; }
    const meta = entries.find((e) => e.path.split('/').pop() === 'entrega.json');
    if (meta) {
      try {
        const m = JSON.parse(dec.decode(meta.bytes));
        if (m.mp !== 'aula-entrega') throw new Error('format');
        const dir = meta.path.slice(0, meta.path.length - 'entrega.json'.length);
        const own = (m.files || []).map((name) => {
          const e = entries.find((x) => x.path === dir + name);
          return { name: cleanName(name), text: e ? dec.decode(e.bytes) : '' };
        });
        const ex = validate(m.exercise);
        const expected = await fingerprint({ ...m, exercise: ex }, own);
        found.push({ meta: m, ex, files: own, intact: expected === m.fingerprint, source: label });
      } catch { bad.push(label); }
      return;
    }
    // Descarga de Canvas (o una carpeta comprimida): un .zip con varios .zip adentro.
    if (depth > 1) { bad.push(label); return; }
    const inner = entries.filter((e) => /\.zip$/i.test(e.path));
    if (!inner.length) { bad.push(label); return; }
    for (const e of inner) await visit(new Blob([e.bytes]), e.path.split('/').pop(), depth + 1);
  };
  for (const f of files) await visit(f, f.name, 0);
  return { found, bad };
}

async function openSubmission(s) {
  const folder = `Entregas/${cleanFolder(s.ex.title)}/${cleanFolder(s.meta.student)}`;
  const existing = (await api.allDocs()).filter((d) => (d.folder || '') === folder);
  let firstId = null;
  let htmlId = null;
  for (const f of s.files) {
    let doc = existing.find((d) => d.name === f.name && d.text === f.text);
    if (!doc) {
      const rec = await api.createDoc({ name: f.name, content: f.text, savedContent: f.text, folder });
      doc = { id: rec.id, name: f.name };
    }
    firstId = firstId || doc.id;
    if (!htmlId && /\.html?$/i.test(f.name)) htmlId = doc.id;
  }
  firstId = htmlId || firstId;
  api.refreshDocList();
  if (firstId) await api.showDoc(firstId);
  return folder;
}

function csv(rows) {
  return rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
}

async function review(initial = null, keep = null) {
  let subs = keep || [];
  const box = el('div', { class: 'modal wide aula-review', role: 'dialog' }, el('h2', { text: t('aula.rev.title') }));
  const intro = el('p', { class: 'hint', text: t('aula.rev.intro') });
  const pick = el('button', { type: 'button', class: 'btn primary', text: t('aula.rev.pick') });
  const exportBtn = el('button', { type: 'button', class: 'btn', text: t('aula.rev.csv'), disabled: true });
  const drop = el('div', { class: 'aula-drop' }, intro, el('div', { class: 'row' }, pick, exportBtn));
  const table = el('div', { class: 'aula-table-wrap' });
  const closeBtn = el('button', { type: 'button', class: 'btn', text: t('ui.close') });
  box.append(el('div', { class: 'aula-scroll' }, drop, table), el('div', { class: 'actions' }, closeBtn));
  const close = openModal(box);
  closeBtn.addEventListener('click', () => close());

  const draw = () => {
    table.textContent = '';
    exportBtn.disabled = !subs.length;
    if (!subs.length) return;
    const oneExercise = subs.every((x) => x.ex.id === subs[0].ex.id);
    const head = ['aula.rev.student', oneExercise ? null : 'aula.rev.exercise', 'aula.rev.when', 'aula.rev.tests', 'aula.rev.time', 'aula.rev.hand', 'aula.rev.pastes', 'aula.rev.leaves', 'aula.rev.check', ''].filter((k) => k !== null);
    const tbl = el('table', { class: 'aula-table' }, el('thead', {}, el('tr', {}, ...head.map((k) => el('th', { text: k ? t(k) : '' })))));
    const tb = el('tbody');
    subs.sort((a, b) => a.meta.student.localeCompare(b.meta.student));
    for (const s of subs) {
      const m = s.meta;
      const total = s.recheck ? s.recheck.length : m.tests?.total || 0;
      const passed = s.recheck ? score(s.recheck) : m.tests?.passed || 0;
      const openBtn = el('button', { type: 'button', class: 'btn sm', text: t('aula.rev.open') });
      openBtn.addEventListener('click', async () => { const folder = await openSubmission(s); close(); toast(t('aula.rev.opened', { folder })); });
      const reBtn = el('button', { type: 'button', class: 'btn sm', text: t('aula.rev.recheck') });
      const playBtn = el('button', { type: 'button', class: 'btn sm', text: t('aula.rev.replay') });
      playBtn.addEventListener('click', () => replay(s, () => review(null, subs)));
      const w = m.writing;
      const pastes = w ? w.pastesBlocked : m.exam?.pastesBlocked;
      reBtn.addEventListener('click', async () => { reBtn.disabled = true; reBtn.textContent = t('aula.checking'); s.recheck = await runTests(s.files, s.ex.tests); draw(); });
      tb.append(el('tr', {},
        el('td', {}, el('b', { text: m.student })),
        oneExercise ? null : el('td', { text: s.ex.title }),
        el('td', { text: fmtTime(m.submittedAt) }),
        el('td', { class: total && passed === total ? 'ok' : '', text: total ? `${passed}/${total}` + (s.recheck ? ' ↻' : '') : '—' }),
        el('td', { text: t('aula.minutes', { n: m.activeMinutes ?? 0 }) }),
        el('td', { class: w ? (w.handPct < 90 || w.bulkEvents ? 'warn' : 'ok') : '', text: w ? `${w.handPct}%` + (w.bulkEvents ? ` · ${t('aula.rev.blocks', { n: w.bulkEvents })}` : '') : '—' }),
        el('td', { class: pastes ? 'warn' : '', text: pastes == null ? '—' : String(pastes) }),
        el('td', { class: m.exam?.leaves ? 'warn' : '', text: m.exam ? `${m.exam.leaves} (${Math.round((m.exam.awaySeconds || 0) / 60)} min)` : '—' }),
        el('td', { class: s.intact ? 'ok' : 'warn', text: s.intact ? t('aula.rev.intact') : t('aula.rev.altered') }),
        el('td', { class: 'acts' }, openBtn, playBtn, reBtn)));
    }
    tbl.append(tb);
    table.append(tbl, el('p', { class: 'hint', text: t('aula.rev.legend') }));
  };

  const load = async (files) => {
    intro.textContent = t('aula.checking');
    const { found, bad } = await parseSubmissions(files);
    for (const s of found) {
      const i = subs.findIndex((x) => x.meta.student === s.meta.student && x.ex.id === s.ex.id);
      if (i >= 0) { if ((s.meta.submittedAt || 0) >= (subs[i].meta.submittedAt || 0)) subs[i] = s; } else subs.push(s);
    }
    intro.textContent = t('aula.rev.loaded', { n: subs.length }) + (bad.length ? ' ' + t('aula.rev.bad', { list: bad.slice(0, 5).join(', ') + (bad.length > 5 ? '…' : '') }) : '');
    draw();
  };
  pick.addEventListener('click', () => pickFiles('.zip,application/zip', true, load));
  box.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  box.addEventListener('dragleave', () => drop.classList.remove('over'));
  box.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = [...e.dataTransfer.files].filter((x) => /\.zip$/i.test(x.name)); if (f.length) load(f); });
  exportBtn.addEventListener('click', () => {
    const rows = [[t('aula.rev.student'), t('aula.rev.exercise'), t('aula.rev.when'), t('aula.rev.passed'), t('aula.rev.total'), t('aula.rev.time'), t('aula.rev.hand'), t('aula.rev.leaves'), t('aula.rev.away'), t('aula.rev.pastes'), t('aula.rev.check')]];
    for (const s of subs) {
      const m = s.meta;
      rows.push([m.student, s.ex.title, new Date(m.submittedAt).toISOString(), s.recheck ? score(s.recheck) : m.tests?.passed ?? '', s.recheck ? s.recheck.length : m.tests?.total ?? '',
        m.activeMinutes ?? '', m.writing ? m.writing.handPct : '', m.exam?.leaves ?? '', m.exam ? Math.round((m.exam.awaySeconds || 0) / 60) : '',
        m.writing ? m.writing.pastesBlocked : m.exam?.pastesBlocked ?? '', s.intact ? t('aula.rev.intact') : t('aula.rev.altered')]);
    }
    api.downloadBlob(new Blob(['﻿' + csv(rows)], { type: 'text/csv' }), 'entregas-' + slug(subs[0]?.ex.title) + '.csv');
  });
  if (initial) load(initial);
  else if (subs.length) { intro.textContent = t('aula.rev.loaded', { n: subs.length }); draw(); }
}

/* ---------------- docente: reproducir cómo se escribió ---------------- */

function replay(s, back) {
  const m = s.meta;
  const hist = m.history;
  const names = hist?.files || s.ex.files.map((f) => f.name);
  const starts = names.map((n) => s.ex.files.find((f) => f.name === n)?.content ?? '');
  const events = hist?.events || [];
  const box = el('div', { class: 'modal wide aula-replay', role: 'dialog' }, el('h2', { text: t('aula.rp.title', { name: m.student }) }));
  const closeBtn = el('button', { type: 'button', class: 'btn primary', text: t('ui.close') });
  if (!events.length) {
    box.append(el('p', { class: 'aula-hint', text: hist ? t('aula.rp.empty') : t('aula.rp.none') }), el('div', { class: 'actions' }, closeBtn));
    const close = openModal(box); closeBtn.addEventListener('click', () => { close(); back?.(); });
    return;
  }
  const w = m.writing || statsFrom(events, 0);
  const tabs = el('div', { class: 'aula-rp-tabs' });
  const code = el('pre', { class: 'aula-rp-code' });
  const slider = el('input', { type: 'range', min: '0', max: String(events.length), value: '0', 'aria-label': t('aula.rp.position') });
  const play = el('button', { type: 'button', class: 'btn primary', text: t('aula.rp.play') });
  const speed = el('select', { 'aria-label': t('aula.rp.speed') }, ...[1, 4, 16].map((x) => el('option', { value: String(x), text: `${x}×` })));
  speed.value = '4';
  const clock = el('span', { class: 'aula-rp-clock' });
  const kindLabel = el('span', { class: 'aula-rp-kind' });
  const totalMs = events[events.length - 1][4] ?? events[events.length - 1][0];
  let pos = 0, file = events[0][1], contents = [...starts], timer = null;

  const apply = (c, ev) => {
    let text = c[ev[1]];
    for (const [fa, ta, ins] of [...ev[3]].reverse()) text = text.slice(0, fa) + ins + text.slice(ta);
    c[ev[1]] = text;
  };
  const stateAt = (n) => { const c = [...starts]; for (let i = 0; i < n; i++) apply(c, events[i]); return c; };
  const fmt = (ms) => { const sec = Math.round(ms / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const draw = () => {
    tabs.textContent = '';
    names.forEach((n, i) => {
      const b = el('button', { type: 'button', class: 'aula-rp-tab' + (i === file ? ' on' : ''), text: n });
      b.addEventListener('click', () => { file = i; draw(); });
      tabs.append(b);
    });
    const last = events[pos - 1];
    code.textContent = '';
    const text = contents[file];
    if (last && last[1] === file && last[3].length === 1 && last[3][0][2]) {
      const [fa, , ins] = last[3][0];
      code.append(document.createTextNode(text.slice(0, fa)), el('mark', { class: 'k-' + last[2], text: ins }), document.createTextNode(text.slice(fa + ins.length)));
    } else code.textContent = text;
    code.querySelector('mark')?.scrollIntoView({ block: 'nearest' });
    slider.value = String(pos);
    clock.textContent = t('aula.rp.time', { t: fmt(last ? last[0] : 0), total: fmt(totalMs) });
    kindLabel.textContent = last ? t('aula.rp.k.' + last[2]) : '';
    kindLabel.className = 'aula-rp-kind' + (last && (last[2] === 'x' || last[2] === 'b') ? ' warn' : '');
  };
  const step = () => {
    if (pos >= events.length) { stop(); return; }
    apply(contents, events[pos]);
    file = events[pos][1];
    pos++;
    draw();
    const next = events[pos];
    if (!next) { stop(); return; }
    const gap = Math.min(1200, Math.max(40, next[0] - (events[pos - 1][4] ?? events[pos - 1][0])));
    timer = setTimeout(step, gap / Number(speed.value));
  };
  const stop = () => { clearTimeout(timer); timer = null; play.textContent = t('aula.rp.play'); };
  play.addEventListener('click', () => {
    if (timer) { stop(); return; }
    if (pos >= events.length) { pos = 0; contents = [...starts]; }
    play.textContent = t('aula.rp.pause');
    step();
  });
  slider.addEventListener('input', () => { stop(); pos = Number(slider.value); contents = stateAt(pos); if (pos) file = events[pos - 1][1]; draw(); });

  // ¿El historial reproduce exactamente el código entregado?
  const final = stateAt(events.length);
  const matches = names.every((n, i) => normText(final[i]) === normText(s.files.find((f) => f.name === n)?.text ?? ''));
  const stats = el('p', { class: 'aula-hint', text: t('aula.rp.stats', { typed: w.typed, moved: w.moved, external: w.external, deleted: w.deleted, pct: w.handPct }) });
  const check = el('p', { class: 'aula-hint ' + (matches && !hist.truncated ? 'ok' : 'warn'), text: hist.truncated ? t('aula.rp.truncated') : matches ? t('aula.rp.match') : t('aula.rp.mismatch') });
  box.append(stats, check, tabs, code,
    el('div', { class: 'aula-rp-controls' }, play, slider, speed, clock), kindLabel,
    el('p', { class: 'aula-hint', text: t('aula.rp.legend') }),
    el('div', { class: 'actions' }, closeBtn));
  const close = openModal(box);
  closeBtn.addEventListener('click', () => { stop(); close(); back?.(); });
  draw();
}

/* ---------------- menú e inicio ---------------- */

export function menuItems() {
  const items = [
    { title: t('aula.menu.teacher') },
    { label: t('aula.menu.create'), action: () => editor() },
    { label: t('aula.menu.mine'), action: () => myExercises() },
    { label: t('aula.menu.review'), action: () => review() },
    'sep',
    { title: t('aula.menu.student') },
    { label: t('aula.menu.open'), action: () => pickFiles('.mpaula,application/json', false, (f) => openExerciseFile(f[0])) },
  ];
  if (active) {
    items.push(
      { label: t('aula.instructions'), action: () => openDrawer('instructions') },
      { label: t('aula.check'), action: () => check() },
      { label: t('aula.submit'), action: () => submit() },
      { label: t('aula.changeName'), action: () => changeName() },
      { label: t('aula.leave'), action: () => leaveExercise() },
    );
  }
  return items;
}

async function changeName() {
  const name = await askName(true);
  if (name && active) { active.name = name; await saveActive(); renderBar(); }
}

export async function initAula(a) {
  api = a;
  active = (await db.get(ACTIVE_KEY)) || null;
  if (active) {
    try { active.ex = validate(active.ex); } catch { active = null; }
  }

  $('#aulaBtnInstr').addEventListener('click', () => toggleDrawer('instructions'));
  $('#aulaBtnCheck').addEventListener('click', () => check());
  $('#aulaBtnSubmit').addEventListener('click', () => submit());
  $('#aulaDrawerClose').addEventListener('click', () => closeDrawer());
  $('#aulaStudent').addEventListener('click', () => changeName());
  $('#aulaMore').addEventListener('click', () => {
    const r = $('#aulaMore').getBoundingClientRect();
    api.showMenu([
      { label: t('aula.changeName'), action: () => changeName() },
      { label: t('aula.menu.open'), action: () => pickFiles('.mpaula,application/json', false, (f) => openExerciseFile(f[0])) },
      'sep',
      { label: t('aula.leave'), action: () => leaveExercise() },
    ], { x: r.right - 220, y: r.bottom + 2 }, $('#aulaMore'));
  });


  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') markAway(); else markBack(); });
  window.addEventListener('blur', () => setTimeout(() => { if (!document.hasFocus()) markAway(); }, 0));
  window.addEventListener('focus', () => markBack());
  window.addEventListener('hashchange', () => openFromHash());
  window.addEventListener('pagehide', () => { if (active) db.set(ACTIVE_KEY, active); });

  // Tiempo activo: cuenta mientras la ventana está visible y con el foco.
  setInterval(() => {
    if (!active || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    active.activeMs += 5000;
    saveActiveSoon();
    $('#aulaTime').textContent = t('aula.minutes', { n: fmtMin(active.activeMs) });
  }, 5000);

  renderBar();
}

// Se llama al terminar de arrancar la app, cuando los paneles ya existen.
export const openPending = () => openFromHash();

export const aulaRefresh = () => { renderBar(); if (!$('#aulaDrawer').hidden) openDrawer(drawerTab); };
