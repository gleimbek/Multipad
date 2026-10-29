# Regenerar vendor/codemirror.js

Solo hace falta si agregas lenguajes o funciones de CodeMirror.

```bash
cd tools
npm init -y
npm i esbuild codemirror @codemirror/state @codemirror/view @codemirror/commands @codemirror/search @codemirror/language @codemirror/autocomplete @codemirror/theme-one-dark @codemirror/lang-javascript @codemirror/lang-html @codemirror/lang-css @codemirror/lang-python @codemirror/lang-java @codemirror/lang-php @codemirror/lang-json @codemirror/lang-markdown @codemirror/lang-sql @codemirror/lang-xml @codemirror/lang-cpp @codemirror/lang-rust @codemirror/legacy-modes
npx esbuild codemirror-entry.js --bundle --format=esm --minify --legal-comments=none --outfile=../vendor/codemirror.js
```

No subas `tools/node_modules` al repositorio (ya está en `.gitignore`).
