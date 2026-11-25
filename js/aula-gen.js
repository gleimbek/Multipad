// Genera pruebas del modo aula a partir de la solución del docente.
// Lee el HTML con DOMParser (no ejecuta scripts) y propone pruebas de texto exacto, estructura,
// atributos, estilos y referencias de caracteres. El editor después corre las pruebas sobre la
// misma solución y descarta las que no pasan, así que aquí se puede proponer de más.
import { t } from './i18n.js';

const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'a', 'button', 'label', 'td', 'th', 'caption',
  'figcaption', 'dt', 'dd', 'blockquote', 'summary', 'legend', 'option', 'title', 'span', 'strong', 'em', 'small', 'address', 'pre']);
const SKIP_TAGS = /^(script|style|link|template|noscript|meta)$/;
const BASIC_ENTITIES = new Set(['&amp;', '&lt;', '&gt;', '&quot;', '&#39;', '&apos;']);
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const IS_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const DATE = /\b(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;

const q = (s) => JSON.stringify(s);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const short = (s, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const baseName = (p) => String(p).split(/[?#]/)[0].split('/').pop();
const cssId = (s) => (window.CSS?.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'));

// Selector que apunta a un solo elemento: #id si lo tiene; si no, la ruta desde body con :nth-of-type cuando hace falta.
function selectorFor(node) {
  const parts = [];
  for (let n = node; n && n.localName !== 'body' && n.localName !== 'html'; n = n.parentElement) {
    if (n.id && n.ownerDocument.querySelectorAll('#' + cssId(n.id)).length === 1) { parts.unshift('#' + cssId(n.id)); return parts.join(' > '); }
    const same = [...(n.parentElement?.children || [])].filter((x) => x.localName === n.localName);
    parts.unshift(same.length > 1 ? `${n.localName}:nth-of-type(${same.indexOf(n) + 1})` : n.localName);
  }
  return ['body', ...parts].join(' > ');
}

// Texto esperado con el correo o la fecha cambiados por un comodín: cada alumno pone los suyos.
function textMatcher(text) {
  let personal = false;
  const marks = [];
  const masked = text.replace(EMAIL, () => { personal = true; marks.push('@'); return '\u0000'; })
    .replace(DATE, () => { personal = true; marks.push('d'); return '\u0000'; });
  if (!personal) return null;
  let i = 0;
  const re = '^' + masked.split('\u0000').map(reEscape).reduce((a, b) => a + (marks[i++] === '@' ? '\\S+@\\S+\\.\\S+' : '\\S+') + b) + '$';
  const shown = masked.split('\u0000').reduce((a, b, k) => a + (marks[k - 1] === '@' ? t('aula.gen.anyEmail') : t('aula.gen.anyDate')) + b);
  return { re, shown };
}

const ownText = (node) => norm(node.textContent);
const textCode = (sel, text) => `(document.querySelector(${q(sel)})?.textContent ?? '').replace(/\\s+/g, ' ').trim() === ${q(text)}`;
const regexCode = (sel, re) => `new RegExp(${q(re)}).test((document.querySelector(${q(sel)})?.textContent ?? '').replace(/\\s+/g, ' ').trim())`;
const tagList = (doc) => [...doc.body.querySelectorAll('*')].filter((e) => !SKIP_TAGS.test(e.localName)).map((e) => e.localName);

function cssRules(text) {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    return [...sheet.cssRules].filter((r) => r instanceof CSSStyleRule);
  } catch { return []; }
}

// docs: [{ name, text }] con la solución. Devuelve una lista de pruebas en el formato del editor.
export function generateTests(docs) {
  const host = docs.find((d) => /\.html?$/i.test(d.name));
  if (!host) return [];
  const doc = new DOMParser().parseFromString(host.text, 'text/html');
  const head = [];
  const body = [];
  const style = [];
  const source = [];

  if (/^\s*<!doctype\s+html\s*>/i.test(host.text)) head.push({ type: 'js', code: "document.doctype !== null && document.doctype.name === 'html'", label: t('aula.gen.doctype') });
  const lang = doc.documentElement.getAttribute('lang');
  if (lang) head.push({ type: 'attr', selector: 'html', attr: 'lang', value: lang, label: t('aula.gen.lang', { value: lang }) });
  const charset = doc.querySelector('meta[charset]')?.getAttribute('charset');
  if (charset) head.push({ type: 'attr', selector: 'meta[charset]', attr: 'charset', value: charset, label: t('aula.gen.charset', { value: charset }) });
  for (const m of doc.querySelectorAll('meta[name][content]')) {
    const name = m.getAttribute('name');
    head.push({ type: 'attr', selector: `meta[name=${q(name)}]`, attr: 'content', value: m.getAttribute('content'), label: t('aula.gen.meta', { name, value: m.getAttribute('content') }) });
  }
  const title = doc.querySelector('head > title');
  if (title) head.push({ type: 'js', code: `document.title === ${q(norm(title.textContent))}`, label: t('aula.gen.title', { text: short(norm(title.textContent)) }) });
  if ([...doc.head.childNodes].some((n) => n.nodeType === 8)) {
    head.push({ type: 'js', code: '[...document.head.childNodes].some((n) => n.nodeType === 8)', label: t('aula.gen.headComment') });
    // Campos del comentario ("Name:", "Date:", "Class:"): se pide que estén, no su valor, que cambia por alumno.
    const comment = [...doc.head.childNodes].filter((n) => n.nodeType === 8).map((n) => n.data).join('\n');
    const keys = [...new Set([...comment.matchAll(/^[\s*-]*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{1,24}):/gm)].map((m) => m[1].trim() + ':'))];
    if (keys.length) {
      head.push({ type: 'js', label: t('aula.gen.commentKeys', { list: keys.join(' ') }),
        code: `((c) => ${q(keys)}.every((k) => c.includes(k)))([...document.head.childNodes].filter((n) => n.nodeType === 8).map((n) => n.data).join(' '))` });
    }
  }
  for (const l of doc.querySelectorAll('link[rel~="stylesheet"][href]')) {
    head.push({ type: 'exists', selector: `link[href=${q(l.getAttribute('href'))}]`, label: t('aula.gen.linkCss', { file: l.getAttribute('href') }) });
  }
  for (const s of doc.querySelectorAll('script[src]')) {
    const where = s.closest('head') ? 'head' : 'body';
    head.push({ type: 'exists', selector: `${where} script[src=${q(s.getAttribute('src'))}]`, label: t('aula.gen.script', { file: s.getAttribute('src'), where }) });
  }

  const tags = tagList(doc);
  if (tags.length) {
    body.push({ type: 'js', label: t('aula.gen.structure', { list: short(tags.join(', '), 90) }),
      code: `[...document.body.querySelectorAll('*')].filter((e) => !/^(script|style|link|template|noscript|meta)$/.test(e.localName)).map((e) => e.localName).join(' ') === ${q(tags.join(' '))}` });
  }

  const taken = new Set();
  for (const node of doc.body.querySelectorAll('*')) {
    if (!TEXT_TAGS.has(node.localName) || [...taken].some((a) => a.contains(node))) continue;
    const text = ownText(node);
    if (!text) continue;
    taken.add(node);
    const sel = selectorFor(node);
    const loose = textMatcher(text);
    body.push(loose
      ? { type: 'js', code: regexCode(sel, loose.re), label: t('aula.gen.text', { tag: node.localName, text: short(loose.shown) }) }
      : { type: 'js', code: textCode(sel, text), label: t('aula.gen.text', { tag: node.localName, text: short(text) }) });
  }

  for (const node of doc.body.querySelectorAll('img, a[href], input, label[for]')) {
    const sel = selectorFor(node);
    const attrs = { img: ['src', 'alt'], a: ['href'], input: ['type', 'name'], label: ['for'] }[node.localName] || [];
    for (const a of attrs) {
      const v = node.getAttribute(a);
      if (v == null || IS_EMAIL.test(v)) continue;
      body.push({ type: 'attr', selector: sel, attr: a, value: v, label: t('aula.gen.attr', { tag: node.localName, attr: a, value: short(v, 40) }) });
    }
  }

  const seen = new Set();
  for (const node of doc.body.querySelectorAll('[id]')) {
    const sel = '#' + cssId(node.id);
    if (seen.has(sel)) continue;
    seen.add(sel);
    body.push({ type: 'exists', selector: sel, label: t('aula.gen.exists', { selector: sel }) });
  }
  for (const node of doc.body.querySelectorAll('[class]')) {
    for (const c of node.classList) {
      const sel = '.' + cssId(c);
      if (seen.has(sel)) continue;
      seen.add(sel);
      const n = doc.body.querySelectorAll(sel).length;
      body.push(n > 1 ? { type: 'count', selector: sel, n: String(n), label: t('aula.gen.count', { selector: sel, n }) } : { type: 'exists', selector: sel, label: t('aula.gen.exists', { selector: sel }) });
    }
  }

  // CSS: el de <style> y el de los .css enlazados.
  const cssTexts = [...doc.querySelectorAll('style')].map((s) => s.textContent);
  for (const l of doc.querySelectorAll('link[rel~="stylesheet"][href]')) {
    const f = docs.find((d) => d.name === baseName(l.getAttribute('href')));
    if (f) cssTexts.push(f.text);
  }
  for (const rule of cssTexts.flatMap(cssRules)) {
    const sel = rule.selectorText;
    if (/:/.test(sel)) continue;
    try { if (!doc.querySelector(sel)) continue; } catch { continue; }
    for (const decl of rule.style.cssText.split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim();
      const value = decl.slice(i + 1).replace(/!important/i, '').trim();
      if (!prop || !value || prop.startsWith('--') || /var\(/.test(value)) continue;
      style.push({ type: 'style', selector: sel, prop, value, label: t('aula.gen.style', { selector: sel, prop, value: short(value, 40) }) });
    }
  }

  // Referencias de caracteres escritas en el código (&ndash;, &#8226;…). Los comentarios no cuentan.
  const raw = host.text.replace(/<!--[\s\S]*?-->/g, '');
  const counts = new Map();
  for (const m of raw.matchAll(/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi)) {
    if (!BASIC_ENTITIES.has(m[0].toLowerCase())) counts.set(m[0], (counts.get(m[0]) || 0) + 1);
  }
  for (const [value, n] of counts) source.push({ type: 'source', value, n: String(n), label: t(n === 1 ? 'aula.gen.entity1' : 'aula.gen.entity', { value, n }) });

  const extra = doc.querySelector('script') ? [{ type: 'noerror', label: t('aula.desc.noerror') }] : [];
  return [...head, ...body, ...source, ...style, ...extra];
}

const key = (x) => JSON.stringify(Object.keys(x).filter((k) => k !== 'label').sort().map((k) => [k, String(x[k] ?? '')]));
export const sameTest = (a, b) => key(a) === key(b);
