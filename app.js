// Configure require.js
require.config({
  paths: {
    'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.43.0/min/vs',
    'xterm': 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm',
    'fit': 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit'
  }
});

class EditorApp {
  constructor() {
    this.models = {};
    this.activeFile = null;
    this.openFiles = [];
    this.pyodide = null;
    this.terminal = null;
    this.fitAddon = null;
    this.editor = null;
    this.decorations = [];
    this.outputLog = [];

    this.items = {}; // id -> item
    this.rootIds = []; // top-level ids
    this.activeFolderId = null;

    this.initLibraries();
  }

  async initLibraries() {
    require(['vs/editor/editor.main', 'xterm', 'fit'], (monaco, xterm, fit) => {
      window.monaco = monaco;
      window.Terminal = xterm.Terminal;
      window.FitAddon = fit;
      this.init();
    });
  }

  async init() {
    await this.loadFromStorage();
    this.initTerminal();
    this.initMonaco();
    this.initResizing();
    this.initEventListeners();
    this.renderSidebar();
    this.updateTabs();
    this.updateBreadcrumbs();
  }

  async loadFromStorage() {
    try {
      const savedItems = localStorage.getItem('paradox_items');
      const savedRoot = localStorage.getItem('paradox_root');
      if (savedItems && savedRoot) {
        this.items = JSON.parse(savedItems);
        this.rootIds = JSON.parse(savedRoot);
      } else {
        // default files
        const indexId = 'index_js';
        const pyId = 'main_py';
        this.items[indexId] = { id: indexId, name: 'index.js', type: 'file', lang: 'javascript', content: `console.log("Hello from ParadoxEditor!");\n\nconst data = [\n  { id: 1, name: "Alpha" },\n  { id: 2, name: "Beta" }\n];\n\nconsole.log("Current Data:", data);` };
        this.items[pyId] = { id: pyId, name: 'main.py', type: 'file', lang: 'python', content: `print("Hello from Python!")\nprint("Line 2")\n\n\ndef greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("World"))` };
        this.rootIds = [indexId, pyId];
      }

      const savedActive = localStorage.getItem('paradox_active');
      const savedOpen = localStorage.getItem('paradox_open');
      if (savedActive) this.activeFile = savedActive;
      if (savedOpen) this.openFiles = JSON.parse(savedOpen);

      if (!this.activeFile) {
        const firstFile = this.rootIds.find(id => this.items[id]?.type === 'file');
        this.activeFile = firstFile || null;
      }
      if (this.activeFile && !this.openFiles.includes(this.activeFile)) this.openFiles.push(this.activeFile);
    } catch (e) {
      console.warn('Persistence failed:', e);
    }
  }

  saveToStorage() {
    localStorage.setItem('paradox_items', JSON.stringify(this.items));
    localStorage.setItem('paradox_root', JSON.stringify(this.rootIds));
    localStorage.setItem('paradox_active', this.activeFile || '');
    localStorage.setItem('paradox_open', JSON.stringify(this.openFiles));
  }

  initTerminal() {
    this.terminal = new Terminal({
      theme: { background: '#1e1e1e', foreground: '#cccccc' },
      fontSize: 13,
      fontFamily: 'var(--font-code)',
      cursorBlink: true
    });
    this.fitAddon = new FitAddon.FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(document.getElementById('terminal-container'));
    this.fitAddon.fit();
    this.terminal.writeln('\x1b[1;34m[Paradox Runtime Ready]\x1b[0m');
  }

  initMonaco() {
    Object.values(this.items).forEach(file => {
      if (file.type === 'file') {
        this.models[file.id] = monaco.editor.createModel(file.content || '', file.lang || 'javascript');
      }
    });

    this.editor = monaco.editor.create(document.getElementById('editor'), {
      model: this.models[this.activeFile] || null,
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: false },
      fontFamily: 'var(--font-code)'
    });

    this.editor.onDidChangeModelContent(() => {
      if (this.activeFile && this.items[this.activeFile]) {
        this.items[this.activeFile].content = this.editor.getValue();
        this.saveToStorage();
      }
    });

    this.editor.onDidChangeCursorPosition((e) => {
      const { lineNumber, column } = e.position;
      const statusSection = document.querySelector('.statusbar .right');
      if (statusSection) statusSection.innerHTML = `Ln ${lineNumber}, Col ${column}`;
    });
  }

  initResizing() {
    const sidebar = document.querySelector('.sidebar');
    const sidebarResizer = document.getElementById('sidebarResizer');
    const panels = document.querySelector('.panels');
    const panelResizer = document.getElementById('panelResizer');

    let isResizingSidebar = false, isResizingPanel = false;

    sidebarResizer.addEventListener('mousedown', () => isResizingSidebar = true);
    panelResizer.addEventListener('mousedown', () => isResizingPanel = true);

    document.addEventListener('mousemove', (e) => {
      if (isResizingSidebar) {
        const width = e.clientX - 48;
        if (width > 0 && width < 600) {
          sidebar.style.width = width + 'px';
          sidebar.style.display = width < 40 ? 'none' : 'flex';
          if (!sidebar.style.display) document.querySelectorAll('.activitybar .icon').forEach(i => i.classList.remove('active'));
        }
      } else if (isResizingPanel) {
        const height = window.innerHeight - e.clientY - 22;
        if (height > 50 && height < window.innerHeight - 150) {
          panels.style.height = height + 'px';
          if (this.fitAddon) this.fitAddon.fit();
        }
      }
    });

    document.addEventListener('mouseup', () => { isResizingSidebar = isResizingPanel = false; });
  }

  initEventListeners() {
    document.getElementById('runBtn').addEventListener('click', () => this.runCode());
    document.getElementById('clearBtn').addEventListener('click', () => this.terminal.clear());
    document.getElementById('newFileBtn').addEventListener('click', () => this.createNewItem('file'));
    document.getElementById('newFolderBtn').addEventListener('click', () => this.createNewItem('folder'));
    document.getElementById('benchmarkBtn').addEventListener('click', () => this.runBenchmark());
    document.getElementById('analyzeBtn').addEventListener('click', () => this.analyzeComplexity());
    document.getElementById('exportBtn').addEventListener('click', () => this.exportProject());
    document.getElementById('toggleOutputBtn').addEventListener('click', () => {
      const active = document.querySelector('.panel-view.active');
      if (active && active.id === 'terminal-container') this.switchPanel('output');
      else this.switchPanel('terminal');
    });

    document.querySelectorAll('.activitybar .icon').forEach(icon => {
      icon.addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar');
        const wasActive = icon.classList.contains('active');
        document.querySelectorAll('.activitybar .icon').forEach(i => i.classList.remove('active'));
        if (wasActive) {
          sidebar.style.display = 'none';
        } else {
          icon.classList.add('active');
          sidebar.style.display = 'flex';
        }
      });
    });

    document.querySelectorAll('.sidebar-section-header').forEach(header => {
      header.addEventListener('click', () => header.parentElement.classList.toggle('active'));
    });

    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchPanel(tab.dataset.panel));
    });
  }

  createNewItem(type) {
    const name = prompt(`Enter ${type} name:`);
    if (!name) return;
    const id = name.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now();
    const lang = name.endsWith('.py') ? 'python' : 'javascript';

    if (type === 'folder') {
      this.items[id] = { id, name, type: 'folder', parentId: this.activeFolderId || null };
    } else {
      const content = lang === 'python' ? '# Python' : '// JavaScript';
      this.items[id] = { id, name, type: 'file', lang, content, parentId: this.activeFolderId || null };
      this.models[id] = monaco.editor.createModel(content, lang);
      this.openFiles.push(id);
      this.switchFile(id);
    }

    if (!this.items[id].parentId) this.rootIds.push(id);
    this.renderSidebar();
    this.saveToStorage();
  }

  renameItem(id) {
    const item = this.items[id];
    if (!item) return;
    const name = prompt('Rename to:', item.name);
    if (!name) return;
    item.name = name;
    if (item.type === 'file') {
      item.lang = name.endsWith('.py') ? 'python' : 'javascript';
    }
    this.renderSidebar();
    this.updateTabs();
    this.updateBreadcrumbs();
    this.saveToStorage();
  }

  deleteItem(id) {
    const item = this.items[id];
    if (!item) return;
    if (!confirm(`Delete ${item.name}?`)) return;

    // remove children if folder
    if (item.type === 'folder') {
      Object.values(this.items).forEach(child => {
        if (child.parentId === id) this.deleteItem(child.id);
      });
    }

    delete this.items[id];
    this.rootIds = this.rootIds.filter(r => r !== id);
    this.openFiles = this.openFiles.filter(f => f !== id);
    if (this.activeFile === id) {
      this.activeFile = this.openFiles[0] || this.rootIds.find(r => this.items[r]?.type === 'file') || null;
      if (this.editor && this.activeFile && this.models[this.activeFile]) this.editor.setModel(this.models[this.activeFile]);
    }

    this.renderSidebar();
    this.updateTabs();
    this.updateBreadcrumbs();
    this.saveToStorage();
  }

  renderSidebar() {
    const explorer = document.getElementById('fileExplorer');
    const openEditors = document.getElementById('openEditors');
    if (!explorer || !openEditors) return;
    explorer.innerHTML = ''; openEditors.innerHTML = '';

    const renderItem = (id, container, depth = 0) => {
      const item = this.items[id];
      if (!item) return;
      const btn = document.createElement('button');
      btn.className = `tab ${this.activeFile === id ? 'active' : ''}`;
      btn.style.paddingLeft = `${8 + depth * 12}px`;

      const icon = item.type === 'folder'
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;

      btn.innerHTML = `<div class="sidebar-item-label">${icon}<span>${item.name}</span></div>
        <div class="sidebar-item-actions">
          <button class="sidebar-action-btn" title="Rename">✎</button>
          <button class="sidebar-action-btn" title="Delete">×</button>
        </div>`;

      btn.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('sidebar-action-btn')) return;
        if (item.type === 'file') this.switchFile(id);
        if (item.type === 'folder') this.activeFolderId = id;
      });

      const [renameBtn, deleteBtn] = btn.querySelectorAll('.sidebar-action-btn');
      renameBtn.addEventListener('click', (e) => { e.stopPropagation(); this.renameItem(id); });
      deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteItem(id); });

      container.appendChild(btn);

      Object.values(this.items).filter(c => c.parentId === id).forEach(child => renderItem(child.id, container, depth + 1));
    };

    this.rootIds.forEach(id => renderItem(id, explorer));

    this.openFiles.forEach(id => {
      const file = this.items[id];
      if (!file || file.type === 'folder') return;
      const btn = document.createElement('button');
      btn.className = `tab ${this.activeFile === id ? 'active' : ''}`;
      btn.innerHTML = `<div class="sidebar-item-label"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg><span>${file.name}</span></div>`;
      btn.addEventListener('click', () => this.switchFile(id));
      openEditors.appendChild(btn);
    });
  }

  switchFile(id) {
    if (!this.models[id]) return;
    this.activeFile = id;
    if (!this.openFiles.includes(id)) this.openFiles.push(id);
    if (this.editor) this.editor.setModel(this.models[id]);
    this.renderSidebar(); this.updateTabs(); this.updateBreadcrumbs(); this.saveToStorage();
  }

  updateTabs() {
    const container = document.getElementById('mainTabs');
    if (!container) return;
    container.innerHTML = '';
    this.openFiles.forEach(id => {
      const file = this.items[id];
      if (!file || file.type === 'folder') return;
      const tab = document.createElement('div');
      tab.className = `tabheader ${this.activeFile === id ? 'active' : ''}`;
      tab.innerHTML = `<span>${file.name}</span>`;
      tab.addEventListener('click', () => this.switchFile(id));
      container.appendChild(tab);
    });
  }

  updateBreadcrumbs() {
    const bc = document.getElementById('breadcrumbs');
    if (bc && this.items[this.activeFile]) {
      bc.innerHTML = `<span>src</span><span class="separator">/</span><span class="current-file">${this.items[this.activeFile].name}</span>`;
    }
  }

  switchPanel(id) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === id));
    document.querySelectorAll('.panel-view').forEach(v => v.classList.toggle('active', v.id === `${id}-container`));
    if (id === 'terminal' && this.fitAddon) this.fitAddon.fit();
  }

  formatValue(val) {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  addOutput(type, content, line = null) {
    this.outputLog.push({ type, content, line, time: Date.now() });
    this.renderOutput();
  }

  renderOutput() {
    const container = document.getElementById('output-container');
    if (!container) return;
    container.innerHTML = '';
    this.outputLog.forEach(entry => {
      const row = document.createElement('div');
      row.className = `output-entry ${entry.type}`;
      const lineLink = document.createElement('a');
      lineLink.className = 'output-line-link';
      lineLink.textContent = entry.line ? `Ln ${entry.line}` : '';
      if (entry.line) {
        lineLink.addEventListener('click', () => this.revealLine(entry.line));
      }
      const content = document.createElement('div');
      content.className = 'output-content';
      content.textContent = entry.content;
      row.appendChild(lineLink);
      row.appendChild(content);
      container.appendChild(row);
    });
  }

  revealLine(line) {
    if (!this.editor) return;
    this.editor.revealLineInCenter(line);
    this.editor.setPosition({ lineNumber: line, column: 1 });
    this.editor.focus();
  }

  parseJsErrorLine(err) {
    const m = (err.stack || '').match(/<anonymous>:(\d+):(\d+)/);
    return m ? parseInt(m[1]) : null;
  }

  parsePyErrorLine(err) {
    const m = String(err).match(/line (\d+)/);
    return m ? parseInt(m[1]) : null;
  }

  async runCode() {
    this.switchPanel('output');
    this.outputLog = [];
    const code = this.editor.getValue();
    const file = this.items[this.activeFile];
    this.addOutput('log', `➜ Executing ${file.name}...`);
    this.terminal.writeln(`\r\n\x1b[1;36m➜ Executing ${file.name}...\x1b[0m`);

    if (file.lang === 'javascript') {
      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;

      console.log = (...args) => {
        const text = args.map(a => this.formatValue(a)).join(' ');
        this.addOutput('log', text);
        this.terminal.writeln(text);
      };
      console.warn = (...args) => {
        const text = args.map(a => this.formatValue(a)).join(' ');
        this.addOutput('warn', text);
        this.terminal.writeln(`\x1b[33m${text}\x1b[0m`);
      };
      console.error = (...args) => {
        const text = args.map(a => this.formatValue(a)).join(' ');
        this.addOutput('error', text);
        this.terminal.writeln(`\x1b[31m${text}\x1b[0m`);
      };

      try {
        const wrapped = `(async () => {\n${code}\n})()`;
        new Function(wrapped)();
      } catch (e) {
        const line = this.parseJsErrorLine(e);
        this.addOutput('error', e.message || String(e), line);
      } finally {
        console.log = originalLog;
        console.warn = originalWarn;
        console.error = originalError;
      }
    } else if (file.lang === 'python') {
      if (!this.pyodide) {
        document.getElementById('pyStatus').innerText = 'Pyodide: loading...';
        try {
          this.pyodide = await loadPyodide();
          document.getElementById('pyStatus').innerText = 'Pyodide: ready';
        } catch (e) {
          this.addOutput('error', 'Failed to load Pyodide');
          return;
        }
      }

      this.pyodide.globals.set('__pdx_print', (...args) => {
        const text = args.map(a => String(a)).join(' ');
        this.addOutput('log', text);
        this.terminal.writeln(text);
      });

      const instrumented = code.replace(/\bprint\s*\(/g, '__pdx_print(');
      try {
        await this.pyodide.runPythonAsync(instrumented);
      } catch (e) {
        const line = this.parsePyErrorLine(e);
        this.addOutput('error', e.message || String(e), line);
      }
    }
  }

  runBenchmark() {
    this.terminal.writeln('Benchmarking started...');
    const start = performance.now();
    try { new Function(this.editor.getValue())(); } catch (e) { }
    this.terminal.writeln(`Execution time: ${(performance.now() - start).toFixed(4)}ms`);
  }

  analyzeComplexity() {
    this.switchPanel('complexity');
    const file = this.items[this.activeFile];
    const lang = file.lang === 'python' ? 'python' : 'javascript';
    const result = window.ComplexityAnalyzer?.analyze(this.editor.getValue(), lang) || 'O(n)';
    document.getElementById('complexity').innerText = `Analysis: ${result}`;
  }

  exportProject() {
    alert('Project exported to console.');
    console.log(this.items);
  }
}

window.onload = () => { window.app = new EditorApp(); };
