# ParadoxEditor

A VS Code–style in‑browser editor to practice **JavaScript** and **Python**. Runs 100% in the browser (static site).

## Features (current)
- Monaco Editor with VS Code dark theme
- JS execution in-browser
- Python execution in-browser (Pyodide)
- Time complexity *estimator* (heuristic)

## Run locally
Because Pyodide needs a web server (WASM), use a simple static server:

```bash
cd ParadoxEditor
python3 -m http.server 8080
```

Then open: http://localhost:8080

## Roadmap
- React/Node support
- Better complexity analysis
- File tree + multi-file support
- Export snippets
