// Almacenamiento local en IndexedDB: documentos del espacio de trabajo y valores sueltos.
const DB_NAME = 'multipad';
const DB_VERSION = 2;
let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        // Si otra ventana abre una versión nueva de la base, esta cede la conexión.
        req.result.onversionchange = () => { req.result.close(); dbPromise = null; };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  getDoc: (id) => run('docs', 'readonly', (s) => s.get(id)),
  allDocs: () => run('docs', 'readonly', (s) => s.getAll()),
  deleteDoc: (id) => run('docs', 'readwrite', (s) => { s.delete(id); }),
  async putDoc(doc) {
    try {
      await run('docs', 'readwrite', (s) => { s.put(doc); });
    } catch (err) {
      // Algunos navegadores no pueden guardar el "handle" del archivo; se guarda sin él.
      if (doc.handle) {
        const { handle, ...rest } = doc;
        await run('docs', 'readwrite', (s) => { s.put(rest); });
      } else {
        throw err;
      }
    }
  },
  // Imágenes del espacio de trabajo: {id, name, type, blob, size, updated}
  getAsset: (id) => run('assets', 'readonly', (s) => s.get(id)),
  allAssets: () => run('assets', 'readonly', (s) => s.getAll()),
  putAsset: (asset) => run('assets', 'readwrite', (s) => { s.put(asset); }),
  deleteAsset: (id) => run('assets', 'readwrite', (s) => { s.delete(id); }),
  get: (key) => run('kv', 'readonly', (s) => s.get(key)),
  set: (key, value) => run('kv', 'readwrite', (s) => { s.put(value, key); }),
};
