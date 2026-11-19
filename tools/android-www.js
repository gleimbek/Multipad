// Copia los archivos de la app web a android-www/ para empaquetarlos en el .apk con Capacitor.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'android-www');
const items = ['index.html', 'preview.html', 'manifest.webmanifest', 'css', 'js', 'vendor', 'icons'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const item of items) fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });
console.log('android-www listo');
