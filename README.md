# Multipad

[English version](README.en.md)

Editor de código que corre en el navegador y se instala como app en computadora, tablet y celular. La idea viene de Notepad++, con dos diferencias: puedes dividir cada ventana en varios paneles y puedes tener varias ventanas de la app abiertas a la vez, cada una con su propio contenido (por ejemplo, una en cada monitor).

No necesita servidor ni base de datos. Es HTML, CSS y JavaScript sin frameworks, y se publica gratis en GitHub Pages.

## Qué hace

- Interfaz en español e inglés (botón ES/EN arriba a la derecha, o Ver → Idioma de la interfaz). Arranca en el idioma del navegador.
- Botón **Ejecutar** (F5) con panel de vista previa y consola. Detalle más abajo.
- Menú **Lenguaje** como el de Notepad++: lista todos los lenguajes, marca el del documento y deja cambiarlo. El lenguaje actual también se ve junto a Ejecutar y en la barra de estado.
- Pestañas con indicador de cambios sin guardar, reordenables arrastrando.
- Hasta 4 paneles por ventana, en fila o en columna, con divisores que se arrastran (doble clic en el divisor los empareja).
- Mover una pestaña a otro panel, o clonarla para ver el mismo archivo en dos lugares.
- Varias ventanas de Multipad al mismo tiempo. Cada una recuerda sus pestañas y paneles.
- "Ventana nueva en otra pantalla": abre la ventana directamente en el segundo monitor (Chrome y Edge de escritorio).
- Pasar pestañas entre ventanas: arrastrándolas o con "Enviar a otra ventana…".
- Si el mismo archivo está abierto en dos ventanas, lo que escribes en una aparece en la otra.
- Resaltado de sintaxis para HTML, CSS, JavaScript/TypeScript, JSON, PHP, Python, Java, Kotlin, C#, C/C++, Rust, Go, Ruby, SQL, Markdown, XML, YAML, Shell y PowerShell.
- Buscar y reemplazar (con expresiones regulares), ir a línea, selección múltiple, plegado de código, autocompletado, comentar líneas, ordenar líneas, mayúsculas/minúsculas.
- Respeta el fin de línea del archivo (LF o CRLF) y permite cambiarlo desde la barra de estado.
- Tema oscuro, claro o automático, y tamaño de letra ajustable.
- Barra de teclas extra en pantallas táctiles (tabulación, llaves, paréntesis, flechas, deshacer).
- Panel lateral con carpetas abiertas y la lista de todos los documentos del espacio de trabajo.
- Funciona sin conexión una vez instalada. Python y SQL necesitan internet la primera vez que se usan (se descargan de jsDelivr); Judge0 siempre necesita internet.

## Lenguajes y ejecución

Multipad elige el lenguaje por la extensión. Si no acierta, se cambia desde el menú Lenguaje o con Alt+L. En el menú, los lenguajes con ▶ se pueden ejecutar.

| Lenguaje | Qué pasa al pulsar Ejecutar | Dónde corre |
|---|---|---|
| HTML | Vista previa en vivo. Incluye los `.css` y `.js` que enlaza si están abiertos en Multipad con el mismo nombre. | Navegador |
| CSS | Muestra el HTML que lo enlaza; si ninguno lo usa, una página de ejemplo | Navegador |
| JavaScript | Si un HTML lo enlaza, muestra ese HTML; si no, lo ejecuta y `console.log` sale en la consola | Navegador |
| Markdown | Vista previa formateada | Navegador |
| SVG | Vista previa de la imagen | Navegador |
| Python | Ejecuta con Pyodide. `input()` lee de la caja stdin | Navegador (descarga ~12 MB la primera vez) |
| SQL | Ejecuta en SQLite y muestra las tablas de resultado | Navegador |
| JSON | Revisa que sea válido y lo formatea | Navegador |
| Java, C, C++, C#, Kotlin, Go, Rust, Ruby, PHP, Bash, TypeScript | Compila y ejecuta | Servidor Judge0 |
| YAML, PowerShell, JSX, TSX, texto | Solo edición | — |

El panel tiene dos pestañas: **Vista previa** y **Consola**. Con "En vivo" activado, la vista previa de HTML, CSS y Markdown se actualiza mientras escribes. El botón ⧉ abre la vista previa en una ventana aparte, que puedes llevar al segundo monitor (también: Ejecutar → Vista previa en otra pantalla).

Si el programa lee del teclado (`input()`, `Scanner`, `cin`), escribe las respuestas en **stdin**, una por línea, antes de ejecutar.

### Sobre Judge0

Los lenguajes compilados necesitan un servidor. Por defecto Multipad usa `https://ce.judge0.com`, la instancia pública de Judge0. No pude probarla desde mi entorno, así que conviene verificarla en tu dispositivo con un "hola mundo" en Java. Si falla, hay dos opciones en Ejecutar → Servidor para Java, C++, C#…:

- Judge0 por RapidAPI: dirección `https://judge0-ce.p.rapidapi.com` y tu clave (tiene un plan gratuito con límite diario).
- Tu propio Judge0 (Docker): su dirección y su token.

El código que ejecutas en Judge0 se envía a ese servidor. Python, JavaScript, SQL, HTML y Markdown nunca salen del dispositivo.

En Java, la clase pública debe llamarse `Main`.

## Dónde se guardan los archivos

Hay dos lugares y conviene tenerlos claros:

1. **Espacio de trabajo (automático).** Todo lo que escribes se guarda solo en el almacenamiento del navegador de ese dispositivo. Si cierras la pestaña o la ventana, el documento sigue en el panel lateral, en "Documentos del espacio".
2. **Archivo en disco (cuando guardas).** Depende del navegador:

| Navegador | Abrir | Guardar (Ctrl+S) | Abrir carpeta |
|---|---|---|---|
| Chrome / Edge en Windows, Mac, Linux, ChromeOS | Sí | Escribe directo en el archivo original | Sí |
| Chrome en Android | Sí | Descarga una copia | No |
| Safari en iPhone / iPad | Sí (desde la app Archivos) | Abre "Compartir" → "Guardar en Archivos" | No |
| Firefox | Sí | Descarga una copia | No |

El espacio de trabajo es local a cada dispositivo: lo que escribes en la tablet no aparece solo en la computadora. Para llevar archivos entre dispositivos, guárdalos en una carpeta sincronizada (OneDrive, Google Drive, iCloud) o en un repositorio.

## Probarlo en tu computadora

El service worker no funciona abriendo `index.html` con doble clic; hace falta un servidor local. Cualquiera de estas opciones sirve:

```bash
# Python
python -m http.server 8080
# luego abre http://localhost:8080
```

O copia la carpeta a `htdocs` de XAMPP y abre `http://localhost/multipad/`.

## Publicarlo en GitHub Pages

1. Crea un repositorio vacío en GitHub llamado `multipad` (sin README, para no tener conflictos).
2. Desde esta carpeta:

   ```bash
   git remote add origin https://github.com/gleimbek/multipad.git
   git branch -M main
   git push -u origin main
   ```

3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guarda.
4. En un par de minutos queda en `https://gleimbek.github.io/multipad/`.

### Cuando publiques cambios

Abre `sw.js` y sube el número de `VERSION` (por ejemplo `multipad-v1.0.1`). Si no lo cambias, los dispositivos que ya instalaron la app siguen usando la versión en caché. Con el número nuevo, cada dispositivo muestra el aviso "Hay una versión nueva" y se actualiza con un toque.

## Instalarlo en cada dispositivo

Abre `https://gleimbek.github.io/multipad/` y:

- **Windows / Mac / Linux (Chrome o Edge):** el ícono de instalar en la barra de direcciones, o menú **Archivo → Instalar Multipad**. Queda como app con su propia ventana y en el menú Inicio/Launchpad. En Windows además aparece en "Abrir con…" para archivos de código.
- **Android (Chrome):** menú ⋮ → **Instalar aplicación** (o "Agregar a la pantalla principal").
- **iPhone / iPad (Safari):** botón Compartir → **Agregar a pantalla de inicio**.

## Dos pantallas

En una computadora con dos monitores:

1. Menú **Ventana → Ventana nueva en otra pantalla** (o el botón con dos monitores en la barra).
2. La primera vez, Chrome/Edge pide permiso de "administración de ventanas". Acéptalo; si no, la ventana se abre igual y la arrastras al otro monitor.
3. Cada ventana tiene nombre ("Ventana 1", "Ventana 2"…). Haz clic en el nombre, arriba a la derecha, para cambiarlo, por ejemplo "Monitor izquierdo".
4. Para pasar un archivo de un monitor al otro: arrastra la pestaña a la otra ventana, o clic derecho en la pestaña → **Enviar a otra ventana…**.

Si cierras una ventana, sus pestañas no se pierden: **Ventana → Reabrir ventana cerrada…**.

En tablets, "varias ventanas" depende del sistema: en Android puedes usar pantalla dividida con dos ventanas de Chrome; en iPad, Split View de Safari con dos pestañas de Multipad. La app instalada en la pantalla de inicio del iPad abre una sola instancia, es una limitación de iPadOS.

## Atajos principales

| Acción | Atajo |
|---|---|
| Ejecutar / vista previa | F5 o Ctrl+Enter |
| Detener | Shift+F5 |
| Panel de ejecución | Ctrl+Shift+P |
| Cambiar lenguaje | Alt+L |
| Nuevo | Alt+N |
| Abrir | Ctrl+O |
| Guardar / Guardar como | Ctrl+S / Ctrl+Shift+S |
| Cerrar pestaña | Alt+W |
| Pestaña siguiente | Ctrl+Tab |
| Buscar / Reemplazar | Ctrl+F / Ctrl+H |
| Ir a línea | Ctrl+G |
| Dividir panel | Ctrl+\ |
| Mover pestaña al otro panel | Alt+M |
| Ventana nueva | Alt+Shift+N |
| Panel lateral | Ctrl+B |
| Ajuste de línea | Alt+Z |

En Mac, Cmd en lugar de Ctrl. Los atajos de "nuevo" y "cerrar" usan Alt porque en una pestaña normal del navegador Ctrl+N y Ctrl+W los toma el navegador.

## Estructura

```
index.html              interfaz
css/styles.css          estilos (tema oscuro y claro)
preview.html            ventana aparte para la vista previa
js/app.js               pestañas, paneles, ventanas, archivos, menús
js/runner.js            panel de ejecución y vista previa
js/py-worker.js         Python (Pyodide) en un worker, para poder detenerlo
js/i18n.js              textos en español e inglés
js/util.js              avisos, ventanas modales y utilidades
js/db.js                almacenamiento local (IndexedDB)
js/langs.js             lenguajes y detección por extensión
vendor/codemirror.js    CodeMirror 6 empaquetado en un solo archivo (licencia MIT)
vendor/markdown.js      marked + DOMPurify para la vista previa de Markdown
sw.js                   caché para uso sin conexión
manifest.webmanifest    datos para instalar la app
icons/                  íconos
```

`vendor/codemirror.js` ya viene compilado, así que no hace falta `npm` para usar ni publicar la app. Si algún día quieres agregar un lenguaje, el paquete se regenera con esbuild a partir de los paquetes `@codemirror/*`.
