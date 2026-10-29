// Textos de la interfaz en español e inglés.
const DICT = {
  es: {
    'ui.cancel': 'Cancelar', 'ui.ok': 'Aceptar', 'ui.close': 'Cerrar', 'ui.filter': 'Filtrar…', 'ui.save': 'Guardar',

    'menu.file': 'Archivo', 'menu.edit': 'Editar', 'menu.view': 'Ver', 'menu.language': 'Lenguaje', 'menu.run': 'Ejecutar',
    'menu.window': 'Ventana', 'menu.help': 'Ayuda', 'menu.all': 'Menú',

    'top.sidebar': 'Panel lateral (Ctrl+B)', 'top.new': 'Nuevo (Alt+N)', 'top.open': 'Abrir (Ctrl+O)', 'top.save': 'Guardar (Ctrl+S)',
    'top.splitRight': 'Dividir a la derecha (Ctrl+\\)', 'top.splitDown': 'Dividir abajo', 'top.newWindow': 'Ventana nueva (Alt+Shift+N)',
    'top.otherScreen': 'Ventana en otra pantalla', 'top.run': 'Ejecutar', 'top.runTitle': 'Ejecutar o ver vista previa (F5)',
    'top.uiLang': 'Idioma de la interfaz: cambiar a inglés', 'top.winLabel': 'Nombre de esta ventana (clic para renombrar)',

    'act.files': 'Archivos', 'act.search': 'Buscar', 'act.run': 'Ejecutar', 'act.settings': 'Ajustes', 'set.title': 'Ajustes', 'side.folders': 'Carpetas', 'side.openFolder': 'Abrir carpeta', 'side.docs': 'Documentos del espacio',
    'folder.none': 'Ninguna carpeta abierta.', 'folder.needChrome': 'Abrir carpetas requiere Chrome o Edge de escritorio.',
    'folder.remove': 'Quitar carpeta de la lista', 'folder.noPermission': 'Sin permiso para leer la carpeta.',
    'folder.tapToAllow': 'Toca la carpeta para dar permiso', 'folder.unsupported': 'Este navegador no permite abrir carpetas completas. Usa Archivo → Abrir para elegir archivos.',
    'docs.none': 'No hay documentos.', 'docs.remove': 'Quitar del espacio de trabajo', 'docs.onlyWorkspace': 'solo en el espacio de trabajo',
    'docs.removeTitle': 'Quitar "{name}"', 'docs.removeOk': 'Quitar',
    'docs.removeDirty': 'Tiene cambios que no se guardaron en un archivo. Si lo quitas, esos cambios se pierden. El archivo en disco (si existe) no se toca.',
    'docs.removeClean': 'Se cierra en todas las ventanas. El archivo en disco (si existe) no se toca.',

    'pane.options': 'Opciones del panel', 'pane.empty': 'Panel vacío', 'pane.documents': 'Documentos', 'pane.title': 'Panel',
    'pane.hintTouch': 'Usa el menú ⋮ de cada pestaña para moverla aquí.', 'pane.hintMouse': 'También puedes arrastrar pestañas o archivos a este panel.',
    'pane.closeAllTabs': 'Cerrar todas las pestañas', 'pane.tagline': 'Escribe. Edita. Ejecuta.',

    'tab.close': 'Cerrar', 'tab.closeOthers': 'Cerrar las demás', 'tab.moveOther': 'Mover al otro panel', 'tab.cloneOther': 'Clonar en el otro panel',
    'tab.sendWindow': 'Enviar a otra ventana…', 'tab.newWindow': 'Abrir en ventana nueva', 'tab.otherScreen': 'Abrir en otra pantalla',
    'tab.noFile': 'sin archivo en disco',

    'cmd.new': 'Nuevo', 'cmd.open': 'Abrir…', 'cmd.openShort': 'Abrir…', 'cmd.openFolder': 'Abrir carpeta…', 'cmd.save': 'Guardar',
    'cmd.saveAs': 'Guardar como…', 'cmd.saveAll': 'Guardar todo', 'cmd.rename': 'Renombrar…', 'cmd.closeTab': 'Cerrar pestaña',
    'cmd.closeAll': 'Cerrar todas', 'cmd.install': 'Instalar Multipad en este dispositivo',
    'cmd.undo': 'Deshacer', 'cmd.redo': 'Rehacer', 'cmd.find': 'Buscar y reemplazar', 'cmd.goto': 'Ir a línea…',
    'cmd.comment': 'Comentar / descomentar', 'cmd.dupLine': 'Duplicar línea', 'cmd.delLine': 'Borrar línea', 'cmd.upper': 'MAYÚSCULAS',
    'cmd.lower': 'minúsculas', 'cmd.sortLines': 'Ordenar líneas', 'cmd.trim': 'Quitar espacios al final',
    'cmd.sidebar': 'Panel lateral', 'cmd.runPanel': 'Panel de ejecución', 'cmd.splitRight': 'Dividir a la derecha', 'cmd.splitDown': 'Dividir abajo',
    'cmd.columnPanes': 'Paneles en columna', 'cmd.moveOther': 'Mover pestaña al otro panel', 'cmd.cloneOther': 'Clonar pestaña en el otro panel',
    'cmd.closePane': 'Cerrar panel', 'cmd.wrap': 'Ajuste de línea', 'cmd.whitespace': 'Mostrar espacios', 'cmd.autocomplete': 'Autocompletar',
    'cmd.mobileKeys': 'Teclas táctiles', 'cmd.tabSize': 'Tabulación…', 'cmd.themeAuto': 'Tema automático', 'cmd.themeDark': 'Tema oscuro',
    'cmd.themeLight': 'Tema claro', 'cmd.zoomIn': 'Letra más grande', 'cmd.zoomOut': 'Letra más chica', 'cmd.zoomReset': 'Tamaño normal ({n}px)',
    'cmd.uiLanguage': 'Idioma de la interfaz', 'cmd.languageOf': 'Lenguaje: {lang}…',
    'cmd.run': 'Ejecutar / vista previa', 'cmd.stop': 'Detener', 'cmd.runAuto': 'Actualizar vista previa al escribir',
    'cmd.previewWindow': 'Vista previa en ventana aparte', 'cmd.previewScreen': 'Vista previa en otra pantalla',
    'cmd.server': 'Servidor para Java, C++, C#…',
    'cmd.newWindow': 'Ventana nueva', 'cmd.otherScreen': 'Ventana nueva en otra pantalla', 'cmd.sendWindow': 'Enviar pestaña a otra ventana…',
    'cmd.reopenWindow': 'Reabrir ventana cerrada…', 'cmd.renameWindow': 'Renombrar esta ventana…', 'cmd.fullscreen': 'Pantalla completa',

    'lang.text': 'Texto plano', 'lang.needDoc': 'Abre o crea un documento primero.', 'lang.pickTitle': 'Lenguaje de {name}',
    'lang.menuTitle': 'Lenguaje de {name}', 'lang.menuTitleNone': 'Sin documento activo', 'lang.whatRuns': '¿Qué lenguajes se pueden ejecutar?',
    'lang.badgeTitle': 'Lenguaje del documento (clic para cambiarlo). Ejecutar: {where}',
    'lang.tableTitle': 'Lenguajes y ejecución',
    'lang.tableIntro': 'Multipad elige el lenguaje por la extensión del archivo. Si no acierta, cámbialo desde el menú Lenguaje, la insignia junto a Ejecutar o la barra de estado (Alt+L).',
    'lang.colLang': 'Lenguaje', 'lang.colExt': 'Extensiones', 'lang.colRun': 'Al pulsar Ejecutar (F5)',
    'lang.tableNote': 'La vista previa de HTML incluye los .css y .js que el HTML enlaza, si están en el espacio de trabajo con el mismo nombre. Las imágenes con ruta relativa no se ven en la vista previa; usa URLs completas.',

    'where.web': 'Vista previa en vivo (HTML con su CSS y JS)', 'where.markdown': 'Vista previa formateada',
    'where.svg': 'Vista previa (solo archivos .svg)', 'where.js': 'Se ejecuta en el navegador; console.log va a la consola',
    'where.python': 'Python en el navegador (Pyodide), sin servidor', 'where.sql': 'SQLite en el navegador, muestra las tablas',
    'where.json': 'Revisa que sea válido y lo formatea', 'where.remote': 'Servidor Judge0 (necesita internet)', 'where.none': 'Solo edición',

    'status.pos': 'Ln {line}, Col {col}', 'status.sel': 'Sel: {n}', 'status.lines': '{n} líneas', 'status.cursors': '{n} cursores',
    'status.spaces': 'Espacios: {n}',

    'run.preview': 'Vista previa', 'run.console': 'Consola', 'run.output': 'Salida', 'run.clear': 'Limpiar consola', 'run.toggleTerm': 'Mostrar u ocultar la consola', 'run.auto': 'En vivo', 'run.stdin': 'Entrada (stdin) para input(), Scanner, cin…',
    'run.stdinPlaceholder': 'Escribe aquí lo que tu programa lee con input(), Scanner, cin… Una respuesta por línea.',
    'run.popout': 'Abrir la vista previa en una ventana aparte (puedes moverla a otra pantalla)', 'run.stop': 'Detener (Shift+F5)',
    'run.again': 'Ejecutar de nuevo (F5)', 'run.close': 'Cerrar panel',
    'run.noDoc': 'No hay documento activo para ejecutar.', 'run.notRunnable': '{lang} no se ejecuta; Multipad solo lo edita.',
    'run.seeTable': 'Menú Lenguaje → "¿Qué lenguajes se pueden ejecutar?" muestra la lista completa.',
    'run.headPreview': 'Vista previa: {name}', 'run.headRun': '{name} · {where}', 'run.headCheck': 'Revisando {name}',
    'run.whereBrowser': 'en el navegador', 'run.whereSqlite': 'SQLite en el navegador', 'run.whereRemote': 'servidor {host}',
    'run.usingHost': 'Se muestra {host}, que usa {file}.', 'run.missing': 'No encontré "{file}" en el espacio de trabajo; ábrelo en Multipad para que la vista previa lo incluya.',
    'run.cssNoHost': 'Ningún HTML del espacio de trabajo enlaza {file}; se muestra una página de ejemplo con esos estilos.',
    'run.sample.h1': 'Título de ejemplo', 'run.sample.p': 'Un párrafo con un', 'run.sample.link': 'enlace', 'run.sample.item': 'Elemento',
    'run.sample.button': 'Botón', 'run.sample.input': 'Campo de texto',
    'run.line': 'línea', 'run.jsonOk': 'JSON válido: {kind}.', 'run.jsonArray': 'lista con {n} elementos', 'run.jsonObject': 'objeto con {n} claves',
    'run.jsonErrAt': '{msg} (línea {line}, columna {col})',
    'run.pyLoading': 'Cargando Python… La primera vez descarga unos 12 MB; después queda en caché.',
    'run.pyReady': 'Python listo.', 'run.pyFail': 'No se pudo iniciar Python.',
    'run.finished': 'Terminó en {ms} ms.', 'run.stopped': 'Ejecución detenida.',
    'run.needStdin': 'Tu programa pidió datos y la entrada está vacía. Abre "stdin" en el panel y escribe una respuesta por línea.',
    'run.stdinHint': 'Este código lee datos del teclado. Escríbelos antes en "stdin" (una respuesta por línea).',
    'run.sqlLoading': 'Cargando SQLite…', 'run.sqlNoRows': 'Sin filas que mostrar. Filas modificadas: {n}.', 'run.sqlRows': '{n} fila(s).',
    'run.noServer': 'No hay servidor configurado. Menú Ejecutar → "Servidor para Java, C++, C#…".',
    'run.sending': 'Enviando al servidor…', 'run.javaMain': 'En Judge0 la clase pública debe llamarse Main (public class Main).',
    'run.remoteFail': 'El servidor no respondió: {msg}',
    'run.remoteHint': 'Revisa la conexión o configura otro servidor en Ejecutar → "Servidor para Java, C++, C#…". El servidor público puede rechazar pedidos desde otros sitios o tener límite de uso.',
    'run.downloadFail': 'No se pudo descargar {url}. ¿Hay conexión a internet?',
    'run.popoutHint': 'Pulsa Ejecutar (F5) y la vista previa aparece en la ventana nueva.',

    'server.title': 'Servidor de ejecución (Judge0)',
    'server.intro': 'Java, C, C++, C#, Kotlin, Go, Rust, Ruby, PHP, Bash y TypeScript se compilan en un servidor Judge0. Python, JavaScript, SQL, HTML y Markdown no lo necesitan.',
    'server.url': 'Dirección del servidor', 'server.key': 'Clave (opcional)', 'server.keyPlaceholder': 'Clave de RapidAPI o token de tu servidor',
    'server.note': 'Si usas Judge0 por RapidAPI, pon https://judge0-ce.p.rapidapi.com y tu clave. Si instalas tu propio Judge0, pon su dirección y su token. La clave se guarda solo en este navegador.',
    'server.reset': 'Restablecer', 'server.saved': 'Servidor guardado.',

    'win.default': 'Ventana {n}', 'win.generic': 'Ventana', 'win.renameTitle': 'Nombre de esta ventana',
    'win.renameText': 'Sirve para reconocerla al mover pestañas entre ventanas o pantallas.',
    'win.blocked': 'El navegador bloqueó la ventana nueva. Permite ventanas emergentes para este sitio.',
    'win.noScreenApi': 'Este navegador no permite elegir la pantalla. Arrastra la ventana nueva al otro monitor.',
    'win.oneScreen': 'Solo se detecta una pantalla.', 'win.noScreenPermission': 'Sin permiso de administración de ventanas. Arrastra la ventana nueva al otro monitor.',
    'win.open': 'abierta', 'win.sendTitle': 'Enviar pestaña a…', 'win.sent': 'Enviada a {name}', 'win.received': 'Recibida desde {name}',
    'win.tabCount': '{n} pestaña(s)', 'win.noneClosed': 'No hay ventanas cerradas para reabrir.', 'win.reopenTitle': 'Reabrir ventana',
    'win.openCount': 'Abiertas: {n}', 'win.this': '{name} (esta)',

    'doc.untitled': 'nuevo', 'doc.renameTitle': 'Renombrar', 'doc.renameOk': 'Renombrar',
    'doc.renameDiskFail': 'El archivo en disco conserva su nombre ({msg}). Usa "Guardar como" si quieres otro archivo.',
    'doc.renameTabOnly': 'Se renombró la pestaña. El archivo en disco conserva su nombre; usa "Guardar como" para crear otro.',

    'file.bigTitle': 'Archivo grande', 'file.bigText': '{name} pesa {mb} MB. Puede ir lento.', 'file.openAnyway': 'Abrir igual',
    'file.binary': '{name} parece un archivo binario; no se abre.', 'file.saved': 'Guardado: {name}',
    'file.writeFail': 'No se pudo escribir {name}: {msg}. Prueba "Guardar como".', 'file.downloaded': 'Descargado: {name}',
    'file.saveAllPartial': 'Guardados {saved}. {pending} no tienen archivo en disco: usa "Guardar como" en cada uno.',
    'file.saveAllDone': 'Guardados {saved} archivo(s).',

    'err.localSave': 'No se pudo guardar en el almacenamiento local: {msg}', 'err.docGone': 'Ese documento ya no existe en el espacio de trabajo.',
    'err.maxPanes': 'Hasta 4 paneles por ventana. Para más, abre otra ventana.', 'err.start': 'Error al iniciar: {msg}',

    'eol.changed': 'Fin de línea: {eol}. Se aplica al guardar.', 'tabsize.title': 'Tamaño de la tabulación', 'tabsize.n': '{n} espacios',

    'sw.newVersion': 'Hay una versión nueva de Multipad.', 'sw.update': 'Actualizar',
    'sw.updated': 'Multipad se actualizó. Recarga esta ventana cuando puedas.', 'sw.reload': 'Recargar',

    'sc.title': 'Atajos de teclado',
    'sc.intro': 'En Mac usa Cmd en lugar de Ctrl. En una pestaña normal del navegador, Ctrl+N y Ctrl+W los toma el navegador; por eso hay atajos con Alt.',
    'sc.new': 'Nuevo documento', 'sc.open': 'Abrir archivos', 'sc.save': 'Guardar / Guardar como', 'sc.close': 'Cerrar pestaña',
    'sc.nextTab': 'Pestaña siguiente / anterior', 'sc.tabN': 'Ir a la pestaña N', 'sc.run': 'Ejecutar / vista previa', 'sc.stop': 'Detener ejecución',
    'sc.runPanel': 'Mostrar u ocultar el panel de ejecución', 'sc.find': 'Buscar / Reemplazar', 'sc.goto': 'Ir a línea', 'sc.comment': 'Comentar línea',
    'sc.dupLine': 'Duplicar línea', 'sc.moveLine': 'Mover línea', 'sc.multi': 'Seleccionar la siguiente coincidencia',
    'sc.split': 'Dividir panel', 'sc.moveTab': 'Mover pestaña al otro panel', 'sc.newWindow': 'Ventana nueva', 'sc.sidebar': 'Panel lateral',
    'sc.zoom': 'Tamaño de letra', 'sc.wrap': 'Ajuste de línea', 'sc.language': 'Cambiar el lenguaje del documento',

    'about.menu': 'Acerca de Multipad',
    'about.text': 'Editor de código para computadora, tablet y celular. Los documentos se guardan en este navegador y, cuando el navegador lo permite, directamente en tus archivos.',
    'about.credits': 'Usa CodeMirror 6, Pyodide, sql.js y marked (licencias MIT y MPL). Los lenguajes compilados se ejecutan en Judge0.',

    'keys.run': '▶ Ejecutar', 'keys.find': 'Buscar',

    'welcome.name': 'Bienvenida.md',
    'welcome.doc': `# Bienvenido a Multipad

Editor de código para computadora, tablet y celular.

## Lenguaje y ejecución
- El lenguaje se elige por la extensión del archivo (.html, .py, .java…). Lo ves junto al botón Ejecutar y en la barra de estado.
- Para cambiarlo, usa el menú **Lenguaje** (como en Notepad++) o Alt+L.
- **Ejecutar** (F5) abre el panel de la derecha:
  - HTML, CSS, Markdown y SVG se ven en **Vista previa**, y se actualizan mientras escribes.
  - JavaScript, Python y SQL corren en tu navegador; la salida aparece en **Consola**.
  - Java, C, C++, C# y otros se compilan en un servidor Judge0.
- Si tu programa pide datos (input, Scanner, cin), escríbelos en **stdin** antes de ejecutar.
- "Vista previa en otra pantalla" manda la vista previa a tu segundo monitor.

## Paneles y ventanas
- Divide la ventana con el botón de dos columnas (\`Ctrl+\\\`). Hasta 4 paneles.
- Arrastra una pestaña a otro panel, o usa su menú (clic derecho; en pantallas táctiles, mantén presionado o toca ⋮).
- "Ventana nueva en otra pantalla" abre otra ventana del editor en tu segundo monitor.
- Un archivo abierto en dos ventanas se sincroniza mientras escribes.

## Archivos
- Ctrl+O abre archivos. En Chrome/Edge de escritorio, Ctrl+S guarda directo en el archivo original.
- En iPhone, iPad y Firefox, "Guardar" descarga el archivo o abre Compartir.
- Todo lo que escribes queda guardado en este navegador. Lo encuentras en el panel lateral (Ctrl+B).

El botón ES/EN de arriba cambia el idioma. Puedes cerrar este documento cuando quieras.
`,
  },

  en: {
    'ui.cancel': 'Cancel', 'ui.ok': 'OK', 'ui.close': 'Close', 'ui.filter': 'Filter…', 'ui.save': 'Save',

    'menu.file': 'File', 'menu.edit': 'Edit', 'menu.view': 'View', 'menu.language': 'Language', 'menu.run': 'Run',
    'menu.window': 'Window', 'menu.help': 'Help', 'menu.all': 'Menu',

    'top.sidebar': 'Sidebar (Ctrl+B)', 'top.new': 'New (Alt+N)', 'top.open': 'Open (Ctrl+O)', 'top.save': 'Save (Ctrl+S)',
    'top.splitRight': 'Split right (Ctrl+\\)', 'top.splitDown': 'Split down', 'top.newWindow': 'New window (Alt+Shift+N)',
    'top.otherScreen': 'Window on another screen', 'top.run': 'Run', 'top.runTitle': 'Run or preview (F5)',
    'top.uiLang': 'Interface language: switch to Spanish', 'top.winLabel': 'Name of this window (click to rename)',

    'act.files': 'Files', 'act.search': 'Search', 'act.run': 'Run', 'act.settings': 'Settings', 'set.title': 'Settings', 'side.folders': 'Folders', 'side.openFolder': 'Open folder', 'side.docs': 'Workspace documents',
    'folder.none': 'No folder open.', 'folder.needChrome': 'Opening folders requires desktop Chrome or Edge.',
    'folder.remove': 'Remove folder from the list', 'folder.noPermission': 'No permission to read the folder.',
    'folder.tapToAllow': 'Tap the folder to grant access', 'folder.unsupported': 'This browser cannot open whole folders. Use File → Open to pick files.',
    'docs.none': 'No documents.', 'docs.remove': 'Remove from workspace', 'docs.onlyWorkspace': 'workspace only',
    'docs.removeTitle': 'Remove "{name}"', 'docs.removeOk': 'Remove',
    'docs.removeDirty': 'It has changes that were never saved to a file. Removing it loses those changes. The file on disk (if any) is not touched.',
    'docs.removeClean': 'It closes in every window. The file on disk (if any) is not touched.',

    'pane.options': 'Pane options', 'pane.empty': 'Empty pane', 'pane.documents': 'Documents', 'pane.title': 'Pane',
    'pane.hintTouch': 'Use the ⋮ menu on a tab to move it here.', 'pane.hintMouse': 'You can also drag tabs or files into this pane.',
    'pane.closeAllTabs': 'Close all tabs', 'pane.tagline': 'Write. Edit. Run.',

    'tab.close': 'Close', 'tab.closeOthers': 'Close others', 'tab.moveOther': 'Move to other pane', 'tab.cloneOther': 'Clone to other pane',
    'tab.sendWindow': 'Send to another window…', 'tab.newWindow': 'Open in new window', 'tab.otherScreen': 'Open on another screen',
    'tab.noFile': 'no file on disk',

    'cmd.new': 'New', 'cmd.open': 'Open…', 'cmd.openShort': 'Open…', 'cmd.openFolder': 'Open folder…', 'cmd.save': 'Save',
    'cmd.saveAs': 'Save as…', 'cmd.saveAll': 'Save all', 'cmd.rename': 'Rename…', 'cmd.closeTab': 'Close tab',
    'cmd.closeAll': 'Close all', 'cmd.install': 'Install Multipad on this device',
    'cmd.undo': 'Undo', 'cmd.redo': 'Redo', 'cmd.find': 'Find and replace', 'cmd.goto': 'Go to line…',
    'cmd.comment': 'Toggle comment', 'cmd.dupLine': 'Duplicate line', 'cmd.delLine': 'Delete line', 'cmd.upper': 'UPPERCASE',
    'cmd.lower': 'lowercase', 'cmd.sortLines': 'Sort lines', 'cmd.trim': 'Trim trailing spaces',
    'cmd.sidebar': 'Sidebar', 'cmd.runPanel': 'Run panel', 'cmd.splitRight': 'Split right', 'cmd.splitDown': 'Split down',
    'cmd.columnPanes': 'Stack panes vertically', 'cmd.moveOther': 'Move tab to other pane', 'cmd.cloneOther': 'Clone tab to other pane',
    'cmd.closePane': 'Close pane', 'cmd.wrap': 'Word wrap', 'cmd.whitespace': 'Show whitespace', 'cmd.autocomplete': 'Autocomplete',
    'cmd.mobileKeys': 'Touch keys', 'cmd.tabSize': 'Tab size…', 'cmd.themeAuto': 'Automatic theme', 'cmd.themeDark': 'Dark theme',
    'cmd.themeLight': 'Light theme', 'cmd.zoomIn': 'Larger text', 'cmd.zoomOut': 'Smaller text', 'cmd.zoomReset': 'Default size ({n}px)',
    'cmd.uiLanguage': 'Interface language', 'cmd.languageOf': 'Language: {lang}…',
    'cmd.run': 'Run / preview', 'cmd.stop': 'Stop', 'cmd.runAuto': 'Update preview while typing',
    'cmd.previewWindow': 'Preview in separate window', 'cmd.previewScreen': 'Preview on another screen',
    'cmd.server': 'Server for Java, C++, C#…',
    'cmd.newWindow': 'New window', 'cmd.otherScreen': 'New window on another screen', 'cmd.sendWindow': 'Send tab to another window…',
    'cmd.reopenWindow': 'Reopen closed window…', 'cmd.renameWindow': 'Rename this window…', 'cmd.fullscreen': 'Full screen',

    'lang.text': 'Plain text', 'lang.needDoc': 'Open or create a document first.', 'lang.pickTitle': 'Language of {name}',
    'lang.menuTitle': 'Language of {name}', 'lang.menuTitleNone': 'No active document', 'lang.whatRuns': 'Which languages can run?',
    'lang.badgeTitle': 'Document language (click to change). Run: {where}',
    'lang.tableTitle': 'Languages and running code',
    'lang.tableIntro': 'Multipad picks the language from the file extension. If it guesses wrong, change it from the Language menu, the badge next to Run, or the status bar (Alt+L).',
    'lang.colLang': 'Language', 'lang.colExt': 'Extensions', 'lang.colRun': 'When you press Run (F5)',
    'lang.tableNote': 'The HTML preview includes the .css and .js files the HTML links to, if they are in the workspace with the same name. Images with relative paths do not show in the preview; use full URLs.',

    'where.web': 'Live preview (HTML with its CSS and JS)', 'where.markdown': 'Formatted preview',
    'where.svg': 'Preview (.svg files only)', 'where.js': 'Runs in the browser; console.log goes to the console',
    'where.python': 'Python in the browser (Pyodide), no server', 'where.sql': 'SQLite in the browser, shows result tables',
    'where.json': 'Checks it is valid and formats it', 'where.remote': 'Judge0 server (needs internet)', 'where.none': 'Edit only',

    'status.pos': 'Ln {line}, Col {col}', 'status.sel': 'Sel: {n}', 'status.lines': '{n} lines', 'status.cursors': '{n} cursors',
    'status.spaces': 'Spaces: {n}',

    'run.preview': 'Preview', 'run.console': 'Console', 'run.output': 'Output', 'run.clear': 'Clear console', 'run.toggleTerm': 'Show or hide the console', 'run.auto': 'Live', 'run.stdin': 'Input (stdin) for input(), Scanner, cin…',
    'run.stdinPlaceholder': 'Type what your program reads with input(), Scanner, cin… One answer per line.',
    'run.popout': 'Open the preview in a separate window (you can move it to another screen)', 'run.stop': 'Stop (Shift+F5)',
    'run.again': 'Run again (F5)', 'run.close': 'Close panel',
    'run.noDoc': 'No active document to run.', 'run.notRunnable': '{lang} does not run; Multipad only edits it.',
    'run.seeTable': 'Language menu → "Which languages can run?" shows the full list.',
    'run.headPreview': 'Preview: {name}', 'run.headRun': '{name} · {where}', 'run.headCheck': 'Checking {name}',
    'run.whereBrowser': 'in the browser', 'run.whereSqlite': 'SQLite in the browser', 'run.whereRemote': 'server {host}',
    'run.usingHost': 'Showing {host}, which uses {file}.', 'run.missing': 'Could not find "{file}" in the workspace; open it in Multipad so the preview includes it.',
    'run.cssNoHost': 'No HTML in the workspace links to {file}; showing a sample page with those styles.',
    'run.sample.h1': 'Sample heading', 'run.sample.p': 'A paragraph with a', 'run.sample.link': 'link', 'run.sample.item': 'Item',
    'run.sample.button': 'Button', 'run.sample.input': 'Text field',
    'run.line': 'line', 'run.jsonOk': 'Valid JSON: {kind}.', 'run.jsonArray': 'array with {n} items', 'run.jsonObject': 'object with {n} keys',
    'run.jsonErrAt': '{msg} (line {line}, column {col})',
    'run.pyLoading': 'Loading Python… The first time it downloads about 12 MB; after that it is cached.',
    'run.pyReady': 'Python ready.', 'run.pyFail': 'Python could not start.',
    'run.finished': 'Finished in {ms} ms.', 'run.stopped': 'Run stopped.',
    'run.needStdin': 'Your program asked for input and stdin is empty. Open "stdin" in the panel and type one answer per line.',
    'run.stdinHint': 'This code reads keyboard input. Type it in "stdin" first (one answer per line).',
    'run.sqlLoading': 'Loading SQLite…', 'run.sqlNoRows': 'No rows to show. Rows changed: {n}.', 'run.sqlRows': '{n} row(s).',
    'run.noServer': 'No server configured. Run menu → "Server for Java, C++, C#…".',
    'run.sending': 'Sending to the server…', 'run.javaMain': 'On Judge0 the public class must be named Main (public class Main).',
    'run.remoteFail': 'The server did not respond: {msg}',
    'run.remoteHint': 'Check your connection or set another server in Run → "Server for Java, C++, C#…". The public server may reject requests from other sites or have usage limits.',
    'run.downloadFail': 'Could not download {url}. Are you online?',
    'run.popoutHint': 'Press Run (F5) and the preview appears in the new window.',

    'server.title': 'Execution server (Judge0)',
    'server.intro': 'Java, C, C++, C#, Kotlin, Go, Rust, Ruby, PHP, Bash and TypeScript are compiled on a Judge0 server. Python, JavaScript, SQL, HTML and Markdown do not need it.',
    'server.url': 'Server address', 'server.key': 'Key (optional)', 'server.keyPlaceholder': 'RapidAPI key or your server token',
    'server.note': 'If you use Judge0 through RapidAPI, enter https://judge0-ce.p.rapidapi.com and your key. If you host your own Judge0, enter its address and token. The key is stored only in this browser.',
    'server.reset': 'Reset', 'server.saved': 'Server saved.',

    'win.default': 'Window {n}', 'win.generic': 'Window', 'win.renameTitle': 'Name of this window',
    'win.renameText': 'Helps you tell windows apart when moving tabs between windows or screens.',
    'win.blocked': 'The browser blocked the new window. Allow pop-ups for this site.',
    'win.noScreenApi': 'This browser cannot choose the screen. Drag the new window to the other monitor.',
    'win.oneScreen': 'Only one screen detected.', 'win.noScreenPermission': 'No window-management permission. Drag the new window to the other monitor.',
    'win.open': 'open', 'win.sendTitle': 'Send tab to…', 'win.sent': 'Sent to {name}', 'win.received': 'Received from {name}',
    'win.tabCount': '{n} tab(s)', 'win.noneClosed': 'No closed windows to reopen.', 'win.reopenTitle': 'Reopen window',
    'win.openCount': 'Open: {n}', 'win.this': '{name} (this one)',

    'doc.untitled': 'new', 'doc.renameTitle': 'Rename', 'doc.renameOk': 'Rename',
    'doc.renameDiskFail': 'The file on disk keeps its name ({msg}). Use "Save as" if you want a different file.',
    'doc.renameTabOnly': 'The tab was renamed. The file on disk keeps its name; use "Save as" to create another.',

    'file.bigTitle': 'Large file', 'file.bigText': '{name} is {mb} MB. It may be slow.', 'file.openAnyway': 'Open anyway',
    'file.binary': '{name} looks like a binary file; not opened.', 'file.saved': 'Saved: {name}',
    'file.writeFail': 'Could not write {name}: {msg}. Try "Save as".', 'file.downloaded': 'Downloaded: {name}',
    'file.saveAllPartial': 'Saved {saved}. {pending} have no file on disk: use "Save as" on each one.',
    'file.saveAllDone': 'Saved {saved} file(s).',

    'err.localSave': 'Could not save to local storage: {msg}', 'err.docGone': 'That document no longer exists in the workspace.',
    'err.maxPanes': 'Up to 4 panes per window. For more, open another window.', 'err.start': 'Startup error: {msg}',

    'eol.changed': 'Line ending: {eol}. Applied when you save.', 'tabsize.title': 'Tab size', 'tabsize.n': '{n} spaces',

    'sw.newVersion': 'A new version of Multipad is available.', 'sw.update': 'Update',
    'sw.updated': 'Multipad was updated. Reload this window when you can.', 'sw.reload': 'Reload',

    'sc.title': 'Keyboard shortcuts',
    'sc.intro': 'On Mac use Cmd instead of Ctrl. In a regular browser tab, Ctrl+N and Ctrl+W belong to the browser; that is why there are Alt shortcuts.',
    'sc.new': 'New document', 'sc.open': 'Open files', 'sc.save': 'Save / Save as', 'sc.close': 'Close tab',
    'sc.nextTab': 'Next / previous tab', 'sc.tabN': 'Go to tab N', 'sc.run': 'Run / preview', 'sc.stop': 'Stop running',
    'sc.runPanel': 'Show or hide the run panel', 'sc.find': 'Find / Replace', 'sc.goto': 'Go to line', 'sc.comment': 'Comment line',
    'sc.dupLine': 'Duplicate line', 'sc.moveLine': 'Move line', 'sc.multi': 'Select next occurrence',
    'sc.split': 'Split pane', 'sc.moveTab': 'Move tab to other pane', 'sc.newWindow': 'New window', 'sc.sidebar': 'Sidebar',
    'sc.zoom': 'Text size', 'sc.wrap': 'Word wrap', 'sc.language': 'Change document language',

    'about.menu': 'About Multipad',
    'about.text': 'Code editor for desktop, tablet and phone. Documents are saved in this browser and, when the browser allows it, straight to your files.',
    'about.credits': 'Built with CodeMirror 6, Pyodide, sql.js and marked (MIT and MPL licenses). Compiled languages run on Judge0.',

    'keys.run': '▶ Run', 'keys.find': 'Find',

    'welcome.name': 'Welcome.md',
    'welcome.doc': `# Welcome to Multipad

Code editor for desktop, tablet and phone.

## Language and running code
- The language comes from the file extension (.html, .py, .java…). You see it next to the Run button and in the status bar.
- To change it, use the **Language** menu (like Notepad++) or Alt+L.
- **Run** (F5) opens the panel on the right:
  - HTML, CSS, Markdown and SVG show up in **Preview** and update while you type.
  - JavaScript, Python and SQL run in your browser; output goes to **Console**.
  - Java, C, C++, C# and others are compiled on a Judge0 server.
- If your program asks for input (input, Scanner, cin), type it in **stdin** before running.
- "Preview on another screen" sends the preview to your second monitor.

## Panes and windows
- Split the window with the two-column button (\`Ctrl+\\\`). Up to 4 panes.
- Drag a tab to another pane, or use its menu (right-click; on touch screens, long-press or tap ⋮).
- "New window on another screen" opens another editor window on your second monitor.
- A file open in two windows stays in sync while you type.

## Files
- Ctrl+O opens files. In desktop Chrome/Edge, Ctrl+S saves straight to the original file.
- On iPhone, iPad and Firefox, "Save" downloads the file or opens Share.
- Everything you type is kept in this browser. Find it in the sidebar (Ctrl+B).

The ES/EN button at the top switches the language. Close this document whenever you like.
`,
  },
};

let current = 'es';

export function detectBrowserLang() {
  return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function setLang(lang) {
  current = DICT[lang] ? lang : 'es';
}

export const getLang = () => current;

export function t(key, vars) {
  let s = DICT[current][key] ?? DICT.es[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

// Traduce los elementos marcados con data-i18n, data-i18n-title, data-i18n-aria-label y data-i18n-placeholder.
export function applyI18n(root) {
  for (const n of root.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
  for (const n of root.querySelectorAll('[data-i18n-title]')) n.title = t(n.dataset.i18nTitle);
  for (const n of root.querySelectorAll('[data-i18n-aria-label]')) n.setAttribute('aria-label', t(n.dataset.i18nAriaLabel));
  for (const n of root.querySelectorAll('[data-i18n-placeholder]')) n.placeholder = t(n.dataset.i18nPlaceholder);
}

export const KEYS = DICT;
