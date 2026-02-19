
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
    this.currentDecorationsList = [];
    this.currentTheme = 'dark';
    this.currentFontSize = 14;
    this.isZenMode = false;
    this.activeActivityView = 'explorer'; // 'explorer' | 'search' | 'challenges'

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
    this.initCommandPalette();
    this.initContextMenuActions();
    this.renderSidebar();
    this.updateTabs();
    this.updateBreadcrumbs();
    this.updateStatusLang();
    this.applyTheme(this.currentTheme);

    // Debounced Auto-Analysis — save content immediately, debounce analysis
    this.analysisTimeout = null;
    this.editor.onDidChangeModelContent(() => {
      if (this.activeFile && this.items[this.activeFile]) {
        this.items[this.activeFile].content = this.editor.getValue();
      }

      if (this.autoUpdateTimeout) clearTimeout(this.autoUpdateTimeout);
      this.autoUpdateTimeout = setTimeout(() => {
        this.saveToStorage(); // Debounced save — not on every keystroke
        this.autoUpdate();
        this.updateOutline();
      }, 1000);
    });

    // Zen mode escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isZenMode) {
        this.toggleZenMode();
      }
      // Ctrl+K Z for zen mode
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        this._zenKeyPending = true;
      }
      if (this._zenKeyPending && e.key === 'z') {
        e.preventDefault();
        this._zenKeyPending = false;
        this.toggleZenMode();
      }
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
        const indexId = 'index_js';
        const pyId = 'main_py';
        this.items[indexId] = { id: indexId, name: 'index.js', type: 'file', lang: 'javascript', content: `console.log("Hello from ParadoxEditor!");\n\nconst data = [\n  { id: 1, name: "Alpha" },\n  { id: 2, name: "Beta" }\n];\n\nconsole.log("Current Data:", data);` };
        this.items[pyId] = { id: pyId, name: 'main.py', type: 'file', lang: 'python', content: `print("Hello from Python!")\nprint("Line 2")\n\n\ndef greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("World"))` };
        this.rootIds = [indexId, pyId];
      }

      const savedActive = localStorage.getItem('paradox_active');
      const savedOpen = localStorage.getItem('paradox_open');
      const savedTheme = localStorage.getItem('paradox_theme');
      const savedFontSize = localStorage.getItem('paradox_fontsize');

      if (savedActive) this.activeFile = savedActive;
      if (savedOpen) this.openFiles = JSON.parse(savedOpen);
      if (savedTheme) this.currentTheme = savedTheme;
      if (savedFontSize) this.currentFontSize = parseInt(savedFontSize, 10);

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
    try {
      localStorage.setItem('paradox_items', JSON.stringify(this.items));
      localStorage.setItem('paradox_root', JSON.stringify(this.rootIds));
      localStorage.setItem('paradox_active', this.activeFile || '');
      localStorage.setItem('paradox_open', JSON.stringify(this.openFiles));
      localStorage.setItem('paradox_theme', this.currentTheme);
      localStorage.setItem('paradox_fontsize', String(this.currentFontSize));
    } catch (e) {
      console.warn('Save failed:', e);
    }
  }

  // ===== Toast Notification System =====
  showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
      info: '●',
      success: '✓',
      warn: '⚠',
      error: '✕'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || '●'}</span><span class="toast-msg">${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('toast-show'));
    });

    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ===== Theme System =====
  applyTheme(theme) {
    this.currentTheme = theme;
    document.body.setAttribute('data-theme', theme);

    if (this.editor) {
      const monacoTheme = theme === 'light' ? 'vs' : theme === 'hc' ? 'hc-black' : 'vscode-dark-plus';
      monaco.editor.setTheme(monacoTheme);
    }

    // Update status bar theme button text
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
      const labels = { dark: 'Dark+', light: 'Light', hc: 'HC' };
      themeBtn.textContent = labels[theme] || 'Dark+';
    }

    localStorage.setItem('paradox_theme', theme);
  }

  cycleTheme() {
    const themes = ['dark', 'light', 'hc'];
    const next = themes[(themes.indexOf(this.currentTheme) + 1) % themes.length];
    this.applyTheme(next);
    this.showToast(`Theme: ${next === 'dark' ? 'Dark+' : next === 'light' ? 'Light' : 'High Contrast'}`, 'info', 2000);
  }

  // ===== Zen Mode =====
  toggleZenMode() {
    this.isZenMode = !this.isZenMode;
    document.body.classList.toggle('zen-mode', this.isZenMode);

    if (this.editor) {
      this.editor.updateOptions({
        minimap: { enabled: !this.isZenMode },
        lineNumbers: this.isZenMode ? 'off' : 'on',
        rulers: this.isZenMode ? [] : [80, 120]
      });
    }

    if (this.fitAddon) this.fitAddon.fit();
    this.showToast(this.isZenMode ? 'Zen Mode: ON (Esc to exit)' : 'Zen Mode: OFF', 'info', 2000);
  }

  // ===== Font Size Control =====
  changeFontSize(delta) {
    this.currentFontSize = Math.max(10, Math.min(24, this.currentFontSize + delta));
    if (this.editor) this.editor.updateOptions({ fontSize: this.currentFontSize });
    const display = document.getElementById('fontSizeDisplay');
    if (display) display.textContent = this.currentFontSize;
    localStorage.setItem('paradox_fontsize', String(this.currentFontSize));
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
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'comment.block', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'comment.line', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: '569CD6' },
        { token: 'keyword.control', foreground: 'C586C0' },
        { token: 'keyword.operator', foreground: 'D4D4D4' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'string.escape', foreground: 'D7BA7D' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'number.hex', foreground: 'B5CEA8' },
        { token: 'entity.name.function', foreground: 'DCDCAA' },
        { token: 'support.function', foreground: 'DCDCAA' },
        { token: 'variable', foreground: '9CDCFE' },
        { token: 'variable.parameter', foreground: '9CDCFE' },
        { token: 'variable.other', foreground: '9CDCFE' },
        { token: 'type', foreground: '4EC9B0' },
        { token: 'entity.name.type', foreground: '4EC9B0' },
        { token: 'entity.name.class', foreground: '4EC9B0' },
        { token: 'support.class', foreground: '4EC9B0' },
        { token: 'constant', foreground: '4FC1FF' },
        { token: 'constant.language', foreground: '569CD6' },
        { token: 'constant.numeric', foreground: 'B5CEA8' },
        { token: 'operator', foreground: 'D4D4D4' },
        { token: 'delimiter', foreground: 'D4D4D4' },
        { token: 'delimiter.bracket', foreground: 'FFD700' },
        { token: 'storage', foreground: '569CD6' },
        { token: 'storage.type', foreground: '569CD6' },
        { token: 'tag', foreground: '569CD6' },
        { token: 'metatag', foreground: '569CD6' },
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
      fontSize: this.currentFontSize,
      fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
      fontLigatures: true,
      lineHeight: 20,
      minimap: { enabled: true, scale: 1, showSlider: 'mouseover' },
      renderLineHighlight: 'all',
      cursorSmoothCaretAnimation: 'on',
      cursorBlinking: 'smooth',
      cursorStyle: 'line',
      smoothScrolling: true,
      bracketPairColorization: { enabled: true },
      matchBrackets: 'always',
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      autoIndent: 'full',
      formatOnPaste: true,
      formatOnType: true,
      rulers: [80, 120],
      renderWhitespace: 'selection',
      guides: { bracketPairs: true, indentation: true },
      lineNumbers: 'on',
      lineNumbersMinChars: 4,
      folding: true,
      foldingHighlight: true,
      showFoldingControls: 'mouseover',
      scrollBeyondLastLine: false,
      padding: { top: 10, bottom: 10 },
      roundedSelection: false,
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      tabCompletion: 'on',
      wordBasedSuggestions: 'currentDocument',
      parameterHints: { enabled: true }
    });

    this.decorationCollection = this.editor.createDecorationsCollection([]);

    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => this.runCode());

    this.editor.onDidChangeCursorPosition((e) => {
      const { lineNumber, column } = e.position;
      const statusSection = document.querySelector('.statusbar .right');
      if (statusSection) statusSection.innerHTML = `Ln ${lineNumber}, Col ${column}`;
    });

    // Problems panel — subscribe to Monaco markers
    monaco.editor.onDidChangeMarkers(() => {
      if (this.editor && this.editor.getModel()) {
        const markers = monaco.editor.getModelMarkers({ resource: this.editor.getModel().uri });
        this.renderProblems(markers);
      }
    });
  }

  // ===== Problems Panel =====
  renderProblems(markers) {
    const container = document.getElementById('problems-container');
    if (!container) return;

    const badge = document.getElementById('problemsBadge');
    const errorCount = markers.filter(m => m.severity === monaco.MarkerSeverity.Error).length;
    const warnCount = markers.filter(m => m.severity === monaco.MarkerSeverity.Warning).length;

    if (badge) {
      const total = errorCount + warnCount;
      badge.textContent = total;
      badge.style.display = total > 0 ? 'inline' : 'none';
    }

    if (markers.length === 0) {
      container.innerHTML = '<div class="problems-empty">No problems detected.</div>';
      return;
    }

    container.innerHTML = markers.map(m => {
      const severity = m.severity === monaco.MarkerSeverity.Error ? 'error'
        : m.severity === monaco.MarkerSeverity.Warning ? 'warn' : 'info';
      const icon = severity === 'error' ? '✕' : severity === 'warn' ? '⚠' : 'ℹ';
      return `<div class="problem-entry problem-${severity}" data-line="${m.startLineNumber}">
        <span class="problem-icon">${icon}</span>
        <span class="problem-msg">${this.escapeHtml(m.message)}</span>
        <span class="problem-loc">Ln ${m.startLineNumber}, Col ${m.startColumn}</span>
      </div>`;
    }).join('');

    container.querySelectorAll('.problem-entry').forEach(el => {
      el.addEventListener('click', () => this.revealLine(parseInt(el.dataset.line, 10)));
    });
  }

  // ===== Outline View =====
  async updateOutline() {
    const outlineEl = document.getElementById('outlineView');
    if (!outlineEl) return;
    if (!this.editor || !this.editor.getModel()) return;

    try {
      const model = this.editor.getModel();
      const symbols = await monaco.languages.executeDocumentSymbolProvider(model);
      this.renderOutline(symbols || [], outlineEl);
    } catch (e) {
      // Outline not available for this language
    }
  }

  renderOutline(symbols, container) {
    if (!container) return;
    if (!symbols || symbols.length === 0) {
      container.innerHTML = '<div class="outline-empty">No symbols found.</div>';
      return;
    }

    const kindIcons = {
      1: 'f', 2: 'M', 3: 'N', 4: 'C', 5: 'E', 6: 'V', 7: 'I',
      8: 'F', 9: '()', 10: 'K', 11: 'P', 12: '{}', 13: '#', 14: '[]',
    };

    const renderSymbol = (sym, depth) => {
      const icon = kindIcons[sym.kind] || '·';
      const lineNum = sym.range?.startLineNumber || 1;
      let html = `<div class="outline-item" data-line="${lineNum}" style="padding-left:${8 + depth * 12}px">
        <span class="outline-kind">${icon}</span>
        <span class="outline-name">${this.escapeHtml(sym.name)}</span>
      </div>`;
      if (sym.children && sym.children.length) {
        html += sym.children.map(c => renderSymbol(c, depth + 1)).join('');
      }
      return html;
    };

    container.innerHTML = symbols.map(s => renderSymbol(s, 0)).join('');

    container.querySelectorAll('.outline-item').forEach(el => {
      el.addEventListener('click', () => this.revealLine(parseInt(el.dataset.line, 10)));
    });
  }

  // ===== Search Across Files =====
  performSearch(query) {
    const resultsEl = document.getElementById('searchResults');
    if (!resultsEl) return;

    if (!query || query.trim() === '') {
      resultsEl.innerHTML = '';
      return;
    }

    const q = query.toLowerCase();
    let html = '';
    let totalMatches = 0;

    Object.values(this.items).forEach(item => {
      if (item.type !== 'file' || !item.content) return;
      const lines = item.content.split('\n');
      const matches = [];
      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes(q)) {
          matches.push({ line: idx + 1, text: line.trim() });
        }
      });
      if (matches.length > 0) {
        totalMatches += matches.length;
        html += `<div class="search-file-group">
          <div class="search-file-header">${this.escapeHtml(item.name)} <span class="search-match-count">${matches.length}</span></div>
          ${matches.map(m => `<div class="search-match" data-fileid="${item.id}" data-line="${m.line}">
            <span class="search-line-num">${m.line}</span>
            <span class="search-line-text">${this.escapeHtml(m.text.substring(0, 80))}</span>
          </div>`).join('')}
        </div>`;
      }
    });

    if (totalMatches === 0) {
      resultsEl.innerHTML = '<div class="search-no-results">No results found.</div>';
    } else {
      resultsEl.innerHTML = html;
      resultsEl.querySelectorAll('.search-match').forEach(el => {
        el.addEventListener('click', () => {
          this.switchFile(el.dataset.fileid);
          setTimeout(() => this.revealLine(parseInt(el.dataset.line, 10)), 100);
          // Switch back to explorer view after clicking
        });
      });
    }
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

    if (runBtn) runBtn.addEventListener('click', () => this.runCode());
    if (stopBtn) stopBtn.addEventListener('click', () => this.stopRun());

    document.getElementById('clearBtn').addEventListener('click', () => {
      this.terminal.clear();
      this.outputLog = [];
      const outputEl = document.getElementById('output-container');
      if (outputEl) outputEl.innerHTML = '';
      if (this.decorationCollection) this.decorationCollection.clear();
      this.currentDecorationsList = [];
    });

    document.getElementById('newFileBtn').addEventListener('click', () => this.createNewItem('file'));
    document.getElementById('newFolderBtn').addEventListener('click', () => this.createNewItem('folder'));
    document.getElementById('benchmarkBtn').addEventListener('click', () => this.runBenchmark());

    document.getElementById('toggleOutputBtn').addEventListener('click', () => {
      const active = document.querySelector('.panel-view.active');
      if (active && active.id === 'terminal-container') this.switchPanel('output');
      else this.switchPanel('terminal');
    });

    // Font size controls
    const fontDecrBtn = document.getElementById('fontDecrBtn');
    const fontIncrBtn = document.getElementById('fontIncrBtn');
    if (fontDecrBtn) fontDecrBtn.addEventListener('click', () => this.changeFontSize(-1));
    if (fontIncrBtn) fontIncrBtn.addEventListener('click', () => this.changeFontSize(1));

    // Update font size display on load
    const fontDisplay = document.getElementById('fontSizeDisplay');
    if (fontDisplay) fontDisplay.textContent = this.currentFontSize;

    // Theme switcher
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', () => this.cycleTheme());

    // Keyboard shortcuts modal
    const shortcutsBtn = document.getElementById('shortcutsBtn');
    const shortcutsModal = document.getElementById('shortcutsModal');
    if (shortcutsBtn && shortcutsModal) {
      shortcutsBtn.addEventListener('click', () => shortcutsModal.classList.toggle('hidden'));
      shortcutsModal.addEventListener('click', (e) => {
        if (e.target === shortcutsModal) shortcutsModal.classList.add('hidden');
      });
    }

    // Activity bar navigation
    document.querySelectorAll('.activitybar .icon').forEach(icon => {
      icon.addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar');
        const view = icon.dataset.view || 'explorer';
        const wasActive = icon.classList.contains('active');

        document.querySelectorAll('.activitybar .icon').forEach(i => i.classList.remove('active'));

        if (wasActive) {
          sidebar.style.display = 'none';
        } else {
          icon.classList.add('active');
          sidebar.style.display = 'flex';
          this.switchSidebarView(view);
        }
      });
    });

    document.querySelectorAll('.sidebar-section-header').forEach(header => {
      header.addEventListener('click', () => header.parentElement.classList.toggle('active'));
    });

    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchPanel(tab.dataset.panel));
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => this.performSearch(searchInput.value), 300);
      });
    }

    // Pyodide status
    document.getElementById('pyStatus').style.display = 'none';
  }

  // ===== Context Menu Actions =====
  initContextMenuActions() {
    if (!this.editor) return;

    this.editor.addAction({
      id: 'paradox.runSelection',
      label: 'Run Selection',
      contextMenuGroupId: 'paradox',
      contextMenuOrder: 1,
      precondition: 'editorHasSelection',
      run: (ed) => {
        const selection = ed.getModel().getValueInRange(ed.getSelection());
        if (selection.trim()) this.runCodeSnippet(selection);
      }
    });

    this.editor.addAction({
      id: 'paradox.copyWithLineNumbers',
      label: 'Copy with Line Numbers',
      contextMenuGroupId: 'paradox',
      contextMenuOrder: 2,
      run: (ed) => {
        const model = ed.getModel();
        const lines = model.getValue().split('\n');
        const numbered = lines.map((l, i) => `${String(i + 1).padStart(3, ' ')}  ${l}`).join('\n');
        navigator.clipboard?.writeText(numbered).then(() => this.showToast('Copied with line numbers', 'success', 2000));
      }
    });

    this.editor.addAction({
      id: 'paradox.analyzeComplexity',
      label: 'Analyze Complexity of Selection',
      contextMenuGroupId: 'paradox',
      contextMenuOrder: 3,
      precondition: 'editorHasSelection',
      run: (ed) => {
        const selection = ed.getModel().getValueInRange(ed.getSelection());
        const file = this.items[this.activeFile];
        if (window.ComplexityAnalyzer && file) {
          const result = window.ComplexityAnalyzer.analyzeFull(selection, file.lang);
          this.showToast(`Complexity — ${result.summary.replace('\n', ' | ')}`, 'info', 5000);
        }
      }
    });
  }

  // ===== Sidebar View Switcher =====
  switchSidebarView(view) {
    this.activeActivityView = view;
    document.querySelectorAll('.sidebar-view').forEach(v => {
      v.style.display = v.dataset.view === view ? 'flex' : 'none';
    });

    const sidebarTitle = document.querySelector('.sidebar-title');
    const titles = { explorer: 'EXPLORER', search: 'SEARCH', challenges: 'CHALLENGES', outline: 'OUTLINE' };
    if (sidebarTitle) sidebarTitle.textContent = titles[view] || 'EXPLORER';
  }

  createNewItem(type) {
    const name = prompt(`Enter ${type} name:`);
    if (!name) return;
    const id = name.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now();
    const lang = name.endsWith('.py') ? 'python' : 'javascript';

    if (type === 'folder') {
      this.items[id] = { id, name, type: 'folder', parentId: this.activeFolderId || null };
    } else {
      const content = lang === 'python' ? '# Python\n' : '// JavaScript\n';
      this.items[id] = { id, name, type: 'file', lang, content, parentId: this.activeFolderId || null };
      this.models[id] = monaco.editor.createModel(content, lang);
      this.openFiles.push(id);
      this.switchFile(id);
    }

    if (!this.items[id].parentId) this.rootIds.push(id);
    this.renderSidebar();
    this.saveToStorage();
    this.showToast(`Created ${type}: ${name}`, 'success', 2000);
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
      if (this.editor && this.activeFile && this.models[this.activeFile]) {
        this.editor.setModel(this.models[this.activeFile]);
      } else if (this.editor && !this.activeFile) {
        this.editor.setModel(null);
      }
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

    // Render challenges if loaded
    this.renderChallengesList();
  }

  switchFile(id) {
    if (!this.models[id]) return;
    this.activeFile = id;
    if (!this.openFiles.includes(id)) this.openFiles.push(id);
    if (this.editor) this.editor.setModel(this.models[id]);
    this.renderSidebar();
    this.updateTabs();
    this.updateBreadcrumbs();
    this.updateStatusLang();
    this.saveToStorage();
    this.updateOutline();
  }

  // ===== Tab Close =====
  closeTab(id) {
    const idx = this.openFiles.indexOf(id);
    if (idx === -1) return;
    this.openFiles.splice(idx, 1);

    if (this.activeFile === id) {
      // Switch to adjacent tab
      const nextId = this.openFiles[idx] || this.openFiles[idx - 1] || null;
      this.activeFile = nextId;
      if (nextId && this.models[nextId] && this.editor) {
        this.editor.setModel(this.models[nextId]);
      } else if (this.editor) {
        this.editor.setModel(null);
      }
    }

    this.renderSidebar();
    this.updateTabs();
    this.updateBreadcrumbs();
    this.updateStatusLang();
    this.saveToStorage();
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
      tab.innerHTML = `<span class="tab-filename">${file.name}</span><button class="tab-close-btn" title="Close tab">×</button>`;
      tab.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close-btn')) this.switchFile(id);
      });
      tab.querySelector('.tab-close-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(id);
      });
      container.appendChild(tab);
    });

    // Scroll active tab into view
    const activeTab = container.querySelector('.tabheader.active');
    if (activeTab) activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  updateBreadcrumbs() {
    const bc = document.getElementById('breadcrumbs');
    if (bc && this.items[this.activeFile]) {
      bc.innerHTML = `<span>src</span><span class="separator">/</span><span class="current-file">${this.items[this.activeFile].name}</span>`;
    }
  }

  updateStatusLang() {
    const el = document.getElementById('statusLang');
    if (el && this.activeFile && this.items[this.activeFile]) {
      const lang = this.items[this.activeFile].lang;
      el.textContent = lang === 'python' ? 'Python' : 'JavaScript';
    }
  }

  switchPanel(id) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === id));
    document.querySelectorAll('.panel-view').forEach(v => {
      const isActive = v.id === `${id}-container`;
      v.classList.toggle('active', isActive);
      // Tests panel uses flex layout
      if (v.classList.contains('tests-panel') && isActive) {
        v.style.display = 'flex';
      } else if (v.classList.contains('tests-panel') && !isActive) {
        v.style.display = '';
      }
    });
    if (id === 'terminal' && this.fitAddon) this.fitAddon.fit();
    // Refresh test case list when switching to tests panel
    if (id === 'tests' && this.activeFile) {
      this.renderTestCaseList(this.activeFile);
    }
  }

  formatValue(val) {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'object') {
      try { return JSON.stringify(val); } catch (e) { return String(val); }
    }
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
    container.scrollTop = container.scrollHeight;
  }

  revealLine(line) {
    if (!this.editor) return;
    this.editor.revealLineInCenter(line);
    this.editor.setPosition({ lineNumber: line, column: 1 });
    this.editor.focus();
  }

  parseJsErrorLine(err) {
    const m = (err.stack || '').match(/<anonymous>:(\d+):(\d+)/);
    if (m) return parseInt(m[1]) - 1; // -1 because AsyncFunction wraps in single-line context
    return null;
  }

  parsePyErrorLine(err) {
    const m = String(err).match(/line (\d+)/);
    return m ? parseInt(m[1]) : null;
  }

  // ===== Unsafe code detection =====
  isUnsafeCode(code) {
    const unsafePatterns = [
      /while\s*\(\s*(true|1|!0|!false)\s*\)/,
      /for\s*\(\s*;[^;]*;\s*\)/,  // for(;;) or for(;cond;)
      /while\s*\(\s*1\s*===\s*1\s*\)/,
    ];
    return unsafePatterns.some(p => p.test(code));
  }

  async autoUpdate() {
    const file = this.items[this.activeFile];
    if (file && file.lang === 'javascript') {
      const code = this.editor.getValue();
      if (code.length > 5000 || this.isUnsafeCode(code)) return;
      this.runCode(true);
    }
  }

  async runCode(silent = false) {
    if (!silent) {
      this.switchPanel('output');
      this.outputLog = [];
      // Clear all decorations on manual run
      this.currentDecorationsList = [];
    } else {
      // In silent mode, keep complexity decorations, clear result decorations
      if (this.currentDecorationsList) {
        this.currentDecorationsList = this.currentDecorationsList.filter(d =>
          d.options.after && d.options.after.inlineClassName === 'inline-complexity-decoration'
        );
      }
    }

    this.isRunning = true;
    this.runAbort = false;

    if (!this.decorationCollection && this.editor) {
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
    if (!file) {
      this.isRunning = false;
      return;
    }

    const t0 = performance.now();

    if (!silent) {
      this.addOutput('log', `➜ Executing ${file.name}...`);
      this.terminal.writeln(`\r\n\x1b[1;36m➜ Executing ${file.name}...\x1b[0m`);
    }

    if (file.lang === 'javascript') {
      await this.runJavaScript(code, silent);
    } else if (file.lang === 'python') {
      if (silent) {
        this.isRunning = false;
        return;
      }
      await this.runPython(code, silent);
    }

    const elapsed = performance.now() - t0;

    if (!silent) {
      const timeDisplay = document.getElementById('runTimeDisplay');
      if (timeDisplay) timeDisplay.textContent = `${elapsed.toFixed(1)}ms`;
      this.showToast(`Ran in ${elapsed.toFixed(1)}ms`, 'success', 2000);

      if (runStatus) runStatus.classList.add('hidden');
      if (stopBtn) stopBtn.classList.add('hidden');
      if (runBtn) runBtn.classList.remove('hidden');
    }

    this.isRunning = false;

    // Run complexity analysis after execution
    if (window.ComplexityAnalyzer) {
      this.runComplexityAnalysis(code, file.lang);
    }
  }

  async runJavaScript(code, silent) {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    // Build a map of line number -> console.log source line
    // Use code transform approach: tag each console.log with its source line
    const codeLines = code.split('\n');
    const logLineMap = {}; // callIndex -> lineNumber

    // Pre-scan: find console.log positions by line
    let logCallIndex = 0;
    const lineHasLog = [];
    for (let i = 0; i < codeLines.length; i++) {
      if (codeLines[i].includes('console.log')) {
        lineHasLog.push(i + 1); // 1-indexed
      }
    }

    // Transform code: inject __pdxLine marker into each console.log call
    // Strategy: replace console.log( with __pdxLog(LINENO,  where LINENO is per-occurrence
    let logOccurrence = 0;
    const lineOccurrences = []; // ordered list of line numbers for each console.log occurrence
    const transformedCode = code.split('\n').map((line, lineIdx) => {
      // Count occurrences on this line
      let transformed = line;
      let offset = 0;
      let tempLine = line;
      while (true) {
        const idx = tempLine.indexOf('console.log(');
        if (idx === -1) break;
        lineOccurrences.push(lineIdx + 1); // 1-indexed
        tempLine = tempLine.substring(idx + 12); // skip past 'console.log('
      }
      return line;
    }).join('\n');

    // Simple approach: map each console.log call in execution order to its source line
    // by using the pre-scanned lineHasLog array. This works for most linear code.
    // For conditional branches, we use a Set to track which lines actually executed.
    const executedLogLines = new Set();

    console.log = (...args) => {
      const text = args.map(a => this.formatValue(a)).join(' ');
      if (!silent) {
        this.addOutput('log', text);
        this.terminal.writeln(text);
      }
      // Map to source line using execution order index
      const lineNum = lineHasLog[logCallIndex];
      if (lineNum) {
        this.addInlineDecoration(lineNum, ` → ${text}`);
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
      // Use AsyncFunction to properly handle async/await code
      const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
      await new AsyncFunction(code)();
    } catch (e) {
      if (!silent) {
        const line = this.parseJsErrorLine(e);
        this.addOutput('error', e.message || String(e), line);
        this.terminal.writeln(`\x1b[31m✕ ${e.message || String(e)}\x1b[0m`);
      }
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }
  }

  async runPython(code, silent) {
    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    const runStatus = document.getElementById('runStatus');

    if (!this.pyodide) {
      this.showPyodideProgress(true);
      this.showToast('Loading Python runtime...', 'info', 8000);
      try {
        this.pyodide = await loadPyodide();
        this.showPyodideProgress(false);
        this.showToast('Python runtime ready!', 'success', 2000);
      } catch (e) {
        this.showPyodideProgress(false);
        this.addOutput('error', 'Failed to load Pyodide: ' + e.message);
        this.showToast('Failed to load Python runtime', 'error', 4000);
        if (runStatus) runStatus.classList.add('hidden');
        if (stopBtn) stopBtn.classList.add('hidden');
        if (runBtn) runBtn.classList.remove('hidden');
        this.isRunning = false;
        return;
      }
    }

    this.pyodide.globals.set('__pdx_print', (...args) => {
      const text = args.map(a => String(a)).join(' ');
      this.addOutput('log', text);
      this.terminal.writeln(text);
    });

    this.pyodide.globals.set('__pdx_inline', (line, text) => {
      this.addInlineDecoration(line, ` → ${text}`);
    });

    const pySetup = `
import sys
import inspect
def __pdx_print_wrapper(*args, **kwargs):
    frame = inspect.currentframe().f_back
    line = frame.f_lineno
    text = " ".join(map(str, args))
    __pdx_print(text)
    __pdx_inline(line, text)
`;

    if (!this.pyodide._pdx_init_done) {
      await this.pyodide.runPythonAsync(pySetup);
      this.pyodide._pdx_init_done = true;
    }

    // Save original print before patching
    await this.pyodide.runPythonAsync(`import builtins; __pdx_orig_print = builtins.print; builtins.print = __pdx_print_wrapper`);

    try {
      await this.pyodide.runPythonAsync(code);
    } catch (e) {
      const line = this.parsePyErrorLine(e);
      this.addOutput('error', e.message || String(e), line);
      this.terminal.writeln(`\x1b[31m✕ ${e.message || String(e)}\x1b[0m`);
    } finally {
      // Always restore original print
      try {
        await this.pyodide.runPythonAsync(`builtins.print = __pdx_orig_print`);
      } catch (e) { /* ignore */ }

      if (runStatus) runStatus.classList.add('hidden');
      if (stopBtn) stopBtn.classList.add('hidden');
      if (runBtn) runBtn.classList.remove('hidden');
    }
  }

  showPyodideProgress(show) {
    const bar = document.getElementById('pyodideProgress');
    if (!bar) return;
    if (show) {
      bar.classList.remove('hidden');
      let pct = 0;
      this._pyProgress = setInterval(() => {
        pct = Math.min(90, pct + 2);
        const fill = bar.querySelector('.pyodide-progress-fill');
        if (fill) fill.style.width = pct + '%';
      }, 200);
    } else {
      if (this._pyProgress) {
        clearInterval(this._pyProgress);
        this._pyProgress = null;
      }
      const fill = bar.querySelector('.pyodide-progress-fill');
      if (fill) fill.style.width = '100%';
      setTimeout(() => bar.classList.add('hidden'), 500);
    }
  }

  // ===== Run code snippet (selection) =====
  async runCodeSnippet(code) {
    const file = this.items[this.activeFile];
    if (!file) return;

    this.switchPanel('output');
    this.addOutput('log', `➜ Running selection...`);
    this.terminal.writeln(`\r\n\x1b[1;36m➜ Running selection...\x1b[0m`);

    const t0 = performance.now();
    await this.runJavaScript(code, false);
    const elapsed = performance.now() - t0;
    this.showToast(`Selection ran in ${elapsed.toFixed(1)}ms`, 'success', 2000);
  }

  runComplexityAnalysis(code, lang) {
    if (!window.ComplexityAnalyzer) return;
    try {
      const result = window.ComplexityAnalyzer.analyzeFull(code, lang);
      if (!result) return;

      // Add complexity decoration to first non-empty line
      const lines = code.split('\n');
      let targetLine = 1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim()) { targetLine = i + 1; break; }
      }
      this.addInlineDecoration(targetLine, `  Complexity: ${result.summary.replace('\n', ' | ')}`, true);
    } catch (e) { /* ignore */ }
  }

  stopRun() {
    this.runAbort = true;
    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    const runStatus = document.getElementById('runStatus');

    this.terminal.writeln('\x1b[31m⚠ Execution aborted (synchronous JS cannot be stopped mid-run).\x1b[0m');
    this.showToast('Stop requested — JS runs synchronously; refresh to abort.', 'warn', 4000);

    if (runStatus) runStatus.classList.add('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');
    if (runBtn) runBtn.classList.remove('hidden');
    this.isRunning = false;
  }

  runBenchmark() {
    const code = this.editor.getValue();
    this.terminal.writeln('\r\nBenchmarking (5 iterations)...');
    const times = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      try { new Function(code)(); } catch (e) { }
      times.push(performance.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const msg = `Benchmark: avg=${avg.toFixed(2)}ms min=${min.toFixed(2)}ms max=${max.toFixed(2)}ms`;
    this.terminal.writeln(msg);
    this.showToast(msg, 'info', 5000);
  }

  addInlineDecoration(lineNumber, text, isComplexity = false) {
    if (!this.editor || !this.decorationCollection) return;

    const display = text.length > 80 ? text.substring(0, 80) + '…' : text;
    const range = new monaco.Range(lineNumber, 1, lineNumber, 2000);
    const newDeco = {
      range,
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

    // De-duplicate: remove existing decoration of same type on same line
    const targetClass = isComplexity ? 'inline-complexity-decoration' : 'inline-result-decoration';
    this.currentDecorationsList = this.currentDecorationsList.filter(d => {
      const sameType = d.options.after && d.options.after.inlineClassName === targetClass;
      return !(sameType && d.range.startLineNumber === lineNumber);
    });

    this.currentDecorationsList.push(newDeco);
    this.decorationCollection.set(this.currentDecorationsList);
  }

  // ===== Challenges System =====
  renderChallengesList() {
    const container = document.getElementById('challengesList');
    if (!container) return;

    const challenges = window.ParadoxChallenges;
    if (!challenges || !challenges.length) {
      container.innerHTML = '<div class="challenge-empty">No challenges loaded.</div>';
      return;
    }

    const progress = this.loadChallengeProgress();
    const filter = document.getElementById('challengeFilter')?.value || 'all';

    const filtered = filter === 'all' ? challenges : challenges.filter(c => c.difficulty.toLowerCase() === filter);

    container.innerHTML = filtered.map(c => {
      const done = progress.has(c.id);
      return `<div class="challenge-item ${done ? 'challenge-done' : ''}" data-id="${c.id}">
        <div class="challenge-top">
          <span class="challenge-title">${this.escapeHtml(c.title)}</span>
          ${done ? '<span class="challenge-check">✓</span>' : ''}
        </div>
        <div class="challenge-meta">
          <span class="challenge-diff challenge-diff-${c.difficulty.toLowerCase()}">${c.difficulty}</span>
          <span class="challenge-cat">${c.category}</span>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('.challenge-item').forEach(el => {
      el.addEventListener('click', () => this.openChallenge(el.dataset.id));
    });
  }

  openChallenge(id) {
    const challenge = window.ParadoxChallenges?.find(c => c.id === id);
    if (!challenge) return;

    const file = this.items[this.activeFile];
    const lang = file?.lang || 'javascript';
    const starter = lang === 'python' ? challenge.starterCode?.python : challenge.starterCode?.javascript;

    // Show description in output panel
    this.switchPanel('output');
    this.outputLog = [];
    this.addOutput('log', `=== ${challenge.title} ===`);
    this.addOutput('log', challenge.description);
    this.addOutput('log', '');
    this.addOutput('log', `Expected complexity: Time ${challenge.expectedComplexity?.time || 'N/A'} | Space ${challenge.expectedComplexity?.space || 'N/A'}`);
    if (challenge.hints?.length) {
      this.addOutput('log', `Hints available: ${challenge.hints.length} (uncomment to reveal)`);
    }

    // Load starter code into current file or create new challenge file
    if (this.editor && starter) {
      if (confirm(`Load starter code for "${challenge.title}" into current file? (This replaces current content)`)) {
        this.editor.setValue(starter);
        if (this.activeFile) {
          this.items[this.activeFile].content = starter;
          this.saveToStorage();
        }
        this.showToast(`Loaded: ${challenge.title}`, 'success', 2000);
      }
    }
  }

  loadChallengeProgress() {
    try {
      const raw = localStorage.getItem('paradox_progress');
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) {
      return new Set();
    }
  }

  markChallengeComplete(id) {
    const progress = this.loadChallengeProgress();
    progress.add(id);
    localStorage.setItem('paradox_progress', JSON.stringify([...progress]));
    this.renderChallengesList();
    this.showToast('Challenge marked complete!', 'success', 3000);
  }

  // ===== Test Case Runner =====
  async runTestCases() {
    const fileId = this.activeFile;
    if (!fileId) return;

    const tests = this.loadTestCases(fileId);
    if (!tests.length) {
      this.showToast('No test cases defined. Add tests in the Tests panel.', 'warn', 3000);
      return;
    }

    const code = this.editor.getValue();
    const resultsEl = document.getElementById('testResults');
    if (resultsEl) resultsEl.innerHTML = '<div class="test-running">Running tests...</div>';

    const results = [];
    for (const test of tests) {
      const result = await this.runSingleTest(code, test);
      results.push(result);
    }

    this.renderTestResults(results);
    const passed = results.filter(r => r.pass).length;
    this.showToast(`Tests: ${passed}/${results.length} passed`, passed === results.length ? 'success' : 'warn', 3000);
  }

  async runSingleTest(code, test) {
    const outputs = [];
    const origLog = console.log;
    console.log = (...args) => outputs.push(args.map(a => this.formatValue(a)).join(' '));

    try {
      const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
      await new AsyncFunction(code)();
      const actual = outputs.join('\n').trim();
      const expected = (test.expected || '').trim();
      return { pass: actual === expected, actual, expected, name: test.name };
    } catch (e) {
      return { pass: false, actual: `Error: ${e.message}`, expected: (test.expected || '').trim(), name: test.name };
    } finally {
      console.log = origLog;
    }
  }

  renderTestResults(results) {
    const el = document.getElementById('testResults');
    if (!el) return;
    el.innerHTML = results.map(r => `
      <div class="test-result ${r.pass ? 'test-pass' : 'test-fail'}">
        <span class="test-indicator">${r.pass ? '✓' : '✕'}</span>
        <div class="test-detail">
          <div class="test-name">${this.escapeHtml(r.name || 'Test')}</div>
          ${!r.pass ? `<div class="test-mismatch">Expected: ${this.escapeHtml(r.expected)}</div><div class="test-mismatch">Got: ${this.escapeHtml(r.actual)}</div>` : ''}
        </div>
      </div>
    `).join('');
  }

  loadTestCases(fileId) {
    try {
      const raw = localStorage.getItem(`paradox_tests_${fileId}`);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  saveTestCase(fileId) {
    const nameEl = document.getElementById('testCaseName');
    const expectedEl = document.getElementById('testCaseExpected');
    if (!nameEl || !expectedEl) return;

    const test = { name: nameEl.value || 'Test', expected: expectedEl.value };
    const tests = this.loadTestCases(fileId);
    tests.push(test);
    localStorage.setItem(`paradox_tests_${fileId}`, JSON.stringify(tests));
    nameEl.value = '';
    expectedEl.value = '';
    this.renderTestCaseList(fileId);
    this.showToast('Test case added', 'success', 2000);
  }

  renderTestCaseList(fileId) {
    const el = document.getElementById('testCaseList');
    if (!el) return;
    const tests = this.loadTestCases(fileId);
    if (!tests.length) {
      el.innerHTML = '<div class="test-empty">No test cases yet.</div>';
      return;
    }
    el.innerHTML = tests.map((t, i) => `
      <div class="test-case-item">
        <span class="test-case-name">${this.escapeHtml(t.name)}</span>
        <button class="test-case-del" data-idx="${i}">×</button>
      </div>
    `).join('');

    el.querySelectorAll('.test-case-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const tests2 = this.loadTestCases(fileId);
        tests2.splice(parseInt(btn.dataset.idx, 10), 1);
        localStorage.setItem(`paradox_tests_${fileId}`, JSON.stringify(tests2));
        this.renderTestCaseList(fileId);
      });
    });
  }

  // ===== Snippet Insertion =====
  insertSnippet(code) {
    if (!this.editor) return;
    const position = this.editor.getPosition();
    this.editor.executeEdits('snippet', [{
      range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
      text: '\n' + code + '\n'
    }]);
    this.editor.focus();
    this.showToast('Snippet inserted', 'success', 1500);
  }

  // ===== Keyboard Shortcuts Panel Content =====
  getShortcutsContent() {
    return [
      { category: 'Run', items: [
        { key: 'Ctrl+Enter', desc: 'Run code' },
        { key: 'F5', desc: 'Run code (palette)' },
        { key: 'Shift+F5', desc: 'Stop execution' },
      ]},
      { category: 'Navigation', items: [
        { key: 'Ctrl+Shift+P', desc: 'Command palette' },
        { key: 'Ctrl+G', desc: 'Go to line' },
        { key: 'Ctrl+K Z', desc: 'Zen mode toggle' },
      ]},
      { category: 'Editor', items: [
        { key: 'Ctrl+F', desc: 'Find' },
        { key: 'Ctrl+H', desc: 'Find & Replace' },
        { key: 'Shift+Alt+F', desc: 'Format document' },
        { key: 'Alt+Z', desc: 'Toggle word wrap' },
        { key: 'Ctrl+/', desc: 'Toggle line comment' },
      ]},
      { category: 'View', items: [
        { key: 'Ctrl+=', desc: 'Zoom in' },
        { key: 'Ctrl+-', desc: 'Zoom out' },
        { key: 'Ctrl+`', desc: 'Toggle terminal' },
      ]},
    ];
  }

  renderShortcutsPanel() {
    const el = document.getElementById('shortcutsContent');
    if (!el) return;
    const content = this.getShortcutsContent();
    el.innerHTML = content.map(group => `
      <div class="shortcut-group">
        <div class="shortcut-category">${group.category}</div>
        ${group.items.map(item => `
          <div class="shortcut-row">
            <kbd class="shortcut-key">${item.key}</kbd>
            <span class="shortcut-desc">${item.desc}</span>
          </div>
        `).join('')}
      </div>
    `).join('');
  }

  // ===== Command Palette =====
  initCommandPalette() {
    this.commands = [
      { name: 'Run Code', shortcut: 'Ctrl+Enter', category: 'Run', action: () => this.runCode() },
      { name: 'Stop Execution', shortcut: 'Shift+F5', category: 'Run', action: () => this.stopRun() },
      { name: 'Run Benchmark', shortcut: '', category: 'Run', action: () => this.runBenchmark() },
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
      { name: 'Toggle Terminal', shortcut: 'Ctrl+`', category: 'View', action: () => this.switchPanel('terminal') },
      { name: 'Toggle Output', shortcut: '', category: 'View', action: () => this.switchPanel('output') },
      { name: 'Toggle Problems', shortcut: '', category: 'View', action: () => this.switchPanel('problems') },
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
        name: 'Zoom In', shortcut: 'Ctrl+=', category: 'View', action: () => this.changeFontSize(1)
      },
      {
        name: 'Zoom Out', shortcut: 'Ctrl+-', category: 'View', action: () => this.changeFontSize(-1)
      },
      {
        name: 'Reset Zoom', shortcut: 'Ctrl+0', category: 'View', action: () => {
          this.currentFontSize = 14;
          this.editor.updateOptions({ fontSize: 14 });
          const display = document.getElementById('fontSizeDisplay');
          if (display) display.textContent = 14;
        }
      },
      { name: 'Toggle Zen Mode', shortcut: 'Ctrl+K Z', category: 'View', action: () => this.toggleZenMode() },
      { name: 'Switch Theme', shortcut: '', category: 'View', action: () => this.cycleTheme() },
      {
        name: 'Insert Snippet...', shortcut: '', category: 'Edit', action: () => {
          this.hideCommandPalette();
          this.showSnippetPicker();
        }
      },
      { name: 'Keyboard Shortcuts', shortcut: '', category: 'Help', action: () => {
        this.renderShortcutsPanel();
        const modal = document.getElementById('shortcutsModal');
        if (modal) modal.classList.remove('hidden');
      }},
    ];

    this.paletteEl = document.getElementById('commandPalette');
    this.commandInputEl = document.getElementById('commandInput');
    this.commandListEl = document.getElementById('commandList');
    this.selectedCommandIndex = 0;

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        this.showCommandPalette();
      }
      if (e.key === 'Escape' && !this.paletteEl.classList.contains('hidden')) {
        this.hideCommandPalette();
      }
    });

    this.paletteEl.querySelector('.command-palette-overlay').addEventListener('click', () => {
      this.hideCommandPalette();
    });

    this.commandInputEl.addEventListener('input', () => {
      this.filterCommands(this.commandInputEl.value);
    });

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

  showSnippetPicker() {
    const snippets = window.ParadoxSnippets;
    if (!snippets || !snippets.length) {
      this.showToast('No snippets loaded.', 'warn', 2000);
      return;
    }

    const file = this.items[this.activeFile];
    const lang = file?.lang || 'javascript';
    const filtered = snippets.filter(s => !s.language || s.language === lang);

    this.commandInputEl.value = '';
    this.commandListEl.innerHTML = filtered.map((s, i) => `
      <div class="command-item ${i === 0 ? 'selected' : ''}" data-index="${i}">
        <span class="command-item-icon">⌨</span>
        <div class="command-item-content">
          <div class="command-item-name">${s.name}</div>
          <div class="command-item-category">${s.category}</div>
        </div>
      </div>
    `).join('');

    this.filteredCommands = filtered.map(s => ({ name: s.name, action: () => this.insertSnippet(s.code) }));
    this.selectedCommandIndex = 0;
    this.paletteEl.classList.remove('hidden');
    this.commandInputEl.placeholder = 'Search snippets...';
    this.commandInputEl.focus();

    this.commandListEl.querySelectorAll('.command-item').forEach((el, i) => {
      el.addEventListener('click', () => {
        this.selectedCommandIndex = i;
        this.executeSelectedCommand();
      });
    });
  }

  showCommandPalette() {
    this.paletteEl.classList.remove('hidden');
    this.commandInputEl.value = '';
    this.commandInputEl.placeholder = 'Type a command...';
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
      if (i === this.selectedCommandIndex) el.scrollIntoView({ block: 'nearest' });
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
