// Versión de escritorio de Multipad (Windows, Mac y Linux).
// Sirve los mismos archivos de la app web desde un protocolo propio (app://multipad),
// así funcionan IndexedDB, BroadcastChannel entre ventanas y las APIs de archivos.
const { app, BrowserWindow, protocol, net, shell, session, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'app://multipad';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function windowOptions() {
  return {
    width: 1280,
    height: 860,
    backgroundColor: '#0b1020',
    icon: path.join(ROOT, 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  };
}

function setupWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Ventanas nuevas de Multipad y la vista previa aparte se abren dentro de la app.
    if (url.startsWith(ORIGIN)) {
      return { action: 'allow', overrideBrowserWindowOptions: windowOptions() };
    }
    // Enlaces externos, en el navegador del sistema.
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
}

app.on('browser-window-created', (_e, win) => setupWindow(win));

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // Permisos que usa Multipad: varias pantallas y acceso a archivos.
  const allowed = new Set(['window-management', 'fileSystem', 'clipboard-sanitized-write', 'clipboard-read']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

  const win = new BrowserWindow(windowOptions());
  win.loadURL(`${ORIGIN}/index.html`);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) new BrowserWindow(windowOptions()).loadURL(`${ORIGIN}/index.html`);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
