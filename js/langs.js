// Lenguajes disponibles y detección por extensión de archivo.
import * as CM from '../vendor/codemirror.js';

const legacy = (mode) => () => CM.StreamLanguage.define(mode);

export const LANGS = [
  { id: 'text', label: 'Texto plano', ext: ['txt', 'log', 'gitignore'], load: () => [] },
  { id: 'html', label: 'HTML', ext: ['html', 'htm', 'xhtml'], load: () => CM.html() },
  { id: 'css', label: 'CSS', ext: ['css', 'scss', 'less'], load: () => CM.css() },
  { id: 'javascript', label: 'JavaScript', ext: ['js', 'mjs', 'cjs'], load: () => CM.javascript() },
  { id: 'jsx', label: 'JavaScript (JSX)', ext: ['jsx'], load: () => CM.javascript({ jsx: true }) },
  { id: 'typescript', label: 'TypeScript', ext: ['ts', 'mts', 'cts'], load: () => CM.javascript({ typescript: true }) },
  { id: 'tsx', label: 'TypeScript (TSX)', ext: ['tsx'], load: () => CM.javascript({ typescript: true, jsx: true }) },
  { id: 'json', label: 'JSON', ext: ['json', 'webmanifest', 'jsonc'], load: () => CM.json() },
  { id: 'php', label: 'PHP', ext: ['php', 'phtml'], load: () => CM.php() },
  { id: 'python', label: 'Python', ext: ['py', 'pyw'], load: () => CM.python() },
  { id: 'java', label: 'Java', ext: ['java'], load: () => CM.java() },
  { id: 'kotlin', label: 'Kotlin', ext: ['kt', 'kts'], load: legacy(CM.kotlin) },
  { id: 'csharp', label: 'C#', ext: ['cs'], load: legacy(CM.csharp) },
  { id: 'cpp', label: 'C / C++', ext: ['c', 'h', 'cpp', 'hpp', 'cc', 'cxx', 'ino'], load: () => CM.cpp() },
  { id: 'rust', label: 'Rust', ext: ['rs'], load: () => CM.rust() },
  { id: 'go', label: 'Go', ext: ['go'], load: legacy(CM.go) },
  { id: 'ruby', label: 'Ruby', ext: ['rb'], load: legacy(CM.ruby) },
  { id: 'sql', label: 'SQL', ext: ['sql'], load: () => CM.sql() },
  { id: 'markdown', label: 'Markdown', ext: ['md', 'markdown'], load: () => CM.markdown() },
  { id: 'xml', label: 'XML / SVG', ext: ['xml', 'svg', 'xsl', 'plist', 'csproj'], load: () => CM.xml() },
  { id: 'yaml', label: 'YAML', ext: ['yml', 'yaml'], load: legacy(CM.yaml) },
  { id: 'shell', label: 'Shell / Bash', ext: ['sh', 'bash', 'zsh', 'env'], load: legacy(CM.shell) },
  { id: 'powershell', label: 'PowerShell', ext: ['ps1', 'psm1'], load: legacy(CM.powerShell) },
];

const SPECIAL_NAMES = {
  dockerfile: 'shell',
  makefile: 'shell',
  '.bashrc': 'shell',
  '.zshrc': 'shell',
  '.env': 'shell',
  '.htaccess': 'text',
};

const cache = new Map();

export function langById(id) {
  return LANGS.find((l) => l.id === id) || LANGS[0];
}

export function langExtension(id) {
  if (!cache.has(id)) cache.set(id, langById(id).load());
  return cache.get(id);
}

export function detectLang(name = '') {
  const lower = name.toLowerCase();
  if (SPECIAL_NAMES[lower]) return SPECIAL_NAMES[lower];
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return 'text';
  const ext = lower.slice(dot + 1);
  const found = LANGS.find((l) => l.ext.includes(ext));
  return found ? found.id : 'text';
}
