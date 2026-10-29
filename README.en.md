# Multipad

[Versión en español](README.md)

A code editor that runs in the browser and installs as an app on desktop, tablet and phone. It is modeled on Notepad++, with two additions: each window can be split into several panes, and you can have several Multipad windows open at once, each with its own content (for example, one per monitor).

No server or database. Plain HTML, CSS and JavaScript, published for free on GitHub Pages.

## Features

- Spanish and English interface (ES/EN button at the top right, or View → Interface language). Starts in the browser's language.
- **Run** button (F5) with a preview and console panel.
- **Language** menu like Notepad++: lists every language, checks the current one and lets you change it. The current language also shows next to Run and in the status bar.
- Tabs with unsaved-change markers, reorderable by dragging.
- Up to 4 panes per window, side by side or stacked, with draggable dividers.
- Several Multipad windows at once. "New window on another screen" opens it directly on the second monitor (desktop Chrome and Edge).
- Move tabs between windows by dragging them or with "Send to another window…". A file open in two windows stays in sync.
- Syntax highlighting for HTML, CSS, JavaScript/TypeScript, JSON, PHP, Python, Java, Kotlin, C#, C/C++, Rust, Go, Ruby, SQL, Markdown, XML, YAML, Shell and PowerShell.
- Find and replace with regex, go to line, multiple cursors, code folding, autocomplete.
- Extra key row on touch screens (Run, tab, brackets, arrows, undo).

## Languages and running code

| Language | What Run does | Where it runs |
|---|---|---|
| HTML | Live preview, including linked `.css` and `.js` files open in Multipad with the same name | Browser |
| CSS | Shows the HTML that links it, or a sample page | Browser |
| JavaScript | Shows the HTML that links it; otherwise runs it and prints `console.log` | Browser |
| Markdown | Formatted preview | Browser |
| SVG | Image preview | Browser |
| Python | Runs with Pyodide; `input()` reads from the stdin box | Browser (~12 MB download the first time) |
| SQL | Runs in SQLite and shows result tables | Browser |
| JSON | Validates and formats | Browser |
| Java, C, C++, C#, Kotlin, Go, Rust, Ruby, PHP, Bash, TypeScript | Compiles and runs | Judge0 server |

If the program reads keyboard input (`input()`, `Scanner`, `cin`), type the answers in **stdin**, one per line, before running.

The default Judge0 server is the public instance at `https://ce.judge0.com`. If it does not respond, set another one in Run → Server for Java, C++, C#… (RapidAPI with your key, or your own Judge0). Code sent to Judge0 leaves the device; everything else stays in the browser. In Java, the public class must be named `Main`.

## Publishing on GitHub Pages

```bash
git remote add origin https://github.com/gleimbek/multipad.git
git push -u origin main
```

Then Settings → Pages → Deploy from a branch, `main`, `/ (root)`. When you publish changes, bump `VERSION` in `sw.js` so installed copies update.

## Installing

Open `https://gleimbek.github.io/multipad/`, then:

- Windows / Mac / Linux (Chrome or Edge): install icon in the address bar, or File → Install Multipad.
- Android (Chrome): ⋮ menu → Install app.
- iPhone / iPad (Safari): Share → Add to Home Screen.
