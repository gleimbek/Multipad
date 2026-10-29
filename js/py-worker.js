// Ejecuta Python con Pyodide (Python compilado a WebAssembly) fuera del hilo principal,
// así un bucle infinito no congela el editor y se puede detener.
// Es un worker de tipo módulo: las versiones actuales de Pyodide no funcionan en workers clásicos.
let pyodide = null;
let loadingPromise = null;

function getPyodide(indexURL) {
  if (pyodide) return Promise.resolve(pyodide);
  if (!loadingPromise) {
    postMessage({ type: 'loading' });
    loadingPromise = (async () => {
      const { loadPyodide } = await import(indexURL + 'pyodide.mjs');
      pyodide = await loadPyodide({ indexURL });
      return pyodide;
    })();
    // Si falla la descarga (sin internet), el próximo intento vuelve a probar.
    loadingPromise.catch(() => { loadingPromise = null; });
  }
  return loadingPromise;
}

self.onmessage = async (e) => {
  const { code, stdin, indexURL } = e.data;
  try {
    const py = await getPyodide(indexURL);
    postMessage({ type: 'ready' });
    py.setStdout({ batched: (text) => postMessage({ type: 'out', text }) });
    py.setStderr({ batched: (text) => postMessage({ type: 'err', text }) });
    const lines = (stdin || '').split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    let i = 0;
    py.setStdin({ stdin: () => (i < lines.length ? lines[i++] + '\n' : undefined) });
    try { await py.loadPackagesFromImports(code); } catch { /* paquete no disponible: se intenta igual */ }
    const t0 = performance.now();
    await py.runPythonAsync(code);
    postMessage({ type: 'done', ms: Math.round(performance.now() - t0) });
  } catch (err) {
    postMessage({ type: 'error', text: String(err && err.message ? err.message : err) });
  }
};
