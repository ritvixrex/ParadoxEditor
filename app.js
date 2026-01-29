/**
 * ParadoxEditor: A premium VS Code replica in the browser.
 */

class EditorApp {
  constructor() {
    this.models = {};
    this.activeFile = 'index_js';
    this.openFiles = ['index_js'];
    this.pyodide = null;
    this.terminal = null;
    this.fitAddon = null;
    this.editor = null;
    this.decorations = [];
    this.capturedOutput = {};

    this.files = {
      'index_js': { name: 'index.js', content: `// JavaScript example\nconst data = [\n  { id: 1, name: "Alpha", items: [10, 20] },\n  { id: 2, name: "Beta", items: [30, 40] }\n];\n\nconsole.log("Data Array:", data);\n\nfunction sum(arr) {\n  return arr.reduce((a, b) => a + b, 0);\n}\n\nconsole.log("Sum of [1..4]:", sum([1,2,3,4]));`, lang: 'javascript', type: 'file' },
      'main_py': { name: 'main.py', content: `# Python example\ndef sum_list(arr):\n    s = 0\n    for x in arr:\n        s += x\n    return s\n\nprint("Python result:", sum_list([1,2,3,4]))`, lang: 'python', type: 'file' }
    };

    this.init();
  }

  async init() {
    await this.loadFromStorage();
    this.initTerminal();
    this.initMonaco();
    this.initResizing();
    this.initEventListeners();
    this.renderSidebar();
  }

  async loadFromStorage() {
    try {
      const saved = localStorage.getItem('paradox_files');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Object.keys(parsed).length > 0) this.files = parsed;
      }
      this.activeFile = localStorage.getItem('paradox_active') || 'index_js';
      const savedOpen = localStorage.getItem('paradox_open');
      if (savedOpen) this.openFiles = JSON.parse(savedOpen);
    } catch (e) {
      console.warn('Persistence failed:', e);
    }
  }

  saveToStorage() {
    localStorage.setItem('paradox_files', JSON.stringify(this.files));
    localStorage.setItem('paradox_active', this.activeFile);
    localStorage.setItem('paradox_open', JSON.stringify(this.openFiles));
  }

  initTerminal() {
    this.terminal = new Terminal({
      theme: {
        background: '#181818',
        foreground: '#cccccc',
        cursor: '#aeafad',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5'
      },
      fontSize: 13,
      fontFamily: 'var(--font-code)',
      cursorBlink: true,
      lineHeight: 1.4
    });
    this.fitAddon = new FitAddon.FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(document.getElementById('terminal-container'));
    this.fitAddon.fit();
    this.terminal.writeln('\x1b[1;34m[Paradox Runtime v2.0 Ready]\x1b[0m');
  }

  initMonaco() {
    window.require.config({
      paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.43.0/min/vs' }
    });

    window.require(['vs/editor/editor.main'], () => {
      // Create models
      for (const [id, file] of Object.entries(this.files)) {
        this.models[id] = monaco.editor.createModel(file.content, file.lang);
      }

      this.editor = monaco.editor.create(document.getElementById('editor'), {
        model: this.models[this.activeFile],
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 14,
        minimap: { enabled: false },
        padding: { top: 10 },
        fontFamily: 'var(--font-code)',
        cursorSmoothCaretAnimation: "on",
        smoothScrolling: true
      });

      this.editor.onDidChangeModelContent(() => {
        this.files[this.activeFile].content = this.editor.getValue();
        this.saveToStorage();
      });

      this.editor.onDidChangeCursorPosition((e) => {
        const { lineNumber, column } = e.position;
        const statusSection = document.querySelector('.statusbar .right');
        if (statusSection) statusSection.innerHTML = `Ln ${lineNumber}, Col ${column}`;
      });

      this.renderSidebar();
      this.updateTabs();
      this.updateBreadcrumbs();
    });
  }

  initResizing() {
    const sidebar = document.querySelector('.sidebar');
    const sidebarResizer = document.getElementById('sidebarResizer');
    const panels = document.querySelector('.panels');
    const panelResizer = document.getElementById('panelResizer');

    let isResizingSidebar = false;
    let isResizingPanel = false;

    sidebarResizer.addEventListener('mousedown', () => { isResizingSidebar = true; sidebarResizer.classList.add('dragging'); });
    panelResizer.addEventListener('mousedown', () => { isResizingPanel = true; panelResizer.classList.add('dragging'); });

    document.addEventListener('mousemove', (e) => {
      if (isResizingSidebar) {
        const width = e.clientX - 48;
        if (width > 150 && width < 600) sidebar.style.width = width + 'px';
      } else if (isResizingPanel) {
        const height = window.innerHeight - e.clientY - 22;
        if (height > 50 && height < window.innerHeight - 150) {
          panels.style.height = height + 'px';
          if (this.fitAddon) this.fitAddon.fit();
        }
      }
    });

    document.addEventListener('mouseup', () => {
      isResizingSidebar = false;
      isResizingPanel = false;
      sidebarResizer.classList.remove('dragging');
      panelResizer.classList.remove('dragging');
    });
  }

  initEventListeners() {
    document.getElementById('runBtn').addEventListener('click', () => this.runCode());
    document.getElementById('benchmarkBtn').addEventListener('click', () => this.runBenchmark());
    document.getElementById('analyzeBtn').addEventListener('click', () => this.analyzeComplexity());
    document.getElementById('exportBtn').addEventListener('click', () => this.exportProject());
    document.getElementById('clearBtn').addEventListener('click', () => this.terminal.clear());
    document.getElementById('newFileBtn').addEventListener('click', () => this.createNewItem('file'));
    document.getElementById('newFolderBtn').addEventListener('click', () => this.createNewItem('folder'));

    // Collapsible sidebars
    document.querySelectorAll('.sidebar-section-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('active');
      });
    });

    // Panel switching
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchPanel(tab.dataset.panel));
    });
  }

  createNewItem(type) {
    const explorer = document.getElementById('fileExplorer');
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'tab';

    const icon = type === 'folder'
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;

    inputWrapper.innerHTML = `
      <div class="sidebar-item-label">
        <span class="sidebar-item-icon">${icon}</span>
        <input type="text" class="rename-input" placeholder="${type} name...">
      </div>
    `;

    explorer.prepend(inputWrapper);
    const input = inputWrapper.querySelector('input');
    input.focus();

    const finish = (cancelled = false) => {
      const name = input.value.trim();
      inputWrapper.remove();
      if (cancelled || !name) return;

      const id = name.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now();
      const lang = name.endsWith('.py') ? 'python' : 'javascript';

      if (type === 'folder') {
        this.files[id] = { name, type: 'folder' };
      } else {
        const content = lang === 'python' ? '# New Python file' : '// New JavaScript file';
        this.files[id] = { name, content, lang, type: 'file' };
        this.models[id] = monaco.editor.createModel(content, lang);
        this.openFiles.push(id);
        this.switchFile(id);
      }

      this.renderSidebar();
      this.saveToStorage();
    };

    input.onkeydown = (e) => {
      if (e.key === 'Enter') finish();
      if (e.key === 'Escape') finish(true);
    };
    input.onblur = () => finish();
  }

  renderSidebar() {
    const explorer = document.getElementById('fileExplorer');
    const openEditors = document.getElementById('openEditors');
    if (!explorer || !openEditors) return;

    explorer.innerHTML = '';
    openEditors.innerHTML = '';

    // Render Explorer
    for (const [id, file] of Object.entries(this.files)) {
      const btn = this.createFileItem(id, file);
      explorer.appendChild(btn);
    }

    // Render Open Editors (only files)
    this.openFiles.forEach(id => {
      if (this.files[id] && this.files[id].type !== 'folder') {
        const btn = this.createFileItem(id, this.files[id], true);
        openEditors.appendChild(btn);
      }
    });
  }

  createFileItem(id, file, isOpenSection = false) {
    const btn = document.createElement('button');
    btn.className = `tab ${this.activeFile === id && !isOpenSection ? 'active' : ''} ${file.type === 'folder' ? 'folder-item' : ''}`;
    btn.dataset.file = id;

    const icon = file.type === 'folder'
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;

    btn.innerHTML = `
      <div class="sidebar-item-label">
        <span class="sidebar-item-icon">${icon}</span>
        <span>${file.name}</span>
      </div>
      <div class="sidebar-item-actions">
        <button class="sidebar-action-btn edit" title="Rename"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
        <button class="sidebar-action-btn delete" title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
      </div>
    `;

    btn.addEventListener('click', () => {
      if (file.type === 'folder') {
        // Folders could eventually be collapsed, for now just UI
      } else {
        this.switchFile(id);
      }
    });

    btn.querySelector('.delete').onclick = (e) => {
      e.stopPropagation();
      this.deleteItem(id);
    };

    btn.querySelector('.edit').onclick = (e) => {
      e.stopPropagation();
      this.renameItem(id);
    };

    return btn;
  }

  renameItem(id) {
    const file = this.files[id];
    const btn = document.querySelector(`.sidebar [data-file="${id}"]`);
    if (!btn) return;

    const label = btn.querySelector('.sidebar-item-label');
    const oldName = file.name;
    const icon = file.type === 'folder'
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;

    label.innerHTML = `
      <span class="sidebar-item-icon">${icon}</span>
      <input type="text" class="rename-input" value="${oldName}">
    `;

    const input = label.querySelector('input');
    input.focus();
    input.select();

    const finish = (cancelled = false) => {
      const newName = input.value.trim();
      if (cancelled || !newName || newName === oldName) {
        this.renderSidebar();
        return;
      }

      this.files[id].name = newName;
      if (this.activeFile === id) {
        this.updateTabs();
        this.updateBreadcrumbs();
      }
      this.renderSidebar();
      this.saveToStorage();
    };

    input.onkeydown = (e) => {
      if (e.key === 'Enter') finish();
      if (e.key === 'Escape') finish(true);
    };
    input.onblur = () => finish();
  }

  deleteItem(id) {
    const file = this.files[id];
    if (Object.keys(this.files).length <= 1) return alert('Keep at least one item.');
    if (!confirm(`Delete ${file.name}?`)) return;

    if (file.type !== 'folder') {
      this.openFiles = this.openFiles.filter(fid => fid !== id);
      if (this.models[id]) this.models[id].dispose();
      delete this.models[id];
    }

    delete this.files[id];

    if (this.activeFile === id) {
      const remainingFiles = Object.keys(this.files).filter(k => this.files[k].type !== 'folder');
      if (remainingFiles.length > 0) {
        this.switchFile(remainingFiles[0]);
      } else {
        this.activeFile = null;
        if (this.editor) this.editor.setModel(null);
      }
    }

    this.renderSidebar();
    this.updateTabs();
    this.saveToStorage();
  }

  switchFile(id) {
    if (!this.models[id]) return;
    this.activeFile = id;
    if (!this.openFiles.includes(id)) this.openFiles.push(id);

    if (this.editor) this.editor.setModel(this.models[id]);

    this.renderSidebar();
    this.updateTabs();
    this.updateBreadcrumbs();
    this.saveToStorage();
  }

  updateTabs() {
    const container = document.getElementById('mainTabs');
    if (!container) return;
    container.innerHTML = '';

    this.openFiles.forEach(id => {
      const tab = document.createElement('div');
      tab.className = `tabheader ${this.activeFile === id ? 'active' : ''}`;
      tab.innerHTML = `<span>${this.files[id].name}</span>`;
      tab.addEventListener('click', () => this.switchFile(id));
      container.appendChild(tab);
    });
  }

  updateBreadcrumbs() {
    const bc = document.getElementById('breadcrumbs');
    if (!bc || !this.files[this.activeFile]) return;
    bc.innerHTML = `<span>src</span><span class="separator">/</span><span class="current-file">${this.files[this.activeFile].name}</span>`;
  }

  switchPanel(id) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === id));
    document.querySelectorAll('.panel-view').forEach(v => v.classList.toggle('active', v.id === `${id}-container`));
    if (id === 'terminal' && this.fitAddon) this.fitAddon.fit();
  }

  // --- Runtime Logic ---

  formatValue(val, depth = 0) {
    if (depth > 5) return '\x1b[90m[Max Depth]\x1b[0m';

    if (val === null) return '\x1b[1;36mnull\x1b[0m';
    if (val === undefined) return '\x1b[1;90mundefined\x1b[0m';

    if (typeof val === 'string') return `\x1b[1;32m"${val}"\x1b[0m`;
    if (typeof val === 'number') return `\x1b[1;33m${val}\x1b[0m`;
    if (typeof val === 'boolean') return `\x1b[1;36m${val}\x1b[0m`;

    if (Array.isArray(val)) {
      if (val.length === 0) return '[]';
      const items = val.map(v => this.formatValue(v, depth + 1)).join(', ');
      return `[ ${items} ]`;
    }

    if (typeof val === 'object') {
      const keys = Object.keys(val);
      if (keys.length === 0) return '{}';
      const pairs = keys.map(k => `${k}: ${this.formatValue(val[k], depth + 1)}`).join(', ');
      return `{ ${pairs} }`;
    }

    return String(val);
  }

  async runCode() {
    this.switchPanel('terminal');
    let code = this.editor.getValue();
    const file = this.files[this.activeFile];
    this.terminal.writeln(`\r\n\x1b[1;36m➜ Executing ${file.name}...\x1b[0m`);

    // Reset captured output and decorations
    this.capturedOutput = {};
    this._clearDecorations();

    if (file.lang === 'javascript') {
      const originalLog = console.log;

      // Instrument JS: Inject line numbers into console.log
      const lines = code.split('\n');
      const instrumentedCode = lines.map((line, idx) => {
        return line.replace(/\bconsole\.log\s*\(/g, `console.log("__pdx_ln__:${idx + 1}", `);
      }).join('\n');

      console.log = (...args) => {
        let ln = null;
        const firstArg = String(args[0]);
        if (firstArg.startsWith("__pdx_ln__:")) {
          ln = parseInt(firstArg.split(':')[1]);
          args.shift();
        }

        const formattedText = args.map(arg => this.formatValue(arg)).join(' ');
        const rawText = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');

        this.terminal.writeln(formattedText);

        if (ln !== null) {
          if (!this.capturedOutput[ln]) this.capturedOutput[ln] = [];
          this.capturedOutput[ln].push(rawText);
          this.updateInlineDecorations();
        }
      };

      try {
        const fn = new Function(instrumentedCode);
        fn();
      } catch (e) {
        this.terminal.writeln(`\x1b[1;31m✖ Runtime Error: ${e.message}\x1b[0m`);
      } finally {
        console.log = originalLog;
      }
    } else {
      try {
        const py = await this.loadPyodideIfNeeded();

        // Instrument Python: Wrap print to include line numbers
        const lines = code.split('\n');
        const instrumentedPy = lines.map((line, idx) => {
          // Simple regex-based instrumentation for Python print
          return line.replace(/\bprint\s*\(/g, `print("__pdx_ln__:${idx + 1}", `);
        }).join('\n');

        py.setStdout({
          batched: (s) => {
            if (s.startsWith("__pdx_ln__:")) {
              const parts = s.split(' ');
              const ln = parseInt(parts[0].split(':')[1]);
              const content = parts.slice(1).join(' ');

              this.terminal.writeln(content);
              if (!this.capturedOutput[ln]) this.capturedOutput[ln] = [];
              this.capturedOutput[ln].push(content.trim());
              this.updateInlineDecorations();
            } else {
              this.terminal.writeln(s);
            }
          }
        });

        py.setStderr({ batched: (s) => this.terminal.writeln(`\x1b[1;31m${s}\x1b[0m`) });
        await py.runPythonAsync(instrumentedPy);
      } catch (e) {
        this.terminal.writeln(`\x1b[1;31m✖ Python Error: ${e.message}\x1b[0m`);
      }
    }
  }

  updateInlineDecorations() {
    const newDecorations = [];
    for (const [line, outputs] of Object.entries(this.capturedOutput)) {
      const content = ` // ${outputs.join(', ')}`;
      newDecorations.push({
        range: new monaco.Range(parseInt(line), 1, parseInt(line), 1),
        options: {
          isWholeLine: false,
          after: {
            content: content,
            inlineClassName: 'inline-output-decoration'
          }
        }
      });
    }
    this.decorations = this.editor.deltaDecorations(this.decorations, newDecorations);
  }

  _clearDecorations() {
    this.decorations = this.editor.deltaDecorations(this.decorations, []);
  }

  async runBenchmark() {
    this.switchPanel('terminal');
    if (this.files[this.activeFile].lang !== 'javascript') {
      return this.terminal.writeln('\x1b[1;33m⚠ Benchmarking only for JS.\x1b[0m');
    }

    const code = this.editor.getValue();
    this.terminal.writeln(`\x1b[1;35m⚡ Benchmarking ${this.files[this.activeFile].name}...\x1b[0m`);

    try {
      const fn = new Function(code);
      fn(); // Warmup
      const start = performance.now();
      for (let i = 0; i < 100; i++) fn();
      const end = performance.now();
      this.terminal.writeln(`\x1b[1;32m✔ Avg (100 runs): ${((end - start) / 100).toFixed(4)}ms\x1b[0m`);
    } catch (e) {
      this.terminal.writeln(`\x1b[31mBenchmark Failed: ${e.message}\x1b[0m`);
    }
  }

  async loadPyodideIfNeeded() {
    if (this.pyodide) return this.pyodide;
    const statusEl = document.getElementById('pyStatus');
    statusEl.textContent = 'Py: loading...';
    const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.mjs');
    this.pyodide = await loadPyodide();
    statusEl.textContent = 'Py: ready';
    return this.pyodide;
  }

  analyzeComplexity() {
    this.switchPanel('complexity');
    const code = this.editor.getValue();
    const result = this.estimateComplexity(code, this.files[this.activeFile].lang === 'python' ? 'py' : 'js');
    document.getElementById('complexity').innerHTML = `<div class="complexity-header">Time Complexity Result:</div>${result.replace(/\n/g, '<br>')}`;
  }

  estimateComplexity(code, lang) {
    let loops = 0, maxDepth = 0, recursion = false, logPatterns = false;

    const lines = code.split('\n');
    let currentDepth = 0;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (/\b(for|while|forEach|map|reduce)\b/.test(trimmed)) {
        loops++;
        currentDepth++;
        if (currentDepth > maxDepth) maxDepth = currentDepth;
      }
      if (trimmed.includes('}') || (lang === 'py' && trimmed === '')) {
        if (currentDepth > 0) currentDepth--;
      }
    });

    const fnMatch = code.match(/(?:function|def|const)\s+(\w+)/);
    if (fnMatch) {
      const fn = fnMatch[1];
      const re = new RegExp(`\\b${fn}\\s*\\(`, 'g');
      recursion = (code.match(re) || []).length > 2;
    }

    if (code.includes('/ 2') || code.includes('>> 1')) logPatterns = true;

    let estimate = 'O(1)';
    if (recursion) estimate = 'O(2^n)';
    else if (maxDepth >= 2) estimate = `O(n^${maxDepth})`;
    else if (maxDepth === 1) estimate = logPatterns ? 'O(log n)' : 'O(n)';

    return `Estimated: ${estimate}\nDepth: ${maxDepth}\nRecursion: ${recursion ? 'Yes' : 'No'}`;
  }

  exportProject() {
    const text = Object.entries(this.files).map(([id, f]) => `=== ${f.name} ===\n${f.content}\n`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project_export.txt';
    a.click();
    URL.revokeObjectURL(url);
  }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new EditorApp(); });

