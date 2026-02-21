
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
    this.decorationCollection = null;
    this.outputLog = [];
    this.isRunning = false;
    this.runAbort = false;

    this.items = {}; // id -> item
    this.rootIds = []; // top-level ids
    this.activeFolderId = null;

    // Diff editor state
    this.diffEditor = null;
    this.diffOriginalModel = null;
    this.diffModifiedModel = null;

    // Challenges state
    this.currentChallenge = null;
    this.currentHintIndex = -1;

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
    this.initCommandPalette();
    this.renderSidebar();
    this.initChallenges();
    this.updateTabs();
    this.updateBreadcrumbs();

    // Debounced Auto-Analysis
    this.analysisTimeout = null;
    this.editor.onDidChangeModelContent((e) => {
      if (this.activeFile && this.items[this.activeFile]) {
        this.items[this.activeFile].content = this.editor.getValue();
        this.saveToStorage();
      }

      // Only clear decorations if the user is typing (to avoid stale console logs)
      // but perhaps we should keep them until re-run to avoid "glitchy" flashing
      // Let's at least debounce the clearing or only clear if it's a structural change.
      // For now, let's keep them until the NEXT run starts to reduce flicker.

      // Auto-Update (Complexity + Inline Output)
      if (this.autoUpdateTimeout) clearTimeout(this.autoUpdateTimeout);
      this.autoUpdateTimeout = setTimeout(() => {
        this.autoUpdate();
      }, 1000);
    });
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
        this.items[pyId] = { id: pyId, name: 'main.py', type: 'file', lang: 'python', content: `print("Hello from Python!")\nprint("Line 2")\n\ndef greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("World"))` };
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
    // Define authentic VS Code Dark+ theme
    monaco.editor.defineTheme('vscode-dark-plus', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        // Comments
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'comment.block', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'comment.line', foreground: '6A9955', fontStyle: 'italic' },

        // Keywords
        { token: 'keyword', foreground: '569CD6' },
        { token: 'keyword.control', foreground: 'C586C0' },
        { token: 'keyword.operator', foreground: 'D4D4D4' },

        // Strings
        { token: 'string', foreground: 'CE9178' },
        { token: 'string.escape', foreground: 'D7BA7D' },

        // Numbers
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'number.hex', foreground: 'B5CEA8' },

        // Functions
        { token: 'entity.name.function', foreground: 'DCDCAA' },
        { token: 'support.function', foreground: 'DCDCAA' },

        // Variables
        { token: 'variable', foreground: '9CDCFE' },
        { token: 'variable.parameter', foreground: '9CDCFE' },
        { token: 'variable.other', foreground: '9CDCFE' },

        // Types & Classes
        { token: 'type', foreground: '4EC9B0' },
        { token: 'entity.name.type', foreground: '4EC9B0' },
        { token: 'entity.name.class', foreground: '4EC9B0' },
        { token: 'support.class', foreground: '4EC9B0' },

        // Constants
        { token: 'constant', foreground: '4FC1FF' },
        { token: 'constant.language', foreground: '569CD6' },
        { token: 'constant.numeric', foreground: 'B5CEA8' },

        // Operators & Punctuation
        { token: 'operator', foreground: 'D4D4D4' },
        { token: 'delimiter', foreground: 'D4D4D4' },
        { token: 'delimiter.bracket', foreground: 'FFD700' },

        // Storage
        { token: 'storage', foreground: '569CD6' },
        { token: 'storage.type', foreground: '569CD6' },

        // Tags (HTML/XML)
        { token: 'tag', foreground: '569CD6' },
        { token: 'metatag', foreground: '569CD6' },

        // Attributes
        { token: 'attribute.name', foreground: '9CDCFE' },
        { token: 'attribute.value', foreground: 'CE9178' },
      ],
      colors: {
        'editor.background': '#1e1e1e',
        'editor.foreground': '#d4d4d4',
        'editor.lineHighlightBackground': '#2a2d2e',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#3a3d41',
        'editorLineNumber.foreground': '#858585',
        'editorLineNumber.activeForeground': '#c6c6c6',
        'editorCursor.foreground': '#aeafad',
        'editorWhitespace.foreground': '#3b3b3b',
        'editorIndentGuide.background': '#404040',
        'editorIndentGuide.activeBackground': '#707070',
        'editor.findMatchBackground': '#515c6a',
        'editor.findMatchHighlightBackground': '#ea5c0055',
        'editorBracketMatch.background': '#0d3a58',
        'editorBracketMatch.border': '#888888',
        'editorRuler.foreground': '#5a5a5a',
        'minimap.background': '#1e1e1e',
      }
    });

    Object.values(this.items).forEach(file => {
      if (file.type === 'file') {
        const model = monaco.editor.createModel(file.content || '', file.lang || 'javascript');
        this.models[file.id] = model;
      }
    });

    this.editor = monaco.editor.create(document.getElementById('editor'), {
      model: this.models[this.activeFile] || null,
      theme: 'vscode-dark-plus',
      automaticLayout: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
      fontLigatures: true,
      lineHeight: 20,

      // Interview Practice Features
      minimap: { enabled: false },
      renderWhitespace: 'none',
      renderControlCharacters: false,
      guides: { indentation: false },
      matchBrackets: 'always',
      
      // Remove visual noise
      rulers: [], // No vertical rulers
      overviewRulerBorder: false, // No scrollbar border
      hideCursorInOverviewRuler: true,
      
      // UX
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      contextmenu: true,
      mouseWheelZoom: true,
    });

    this.decorationCollection = this.editor.createDecorationsCollection([]);

    this.editor.onDidChangeModelContent(() => {
      // Redundant listener removed, logic moved to init() for cleaner debounce handling
    });

    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => this.runCode());

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
    const savedPanel = localStorage.getItem('paradox_panel_height');
    if (savedPanel) panels.style.height = savedPanel + 'px';
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
          localStorage.setItem('paradox_panel_height', height);
          if (this.fitAddon) this.fitAddon.fit();
        }
      }
    });

    document.addEventListener('mouseup', () => { isResizingSidebar = isResizingPanel = false; });
  }

  initEventListeners() {
    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    const runStatus = document.getElementById('runStatus');
    const runStatusText = document.getElementById('runStatusText');

    if (runBtn) runBtn.addEventListener('click', () => this.runCode());
    if (stopBtn) stopBtn.addEventListener('click', () => this.stopRun());
    document.getElementById('clearBtn').addEventListener('click', () => {
      this.terminal.clear();
      this.outputLog = [];
      const outputEl = document.getElementById('output');
      if (outputEl) outputEl.innerHTML = '';
      if (this.editor) this.editor.setValue('');
      if (this.decorationCollection) this.decorationCollection.clear();
      this.currentDecorationsList = [];
    });
    document.getElementById('newFileBtn').addEventListener('click', () => this.createNewItem('file'));
    document.getElementById('newFolderBtn').addEventListener('click', () => this.createNewItem('folder'));
    document.getElementById('benchmarkBtn').addEventListener('click', () => this.runBenchmark());
    document.getElementById('diffBtn')?.addEventListener('click', () => this.initDiffEditor());
    document.getElementById('toggleOutputBtn').addEventListener('click', () => {
      const active = document.querySelector('.panel-view.active');
      if (active && active.id === 'terminal-container') this.switchPanel('output');
      else this.switchPanel('terminal');
    });

    // Generic activity bar toggle — skip Challenges button (handled separately)
    document.querySelectorAll('.activitybar .icon').forEach(icon => {
      icon.addEventListener('click', () => {
        if (icon.id === 'challengesActivityBtn') return; // handled below
        const sidebar = document.querySelector('.sidebar');
        const wasActive = icon.classList.contains('active');
        document.querySelectorAll('.activitybar .icon').forEach(i => i.classList.remove('active'));

        // When switching away from challenges, restore explorer sections
        const challengesSection = document.getElementById('challengesSection');
        const sidebarHeader = document.querySelector('.sidebar-header');
        document.querySelectorAll('.sidebar-section:not(#challengesSection)').forEach(s => s.style.display = '');
        if (challengesSection) challengesSection.style.display = 'none';
        if (sidebarHeader) sidebarHeader.style.display = '';

        if (wasActive) {
          sidebar.style.display = 'none';
        } else {
          icon.classList.add('active');
          sidebar.style.display = 'flex';
        }
      });
    });

    // Challenges activity bar — shows challenges panel, hides explorer
    document.getElementById('challengesActivityBtn')?.addEventListener('click', () => {
      const sidebar = document.querySelector('.sidebar');
      const challengesSection = document.getElementById('challengesSection');
      const sidebarHeader = document.querySelector('.sidebar-header');
      const btn = document.getElementById('challengesActivityBtn');
      const wasActive = btn.classList.contains('active');

      document.querySelectorAll('.activitybar .icon').forEach(i => i.classList.remove('active'));

      if (wasActive) {
        sidebar.style.display = 'none';
        if (challengesSection) challengesSection.style.display = 'none';
        document.querySelectorAll('.sidebar-section:not(#challengesSection)').forEach(s => s.style.display = '');
        if (sidebarHeader) sidebarHeader.style.display = '';
      } else {
        btn.classList.add('active');
        sidebar.style.display = 'flex';
        if (challengesSection) challengesSection.style.display = 'block';
        document.querySelectorAll('.sidebar-section:not(#challengesSection)').forEach(s => s.style.display = 'none');
        if (sidebarHeader) sidebarHeader.style.display = 'none';
      }
    });

    // Diff modal controls
    document.getElementById('diffCloseBtn')?.addEventListener('click', () => this.closeDiffEditor());
    document.getElementById('diffClearBtn')?.addEventListener('click', () => {
      if (this.diffModifiedModel) this.diffModifiedModel.setValue('// Paste reference solution here');
    });
    document.getElementById('diffRunBtn')?.addEventListener('click', () => {
      if (this.diffOriginalModel) this.diffOriginalModel.setValue(this.editor.getValue());
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

  async autoUpdate() {
    const file = this.items[this.activeFile];
    if (!file) return;

    const code = this.editor.getValue();

    // Complexity analysis — runs for both JS and Python
    if (window.ComplexityAnalyzer && code.trim().length > 10) {
      try {
        const lang = file.lang === 'python' ? 'python' : 'javascript';
        const result = window.ComplexityAnalyzer.analyzeFull(code, lang);
        const lines = code.split('\n');
        let targetLine = 1;
        const fnPattern = lang === 'python'
          ? /^\s*def\s+\w/
          : /^\s*(function\s+\w|const\s+\w+\s*=\s*(function|\([^)]*\)\s*=>)|[a-zA-Z_$]\w*\s*\([^)]*\)\s*\{)/;
        for (let i = 0; i < lines.length; i++) {
          if (fnPattern.test(lines[i])) { targetLine = i + 1; break; }
        }
        this.addInlineDecoration(
          targetLine,
          ` Complexity: Time ${result.time} | Space ${result.space}`,
          true
        );
      } catch (e) {
        // Silently fail — complexity is best-effort
      }
    }

    // Ghost execution for inline output (JS only for performance reasons)
    if (file.lang === 'javascript') {
      if (code.length > 5000 || code.includes('while(true)') || code.includes('while (true)')) return;
      this.runCode(true); // true = silent/ghost mode
    }
  }

  async runCode(silent = false) {
    if (!silent) {
      this.switchPanel('output');
      this.outputLog = [];
      this.currentDecorationsList = []; // Clear all decorations on manual run
    } else {
      // In silent mode, only clear log decorations, keep complexity
      if (this.currentDecorationsList) {
        this.currentDecorationsList = this.currentDecorationsList.filter(d =>
          d.options.after && d.options.after.inlineClassName === 'inline-complexity-decoration'
        );
      }
    }

    this.isRunning = true;
    this.runAbort = false;

    if (this.decorationCollection) {
      // If we don't clear, they stack. But if we clear, we lose complexity.
      // SET will handle the update correctly.
    } else if (this.editor) {
      this.decorationCollection = this.editor.createDecorationsCollection([]);
    }

    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    const runStatus = document.getElementById('runStatus');

    if (!silent) {
      if (runBtn) runBtn.classList.add('hidden');
      if (stopBtn) stopBtn.classList.remove('hidden');
      if (runStatus) runStatus.classList.remove('hidden');
    }

    const code = this.editor.getValue();
    const file = this.items[this.activeFile];

    if (!silent) {
      this.addOutput('log', `➜ Executing ${file.name}...`);
      this.terminal.writeln(`\r\n\x1b[1;36m➜ Executing ${file.name}...\x1b[0m`);
      // Show complexity in output panel on manual run
      if (window.ComplexityAnalyzer && code.trim().length > 10) {
        try {
          const complexResult = window.ComplexityAnalyzer.analyzeFull(code, file.lang);
          this.addOutput('log', `[Complexity] Time: ${complexResult.time}  Space: ${complexResult.space}`);
        } catch (e) { /* ignore */ }
      }
    }

    if (file.lang === 'javascript') {
      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;

      // Track which console.log we're on (order of execution)
      let logCallIndex = 0;

      // Find all console.log lines in the source code
      const codeLines = code.split('\n');
      const logLines = [];
      for (let i = 0; i < codeLines.length; i++) {
        if (codeLines[i].includes('console.log')) {
          logLines.push(i + 1); // 1-indexed line numbers
        }
      }

      console.log = (...args) => {
        const text = args.map(a => this.formatValue(a)).join(' ');
        if (!silent) {
          this.addOutput('log', text);
          this.terminal.writeln(text);
        }

        // Use the pre-computed log line positions
        if (logLines[logCallIndex] && logLines[logCallIndex] <= this.editor.getModel().getLineCount()) {
          this.addInlineDecoration(logLines[logCallIndex], ` → ${text}`);
        }
        logCallIndex++;
      };
      console.warn = (...args) => {
        if (silent) return;
        const text = args.map(a => this.formatValue(a)).join(' ');
        this.addOutput('warn', text);
        this.terminal.writeln(`\x1b[33m${text}\x1b[0m`);
      };
      console.error = (...args) => {
        if (silent) return;
        const text = args.map(a => this.formatValue(a)).join(' ');
        this.addOutput('error', text);
        this.terminal.writeln(`\x1b[31m${text}\x1b[0m`);
      };

      try {
        const wrapped = `(async () => {\n${code}\n})()`;
        new Function(wrapped)();
      } catch (e) {
        if (!silent) {
          const line = this.parseJsErrorLine(e);
          this.addOutput('error', e.message || String(e), line);
        }
      } finally {
        console.log = originalLog;
        console.warn = originalWarn;
        console.error = originalError;
        if (!silent) {
          if (runStatus) runStatus.classList.add('hidden');
          if (stopBtn) stopBtn.classList.add('hidden');
          if (runBtn) runBtn.classList.remove('hidden');
        }
        this.isRunning = false;
        // Run test cases if a challenge is active (JS)
        if (!silent && this.currentChallenge) {
          this.runTestCases(code, 'javascript');
        }
      }
    } else if (file.lang === 'python') {
      // Python auto-run is disabled for performance/complexity unless manual
      if (silent) {
        this.isRunning = false;
        return;
      }
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
        // Python inline logic handled via instrumentation
      });

      this.pyodide.globals.set('__pdx_inline', (line, text) => {
        this.addInlineDecoration(line, text);
      });

      // Instrument Python code to capture line numbers for print
      // We wrap print calls to pass line number: __pdx_inline(line, text)
      // This is complex via regex. Better to use a small python tracer?
      // Simple regex replacement: print(x) -> __pdx_print_with_line(lineno, x)
      // We can define a python helper that inspects the frame.

      const pySetup = `
import sys
import inspect
def __pdx_print_wrapper(*args, **kwargs):
    frame = inspect.currentframe().f_back
    line = frame.f_lineno
    text = " ".join(map(str, args))
    __pdx_print(*args, **kwargs)
    __pdx_inline(line, text)
`;
      // Prepend setup, but run it separately so line numbers match?
      // No, if we prepend, line numbers shift.
      // We will inject the function into globals first.

      if (!this.pyodide._pdx_init_done) {
        await this.pyodide.runPythonAsync(pySetup);
        this.pyodide._pdx_init_done = true;
      }

      // We replace print() calls with our wrapper in the user code?
      // Or just override builtins.print?
      // Overriding builtins.print is cleaner and preserves line numbers!
      await this.pyodide.runPythonAsync(`import builtins; builtins.print = __pdx_print_wrapper`);

      try {
        await this.pyodide.runPythonAsync(code);
      } catch (e) {
        const line = this.parsePyErrorLine(e);
        this.addOutput('error', e.message || String(e), line);
      } finally {
        if (runStatus) runStatus.classList.add('hidden');
        if (stopBtn) stopBtn.classList.add('hidden');
        if (runBtn) runBtn.classList.remove('hidden');
        this.isRunning = false;
        // Run test cases if a challenge is active (Python)
        if (this.currentChallenge) {
          await this.runTestCases(code, 'python');
        }
      }
    }

  }

  stopRun() {
    this.runAbort = true;
    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    const runStatus = document.getElementById('runStatus');

    this.terminal.writeln('\x1b[31m⚠ Execution aborted by user (refresh required for full reset).\x1b[0m');

    if (runStatus) runStatus.classList.add('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');
    if (runBtn) runBtn.classList.remove('hidden');
    this.isRunning = false;
  }

  runBenchmark() {
    this.terminal.writeln('Benchmarking started...');
    const start = performance.now();
    try { new Function(this.editor.getValue())(); } catch (e) { }
    this.terminal.writeln(`Execution time: ${(performance.now() - start).toFixed(4)}ms`);
  }

  // ===== Diff Editor =====

  initDiffEditor() {
    try {
      const modal = document.getElementById('diffModal');
      const container = document.getElementById('diffEditorContainer');

      if (!this.diffEditor) {
        this.diffEditor = monaco.editor.createDiffEditor(container, {
          theme: 'vscode-dark-plus',
          automaticLayout: true,
          readOnly: false,
          renderSideBySide: true,
          fontSize: 14,
          fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
        });
      }

      const code = this.editor.getValue();
      const lang = this.items[this.activeFile]?.lang || 'javascript';
      const monacoLang = lang === 'python' ? 'python' : 'javascript';

      if (this.diffOriginalModel) this.diffOriginalModel.dispose();
      if (this.diffModifiedModel) this.diffModifiedModel.dispose();

      this.diffOriginalModel = monaco.editor.createModel(code, monacoLang);
      this.diffModifiedModel = monaco.editor.createModel(
        this.currentChallenge?.solution?.[lang] || '// Paste reference solution here',
        monacoLang
      );

      this.diffEditor.setModel({
        original: this.diffOriginalModel,
        modified: this.diffModifiedModel,
      });

      modal.classList.remove('hidden');
    } catch (e) {
      this.addOutput('error', `Diff editor error: ${e.message}`);
    }
  }

  closeDiffEditor() {
    document.getElementById('diffModal').classList.add('hidden');
  }

  // ===== Challenges System =====

  initChallenges() {
    const listEl = document.getElementById('challengesList');
    if (!listEl || !window.CHALLENGES) return;

    window.CHALLENGES.forEach(ch => {
      const btn = document.createElement('div');
      btn.className = 'sidebar-item';
      btn.dataset.id = ch.id;
      btn.style.cursor = 'pointer';
      btn.innerHTML = `
        <div class="sidebar-item-label" style="padding-left:12px;gap:6px;display:flex;align-items:center;">
          <span class="challenge-difficulty-dot difficulty-${ch.difficulty.toLowerCase()}"></span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ch.title}</span>
          <span class="challenge-tag">${ch.difficulty}</span>
        </div>`;
      btn.addEventListener('click', () => this.loadChallenge(ch.id));
      listEl.appendChild(btn);
    });

    document.getElementById('hintBtn')?.addEventListener('click', () => this.showNextHint());
    document.getElementById('showSolutionBtn')?.addEventListener('click', () => this.showSolution());
  }

  loadChallenge(id) {
    const ch = window.CHALLENGES?.find(c => c.id === id);
    if (!ch) return;

    this.currentChallenge = ch;
    this.currentHintIndex = -1;

    localStorage.setItem('paradox_challenge_active', id);

    // Highlight selected challenge in list
    document.querySelectorAll('#challengesList .sidebar-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.id === id);
    });

    // Load starter code into editor
    const file = this.items[this.activeFile];
    const lang = file?.lang || 'javascript';
    const starter = ch.starterCode[lang] || ch.starterCode.javascript;
    if (this.editor) this.editor.setValue(starter);

    // Show description panel
    const descEl = document.getElementById('challengeDescription');
    const titleEl = document.getElementById('challengeTitle');
    const diffEl = document.getElementById('challengeDifficulty');
    const textEl = document.getElementById('challengeDescText');
    const hintBox = document.getElementById('hintBox');

    if (descEl) descEl.classList.remove('hidden');
    if (titleEl) titleEl.textContent = ch.title;
    if (diffEl) {
      diffEl.textContent = ch.difficulty;
      diffEl.className = `challenge-difficulty difficulty-${ch.difficulty.toLowerCase()}`;
    }
    if (textEl) textEl.textContent = ch.description;
    if (hintBox) { hintBox.classList.add('hidden'); hintBox.innerHTML = ''; }

    this.addOutput('log', `[Challenge] Loaded: ${ch.title} (${ch.difficulty})`);
    this.addOutput('log', `Run your code to test against ${ch.testCases.length} test case(s). Use the Hint button if stuck.`);
    this.switchPanel('output');
  }

  // ===== Test Case Runner =====

  async runTestCases(code, lang) {
    const ch = this.currentChallenge;
    if (!ch) return;

    this.addOutput('log', `\n[Tests] Running ${ch.testCases.length} test case(s) for "${ch.title}"...`);

    let passed = 0;
    let failed = 0;

    for (let i = 0; i < ch.testCases.length; i++) {
      const tc = ch.testCases[i];
      const testNum = `Test ${i + 1}`;

      try {
        let actual;

        if (lang === 'javascript') {
          // Detect function name from first function definition line
          const fnNameMatch = code.match(/^(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=)/m);
          const fnName = fnNameMatch ? (fnNameMatch[1] || fnNameMatch[2]) : null;
          if (!fnName) {
            this.addOutput('warn', `${testNum}: Could not detect function name. Define your function on line 1.`);
            failed++;
            continue;
          }
          const testWrapper = `${code}\nreturn ${fnName}(${tc.input});`;
          const testFn = new Function(testWrapper);
          actual = testFn();
        } else if (lang === 'python') {
          if (!this.pyodide) {
            this.addOutput('warn', `${testNum}: Pyodide not loaded. Run your code first to initialize Python.`);
            failed++;
            continue;
          }
          const fnNameMatch = code.match(/^def\s+(\w+)/m);
          const fnName = fnNameMatch ? fnNameMatch[1] : null;
          if (!fnName) {
            this.addOutput('warn', `${testNum}: Could not detect function name. Define your function on line 1.`);
            failed++;
            continue;
          }
          const pyTest = `${code}\n__pdx_test_result = ${fnName}(${tc.input})`;
          await this.pyodide.runPythonAsync(pyTest);
          const raw = this.pyodide.globals.get('__pdx_test_result');
          actual = (raw && typeof raw.toJs === 'function')
            ? raw.toJs({ dict_converter: Object.fromEntries })
            : raw;
        }

        const pass = this._deepEqual(actual, tc.expectedValue);
        if (pass) {
          this.addOutput('log', `  ✓ ${testNum}: PASS`);
          passed++;
        } else {
          this.addOutput('error', `  ✗ ${testNum}: FAIL — Expected: ${JSON.stringify(tc.expectedValue)}, Got: ${JSON.stringify(actual)}`);
          failed++;
        }
      } catch (e) {
        this.addOutput('error', `  ✗ ${testNum}: ERROR — ${e.message || String(e)}`);
        failed++;
      }
    }

    const summary = `[Tests] ${passed}/${ch.testCases.length} passed`;
    if (failed === 0) {
      this.addOutput('log', `\n${summary} — All tests passed! `);
    } else {
      this.addOutput('error', `\n${summary} — ${failed} failed. Use the Hint button in the sidebar if stuck.`);
    }
  }

  _deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => this._deepEqual(v, b[i]));
    }
    if (typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      return ka.every(k => this._deepEqual(a[k], b[k]));
    }
    return false;
  }

  // ===== Hints System =====

  showNextHint() {
    const ch = this.currentChallenge;
    if (!ch) {
      this.addOutput('warn', '[Hint] No challenge selected. Click a challenge in the sidebar first.');
      this.switchPanel('output');
      return;
    }
    if (!ch.hints || ch.hints.length === 0) {
      this.addOutput('log', '[Hint] No hints available for this challenge.');
      return;
    }

    this.currentHintIndex = Math.min(this.currentHintIndex + 1, ch.hints.length - 1);
    const hint = ch.hints[this.currentHintIndex];
    const hintBox = document.getElementById('hintBox');

    if (hintBox) {
      hintBox.classList.remove('hidden');
      const allShown = this.currentHintIndex === ch.hints.length - 1;
      hintBox.innerHTML = `
        <div class="hint-label">Hint ${this.currentHintIndex + 1} of ${ch.hints.length}</div>
        <div class="hint-text">${hint}</div>
        ${allShown ? '<div class="hint-all-shown">No more hints available.</div>' : ''}
      `;
    }

    this.addOutput('log', `[Hint ${this.currentHintIndex + 1}/${ch.hints.length}] ${hint}`);
    this.switchPanel('output');
  }

  showSolution() {
    const ch = this.currentChallenge;
    if (!ch) return;
    const file = this.items[this.activeFile];
    const lang = file?.lang || 'javascript';
    const sol = ch.solution?.[lang] || ch.solution?.javascript;
    if (sol && this.editor) {
      if (confirm(`Load the ${lang} solution for "${ch.title}"? This will replace your current code.`)) {
        this.editor.setValue(sol);
        this.addOutput('log', `[Solution] Loaded reference solution for: ${ch.title}`);
        this.switchPanel('output');
      }
    }
  }

  addInlineDecoration(lineNumber, text, isComplexity = false) {
    if (!this.editor || !this.decorationCollection) return;

    const display = text.length > 60 ? text.substring(0, 60) + '...' : text;

    const range = new monaco.Range(lineNumber, 1, lineNumber, 2000);
    const newDeco = {
      range: range,
      options: {
        isWholeLine: false,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        after: {
          content: display,
          inlineClassName: isComplexity ? 'inline-complexity-decoration' : 'inline-result-decoration',
          cursorStops: monaco.editor.InjectedTextCursorStops.None
        }
      }
    };

    if (!this.currentDecorationsList) this.currentDecorationsList = [];

    // If we are adding complexity, replace existing complexity on that line
    if (isComplexity) {
      this.currentDecorationsList = this.currentDecorationsList.filter(d => d.range.startLineNumber !== lineNumber || !d.options.after.content.includes('Complexity:'));
    }

    this.currentDecorationsList.push(newDeco);
    this.decorationCollection.set(this.currentDecorationsList);
  }

  // ===== Command Palette =====
  initCommandPalette() {
    this.commands = [
      { name: 'Run Code', shortcut: 'F5', category: 'Run', action: () => this.runCode() },
      { name: 'Stop Execution', shortcut: 'Shift+F5', category: 'Run', action: () => this.stopRun() },
      { name: 'New File', shortcut: 'Ctrl+N', category: 'File', action: () => this.createNewItem('file') },
      { name: 'New Folder', shortcut: '', category: 'File', action: () => this.createNewItem('folder') },
      { name: 'Clear Terminal', shortcut: '', category: 'Terminal', action: () => { this.terminal.clear(); } },
      {
        name: 'Clear All', shortcut: '', category: 'Edit', action: () => {
          this.terminal.clear();
          this.outputLog = [];
          if (this.editor) this.editor.setValue('');
          if (this.decorationCollection) this.decorationCollection.clear();
          this.currentDecorationsList = [];
        }
      },
      { name: 'Run Benchmark', shortcut: '', category: 'Run', action: () => this.runBenchmark() },
      { name: 'Toggle Terminal', shortcut: 'Ctrl+`', category: 'View', action: () => this.switchPanel('terminal') },
      { name: 'Toggle Output', shortcut: '', category: 'View', action: () => this.switchPanel('output') },
      {
        name: 'Format Document', shortcut: 'Shift+Alt+F', category: 'Edit', action: () => {
          this.editor.getAction('editor.action.formatDocument')?.run();
        }
      },
      {
        name: 'Go to Line...', shortcut: 'Ctrl+G', category: 'Go', action: () => {
          this.editor.getAction('editor.action.gotoLine')?.run();
        }
      },
      {
        name: 'Find', shortcut: 'Ctrl+F', category: 'Edit', action: () => {
          this.editor.getAction('actions.find')?.run();
        }
      },
      {
        name: 'Find and Replace', shortcut: 'Ctrl+H', category: 'Edit', action: () => {
          this.editor.getAction('editor.action.startFindReplaceAction')?.run();
        }
      },
      {
        name: 'Toggle Word Wrap', shortcut: 'Alt+Z', category: 'View', action: () => {
          const current = this.editor.getOption(monaco.editor.EditorOption.wordWrap);
          this.editor.updateOptions({ wordWrap: current === 'on' ? 'off' : 'on' });
        }
      },
      {
        name: 'Zoom In', shortcut: 'Ctrl+=', category: 'View', action: () => {
          const current = this.editor.getOption(monaco.editor.EditorOption.fontSize);
          this.editor.updateOptions({ fontSize: current + 1 });
        }
      },
      {
        name: 'Zoom Out', shortcut: 'Ctrl+-', category: 'View', action: () => {
          const current = this.editor.getOption(monaco.editor.EditorOption.fontSize);
          this.editor.updateOptions({ fontSize: Math.max(8, current - 1) });
        }
      },
      {
        name: 'Reset Zoom', shortcut: 'Ctrl+0', category: 'View', action: () => {
          this.editor.updateOptions({ fontSize: 14 });
        }
      },
      {
        name: 'Open Challenges', shortcut: '', category: 'Challenges',
        action: () => document.getElementById('challengesActivityBtn')?.click()
      },
      {
        name: 'Run Tests', shortcut: '', category: 'Challenges',
        action: () => {
          if (this.currentChallenge) {
            const lang = this.items[this.activeFile]?.lang || 'javascript';
            this.runTestCases(this.editor.getValue(), lang);
          } else {
            this.addOutput('warn', '[Tests] No challenge selected. Open a challenge first.');
            this.switchPanel('output');
          }
        }
      },
      {
        name: 'Compare with Reference', shortcut: '', category: 'Diff',
        action: () => this.initDiffEditor()
      },
      {
        name: 'Show Next Hint', shortcut: '', category: 'Challenges',
        action: () => this.showNextHint()
      },
    ];

    this.paletteEl = document.getElementById('commandPalette');
    this.commandInputEl = document.getElementById('commandInput');
    this.commandListEl = document.getElementById('commandList');
    this.selectedCommandIndex = 0;

    // Global keyboard shortcut for Command Palette
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        this.showCommandPalette();
      }
      if (e.key === 'Escape' && !this.paletteEl.classList.contains('hidden')) {
        this.hideCommandPalette();
      }
      if (e.key === 'Escape') {
        const diffModal = document.getElementById('diffModal');
        if (diffModal && !diffModal.classList.contains('hidden')) this.closeDiffEditor();
      }
    });

    // Close on overlay click
    this.paletteEl.querySelector('.command-palette-overlay').addEventListener('click', () => {
      this.hideCommandPalette();
    });

    // Search input handling
    this.commandInputEl.addEventListener('input', () => {
      this.filterCommands(this.commandInputEl.value);
    });

    // Keyboard navigation
    this.commandInputEl.addEventListener('keydown', (e) => {
      const items = this.commandListEl.querySelectorAll('.command-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedCommandIndex = Math.min(this.selectedCommandIndex + 1, items.length - 1);
        this.updateCommandSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedCommandIndex = Math.max(this.selectedCommandIndex - 1, 0);
        this.updateCommandSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.executeSelectedCommand();
      }
    });
  }

  showCommandPalette() {
    this.paletteEl.classList.remove('hidden');
    this.commandInputEl.value = '';
    this.commandInputEl.focus();
    this.selectedCommandIndex = 0;
    this.filterCommands('');
  }

  hideCommandPalette() {
    this.paletteEl.classList.add('hidden');
    this.editor?.focus();
  }

  filterCommands(query) {
    const filtered = query
      ? this.commands.filter(cmd =>
        cmd.name.toLowerCase().includes(query.toLowerCase()) ||
        cmd.category.toLowerCase().includes(query.toLowerCase())
      )
      : this.commands;

    this.commandListEl.innerHTML = filtered.map((cmd, i) => `
      <div class="command-item ${i === 0 ? 'selected' : ''}" data-index="${i}">
        <span class="command-item-icon">▶</span>
        <div class="command-item-content">
          <div class="command-item-name">${cmd.name}</div>
          <div class="command-item-category">${cmd.category}</div>
        </div>
        ${cmd.shortcut ? `<span class="command-item-shortcut">${cmd.shortcut}</span>` : ''}
      </div>
    `).join('');

    this.filteredCommands = filtered;
    this.selectedCommandIndex = 0;

    // Click handlers
    this.commandListEl.querySelectorAll('.command-item').forEach((el, i) => {
      el.addEventListener('click', () => {
        this.selectedCommandIndex = i;
        this.executeSelectedCommand();
      });
    });
  }

  updateCommandSelection() {
    const items = this.commandListEl.querySelectorAll('.command-item');
    items.forEach((el, i) => {
      el.classList.toggle('selected', i === this.selectedCommandIndex);
      if (i === this.selectedCommandIndex) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  executeSelectedCommand() {
    const cmd = this.filteredCommands?.[this.selectedCommandIndex];
    if (cmd && cmd.action) {
      this.hideCommandPalette();
      cmd.action();
    }
  }

}

window.onload = () => { window.app = new EditorApp(); };
