// Marcado de errores de sintaxis mientras se escribe.
// JavaScript usa Acorn (mensajes precisos); JSON usa el analizador del navegador;
// el resto usa el árbol sintáctico que CodeMirror ya construye para resaltar el código.
import * as CM from '../vendor/codemirror.js';
import { t, getLang } from './i18n.js';

const DELAY = 700;

// Etiquetas HTML que siempre deben cerrarse (las demás, como <p> o <li>, pueden cerrarse solas).
const MUST_CLOSE = new Set([
  'div', 'span', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main', 'a', 'b', 'i', 'u', 'em', 'strong',
  'small', 'ul', 'ol', 'table', 'button', 'form', 'label', 'select', 'textarea', 'script', 'style', 'title',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code', 'blockquote', 'figure', 'figcaption', 'canvas', 'svg',
  'video', 'audio', 'iframe', 'details', 'summary', 'mark', 'sup', 'sub', 'q', 'abbr', 'cite', 'fieldset', 'legend',
]);

const TREE_LANGS = new Set(['html', 'css', 'python', 'java', 'php', 'cpp', 'rust', 'typescript', 'jsx', 'tsx', 'xml', 'sql']);

// Traducción de los mensajes más comunes de Acorn.
const JS_MESSAGES_ES = [
  [/^Unexpected token$/, 'Símbolo inesperado'],
  [/^Unterminated string constant$/, 'Faltan las comillas de cierre del texto'],
  [/^Unterminated template$/, 'Falta cerrar la plantilla con `'],
  [/^Unterminated comment$/, 'Falta cerrar el comentario con */'],
  [/^Unterminated regular expression$/, 'Falta cerrar la expresión regular'],
  [/^Unexpected character '(.*)'$/, 'Carácter inesperado: $1'],
  [/^Identifier '(.*)' has already been declared$/, "La variable '$1' ya fue declarada"],
  [/^Assigning to rvalue$/, 'No se le puede asignar un valor a esto'],
  [/^Unexpected keyword '(.*)'$/, "Palabra reservada inesperada: '$1'"],
  [/^The keyword '(.*)' is reserved$/, "'$1' es una palabra reservada"],
  [/^Invalid left-hand side in (.*)$/, 'Lado izquierdo inválido'],
  [/^Unexpected reserved word$/, 'Palabra reservada inesperada'],
  [/^Complex binding patterns require an initialization value$/, 'Falta el valor inicial (=)'],
  [/^Missing initializer in const declaration$/, 'A una constante (const) hay que darle un valor'],
  [/^Deleting local variable in strict mode$/, 'No se puede borrar una variable local'],
];

function translateJs(msg) {
  const clean = msg.replace(/\s*\(\d+:\d+\)$/, '');
  if (getLang() !== 'es') return clean;
  for (const [re, es] of JS_MESSAGES_ES) if (re.test(clean)) return clean.replace(re, es);
  return clean;
}

function errorRange(doc, pos) {
  if (pos >= doc.length) return { from: Math.max(0, doc.length - 1), to: doc.length };
  const line = doc.lineAt(pos);
  return { from: pos, to: Math.min(line.to, pos + 1) || pos + 1 };
}

function jsLint(view) {
  const code = view.state.doc.toString();
  if (!code.trim()) return [];
  const opts = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowHashBang: true };
  try {
    CM.acornParse(code, { ...opts, sourceType: 'script' });
    return [];
  } catch (err) {
    let e = err;
    if (/sourceType: module|import\.meta/.test(err.message)) {
      try { CM.acornParse(code, { ...opts, sourceType: 'module' }); return []; } catch (err2) { e = err2; }
    }
    if (typeof e.pos !== 'number') return [];
    const atEnd = e.pos >= code.trimEnd().length;
    const message = atEnd && /Unexpected token/.test(e.message) ? t('lint.unclosed') : translateJs(e.message);
    return [{ ...errorRange(view.state.doc, e.pos), severity: 'error', message, source: 'JavaScript' }];
  }
}

// Validador de JSON propio: los navegadores no siempre dicen en qué posición está el error.
function jsonError(text) {
  let i = 0;
  const fail = (key, pos = i) => { throw { pos, key }; };
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const value = () => {
    ws();
    const c = text[i];
    if (c === '{') return object();
    if (c === '[') return array();
    if (c === '"') return string();
    if (c === '-' || (c >= '0' && c <= '9')) return number();
    for (const w of ['true', 'false', 'null']) if (text.startsWith(w, i)) { i += w.length; return; }
    if (c === "'") fail('json.singleQuote');
    fail(i >= text.length ? 'json.end' : 'json.value');
  };
  const string = () => {
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\') i++;
      else if (text[i] === '\n') fail('json.unclosedString');
      i++;
    }
    if (i >= text.length) fail('json.unclosedString');
    i++;
  };
  const number = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail('json.value');
    i += m[0].length;
  };
  const array = () => {
    i++; ws();
    if (text[i] === ']') { i++; return; }
    for (;;) {
      value(); ws();
      if (text[i] === ',') { i++; ws(); if (text[i] === ']') fail('json.trailingComma', i - 1); continue; }
      if (text[i] === ']') { i++; return; }
      fail(i >= text.length ? 'json.end' : 'json.comma');
    }
  };
  const object = () => {
    i++; ws();
    if (text[i] === '}') { i++; return; }
    for (;;) {
      ws();
      if (text[i] !== '"') fail(i >= text.length ? 'json.end' : 'json.key');
      string(); ws();
      if (text[i] !== ':') fail('json.colon');
      i++;
      value(); ws();
      if (text[i] === ',') { i++; ws(); if (text[i] === '}') fail('json.trailingComma', i - 1); continue; }
      if (text[i] === '}') { i++; return; }
      fail(i >= text.length ? 'json.end' : 'json.comma');
    }
  };
  try {
    value(); ws();
    if (i < text.length) fail('json.extra');
    return null;
  } catch (e) {
    if (e && typeof e.pos === 'number') return e;
    throw e;
  }
}

function jsonLint(view) {
  const code = view.state.doc.toString();
  if (!code.trim()) return [];
  const err = jsonError(code);
  if (!err) return [];
  return [{ ...errorRange(view.state.doc, err.pos), severity: 'error', message: t('lint.' + err.key), source: 'JSON' }];
}

function treeLint(view, lang) {
  const { state } = view;
  const doc = state.doc;
  const out = [];
  const seenLines = new Set();
  const add = (from, to, message) => {
    const line = doc.lineAt(Math.min(from, doc.length)).number;
    if (seenLines.has(line) || out.length >= 30) return;
    seenLines.add(line);
    if (to <= from) ({ from, to } = errorRange(doc, from));
    out.push({ from, to, severity: 'error', message });
  };
  const trimmedEnd = doc.toString().trimEnd().length;
  const htmlLevel = (node) => {
    const p = node.parent;
    return p && (p.name === 'Element' || p.name === 'Document' || p.name === 'OpenTag' || p.name === 'CloseTag');
  };
  CM.syntaxTree(state).iterate({
    enter(ref) {
      const node = ref.node;
      if (lang === 'html') {
        if (ref.name === 'MismatchedCloseTag') {
          add(ref.from, ref.to, t('lint.htmlMismatch'));
          return;
        }
        if (ref.name === 'Element') {
          const open = node.getChild('OpenTag');
          const name = open?.getChild('TagName');
          if (name && !node.getChild('CloseTag') && !node.getChild('SelfClosingTag')) {
            const tag = doc.sliceString(name.from, name.to).toLowerCase();
            if (MUST_CLOSE.has(tag)) add(open.from, open.to, t('lint.htmlUnclosed', { tag }));
          }
          return;
        }
        if (ref.type.isError && htmlLevel(node)) return;
      }
      if (ref.type.isError) {
        add(ref.from, ref.to, ref.from >= trimmedEnd ? t('lint.unclosed') : t('lint.syntax'));
      }
    },
  });
  return out;
}

export function lintFor(lang) {
  if (lang === 'javascript') return CM.linter(jsLint, { delay: DELAY });
  if (lang === 'json') return CM.linter(jsonLint, { delay: DELAY });
  if (TREE_LANGS.has(lang)) return CM.linter((view) => treeLint(view, lang), { delay: DELAY });
  return [];
}

export const LINTED = new Set(['javascript', 'json', ...TREE_LANGS]);
