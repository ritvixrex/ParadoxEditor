
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
    this.buildVersion = '2026-03-27.6';
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
    this.autoRunEnabled = true;
    this.freshRunEnabled = false;
    this.problemOwner = 'paradox-runtime';
    this.problemsByFile = {};
    this.memoryRefreshTimeout = null;
    this.memoryZoom = 1;
    this.memoryOffsetX = 0;
    this.memoryOffsetY = 0;

    this.items = {}; // id -> item
    this.rootIds = []; // top-level ids
    this.activeFolderId = null;
    this.expandedFolders = new Set(); // folder ids that are open

    // DB runners state
    this.sqlDb = null;
    this.mongoEngine = null;

    // Diff editor state
    this.diffEditor = null;
    this.diffOriginalModel = null;
    this.diffModifiedModel = null;

    // DB Live Visualizer state
    this.dbVisZoom = 1.0;
    this.dbVisOffsetX = 0;
    this.dbVisOffsetY = 0;
    this.dbVisCardPositions = {}; // tableName -> {x, y}
    this.dbVisLastChange = null;  // { type: 'insert'|'update'|'delete', ids: Set }
    this.dbVisCollapsed = false;
    this.reactPreviewVisible = true;
    this.reactPreviewWidth = 420;
    this.reactPreviewRefreshTimeout = null;
    this.reactPreviewBlobUrls = [];
    this.babelReadyPromise = null;

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
    console.log(`[ParadoxEditor] build ${this.buildVersion}`);
    await this.loadFromStorage();
    this.initTerminal();
    this.initMonaco();
    this.upgradeStandaloneReactFiles();
    this.initResizing();
    this.initEventListeners();
    this.initCommandPalette();
    this.renderSidebar();
    this.initPatterns();
    this.initDbCheatsheets();
    this.initDbVis();
    this.initReactPreview();
    this.updateTabs();
    this.updateBreadcrumbs();
    this.renderProblems();
    this.updateStatusBar();
    // Belt-and-suspenders: force correct vis panel state after full init
    this._syncDbVisPanel();
    this._syncReactPreviewPanel();
    this._syncRunControls();
    setTimeout(() => {
      this._syncRunControls();
      this._syncDbVisPanel();
      this._syncReactPreviewPanel();
    }, 0);

    // Debounced Auto-Analysis
    this.analysisTimeout = null;
    this.editor.onDidChangeModelContent((e) => {
      if (this.activeFile && this.items[this.activeFile]) {
        this.items[this.activeFile].content = this.editor.getValue();
        this.saveToStorage();
        this.clearProblems(this.activeFile);
        const memoryModal = document.getElementById('memoryModal');
        if (memoryModal && !memoryModal.classList.contains('hidden')) {
          if (this.memoryRefreshTimeout) clearTimeout(this.memoryRefreshTimeout);
          this.memoryRefreshTimeout = setTimeout(() => this.showMemoryView(false), 250);
        }
        if ((this._isReactProjectFile(this.activeFile) || this._isReactFile(this.items[this.activeFile])) && this.reactPreviewVisible) {
          if (this.reactPreviewRefreshTimeout) clearTimeout(this.reactPreviewRefreshTimeout);
          this.reactPreviewRefreshTimeout = setTimeout(() => this.refreshReactPreview({ silent: true }), 350);
        }
      }

      // Only clear decorations if the user is typing (to avoid stale console logs)
      // but perhaps we should keep them until re-run to avoid "glitchy" flashing
      // Let's at least debounce the clearing or only clear if it's a structural change.
      // For now, let's keep them until the NEXT run starts to reduce flicker.

      // Auto-Update (Complexity + Inline Output)
      if (this.autoUpdateTimeout) clearTimeout(this.autoUpdateTimeout);
      if (this.autoRunEnabled) {
        this.autoUpdateTimeout = setTimeout(() => {
          this.autoUpdate();
        }, 1000);
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
        // default files
        const indexId = 'index_js';
        const pyId = 'main_py';
        this.items[indexId] = { id: indexId, name: 'index.js', type: 'file', lang: 'javascript', content: `console.log("Hello from ParadoxEditor!");\n\nconst data = [\n  { id: 1, name: "Alpha" },\n  { id: 2, name: "Beta" }\n];\n\nconsole.log("Current Data:", data);` };
        this.items[pyId] = { id: pyId, name: 'main.py', type: 'file', lang: 'python', content: `print("Hello from Python!")\nprint("Line 2")\n\ndef greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("World"))` };
        this.rootIds = [indexId, pyId];
      }

      // Backfill legacy saved files so SQL/Mongo detection is consistent.
      Object.values(this.items).forEach(item => {
        if (!item || item.type !== 'file') return;
        const inferredLang = this._getLang(item.name || '');
        if (
          !item.lang ||
          this._nameHasExt(item.name, '.py') ||
          this._nameHasExt(item.name, '.sql') ||
          this._nameHasExt(item.name, '.mongo') ||
          this._nameHasExt(item.name, '.js') ||
          this._nameHasExt(item.name, '.jsx') ||
          this._nameHasExt(item.name, '.html') ||
          this._nameHasExt(item.name, '.css') ||
          this._nameHasExt(item.name, '.json')
        ) {
          item.lang = inferredLang;
        }
      });

      const savedActive = localStorage.getItem('paradox_active');
      const savedOpen = localStorage.getItem('paradox_open');
      const savedAutoRun = localStorage.getItem('paradox_auto_run');
      const savedFreshRun = localStorage.getItem('paradox_fresh_run');
      const savedReactPreviewVisible = localStorage.getItem('paradox_react_preview_visible');
      const savedReactPreviewWidth = localStorage.getItem('paradox_react_preview_width');
      if (savedActive) this.activeFile = savedActive;
      if (savedOpen) this.openFiles = JSON.parse(savedOpen);
      if (savedAutoRun !== null) this.autoRunEnabled = savedAutoRun === '1';
      if (savedFreshRun !== null) this.freshRunEnabled = savedFreshRun === '1';
      if (savedReactPreviewVisible !== null) this.reactPreviewVisible = savedReactPreviewVisible === '1';
      if (savedReactPreviewWidth) this.reactPreviewWidth = Math.max(320, Math.min(760, parseInt(savedReactPreviewWidth, 10) || 420));

      if (this.activeFile && !this.items[this.activeFile]) {
        this.activeFile = null;
      }
      if (!this.activeFile) {
        this.activeFile = this._getFirstFileId();
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
    localStorage.setItem('paradox_auto_run', this.autoRunEnabled ? '1' : '0');
    localStorage.setItem('paradox_fresh_run', this.freshRunEnabled ? '1' : '0');
    localStorage.setItem('paradox_react_preview_visible', this.reactPreviewVisible ? '1' : '0');
    localStorage.setItem('paradox_react_preview_width', String(this.reactPreviewWidth));
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
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      allowNonTsExtensions: true,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      module: monaco.languages.typescript.ModuleKind.ESNext,
    });

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
      glyphMargin: true,
      renderValidationDecorations: 'on',
      
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
    const panelResizer = document.getElementById('panelResizer');

    const clampSidebarWidth = (rawWidth) => {
      const minSidebar = 160;
      const maxSidebarConfig = 600;
      const minMain = 380; // keep editor toolbar/Monaco usable
      const viewportMax = Math.max(minSidebar, window.innerWidth - 48 - minMain);
      const maxAllowed = Math.min(maxSidebarConfig, viewportMax);
      const parsed = parseInt(rawWidth, 10);
      const fallback = 260;
      const candidate = Number.isFinite(parsed) ? parsed : fallback;
      return Math.max(minSidebar, Math.min(maxAllowed, candidate));
    };

    const clampPanelHeight = (rawHeight) => {
      const minPanel = 50;
      const parsed = parseInt(rawHeight, 10);
      const maxPanel = Math.max(minPanel, window.innerHeight - 150);
      const fallback = 250;
      const candidate = Number.isFinite(parsed) ? parsed : fallback;
      return Math.max(minPanel, Math.min(maxPanel, candidate));
    };

    // Restore persisted sizes
    const savedPanel = localStorage.getItem('paradox_panel_height');
    if (savedPanel) panels.style.height = clampPanelHeight(savedPanel) + 'px';
    const savedSidebar = localStorage.getItem('paradox_sidebar_width');
    if (savedSidebar) sidebar.style.width = clampSidebarWidth(savedSidebar) + 'px';

    let isResizingSidebar = false, isResizingPanel = false;

    sidebarResizer.addEventListener('mousedown', () => {
      isResizingSidebar = true;
      sidebarResizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    panelResizer.addEventListener('mousedown', () => isResizingPanel = true);

    document.addEventListener('mousemove', (e) => {
      if (isResizingSidebar) {
        const width = e.clientX - 48; // subtract activitybar (48px)
        sidebar.style.width = clampSidebarWidth(width) + 'px';
      } else if (isResizingPanel) {
        const height = window.innerHeight - e.clientY - 22;
        const safeHeight = clampPanelHeight(height);
        panels.style.height = safeHeight + 'px';
        localStorage.setItem('paradox_panel_height', safeHeight);
        if (this.fitAddon) this.fitAddon.fit();
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizingSidebar) {
        const w = clampSidebarWidth(sidebar.style.width);
        sidebar.style.width = w + 'px';
        if (w >= 160) localStorage.setItem('paradox_sidebar_width', w);
        sidebarResizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      isResizingSidebar = isResizingPanel = false;
    });

    // Keep persisted widths safe after viewport changes.
    window.addEventListener('resize', () => {
      const safeW = clampSidebarWidth(sidebar.style.width || localStorage.getItem('paradox_sidebar_width'));
      sidebar.style.width = safeW + 'px';
      localStorage.setItem('paradox_sidebar_width', safeW);

      const safeH = clampPanelHeight(panels.style.height || localStorage.getItem('paradox_panel_height'));
      panels.style.height = safeH + 'px';
      localStorage.setItem('paradox_panel_height', safeH);
    });
  }

  initEventListeners() {
    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    const runStatus = document.getElementById('runStatus');
    const runStatusText = document.getElementById('runStatusText');

    if (runBtn) runBtn.addEventListener('click', () => this.runCode());
    if (stopBtn) stopBtn.addEventListener('click', () => this.stopRun());
    document.getElementById('memoryBtn')?.addEventListener('click', () => this.showMemoryView());
    document.getElementById('previewBtn')?.addEventListener('click', () => this.toggleReactPreview());
    document.getElementById('autoRunBtn')?.addEventListener('click', () => this.toggleAutoRun());
    document.getElementById('freshRunBtn')?.addEventListener('click', () => this.toggleFreshRun());
    document.getElementById('clearInlineBtn')?.addEventListener('click', () => this.clearInlineDecorations());
    document.getElementById('clearBtn').addEventListener('click', () => {
      this.terminal.clear();
      this.outputLog = [];
      const outputEl = document.getElementById('output');
      if (outputEl) outputEl.innerHTML = '';
      if (this.editor) this.editor.setValue('');
      this.clearInlineDecorations();
    });
    document.getElementById('newFileBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.showLangPicker(e.currentTarget);
    });
    document.getElementById('newReactProjectBtn')?.addEventListener('click', () => this.createReactProject());
    document.getElementById('newFolderBtn').addEventListener('click', () => this.createNewItem('folder'));
    document.getElementById('benchmarkBtn').addEventListener('click', () => this.runBenchmark());
    document.getElementById('diffBtn')?.addEventListener('click', () => this.initDiffEditor());
    document.getElementById('memoryCloseBtn')?.addEventListener('click', () => this.closeMemoryView());
    document.querySelector('#memoryModal .memory-modal-overlay')?.addEventListener('click', () => this.closeMemoryView());
    document.getElementById('flowBtn')?.addEventListener('click', () => this.showEventLoopView());
    document.getElementById('flowCloseBtn')?.addEventListener('click', () => this.closeEventLoopView());
    document.querySelector('#flowModal .flow-modal-overlay')?.addEventListener('click', () => this.closeEventLoopView());
    document.getElementById('toggleOutputBtn').addEventListener('click', () => {
      const active = document.querySelector('.panel-view.active');
      if (active && active.id === 'terminal-container') this.switchPanel('output');
      else this.switchPanel('terminal');
    });

    // Helper: hide all special panels, show explorer
    const showExplorerPanel = () => {
      const patternsSection = document.getElementById('patternsSection');
      const dbSection = document.getElementById('dbSection');
      const sidebarHeader = document.querySelector('.sidebar-header');
      if (patternsSection) { patternsSection.style.display = 'none'; patternsSection.classList.remove('active'); }
      if (dbSection) { dbSection.style.display = 'none'; dbSection.classList.remove('active'); }
      document.querySelectorAll('.sidebar-section:not(#patternsSection):not(#dbSection)').forEach(s => s.style.display = '');
      if (sidebarHeader) sidebarHeader.style.display = '';
    };

    // Generic activity bar toggle — skip special buttons
    document.querySelectorAll('.activitybar .icon').forEach(icon => {
      icon.addEventListener('click', () => {
        if (icon.id === 'patternsActivityBtn' || icon.id === 'dbCheatsheetActivityBtn') return;
        const sidebar = document.querySelector('.sidebar');
        const wasActive = icon.classList.contains('active');
        document.querySelectorAll('.activitybar .icon').forEach(i => i.classList.remove('active'));
        showExplorerPanel();
        if (wasActive) {
          sidebar.style.display = 'none';
        } else {
          icon.classList.add('active');
          sidebar.style.display = 'flex';
        }
      });
    });

    // Helper: show a special panel (patterns or db), hide explorer + other special panels
    const showSpecialPanel = (panelId, btn) => {
      const sidebar = document.querySelector('.sidebar');
      const sidebarHeader = document.querySelector('.sidebar-header');
      const panelEl = document.getElementById(panelId);
      const patternsSection = document.getElementById('patternsSection');
      const dbSection = document.getElementById('dbSection');
      const wasActive = btn.classList.contains('active');

      document.querySelectorAll('.activitybar .icon').forEach(i => i.classList.remove('active'));

      // Hide all special panels
      if (patternsSection) { patternsSection.style.display = 'none'; patternsSection.classList.remove('active'); }
      if (dbSection) { dbSection.style.display = 'none'; dbSection.classList.remove('active'); }

      if (wasActive) {
        sidebar.style.display = 'none';
        showExplorerPanel();
      } else {
        btn.classList.add('active');
        sidebar.style.display = 'flex';
        if (panelEl) { panelEl.style.display = 'block'; panelEl.classList.add('active'); }
        document.querySelectorAll('.sidebar-section:not(#patternsSection):not(#dbSection)').forEach(s => s.style.display = 'none');
        if (sidebarHeader) sidebarHeader.style.display = 'none';
      }
    };

    // Patterns activity bar
    document.getElementById('patternsActivityBtn')?.addEventListener('click', () => {
      showSpecialPanel('patternsSection', document.getElementById('patternsActivityBtn'));
    });

    // DB Cheat Sheets activity bar
    document.getElementById('dbCheatsheetActivityBtn')?.addEventListener('click', () => {
      showSpecialPanel('dbSection', document.getElementById('dbCheatsheetActivityBtn'));
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

  // ─── File type helpers ────────────────────────────────────────────────────
  _nameLower(name) {
    return String(name || '').trim().toLowerCase();
  }

  _nameHasExt(name, ext) {
    return this._nameLower(name).endsWith(ext);
  }

  _isMongoFile(fileOrName) {
    if (!fileOrName) return false;
    const name = typeof fileOrName === 'string' ? fileOrName : fileOrName.name;
    return this._nameHasExt(name, '.mongo');
  }

  _isSqlFile(fileOrName) {
    if (!fileOrName) return false;
    if (typeof fileOrName === 'string') return this._nameHasExt(fileOrName, '.sql');
    return fileOrName.lang === 'sql' || this._nameHasExt(fileOrName.name, '.sql');
  }

  _isDbFile(fileOrName) {
    return this._isSqlFile(fileOrName) || this._isMongoFile(fileOrName);
  }

  _isReactFile(fileOrName) {
    if (!fileOrName) return false;
    const name = typeof fileOrName === 'string' ? fileOrName : fileOrName.name;
    return this._nameHasExt(name, '.jsx');
  }

  _getLang(name) {
    if (this._nameHasExt(name, '.py')) return 'python';
    if (this._nameHasExt(name, '.sql')) return 'sql';
    if (this._nameHasExt(name, '.html')) return 'html';
    if (this._nameHasExt(name, '.css')) return 'css';
    if (this._nameHasExt(name, '.json')) return 'json';
    if (this._isMongoFile(name)) return 'javascript'; // Mongo shell is JS-like
    return 'javascript';
  }

  _getMonacoLang(lang) {
    if (lang === 'python') return 'python';
    if (lang === 'sql') return 'sql';
    if (lang === 'html') return 'html';
    if (lang === 'css') return 'css';
    if (lang === 'json') return 'json';
    return 'javascript';
  }

  _getFileIconHtml(name) {
    if (this._isReactFile(name)) return '<span class="file-icon file-icon-react">RX</span>';
    if (this._nameHasExt(name, '.js')) return '<span class="file-icon file-icon-js">JS</span>';
    if (this._nameHasExt(name, '.py')) return '<span class="file-icon file-icon-py">PY</span>';
    if (this._nameHasExt(name, '.sql')) return '<span class="file-icon file-icon-sql">SQL</span>';
    if (this._isMongoFile(name)) return '<span class="file-icon file-icon-mongo">MDB</span>';
    return '<span class="file-icon file-icon-default"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg></span>';
  }

  getReactTemplate() {
    return `import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>React Practice</h1>
      <p>Edit this component and watch the preview update.</p>
      <button onClick={() => setCount(count + 1)}>
        Clicked ${'{'}count{'}'} times
      </button>
    </div>
  );
}
`;
  }

  getReactProjectTemplate(projectName = 'react-app') {
    return [
      {
        name: projectName,
        type: 'folder',
        projectType: 'react',
        children: [
          {
            name: 'public',
            type: 'folder',
            children: [
              {
                name: 'index.html',
                type: 'file',
                lang: 'html',
                content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${projectName}</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>
`
              }
            ]
          },
          {
            name: 'src',
            type: 'folder',
            children: [
              {
                name: 'App.js',
                type: 'file',
                lang: 'javascript',
                content: `import React from 'react';
import './style.css';

export default function App() {
  return (
    <div className="app-shell">
      <div className="app-card">
        <span className="eyebrow">ParadoxEditor React</span>
        <h1>Hello React</h1>
        <p>Start editing <code>src/App.js</code> to see your preview update.</p>
      </div>
    </div>
  );
}
`
              },
              {
                name: 'index.js',
                type: 'file',
                lang: 'javascript',
                content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = createRoot(document.getElementById('root'));
root.render(<App />);
`
              },
              {
                name: 'style.css',
                type: 'file',
                lang: 'css',
                content: `:root {
  color-scheme: dark;
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: #0f1722;
  color: #e6edf3;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(56, 189, 248, 0.18), transparent 32%),
    linear-gradient(180deg, #111827 0%, #0b1220 100%);
}

#root {
  min-height: 100vh;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
}

.app-card {
  width: min(560px, 100%);
  padding: 28px;
  border-radius: 20px;
  background: rgba(15, 23, 34, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.34);
}

.eyebrow {
  display: inline-block;
  margin-bottom: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.16);
  color: #93c5fd;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 12px;
  font-size: 36px;
}

p {
  margin: 0;
  color: #c7d2fe;
  line-height: 1.6;
}

code {
  font-family: var(--font-code);
  color: #f9a8d4;
}
`
              }
            ]
          },
          {
            name: 'package.json',
            type: 'file',
            lang: 'json',
            content: `{
  "name": "${projectName}",
  "private": true,
  "version": "1.0.0",
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1"
  }
}
`
          }
        ]
      }
    ];
  }

  _makeItemId(seed) {
    return `${String(seed || 'item').replace(/[^a-zA-Z0-9._-]/g, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  _getUniqueName(baseName, parentId = null) {
    const siblings = Object.values(this.items).filter(item => (item.parentId || null) === parentId);
    if (!siblings.some(item => item.name === baseName)) return baseName;
    const extMatch = baseName.match(/(\.[^.]+)$/);
    const ext = extMatch ? extMatch[1] : '';
    const stem = ext ? baseName.slice(0, -ext.length) : baseName;
    let counter = 2;
    let candidate = `${stem}-${counter}${ext}`;
    while (siblings.some(item => item.name === candidate)) {
      counter += 1;
      candidate = `${stem}-${counter}${ext}`;
    }
    return candidate;
  }

  _getFirstFileInBranch(itemId) {
    const item = this.items[itemId];
    if (!item) return null;
    if (item.type === 'file') return item.id;
    const children = Object.values(this.items)
      .filter(child => child.parentId === item.id)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    for (const child of children) {
      const fileId = this._getFirstFileInBranch(child.id);
      if (fileId) return fileId;
    }
    return null;
  }

  _getFirstFileId() {
    for (const rootId of this.rootIds) {
      const fileId = this._getFirstFileInBranch(rootId);
      if (fileId) return fileId;
    }
    return null;
  }

  _getItemPathSegments(itemId) {
    const segments = [];
    let current = this.items[itemId];
    while (current) {
      segments.unshift(current.name);
      current = current.parentId ? this.items[current.parentId] : null;
    }
    return segments;
  }

  _getItemPath(itemId) {
    return this._getItemPathSegments(itemId).join('/');
  }

  _getProjectRootId(itemOrId, projectType = null) {
    const initialId = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
    let current = initialId ? this.items[initialId] : null;
    while (current) {
      if (current.type === 'folder' && (!projectType || current.projectType === projectType)) {
        return current.id;
      }
      current = current.parentId ? this.items[current.parentId] : null;
    }
    return null;
  }

  _getReactProjectRoot(itemOrId = this.activeFile) {
    const rootId = this._getProjectRootId(itemOrId, 'react');
    return rootId ? this.items[rootId] : null;
  }

  _isReactProjectFile(itemOrId = this.activeFile) {
    return !!this._getReactProjectRoot(itemOrId);
  }

  _getReactProjectFiles(projectRootId) {
    return Object.values(this.items)
      .filter(item => item?.type === 'file' && this._getProjectRootId(item.id, 'react') === projectRootId)
      .sort((a, b) => this._getItemPath(a.id).localeCompare(this._getItemPath(b.id)));
  }

  _getReactProjectEntryFile(projectRootId) {
    const files = this._getReactProjectFiles(projectRootId);
    const preferred = [
      `${this.items[projectRootId]?.name}/src/index.js`,
      `${this.items[projectRootId]?.name}/src/index.jsx`,
      `${this.items[projectRootId]?.name}/src/main.js`,
      `${this.items[projectRootId]?.name}/src/main.jsx`
    ];
    const preferredFile = files.find(file => preferred.includes(this._getItemPath(file.id)));
    if (preferredFile) return preferredFile;
    return files.find(file => this._nameHasExt(file.name, '.js') || this._nameHasExt(file.name, '.jsx')) || null;
  }

  _clearProblemsForFiles(fileIds = []) {
    fileIds.forEach(fileId => {
      if (!fileId) return;
      delete this.problemsByFile[fileId];
      if (this.models[fileId] && window.monaco) {
        monaco.editor.setModelMarkers(this.models[fileId], this.problemOwner, []);
      }
    });
    this.renderProblems();
    this.updateStatusBar();
  }

  createReactProject(options = {}) {
    const sourceFileId = options.sourceFileId || null;
    const sourceItem = sourceFileId ? this.items[sourceFileId] : null;
    const sourceBaseName = sourceItem?.name ? sourceItem.name.replace(/\.[^.]+$/, '') : 'react-app';
    const projectName = this._getUniqueName(options.projectName || sourceBaseName || 'react-app');
    const template = this.getReactProjectTemplate(projectName);
    let firstSourceFileId = null;
    let appFileId = null;
    let indexFileId = null;

    const createNode = (node, parentId = null, projectRootId = null) => {
      const id = this._makeItemId(node.name);
      const nextProjectRootId = node.projectType === 'react' ? id : projectRootId;
      const item = {
        id,
        name: node.name,
        type: node.type,
        parentId,
      };

      if (node.projectType) item.projectType = node.projectType;
      if (nextProjectRootId && node.projectType !== 'react') item.projectRootId = nextProjectRootId;

      if (node.type === 'folder') {
        this.items[id] = item;
        if (!parentId) this.rootIds.unshift(id);
        this.expandedFolders.add(id);
        (node.children || []).forEach(child => createNode(child, id, nextProjectRootId));
      } else {
        item.lang = node.lang || this._getLang(node.name);
        item.content = node.content || '';
        this.items[id] = item;
        this.models[id] = monaco.editor.createModel(item.content, this._getMonacoLang(item.lang));
        const itemPath = this._getItemPath(id);
        if (/\/src\/App\.js$/i.test(`/${itemPath}`)) appFileId = id;
        if (/\/src\/index\.js$/i.test(`/${itemPath}`)) indexFileId = id;
        if (/\/src\/(App|index|main)\.(js|jsx)$/i.test(`/${this._getItemPath(id)}`) && !firstSourceFileId) {
          firstSourceFileId = id;
        }
      }
      return id;
    };

    template.forEach(node => createNode(node));

    if (sourceItem) {
      const sourceContent = this.activeFile === sourceFileId && this.editor ? this.editor.getValue() : (sourceItem.content || '');
      const sourceHasOwnMount = /\bcreateRoot\s*\(|ReactDOM\.render\s*\(/.test(sourceContent);
      const targetId = sourceHasOwnMount ? indexFileId : appFileId;
      if (targetId && this.items[targetId] && this.models[targetId]) {
        this.items[targetId].content = sourceContent;
        this.models[targetId].setValue(sourceContent);
      }

      if (this.models[sourceFileId]) {
        this.models[sourceFileId].dispose();
        delete this.models[sourceFileId];
      }
      delete this.items[sourceFileId];
      this.rootIds = this.rootIds.filter(id => id !== sourceFileId);
      this.openFiles = this.openFiles.filter(id => id !== sourceFileId);
      if (this.activeFile === sourceFileId) this.activeFile = null;
    }

    if (firstSourceFileId) {
      if (!this.openFiles.includes(firstSourceFileId)) this.openFiles.push(firstSourceFileId);
      this.switchFile(firstSourceFileId);
    } else {
      this.renderSidebar();
      this.saveToStorage();
    }
  }

  upgradeStandaloneReactFiles() {
    const reactProjectExists = this.rootIds.some(id => this.items[id]?.type === 'folder' && this.items[id]?.projectType === 'react');
    if (reactProjectExists) return;

    const standaloneReactFiles = this.rootIds.filter(id => this.items[id]?.type === 'file' && this._isReactFile(this.items[id]));
    if (!standaloneReactFiles.length) return;

    const preferredSourceId = standaloneReactFiles.includes(this.activeFile) ? this.activeFile : standaloneReactFiles[0];
    this.createReactProject({ sourceFileId: preferredSourceId });
  }

  _getFolderIconHtml(isExpanded) {
    return isExpanded
      ? `<span class="file-icon file-icon-folder-open"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="2" y1="10" x2="22" y2="10"></line></svg></span>`
      : `<span class="file-icon file-icon-folder"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></span>`;
  }

  // ─── Create new file/folder with inline input ──────────────────────────────
  createNewItem(type, parentId = null, defaultExt = '') {
    const targetParentId = parentId || this.activeFolderId || null;
    const targetProjectRootId = targetParentId ? this._getProjectRootId(targetParentId, 'react') : null;
    const explorer = document.getElementById(targetProjectRootId ? 'reactExplorer' : 'fileExplorer');
    if (!explorer) return;

    // Remove any existing pending input
    const existing = explorer.querySelector('.new-item-input');
    if (existing) existing.remove();

    const wrapper = document.createElement('div');
    wrapper.style.paddingLeft = targetParentId ? '24px' : '8px';
    wrapper.style.paddingTop = '2px';
    wrapper.style.paddingBottom = '2px';

    const input = document.createElement('input');
    input.className = 'rename-input-inline new-item-input';
    input.placeholder = type === 'file' ? `filename${defaultExt || '.js'}` : 'folder-name';
    // Pre-fill with extension so user types name before it
    if (defaultExt && type === 'file') {
      input.value = defaultExt;
    }
    wrapper.appendChild(input);

    // Insert at top of explorer, or after the parent folder row
    if (targetParentId) {
      const parentBtn = explorer.querySelector(`[data-item-id="${targetParentId}"]`);
      if (parentBtn && parentBtn.nextSibling) {
        explorer.insertBefore(wrapper, parentBtn.nextSibling);
      } else {
        explorer.appendChild(wrapper);
      }
    } else {
      explorer.insertBefore(wrapper, explorer.firstChild);
    }
    input.focus();
    // If extension pre-filled, put cursor at position 0 so user types name before extension
    if (defaultExt && type === 'file') {
      input.setSelectionRange(0, 0);
    }

    let hasCommitted = false;
    const commit = () => {
      if (hasCommitted) return;
      hasCommitted = true;

      const name = input.value.trim();
      if (wrapper.isConnected) wrapper.remove();
      if (!name) return;
      const id = name.replace(/[^a-zA-Z0-9._\-]/g, '_') + '_' + Date.now();
      const lang = this._getLang(name);

      if (type === 'folder') {
        const folderItem = { id, name, type: 'folder', parentId: targetParentId };
        if (targetProjectRootId) folderItem.projectRootId = targetProjectRootId;
        this.items[id] = folderItem;
        if (!targetParentId) this.rootIds.push(id);
        else if (targetParentId) this.expandedFolders.add(targetParentId);
      } else {
        const isMongo = this._isMongoFile(name);
        const isReact = this._isReactFile(name);
        const defaultContent = isReact
          ? this.getReactTemplate()
          : lang === 'python'
            ? '# Python\n'
            : lang === 'sql'
              ? '-- SQL\n'
              : lang === 'html'
                ? '<!doctype html>\n<html>\n  <head>\n    <meta charset="utf-8" />\n    <title>Document</title>\n  </head>\n  <body>\n  </body>\n</html>\n'
                : lang === 'css'
                  ? '/* CSS */\n'
                  : lang === 'json'
                    ? '{\n  \n}\n'
                    : isMongo
                      ? '// MongoDB\n// Use db.collection(\"name\").find() etc.\n'
                      : '// JavaScript\n';
        const fileItem = { id, name, type: 'file', lang, content: defaultContent, parentId: targetParentId };
        if (targetProjectRootId) fileItem.projectRootId = targetProjectRootId;
        this.items[id] = fileItem;
        this.models[id] = monaco.editor.createModel(defaultContent, this._getMonacoLang(lang));
        if (!targetParentId) this.rootIds.push(id);
        else if (targetParentId) this.expandedFolders.add(targetParentId);
        this.openFiles.push(id);
        this.switchFile(id);
      }

      this.renderSidebar();
      this.saveToStorage();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') {
        hasCommitted = true;
        if (wrapper.isConnected) wrapper.remove();
      }
    });
  }

  // ─── Inline rename ────────────────────────────────────────────────────────
  renameItem(id) {
    const item = this.items[id];
    if (!item) return;

    const nameSpan = document.querySelector(`[data-item-id="${id}"] .item-name`);
    if (!nameSpan) return;

    const oldName = item.name;
    const input = document.createElement('input');
    input.className = 'rename-input-inline';
    input.value = oldName;
    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const newName = input.value.trim() || oldName;
      item.name = newName;
      if (item.type === 'file') {
        item.lang = this._getLang(newName);
        // Update Monaco model language
        if (this.models[id]) {
          const newMonacoLang = this._getMonacoLang(item.lang);
          const content = this.models[id].getValue();
          this.models[id].dispose();
          this.models[id] = monaco.editor.createModel(content, newMonacoLang);
          if (this.activeFile === id) this.editor.setModel(this.models[id]);
        }
      }
      this.renderSidebar();
      this.updateTabs();
      this.updateBreadcrumbs();
      this.saveToStorage();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') this.renderSidebar();
    });
  }

  // ─── Right-click context menu ─────────────────────────────────────────────
  showContextMenu(e, id) {
    e.preventDefault();
    e.stopPropagation();
    const existing = document.getElementById('explorerContextMenu');
    if (existing) existing.remove();

    const item = this.items[id];
    if (!item) return;

    const menu = document.createElement('div');
    menu.id = 'explorerContextMenu';
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const isFolder = item.type === 'folder';
    menu.innerHTML = `
      ${isFolder ? `
        <div class="context-menu-item" data-action="newfile">
          <span>📄</span> New File
        </div>
        <div class="context-menu-item" data-action="newfolder">
          <span>📁</span> New Folder
        </div>
        <hr class="context-menu-sep">` : ''}
      <div class="context-menu-item" data-action="rename">
        <span>✎</span> Rename
      </div>
      <div class="context-menu-item context-menu-danger" data-action="delete">
        <span>🗑</span> Delete
      </div>`;

    document.body.appendChild(menu);

    menu.addEventListener('click', ev => {
      const action = ev.target.closest('[data-action]')?.dataset.action;
      if (action === 'rename') this.renameItem(id);
      if (action === 'delete') this.deleteItem(id);
      if (action === 'newfile') {
        this.expandedFolders.add(id);
        this.renderSidebar();
        this.createNewItem('file', id);
      }
      if (action === 'newfolder') {
        this.expandedFolders.add(id);
        this.renderSidebar();
        this.createNewItem('folder', id);
      }
      menu.remove();
    });

    // Close on outside click
    const close = ev => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  // ─── Language picker popup (New File button) ──────────────────────────────
  showLangPicker(anchorEl) {
    // Toggle — if already open, close it
    const existing = document.getElementById('langPickerMenu');
    if (existing) { existing.remove(); return; }

    const picker = document.createElement('div');
    picker.id = 'langPickerMenu';
    picker.className = 'lang-picker';

    const langs = [
      { label: 'JS',  ext: '.js',    cls: 'file-icon-js'    },
      { label: 'RX',  ext: '.jsx',   cls: 'file-icon-react' },
      { label: 'PY',  ext: '.py',    cls: 'file-icon-py'    },
      { label: 'SQL', ext: '.sql',   cls: 'file-icon-sql'   },
      { label: 'MDB', ext: '.mongo', cls: 'file-icon-mongo' },
    ];

    langs.forEach(({ label, ext, cls }) => {
      const btn = document.createElement('button');
      btn.className = `lang-picker-btn file-icon ${cls}`;
      btn.textContent = label;
      btn.title = `New ${label} file`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        picker.remove();
        this.createNewItem('file', null, ext);
      });
      picker.appendChild(btn);
    });

    document.body.appendChild(picker);

    // Position below the anchor button
    const rect = anchorEl.getBoundingClientRect();
    picker.style.left = rect.left + 'px';
    picker.style.top = (rect.bottom + 4) + 'px';

    // Close on outside click
    const close = (ev) => {
      if (!picker.contains(ev.target) && ev.target !== anchorEl) {
        picker.remove();
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  deleteItem(id) {
    const item = this.items[id];
    if (!item) return;
    if (!confirm(`Delete "${item.name}"?`)) return;

    // Recursively collect all ids to delete
    const toDelete = new Set();
    const collect = (itemId) => {
      toDelete.add(itemId);
      Object.values(this.items).filter(c => c.parentId === itemId).forEach(c => collect(c.id));
    };
    collect(id);

    // Dispose Monaco models
    toDelete.forEach(itemId => {
      if (this.models[itemId]) { this.models[itemId].dispose(); delete this.models[itemId]; }
      delete this.items[itemId];
    });

    this.rootIds = this.rootIds.filter(r => !toDelete.has(r));
    this.openFiles = this.openFiles.filter(f => !toDelete.has(f));
    this.expandedFolders.delete(id);

    if (this.activeFile && toDelete.has(this.activeFile)) {
      this.activeFile = this.openFiles[0] || this._getFirstFileId() || null;
      if (this.editor) {
        this.editor.setModel(this.activeFile && this.models[this.activeFile] ? this.models[this.activeFile] : null);
      }
    }

    this.renderSidebar();
    this.updateTabs();
    this.updateBreadcrumbs();
    this.saveToStorage();
  }

  renderSidebar() {
    const explorer = document.getElementById('fileExplorer');
    const reactExplorer = document.getElementById('reactExplorer');
    const reactSection = document.getElementById('reactSection');
    const regularFilesSection = document.querySelector('[data-section="files"]');
    const openEditors = document.getElementById('openEditors');
    if (!explorer || !openEditors || !reactExplorer || !reactSection || !regularFilesSection) return;
    explorer.innerHTML = '';
    reactExplorer.innerHTML = '';
    openEditors.innerHTML = '';

    const renderItem = (id, container, depth = 0) => {
      const item = this.items[id];
      if (!item) return;

      if (item.type === 'folder') {
        const isExpanded = this.expandedFolders.has(id);
        const isActiveFolder = this.activeFolderId === id;

        const btn = document.createElement('button');
        btn.className = `tab explorer-folder${isActiveFolder ? ' active-folder' : ''}`;
        btn.dataset.itemId = id;
        btn.style.paddingLeft = `${8 + depth * 16}px`;

        btn.innerHTML = `
          <div class="sidebar-item-label">
            <span class="folder-chevron">${isExpanded ? '▾' : '▸'}</span>
            ${this._getFolderIconHtml(isExpanded)}
            <span class="item-name">${this._escapeHtml(item.name)}</span>
          </div>
          <div class="sidebar-item-actions">
            <button class="sidebar-action-btn" title="New File in folder">+</button>
            <button class="sidebar-action-btn" title="Rename">✎</button>
            <button class="sidebar-action-btn sidebar-action-delete" title="Delete">×</button>
          </div>`;

        btn.addEventListener('click', e => {
          if (e.target.classList.contains('sidebar-action-btn') || e.target.closest('.sidebar-action-btn')) return;
          if (this.expandedFolders.has(id)) this.expandedFolders.delete(id);
          else this.expandedFolders.add(id);
          this.activeFolderId = id;
          this.renderSidebar();
        });
        btn.addEventListener('contextmenu', e => this.showContextMenu(e, id));

        const [newInFolderBtn, renameBtn, deleteBtn] = btn.querySelectorAll('.sidebar-action-btn');
        newInFolderBtn.addEventListener('click', e => { e.stopPropagation(); this.expandedFolders.add(id); this.renderSidebar(); this.createNewItem('file', id); });
        renameBtn.addEventListener('click', e => { e.stopPropagation(); this.renameItem(id); });
        deleteBtn.addEventListener('click', e => { e.stopPropagation(); this.deleteItem(id); });

        container.appendChild(btn);

        if (isExpanded) {
          const children = Object.values(this.items).filter(c => c.parentId === id);
          children.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
          children.forEach(child => renderItem(child.id, container, depth + 1));
        }
      } else {
        // File
        const btn = document.createElement('button');
        btn.className = `tab explorer-file${this.activeFile === id ? ' active' : ''}`;
        btn.dataset.itemId = id;
        btn.style.paddingLeft = `${8 + depth * 16 + 16}px`; // extra indent for file vs folder

        btn.innerHTML = `
          <div class="sidebar-item-label">
            ${this._getFileIconHtml(item.name)}
            <span class="item-name">${this._escapeHtml(item.name)}</span>
          </div>
          <div class="sidebar-item-actions">
            <button class="sidebar-action-btn" title="Rename">✎</button>
            <button class="sidebar-action-btn sidebar-action-delete" title="Delete">×</button>
          </div>`;

        btn.addEventListener('click', e => {
          if (e.target.classList.contains('sidebar-action-btn') || e.target.closest('.sidebar-action-btn')) return;
          this.switchFile(id);
        });
        btn.addEventListener('contextmenu', e => this.showContextMenu(e, id));

        const [renameBtn, deleteBtn] = btn.querySelectorAll('.sidebar-action-btn');
        renameBtn.addEventListener('click', e => { e.stopPropagation(); this.renameItem(id); });
        deleteBtn.addEventListener('click', e => { e.stopPropagation(); this.deleteItem(id); });

        container.appendChild(btn);
      }
    };

    const getSortedChildren = (parentId) => {
      return Object.values(this.items)
        .filter(child => child.parentId === parentId)
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    };

    const readReactDependencies = (projectRootId) => {
      const packageFile = this._getReactProjectFiles(projectRootId).find(file => file.name === 'package.json');
      if (!packageFile) return [['react', '18.x'], ['react-dom', '18.x']];
      const packageContent = this.activeFile === packageFile.id && this.editor ? this.editor.getValue() : (packageFile.content || '{}');
      try {
        const pkg = JSON.parse(packageContent);
        const deps = Object.entries(pkg.dependencies || {});
        return deps.length ? deps : [['react', '18.x'], ['react-dom', '18.x']];
      } catch (error) {
        return [['package.json', 'Invalid JSON']];
      }
    };

    const renderReactWorkspace = (projectRootId, container) => {
      const project = this.items[projectRootId];
      if (!project) return;
      const activeReactRootId = this._getProjectRootId(this.activeFile, 'react');
      const isActiveProject = activeReactRootId === projectRootId;
      const workspace = document.createElement('section');
      workspace.className = `react-workspace${isActiveProject ? ' active' : ''}`;

      const entryFile = this._getReactProjectEntryFile(projectRootId);
      const entryLabel = entryFile ? this._getItemPath(entryFile.id).replace(`${project.name}/`, '') : 'src/index.js';

      const header = document.createElement('div');
      header.className = 'react-workspace-header';
      header.innerHTML = `
        <div class="react-workspace-heading">
          <span class="react-workspace-title">PROJECT</span>
          <span class="react-workspace-name">${this._escapeHtml(project.name)}</span>
        </div>
        <div class="react-workspace-actions">
          <button class="react-workspace-action" data-action="new-file" title="New file in project">+ File</button>
          <button class="react-workspace-action" data-action="new-folder" title="New folder in project">+ Folder</button>
        </div>
      `;

      header.addEventListener('click', (event) => {
        if (event.target.closest('.react-workspace-action')) return;
        const firstFileId = this._getFirstFileInBranch(projectRootId);
        if (firstFileId) this.switchFile(firstFileId);
      });

      header.querySelector('[data-action="new-file"]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        this.activeFolderId = projectRootId;
        this.createNewItem('file', projectRootId);
      });

      header.querySelector('[data-action="new-folder"]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        this.activeFolderId = projectRootId;
        this.createNewItem('folder', projectRootId);
      });

      workspace.appendChild(header);

      const infoSection = document.createElement('div');
      infoSection.className = 'react-workspace-section';
      infoSection.innerHTML = `
        <div class="react-workspace-section-label">INFO</div>
        <div class="react-workspace-meta">
          <div><span>Entry</span><strong>${this._escapeHtml(entryLabel)}</strong></div>
          <div><span>Preview</span><strong>public/index.html</strong></div>
          <div><span>Runtime</span><strong>React 18 via CDN</strong></div>
        </div>
      `;
      workspace.appendChild(infoSection);

      const filesSection = document.createElement('div');
      filesSection.className = 'react-workspace-section';
      filesSection.innerHTML = `<div class="react-workspace-section-label">FILES</div>`;
      const filesTree = document.createElement('div');
      filesTree.className = 'react-workspace-files';
      getSortedChildren(projectRootId).forEach(child => renderItem(child.id, filesTree, 0));
      filesSection.appendChild(filesTree);
      workspace.appendChild(filesSection);

      const depsSection = document.createElement('div');
      depsSection.className = 'react-workspace-section';
      depsSection.innerHTML = `<div class="react-workspace-section-label">DEPENDENCIES</div>`;
      const depList = document.createElement('div');
      depList.className = 'react-dependencies';
      readReactDependencies(projectRootId).forEach(([name, version]) => {
        const row = document.createElement('div');
        row.className = 'react-dependency-row';
        row.innerHTML = `<span>${this._escapeHtml(name)}</span><strong>${this._escapeHtml(version)}</strong>`;
        depList.appendChild(row);
      });
      depsSection.appendChild(depList);
      workspace.appendChild(depsSection);

      container.appendChild(workspace);
    };

    // Sort root: folders first, then files, both alphabetically
    const sortedRootIds = [...this.rootIds].sort((a, b) => {
      const ia = this.items[a], ib = this.items[b];
      if (!ia || !ib) return 0;
      if (ia.type !== ib.type) return ia.type === 'folder' ? -1 : 1;
      return ia.name.localeCompare(ib.name);
    });

    const reactRootIds = sortedRootIds.filter(id => this.items[id]?.type === 'folder' && this.items[id]?.projectType === 'react');
    const regularRootIds = sortedRootIds.filter(id => !reactRootIds.includes(id));
    const standaloneReactFiles = sortedRootIds.filter(id => this.items[id]?.type === 'file' && this._isReactFile(this.items[id]));
    const activeReactRootId = this._getProjectRootId(this.activeFile, 'react');

    if (regularRootIds.length === 0) {
      explorer.innerHTML = '<div class="explorer-empty">No files yet<br><small>Click + to create a file</small></div>';
    } else {
      regularRootIds.forEach(id => renderItem(id, explorer));
    }

    if (reactRootIds.length === 0) {
      if (standaloneReactFiles.length) {
        reactSection.style.display = '';
        reactExplorer.innerHTML = `<div class="react-workspace-empty">
          <div class="react-workspace-empty-title">React workspace needs a project structure</div>
          <div class="react-workspace-empty-copy">Create starter files like <code>public</code>, <code>src</code>, and <code>package.json</code> so this React file can run as a real workspace.</div>
          <button class="react-workspace-create-btn" data-create-react-project="true">Create Starter React Project</button>
        </div>`;
        reactExplorer.querySelector('[data-create-react-project="true"]')?.addEventListener('click', () => {
          const sourceId = standaloneReactFiles.includes(this.activeFile) ? this.activeFile : standaloneReactFiles[0];
          this.createReactProject({ sourceFileId: sourceId });
        });
      } else {
        reactSection.style.display = 'none';
        reactExplorer.innerHTML = '';
      }
    } else {
      reactSection.style.display = '';
      const orderedReactRoots = [...reactRootIds].sort((a, b) => {
        if (a === activeReactRootId) return -1;
        if (b === activeReactRootId) return 1;
        return this.items[a].name.localeCompare(this.items[b].name);
      });
      orderedReactRoots.forEach(id => renderReactWorkspace(id, reactExplorer));
    }

    regularFilesSection.style.display = reactRootIds.length && activeReactRootId ? 'none' : '';

    const visibleOpenFileIds = this.openFiles.filter(id => {
      const file = this.items[id];
      if (!file || file.type === 'folder') return false;
      return !this._getProjectRootId(id, 'react');
    });

    // Open Editors panel
    visibleOpenFileIds.forEach(id => {
      const file = this.items[id];
      if (!file || file.type === 'folder') return;
      const btn = document.createElement('button');
      btn.className = `tab${this.activeFile === id ? ' active' : ''}`;
      btn.innerHTML = `<div class="sidebar-item-label">${this._getFileIconHtml(file.name)}<span class="item-name">${this._escapeHtml(file.name)}</span></div>`;
      btn.addEventListener('click', () => this.switchFile(id));
      openEditors.appendChild(btn);
    });
    if (!visibleOpenFileIds.length) {
      openEditors.innerHTML = '<div class="explorer-empty"><small>React workspace files are managed below</small></div>';
    }
  }

  switchFile(id) {
    if (!this.models[id]) return;
    this.activeFile = id;
    if (!this.openFiles.includes(id)) this.openFiles.push(id);
    if (this.editor) this.editor.setModel(this.models[id]);
    this.renderProblems();
    this.updateStatusBar();
    if (!document.getElementById('memoryModal')?.classList.contains('hidden')) this.showMemoryView(false);
    this._syncReactPreviewPanel();
    this.renderSidebar(); this.updateTabs(); this.updateBreadcrumbs(); this.saveToStorage();
    // DB vis panel show/hide is handled inside updateBreadcrumbs()
    setTimeout(() => {
      this._syncRunControls();
      try {
        this._syncDbVisPanel();
      } catch (e) {
        console.error('[ParadoxEditor] Deferred DB visualizer sync failed:', e);
      }
    }, 0);
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
    const item = this.activeFile && this.items[this.activeFile];
    if (bc && item) {
      const segments = this._getItemPathSegments(item.id);
      bc.innerHTML = segments
        .map((segment, index) => {
          const cls = index === segments.length - 1 ? 'current-file' : '';
          return `${index > 0 ? '<span class="separator">/</span>' : ''}<span class="${cls}">${this._escapeHtml(segment)}</span>`;
        })
        .join('');
    }
    this.updateStatusBar();
    // Keep run controls resilient even if DB visualizer logic errors.
    this._syncRunControls();
    try {
      this._syncDbVisPanel();
      this._syncReactPreviewPanel();
    } catch (e) {
      console.error('[ParadoxEditor] DB visualizer sync failed:', e);
      this._hideDbVis();
      this._hideReactPreview();
    }
    // Re-apply after paint in case any async path changed button visibility.
    requestAnimationFrame(() => this._syncRunControls());
  }

  // Centralised helper — syncs DB Vis panel show/hide with the active file.
  // Called from updateBreadcrumbs() (every file switch) and at end of init().
  _syncDbVisPanel() {
    const item = this.activeFile && this.items[this.activeFile];
    const isDbFile = item && this._isDbFile(item);
    if (isDbFile) {
      this._showDbVis(this._isMongoFile(item) ? 'mongo' : 'sql');
    } else {
      this._hideDbVis();
    }
  }

  _syncReactPreviewPanel() {
    const item = this.activeFile && this.items[this.activeFile];
    if (item && this._isReactProjectFile(item.id) && this.reactPreviewVisible) {
      this._showReactPreview();
      this.refreshReactPreview({ silent: true });
    } else if (item && this._isReactFile(item) && this.reactPreviewVisible) {
      this._showReactPreview();
      this.refreshReactPreview({ silent: true });
    } else {
      this._hideReactPreview();
    }
  }

  initReactPreview() {
    const panel = document.getElementById('reactPreviewPanel');
    const resizer = document.getElementById('reactPreviewResizer');
    if (panel) panel.style.width = `${this.reactPreviewWidth}px`;

    let isResizing = false;
    resizer?.addEventListener('mousedown', () => {
      if (panel?.classList.contains('hidden')) return;
      isResizing = true;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (event) => {
      if (!isResizing || !panel) return;
      const mainRect = document.querySelector('.main')?.getBoundingClientRect();
      if (!mainRect) return;
      const minWidth = 320;
      const maxWidth = Math.min(760, Math.max(minWidth, mainRect.width - 420));
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, mainRect.right - event.clientX));
      this.reactPreviewWidth = nextWidth;
      panel.style.width = `${nextWidth}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;
      resizer?.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this.saveToStorage();
    });

    document.getElementById('reactPreviewRefreshBtn')?.addEventListener('click', () => this.refreshReactPreview({ silent: false }));
    document.getElementById('reactPreviewHideBtn')?.addEventListener('click', () => this.toggleReactPreview(false));

    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.source !== 'paradox-react-preview') return;
      const activeFile = this.activeFile && this.items[this.activeFile];
      if (!activeFile || (!this._isReactFile(activeFile) && !this._isReactProjectFile(activeFile.id))) return;

      if (data.type === 'ready') {
        this._setReactPreviewStatus('Live', 'ready');
      } else if (data.type === 'runtime-error') {
        this._setReactPreviewStatus('Error', 'error');
        this.addOutput('error', `React preview error: ${data.message || 'Unknown runtime error'}`);
      }
    });
  }

  toggleReactPreview(force) {
    this.reactPreviewVisible = typeof force === 'boolean' ? force : !this.reactPreviewVisible;
    this.saveToStorage();
    this.updatePracticeButtons();
    this._syncReactPreviewPanel();
  }

  _showReactPreview() {
    const panel = document.getElementById('reactPreviewPanel');
    const resizer = document.getElementById('reactPreviewResizer');
    if (panel) {
      panel.classList.remove('hidden');
      panel.style.width = `${this.reactPreviewWidth}px`;
    }
    if (resizer) resizer.classList.remove('hidden');
    this.updatePracticeButtons();
  }

  _hideReactPreview() {
    const panel = document.getElementById('reactPreviewPanel');
    const resizer = document.getElementById('reactPreviewResizer');
    if (panel) panel.classList.add('hidden');
    if (resizer) resizer.classList.add('hidden');
    this.updatePracticeButtons();
  }

  _setReactPreviewStatus(text, tone = '') {
    const status = document.getElementById('reactPreviewStatus');
    if (!status) return;
    status.textContent = text;
    status.className = `react-preview-status${tone ? ` ${tone}` : ''}`;
  }

  _renderReactPreviewEmpty(message, tone = 'empty') {
    const frame = document.getElementById('reactPreviewFrame');
    const empty = document.getElementById('reactPreviewEmpty');
    if (frame) frame.srcdoc = '<!doctype html><html><body style="margin:0;background:#111822;"></body></html>';
    if (empty) {
      empty.textContent = message;
      empty.className = `react-preview-empty ${tone}`;
      empty.style.display = 'flex';
    }
  }

  _showReactPreviewFrame() {
    const empty = document.getElementById('reactPreviewEmpty');
    if (empty) empty.style.display = 'none';
  }

  _clearReactPreviewBlobs() {
    this.reactPreviewBlobUrls.forEach(url => {
      try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
    });
    this.reactPreviewBlobUrls = [];
  }

  async ensureBabelLoaded() {
    if (window.Babel) return window.Babel;
    if (this.babelReadyPromise) return this.babelReadyPromise;

    this.babelReadyPromise = new Promise((resolve, reject) => {
      const sources = [
        'https://cdn.jsdelivr.net/npm/@babel/standalone/babel.min.js',
        'https://unpkg.com/@babel/standalone/babel.min.js'
      ];
      let index = 0;

      const tryNext = () => {
        if (window.Babel) {
          resolve(window.Babel);
          return;
        }
        if (index >= sources.length) {
          reject(new Error('Failed to load Babel Standalone from the available CDNs.'));
          return;
        }

        const script = document.createElement('script');
        script.id = `babelStandaloneScript_${index}`;
        script.src = sources[index];
        script.async = true;
        script.onload = () => resolve(window.Babel);
        script.onerror = () => {
          script.remove();
          index += 1;
          tryNext();
        };
        document.head.appendChild(script);
      };

      tryNext();
    });

    try {
      return await this.babelReadyPromise;
    } catch (error) {
      this.babelReadyPromise = null;
      throw error;
    }
  }

  getReactProblem(err, fileId = this.activeFile) {
    const rawMessage = err?.message || String(err || 'React preview error');
    let line = 1;
    let column = 1;
    if (err?.loc) {
      line = Math.max(1, err.loc.line || 1);
      column = Math.max(1, (err.loc.column || 0) + 1);
    } else {
      const match = rawMessage.match(/\((\d+):(\d+)\)/);
      if (match) {
        line = Math.max(1, Number(match[1]) || 1);
        column = Math.max(1, Number(match[2]) || 1);
      }
    }
    const message = rawMessage.split('\n')[0].replace(/^unknown:\s*/i, '');
    return this.makeProblem({
      message,
      rawMessage,
      line,
      column,
      endLine: line,
      endColumn: this.getLineEndColumn(fileId, line, column, 2),
      source: 'React Preview',
      severity: 'error',
      hint: 'Export a default component or fix the JSX syntax error in this file.'
    });
  }

  _normalizeReactModulePath(path) {
    const raw = String(path || '').replace(/\\/g, '/');
    const parts = [];
    raw.split('/').forEach(part => {
      if (!part || part === '.') return;
      if (part === '..') {
        parts.pop();
        return;
      }
      parts.push(part);
    });
    return `/${parts.join('/')}`;
  }

  _resolveReactImport(fromPath, specifier, knownPaths) {
    if (!specifier.startsWith('.')) return specifier;
    const fromParts = this._normalizeReactModulePath(fromPath).split('/').filter(Boolean);
    fromParts.pop();
    specifier.split('/').forEach(part => {
      if (!part || part === '.') return;
      if (part === '..') fromParts.pop();
      else fromParts.push(part);
    });

    const basePath = `/${fromParts.join('/')}`;
    const candidates = [
      basePath,
      `${basePath}.js`,
      `${basePath}.jsx`,
      `${basePath}.css`,
      `${basePath}.json`,
      `${basePath}/index.js`,
      `${basePath}/index.jsx`
    ];
    const resolved = candidates.find(candidate => knownPaths.has(candidate));
    return resolved || basePath;
  }

  _rewriteReactImports(code, fromPath, knownPaths) {
    const rewrite = (full, prefix, specifier, suffix) => {
      if (!specifier.startsWith('.')) return full;
      const resolved = this._resolveReactImport(fromPath, specifier, knownPaths);
      return `${prefix}virtual:${resolved}${suffix}`;
    };

    return code
      .replace(/(from\s*["'])([^"']+)(["'])/g, rewrite)
      .replace(/(import\s*["'])([^"']+)(["'])/g, rewrite)
      .replace(/(import\s*\(\s*["'])([^"']+)(["']\s*\))/g, rewrite);
  }

  _buildReactPreviewDocument({ htmlShell, importMap, entrySpecifier }) {
    const overlayMarkup = `
  <div id="previewError" class="preview-error"><strong id="previewErrorTitle"></strong><pre id="previewErrorStack"></pre></div>
  <script>
    window.__pdxShowError = function(message, detail) {
      const box = document.getElementById('previewError');
      document.getElementById('previewErrorTitle').textContent = message || 'React preview failed';
      document.getElementById('previewErrorStack').textContent = detail || '';
      box.style.display = 'block';
    };
    window.__pdxClearError = function() {
      const box = document.getElementById('previewError');
      document.getElementById('previewErrorTitle').textContent = '';
      document.getElementById('previewErrorStack').textContent = '';
      box.style.display = 'none';
    };
    window.addEventListener('error', function(event) {
      const error = event.error || {};
      window.__pdxShowError(event.message || error.message || 'Runtime error', error.stack || '');
      window.parent.postMessage({ source: 'paradox-react-preview', type: 'runtime-error', message: event.message || error.message || 'Runtime error' }, '*');
    });
    window.addEventListener('unhandledrejection', function(event) {
      const reason = event.reason || {};
      window.__pdxShowError(reason.message || 'Unhandled promise rejection', reason.stack || String(reason || ''));
      window.parent.postMessage({ source: 'paradox-react-preview', type: 'runtime-error', message: reason.message || 'Unhandled promise rejection' }, '*');
    });
  </script>
  <script type="importmap">${JSON.stringify(importMap, null, 2)}</script>
  <script type="module">
    try {
      window.__pdxClearError();
      await import(${JSON.stringify(entrySpecifier)});
      window.parent.postMessage({ source: 'paradox-react-preview', type: 'ready' }, '*');
    } catch (error) {
      window.__pdxShowError(error.message || 'React preview failed', error.stack || '');
      window.parent.postMessage({ source: 'paradox-react-preview', type: 'runtime-error', message: error.message || 'React preview failed' }, '*');
    }
  </script>`;

    const previewStyles = `
  <style>
    html, body { margin: 0; min-height: 100%; background: #0f1722; color: #dbe7f3; font-family: Inter, system-ui, sans-serif; }
    #root { min-height: 100vh; }
    .preview-error {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 16px;
      display: none;
      padding: 16px;
      border-radius: 12px;
      border: 1px solid rgba(248, 81, 73, 0.45);
      background: rgba(37, 14, 18, 0.96);
      color: #ffd7d5;
      box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
      overflow: auto;
      z-index: 10;
      white-space: pre-wrap;
      max-height: 40vh;
    }
    .preview-error strong { display: block; margin-bottom: 10px; font-size: 14px; }
    .preview-error pre { margin: 0; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; line-height: 1.55; }
  </style>`;

    let html = (htmlShell || '').trim();
    if (!html) {
      html = '<!doctype html><html><head><meta charset="utf-8" /></head><body><div id="root"></div></body></html>';
    }
    if (!/<body[\s>]/i.test(html)) {
      html = `<!doctype html><html><head><meta charset="utf-8" /></head><body>${html}</body></html>`;
    }
    if (!/<div[^>]+id=["']root["']/i.test(html)) {
      html = html.replace(/<\/body>/i, '<div id="root"></div></body>');
    }
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `${previewStyles}</head>`);
    } else {
      html = html.replace(/<body/i, `<head>${previewStyles}</head><body`);
    }
    if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, `${overlayMarkup}</body>`);
    } else {
      html += overlayMarkup;
    }
    return html;
  }

  async refreshReactPreview({ silent = false } = {}) {
    const file = this.activeFile && this.items[this.activeFile];
    const panel = document.getElementById('reactPreviewPanel');
    const frame = document.getElementById('reactPreviewFrame');
    const reactProject = file ? this._getReactProjectRoot(file.id) : null;
    const isSingleReactFile = !!file && this._isReactFile(file);
    if (!file || (!reactProject && !isSingleReactFile) || !panel || !frame) return;

    if (!silent && !this.reactPreviewVisible) {
      this.reactPreviewVisible = true;
      this.saveToStorage();
    }
    this._showReactPreview();
    try {
      await this.ensureBabelLoaded();
    } catch (error) {
      this._setReactPreviewStatus('Missing Babel', 'error');
      this._renderReactPreviewEmpty('Babel failed to load, so React preview is unavailable.', 'error');
      if (!silent) this.addOutput('error', error.message || 'Failed to load Babel Standalone.');
      return;
    }

    this._setReactPreviewStatus('Building…', 'building');
    this._clearReactPreviewBlobs();

    try {
      const fileRecords = reactProject
        ? this._getReactProjectFiles(reactProject.id).map(projectFile => ({
            id: projectFile.id,
            name: projectFile.name,
            path: this._normalizeReactModulePath(this._getItemPath(projectFile.id)),
            lang: projectFile.lang,
            content: this.editor && this.activeFile === projectFile.id ? this.editor.getValue() : (projectFile.content || '')
          }))
        : [{
            id: file.id,
            name: file.name,
            path: this._normalizeReactModulePath(file.name),
            lang: file.lang,
            content: this.editor && this.activeFile === file.id ? this.editor.getValue() : (file.content || '')
          }];

      const fileIdsToClear = fileRecords.map(record => record.id);
      this._clearProblemsForFiles(fileIdsToClear);

      const htmlShell = reactProject
        ? (fileRecords.find(record => /\/public\/index\.html$/i.test(record.path))?.content || '')
        : '';
      const entryRecord = reactProject
        ? fileRecords.find(record => record.id === this._getReactProjectEntryFile(reactProject.id)?.id)
        : fileRecords[0];

      if (!entryRecord) {
        throw new Error('Add a src/index.js, src/index.jsx, src/main.js, or src/main.jsx entry file to run this React project.');
      }

      const knownPaths = new Set(fileRecords.map(record => record.path));
      const importMap = {
        imports: {
          react: 'https://esm.sh/react@18',
          'react-dom/client': 'https://esm.sh/react-dom@18/client',
          'react/jsx-runtime': 'https://esm.sh/react@18/jsx-runtime',
          'react/jsx-dev-runtime': 'https://esm.sh/react@18/jsx-dev-runtime'
        }
      };

      fileRecords
        .filter(record => record.lang === 'css')
        .forEach(record => {
          const styleModule = `const css = ${JSON.stringify(record.content)};
const style = document.createElement('style');
style.setAttribute('data-pdx-style', ${JSON.stringify(record.path)});
style.textContent = css;
document.head.appendChild(style);
export default css;
`;
          const cssUrl = URL.createObjectURL(new Blob([styleModule], { type: 'text/javascript' }));
          this.reactPreviewBlobUrls.push(cssUrl);
          importMap.imports[`virtual:${record.path}`] = cssUrl;
        });

      fileRecords
        .filter(record => record.lang === 'json')
        .forEach(record => {
          const jsonModule = `export default ${record.content.trim() || '{}'};`;
          const jsonUrl = URL.createObjectURL(new Blob([jsonModule], { type: 'text/javascript' }));
          this.reactPreviewBlobUrls.push(jsonUrl);
          importMap.imports[`virtual:${record.path}`] = jsonUrl;
        });

      fileRecords
        .filter(record => this._nameHasExt(record.name, '.js') || this._nameHasExt(record.name, '.jsx'))
        .forEach(record => {
          let transpiled;
          try {
            transpiled = window.Babel.transform(record.content, {
              filename: record.path,
              sourceType: 'module',
              retainLines: true,
              presets: [['react', { runtime: 'automatic' }]],
            }).code;
          } catch (error) {
            const compileProblem = this.getReactProblem(error, record.id);
            this.setProblems(record.id, [compileProblem], { switchToProblems: !silent, reveal: !silent });
            this._setReactPreviewStatus('Build error', 'error');
            this._renderReactPreviewEmpty(compileProblem.message, 'error');
            if (!silent) this.addOutput('error', compileProblem.message, compileProblem.line);
            throw error;
          }

          const rewritten = this._rewriteReactImports(transpiled, record.path, knownPaths);
          const moduleUrl = URL.createObjectURL(new Blob([rewritten], { type: 'text/javascript' }));
          this.reactPreviewBlobUrls.push(moduleUrl);
          importMap.imports[`virtual:${record.path}`] = moduleUrl;
        });

      if (!importMap.imports[`virtual:${entryRecord.path}`]) {
        throw new Error(`React entry file "${entryRecord.name}" could not be prepared for preview.`);
      }

      if (!reactProject) {
        const singleFileCode = fileRecords[0].content;
        const hasOwnMount = /\bcreateRoot\s*\(|ReactDOM\.render\s*\(/.test(singleFileCode);
        if (!hasOwnMount) {
          const bootstrapCode = `
import React from 'react';
import { createRoot } from 'react-dom/client';
const UserModule = await import(${JSON.stringify(`virtual:${entryRecord.path}`)});
const Component = UserModule.default || UserModule.App;
if (!Component) {
  throw new Error('Export a default React component or call createRoot(...) yourself.');
}
createRoot(document.getElementById('root')).render(React.createElement(Component));
`;
          const bootstrapUrl = URL.createObjectURL(new Blob([bootstrapCode], { type: 'text/javascript' }));
          this.reactPreviewBlobUrls.push(bootstrapUrl);
          importMap.imports[`virtual:/__pdx_bootstrap__.js`] = bootstrapUrl;
          frame.srcdoc = this._buildReactPreviewDocument({
            htmlShell: '',
            importMap,
            entrySpecifier: 'virtual:/__pdx_bootstrap__.js'
          });
        } else {
          frame.srcdoc = this._buildReactPreviewDocument({
            htmlShell: '',
            importMap,
            entrySpecifier: `virtual:${entryRecord.path}`
          });
        }
      } else {
        frame.srcdoc = this._buildReactPreviewDocument({
          htmlShell,
          importMap,
          entrySpecifier: `virtual:${entryRecord.path}`
        });
      }

      this._showReactPreviewFrame();
      if (!silent) {
        const label = reactProject ? reactProject.name : file.name;
        this.addOutput('log', `[React] Preview refreshed for ${label}`);
      }
    } catch (error) {
      const message = error?.message || 'React preview failed';
      this._setReactPreviewStatus('Build error', 'error');
      if (!document.getElementById('reactPreviewEmpty') || document.getElementById('reactPreviewEmpty').style.display === 'none') {
        this._renderReactPreviewEmpty(message, 'error');
      }
      if (!silent && !/unknown:\s*/i.test(String(message))) {
        this.addOutput('error', message);
      }
    }
  }

  _syncRunControls() {
    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    const runStatus = document.getElementById('runStatus');
    if (!runBtn || !stopBtn || !runStatus) return;

    const active = this.activeFile && this.items[this.activeFile];
    const isDbFile = this._isDbFile(active);

    // Keep Run visible for DB files, and restore controls when not running.
    if (isDbFile || !this.isRunning) {
      stopBtn.classList.add('hidden');
      runStatus.classList.add('hidden');
      runBtn.classList.remove('hidden');
    }

    this.updatePracticeButtons();
  }

  switchPanel(id) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === id));
    document.querySelectorAll('.panel-view').forEach(v => v.classList.toggle('active', v.id === `${id}-container`));
    if (id === 'terminal' && this.fitAddon) this.fitAddon.fit();
  }

  getActiveProblems() {
    return (this.activeFile && this.problemsByFile[this.activeFile]) ? this.problemsByFile[this.activeFile] : [];
  }

  clearProblems(fileId = this.activeFile) {
    if (!fileId) return;
    delete this.problemsByFile[fileId];
    if (this.models[fileId] && window.monaco) {
      monaco.editor.setModelMarkers(this.models[fileId], this.problemOwner, []);
    }
    if (fileId === this.activeFile) {
      this.renderProblems();
      this.updateStatusBar();
    }
  }

  setProblems(fileId, problems = [], options = {}) {
    if (!fileId || !this.models[fileId] || !window.monaco) return;

    const normalized = (problems || []).map(problem => ({
      severity: problem.severity || 'error',
      source: problem.source || 'Runtime',
      message: problem.message || 'Unknown error',
      rawMessage: problem.rawMessage || problem.message || 'Unknown error',
      line: Math.max(1, problem.line || 1),
      column: Math.max(1, problem.column || 1),
      endLine: Math.max(1, problem.endLine || problem.line || 1),
      endColumn: Math.max(1, problem.endColumn || ((problem.column || 1) + 1)),
      hint: problem.hint || '',
    }));

    this.problemsByFile[fileId] = normalized;
    monaco.editor.setModelMarkers(
      this.models[fileId],
      this.problemOwner,
      normalized.map(problem => ({
        severity: problem.severity === 'warning'
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Error,
        message: problem.hint ? `${problem.message}\nHint: ${problem.hint}` : problem.message,
        source: problem.source,
        startLineNumber: problem.line,
        startColumn: problem.column,
        endLineNumber: problem.endLine,
        endColumn: problem.endColumn
      }))
    );

    if (fileId === this.activeFile) {
      this.renderProblems();
      this.updateStatusBar();
      if (normalized.length && options.switchToProblems !== false) this.switchPanel('problems');
      if (normalized.length && options.reveal !== false) this.revealProblem(normalized[0]);
    }
  }

  renderProblems() {
    const container = document.getElementById('problems-container');
    const list = document.getElementById('problemsList');
    const badge = document.getElementById('problemsTabCount');
    if (!container || !list || !badge) return;

    const problems = this.getActiveProblems();
    badge.textContent = String(problems.length);
    badge.classList.toggle('hidden', problems.length === 0);
    list.innerHTML = '';

    if (!problems.length) {
      const empty = document.createElement('div');
      empty.className = 'problems-empty';
      empty.textContent = 'No problems in the active file';
      list.appendChild(empty);
      return;
    }

    const model = this.activeFile ? this.models[this.activeFile] : null;
    problems.forEach(problem => {
      const row = document.createElement('button');
      row.className = `problem-entry ${problem.severity}`;
      const lineText = model ? model.getLineContent(problem.line).trim() : '';
      row.innerHTML = `
        <span class="problem-icon">${problem.severity === 'warning' ? '!' : '×'}</span>
        <div class="problem-main">
          <div class="problem-message">${this._escapeHtml(problem.message)}</div>
          <div class="problem-meta">${this._escapeHtml(problem.source)} • Ln ${problem.line}, Col ${problem.column}</div>
          ${lineText ? `<div class="problem-snippet">${this._escapeHtml(lineText)}</div>` : ''}
        </div>
      `;
      row.addEventListener('click', () => this.revealProblem(problem));
      list.appendChild(row);
    });
  }

  revealProblem(problem) {
    if (!problem || !this.editor) return;
    this.editor.revealPositionInCenter({ lineNumber: problem.line, column: problem.column });
    this.editor.setPosition({ lineNumber: problem.line, column: problem.column });
    this.editor.focus();
  }

  updateStatusBar() {
    const statusLang = document.getElementById('statusLang');
    if (!statusLang) return;
    const item = this.activeFile && this.items[this.activeFile];
    if (!item) {
      statusLang.textContent = 'No file';
      return;
    }
    const inReactProject = this._isReactProjectFile(item.id);
    const language = this._isMongoFile(item)
      ? 'MongoDB'
      : inReactProject
        ? this._nameHasExt(item.name, '.css')
          ? 'React CSS'
          : this._nameHasExt(item.name, '.html')
            ? 'React HTML'
            : this._nameHasExt(item.name, '.json')
              ? 'React JSON'
              : 'React'
        : this._isReactFile(item)
          ? 'React'
          : item.lang === 'python'
            ? 'Python'
            : item.lang === 'sql'
              ? 'SQL'
              : item.lang === 'html'
                ? 'HTML'
                : item.lang === 'css'
                  ? 'CSS'
                  : item.lang === 'json'
                    ? 'JSON'
                    : 'JavaScript';
    const problemCount = this.getActiveProblems().length;
    const suffix = problemCount ? ` | ${problemCount} problem${problemCount === 1 ? '' : 's'}` : '';
    statusLang.textContent = `${language}${suffix}`;
  }

  showMemoryView(openPanel = true) {
    const container = document.getElementById('memoryView');
    const modal = document.getElementById('memoryModal');
    const file = this.activeFile && this.items[this.activeFile];
    const shouldFitScene = openPanel || !!modal?.classList.contains('hidden');
    if (!container || !file || file.type !== 'file' || !this.editor) {
      if (container) container.innerHTML = '<div class="memory-empty">Open a JavaScript or Python file to see a conceptual memory map.</div>';
      if (openPanel && modal) modal.classList.remove('hidden');
      return;
    }

    const analysis = this.buildMemoryAnalysis(file, this.editor.getValue());
    container.innerHTML = this.renderMemoryAnalysisHtml(analysis);
    if (openPanel && modal) modal.classList.remove('hidden');
    this.bindMemoryViewInteractions();
    // Double-RAF: first frame makes the modal visible + computes layout,
    // second frame reads stable getBoundingClientRect for arrow positions.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (shouldFitScene) this.fitMemoryViewport();
      else this.applyMemoryTransform();
      this.drawMemoryArrows();
    }));
  }

  closeMemoryView() {
    const modal = document.getElementById('memoryModal');
    if (modal) modal.classList.add('hidden');
  }

  buildMemoryAnalysis(file, code) {
    if (this._isSqlFile(file)) {
      return {
        model: 'sql',
        title: 'SQL Memory View',
        subtitle: 'SQL is declarative, so this panel does not model it with stack and heap frames.',
        frameLabel: 'Execution Context',
        heapLabel: 'Persistent Data',
        frameItems: [],
        heapItems: [],
        notes: [
          'Use the DB visualizer for tables and row state. Stack vs heap is more useful for JavaScript and Python code execution.'
        ]
      };
    }

    if (file.lang === 'python') return this.buildPythonMemoryAnalysis(code);
    return this.buildJavaScriptMemoryAnalysis(code, this._isMongoFile(file) ? 'MongoDB Shell Memory View' : 'JavaScript Memory View');
  }

  buildJavaScriptMemoryAnalysis(code, title = 'JavaScript Memory View') {
    const frameItems = [];
    const heapItems = [];
    const bindingTargets = {};
    const lines = code.split('\n');
    let heapCounter = 1;
    let braceDepth = 0;

    const addHeap = (kind, preview, note, line) => {
      const id = `H${heapCounter++}`;
      heapItems.push({ id, kind, preview, note, line });
      return id;
    };

    lines.forEach((rawLine, index) => {
      const lineNumber = index + 1;
      const line = rawLine.trim();
      const depthBefore = braceDepth;

      if (!line || line.startsWith('//')) {
        braceDepth += (rawLine.match(/\{/g) || []).length - (rawLine.match(/\}/g) || []).length;
        return;
      }

      if (depthBefore === 0) {
        const fnMatch = rawLine.match(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
        const classMatch = rawLine.match(/^\s*class\s+([A-Za-z_$][\w$]*)\b/);
        const declMatch = rawLine.match(/^\s*(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*;?\s*$/);

        if (fnMatch) {
          const name = fnMatch[1];
          const params = fnMatch[2].trim();
          const heapId = addHeap('function', `function ${name}(${params})`, 'Functions are heap objects. Calling one creates a new stack frame for params and locals.', lineNumber);
          bindingTargets[name] = heapId;
          frameItems.push({
            name,
            storage: 'stack -> heap ref',
            kind: 'function binding',
            preview: heapId,
            note: `Global binding points to ${heapId}.`,
            line: lineNumber,
            target: heapId
          });
        } else if (classMatch) {
          const name = classMatch[1];
          const heapId = addHeap('class', `class ${name}`, 'Class definitions are heap objects. Instances created with new live on the heap too.', lineNumber);
          bindingTargets[name] = heapId;
          frameItems.push({
            name,
            storage: 'stack -> heap ref',
            kind: 'class binding',
            preview: heapId,
            note: `Global binding points to ${heapId}.`,
            line: lineNumber,
            target: heapId
          });
        } else if (declMatch) {
          const name = declMatch[2];
          const expr = declMatch[3].replace(/;$/, '').trim();
          const binding = this.classifyJavaScriptBinding(expr, lineNumber, bindingTargets, addHeap);
          if (binding.heapId) bindingTargets[name] = binding.heapId;
          frameItems.push({
            name,
            storage: binding.storage,
            kind: binding.kind,
            preview: binding.preview,
            note: binding.note,
            line: lineNumber,
            target: binding.target || binding.heapId || ''
          });
        }
      }

      braceDepth += (rawLine.match(/\{/g) || []).length - (rawLine.match(/\}/g) || []).length;
    });

    return {
      model: this._isMongoFile(this.items[this.activeFile] || {}) ? 'mongodb' : 'javascript',
      title,
      subtitle: 'Conceptual view: primitive values are shown as stack-like bindings, while objects, arrays, classes, and functions live on the heap with references from the current frame.',
      frameLabel: 'Current Frame / Stack',
      heapLabel: 'Heap Objects',
      frameItems,
      heapItems,
      notes: [
        'This is a teaching model, not the JavaScript engine\'s real allocator.',
        'Calling a function creates a new call-stack frame for its parameters and local bindings.',
        'Objects, arrays, functions, and class instances are shown as heap allocations referenced by bindings.'
      ]
    };
  }

  classifyJavaScriptBinding(expr, lineNumber, bindingTargets, addHeap) {
    const value = expr.trim();
    if (/^[-+]?\d+(\.\d+)?$/.test(value) || /^(true|false|null|undefined|NaN)$/.test(value) || /^(['"`]).*\1$/.test(value)) {
      return {
        storage: 'stack value',
        kind: 'primitive',
        preview: this.compactMemoryPreview(value),
        note: 'Shown as a direct value in the current frame.'
      };
    }

    if (/^\[/.test(value)) {
      const heapId = addHeap('array', this.compactMemoryPreview(value), 'Arrays are heap objects. The binding stores a reference.', lineNumber);
      return { storage: 'stack -> heap ref', kind: 'array', preview: heapId, note: 'Binding points to a heap array.', heapId };
    }

    if (/^\{/.test(value)) {
      const heapId = addHeap('object', this.compactMemoryPreview(value), 'Objects live on the heap and bindings point to them.', lineNumber);
      return { storage: 'stack -> heap ref', kind: 'object', preview: heapId, note: 'Binding points to a heap object.', heapId };
    }

    if (/^(function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.test(value)) {
      const heapId = addHeap('function', this.compactMemoryPreview(value), 'Function values are heap objects.', lineNumber);
      return { storage: 'stack -> heap ref', kind: 'function value', preview: heapId, note: 'Binding points to a heap function.', heapId };
    }

    const newMatch = value.match(/^new\s+([A-Za-z_$][\w$]*)/);
    if (newMatch) {
      const heapId = addHeap(`instance of ${newMatch[1]}`, this.compactMemoryPreview(value), 'Instances created with new are shown as heap allocations.', lineNumber);
      return { storage: 'stack -> heap ref', kind: 'instance', preview: heapId, note: 'Binding points to a heap instance.', heapId };
    }

    if (/^[A-Za-z_$][\w$]*$/.test(value) && bindingTargets[value]) {
      return {
        storage: 'shared heap ref',
        kind: 'alias',
        preview: bindingTargets[value],
        note: `${value} already points to ${bindingTargets[value]}, so this binding shares that reference.`,
        heapId: bindingTargets[value],
        target: bindingTargets[value]
      };
    }

    return {
      storage: 'runtime result',
      kind: 'computed value',
      preview: this.compactMemoryPreview(value),
      note: 'This value is created when the code runs, so the exact memory shape depends on runtime execution.'
    };
  }

  buildPythonMemoryAnalysis(code) {
    const frameItems = [];
    const heapItems = [];
    const bindingTargets = {};
    const lines = code.split('\n');
    let heapCounter = 1;

    // Caches for Python's interning behaviour
    const smallIntCache  = new Map(); // int value string → heapId  (−5…256)
    const singletonCache = new Map(); // 'True'/'False'/'None' → heapId
    const internedStrCache = new Map(); // short identifier-like strings → heapId

    const addHeap = (kind, preview, note, line) => {
      const id = `P${heapCounter++}`;
      heapItems.push({ id, kind, preview, note, line });
      return id;
    };

    lines.forEach((rawLine, index) => {
      const lineNumber = index + 1;
      // Strip inline comment before any matching so "c = a  # comment" works correctly
      const codeLine = this._stripPythonInlineComment(rawLine);
      const trimmed = codeLine.trim();
      const indent = rawLine.match(/^\s*/)?.[0].length || 0;
      if (!trimmed || trimmed.startsWith('#') || indent > 0) return;

      const fnMatch = codeLine.match(/^\s*def\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)\s*:/);
      const classMatch = codeLine.match(/^\s*class\s+([A-Za-z_][\w]*)\b.*:/);
      const assignMatch = codeLine.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.+?)\s*$/);

      if (fnMatch) {
        const name = fnMatch[1];
        const params = fnMatch[2].trim();
        const heapId = addHeap('function object', `def ${name}(${params})`, 'In Python, function definitions create function objects on the heap and names point to them.', lineNumber);
        bindingTargets[name] = heapId;
        frameItems.push({
          name,
          storage: 'frame -> heap ref',
          kind: 'function name',
          preview: heapId,
          note: `The name ${name} points to function object ${heapId}.`,
          line: lineNumber,
          target: heapId
        });
      } else if (classMatch) {
        const name = classMatch[1];
        const heapId = addHeap('class object', `class ${name}`, 'Class definitions create class objects on the heap.', lineNumber);
        bindingTargets[name] = heapId;
        frameItems.push({
          name,
          storage: 'frame -> heap ref',
          kind: 'class name',
          preview: heapId,
          note: `The name ${name} points to class object ${heapId}.`,
          line: lineNumber,
          target: heapId
        });
      } else if (assignMatch) {
        const name = assignMatch[1];
        const expr = assignMatch[2].trim();
        const binding = this.classifyPythonBinding(expr, lineNumber, bindingTargets, addHeap, smallIntCache, singletonCache, internedStrCache);
        if (binding.heapId) bindingTargets[name] = binding.heapId;
        frameItems.push({
          name,
          storage: 'frame -> heap ref',
          kind: binding.kind,
          preview: binding.preview,
          note: binding.note,
          line: lineNumber,
          target: binding.target || binding.heapId || ''
        });
      }
    });

    return {
      model: 'python',
      title: 'Python Memory View',
      subtitle: 'Conceptual view: Python names live in a frame and point to heap objects. Lists, dicts, functions, strings, and numbers are all objects.',
      frameLabel: 'Current Frame',
      heapLabel: 'Heap Objects',
      frameItems,
      heapItems,
      notes: [
        'This is a conceptual Python memory model, not a CPython debugger.',
        'Frames hold names and references. Most values you write in Python are objects on the heap.',
        'Calling a function creates a new frame with parameter names pointing to objects.'
      ]
    };
  }

  classifyPythonBinding(expr, lineNumber, bindingTargets, addHeap, smallIntCache, singletonCache, internedStrCache) {
    const value = expr.trim();

    // ── 1. Alias: bare name that is already a known binding (c = a)
    if (/^[A-Za-z_][\w]*$/.test(value) && bindingTargets[value]) {
      const existingId = bindingTargets[value];
      return {
        kind: 'alias',
        preview: existingId,
        note: `"${value}" is already bound — no new allocation. This name points to the same object (${existingId}).`,
        heapId: existingId,
        target: existingId
      };
    }

    // ── 2. Singletons: True, False, None — only ONE object each in all of Python
    if (/^(True|False|None)$/.test(value)) {
      if (singletonCache?.has(value)) {
        const existingId = singletonCache.get(value);
        return { kind: 'singleton', preview: existingId, note: `${value} is a Python singleton. Every reference to ${value} in the program shares this one object.`, heapId: existingId, target: existingId };
      }
      const heapId = addHeap('singleton', value, `Python has exactly ONE ${value} object. All variables set to ${value} point here.`, lineNumber);
      singletonCache?.set(value, heapId);
      return { kind: 'singleton', preview: heapId, note: `${value} is a singleton. No copy is made.`, heapId };
    }

    // ── 3. Small integer caching: CPython caches −5 … 256
    if (/^-?\d+$/.test(value) && !/\./.test(value)) {
      const num = parseInt(value, 10);
      if (num >= -5 && num <= 256) {
        if (smallIntCache?.has(value)) {
          const existingId = smallIntCache.get(value);
          return { kind: 'cached int', preview: existingId, note: `CPython caches small integers (−5…256). The value ${value} is always the same object — no new allocation.`, heapId: existingId, target: existingId };
        }
        const heapId = addHeap('number object', value, `Small integer ${value} is cached by CPython. Any variable assigned ${value} shares this single object.`, lineNumber);
        smallIntCache?.set(value, heapId);
        return { kind: 'number object', preview: heapId, note: `Cached int ${value} — next variable assigned ${value} will reuse ${heapId}.`, heapId };
      }
      // Large integer — always a new object
      const heapId = addHeap('number object', value, `Large integers (outside −5…256) are NOT cached — each is a distinct object on the heap.`, lineNumber);
      return { kind: 'number object', preview: heapId, note: `Large int — new object ${heapId} allocated.`, heapId };
    }

    // ── 4. Float
    if (/^-?\d+\.\d*$/.test(value)) {
      const heapId = addHeap('float object', value, 'Floats are not cached — each float literal creates a new object on the heap.', lineNumber);
      return { kind: 'float object', preview: heapId, note: `Float — new object ${heapId}.`, heapId };
    }

    // ── 5. Interned strings: short strings that look like identifiers are interned by CPython
    const strMatch = value.match(/^(['"])(.*)\1$/);
    if (strMatch) {
      const strContent = strMatch[2];
      const isInterned = /^[A-Za-z_][\w]*$/.test(strContent) && strContent.length <= 20;
      if (isInterned && internedStrCache?.has(strContent)) {
        const existingId = internedStrCache.get(strContent);
        return { kind: 'interned str', preview: existingId, note: `The string "${strContent}" is interned by CPython — reusing the same object (${existingId}).`, heapId: existingId, target: existingId };
      }
      const heapId = addHeap('string object', this.compactMemoryPreview(value), isInterned ? `Short identifier-like strings are interned by CPython — all uses of "${strContent}" share this object.` : 'Non-interned string — new object each time.', lineNumber);
      if (isInterned) internedStrCache?.set(strContent, heapId);
      return { kind: 'string object', preview: heapId, note: `String → ${heapId}${isInterned ? ' (interned)' : ''}.`, heapId };
    }

    // ── 6. Containers and other — always new objects
    const pyKind = /^\[/.test(value)       ? 'list object'
                 : /^\{[^}]*:/.test(value)  ? 'dict object'
                 : /^\{/.test(value)        ? 'set object'
                 : /^\(/.test(value)        ? 'tuple object'
                 : /^[A-Za-z_][\w]*\s*\(/.test(value) ? 'runtime object'
                 : 'object';

    const heapId = addHeap(pyKind, this.compactMemoryPreview(value), `New ${pyKind} created on the heap.`, lineNumber);
    return { kind: pyKind, preview: heapId, note: `New object ${heapId} on the heap.`, heapId };
  }

  // Strip Python inline comment without breaking string literals
  _stripPythonInlineComment(line) {
    let inStr = false, strChar = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (!inStr && (c === '"' || c === "'")) { inStr = true; strChar = c; }
      else if (inStr && c === strChar && line[i - 1] !== '\\') { inStr = false; }
      else if (!inStr && c === '#') return line.slice(0, i).trimEnd();
    }
    return line;
  }

  compactMemoryPreview(value, max = 72) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max - 3) + '...' : text;
  }

  renderMemoryAnalysisHtml(analysis) {
    const frameItems = analysis.frameItems.length
      ? analysis.frameItems.map(item => `
          <div class="memory-item">
            <div class="memory-item-main">
              <div class="memory-item-name">${this._escapeHtml(item.name)}</div>
              <div class="memory-item-meta">${this._escapeHtml(item.kind)} • line ${item.line}</div>
              <div class="memory-item-value">${this._escapeHtml(item.preview)}</div>
              <div class="memory-item-note">${this._escapeHtml(item.note)}</div>
            </div>
            <span class="memory-item-tag">${this._escapeHtml(item.storage)}</span>
          </div>
        `).join('')
      : '<div class="memory-empty">No top-level bindings were detected yet.</div>';

    const heapItems = analysis.heapItems.length
      ? analysis.heapItems.map(item => `
          <div class="memory-item">
            <div class="memory-item-main">
              <div class="memory-item-name">${this._escapeHtml(item.id)}</div>
              <div class="memory-item-meta">${this._escapeHtml(item.kind)} • line ${item.line}</div>
              <div class="memory-item-value">${this._escapeHtml(item.preview)}</div>
              <div class="memory-item-note">${this._escapeHtml(item.note)}</div>
            </div>
            <span class="memory-item-tag">${this._escapeHtml(item.kind)}</span>
          </div>
        `).join('')
      : '<div class="memory-empty">No heap-style allocations were detected yet.</div>';

    const notes = (analysis.notes || []).map(note => `<li>${this._escapeHtml(note)}</li>`).join('');

    return `
      <div class="memory-header">
        <div class="memory-title">${this._escapeHtml(analysis.title)}</div>
        <div class="memory-subtitle">${this._escapeHtml(analysis.subtitle)}</div>
      </div>
      <div class="memory-grid">
        <div class="memory-column">
          <div class="memory-panel-card">
            <div class="memory-panel-head">
              <span class="memory-panel-title">Current Frame / Stack</span>
              <span class="memory-panel-badge stack">Stack</span>
            </div>
            <div class="memory-list">${frameItems}</div>
          </div>
        </div>
        <div class="memory-column">
          <div class="memory-panel-card">
            <div class="memory-panel-head">
              <span class="memory-panel-title">Heap Objects</span>
              <span class="memory-panel-badge heap">Heap</span>
            </div>
            <div class="memory-list">${heapItems}</div>
          </div>
        </div>
      </div>
      <div class="memory-notes">
        <div class="memory-notes-title">Notes</div>
        <ol class="memory-notes-list">${notes}</ol>
      </div>
    `;
  }

  memoryDomId(prefix, value) {
    const safeValue = String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${prefix}-${safeValue || 'node'}`;
  }

  renderMemoryAnalysisHtml(analysis) {
    const modelLabel = analysis.model === 'python'
      ? 'Python Reference Model'
      : analysis.model === 'sql'
        ? 'SQL Execution Model'
        : analysis.model === 'mongodb'
          ? 'Mongo Shell Model'
          : 'JavaScript Reference Model';

    const frameRows = analysis.frameItems.length
      ? analysis.frameItems.map(item => {
          const cardId = this.memoryDomId('memory-frame', `${item.name}-${item.line}`);
          const linkId = item.target || cardId;
          const isRef = !!item.target;
          return `
            <div
              id="${cardId}"
              class="memory-node-card memory-binding-card mem-frame-row"
              data-node-id="${cardId}"
              data-link-id="${this._escapeHtml(linkId)}"
              ${item.target ? `data-target="${this._escapeHtml(item.target)}"` : ''}
              data-line="${item.line}"
            >
              <div class="mem-cell mem-cell-name">${this._escapeHtml(item.name)}</div>
              <div class="mem-cell mem-cell-val${isRef ? ' is-ref' : ''}">${isRef ? `\u2192 ${this._escapeHtml(item.preview)}` : this._escapeHtml(item.preview)}</div>
            </div>
          `;
        }).join('')
      : '<div class="mem-empty-row">No bindings detected.</div>';

    const heapItems = analysis.heapItems.length
      ? analysis.heapItems.map(item => `
          <div
            id="${this.memoryDomId('memory-heap', item.id)}"
            class="memory-node-card memory-heap-card mem-heap-block"
            data-node-id="${this._escapeHtml(item.id)}"
            data-link-id="${this._escapeHtml(item.id)}"
            data-line="${item.line}"
          >
            <div class="mem-block-head">
              <span class="mem-block-id">${this._escapeHtml(item.id)}</span>
              <span class="mem-block-kind">${this._escapeHtml(item.kind)}</span>
            </div>
            <div class="mem-block-body">${this._escapeHtml(item.preview)}</div>
          </div>
        `).join('')
      : '<div class="mem-empty-row">No heap objects detected.</div>';

    return `
      <div class="memory-toolbar">
        <div class="memory-toolbar-group">
          <span class="memory-model-chip">${this._escapeHtml(modelLabel)}</span>
          <span class="memory-model-chip subtle">${analysis.frameItems.length} bindings</span>
          <span class="memory-model-chip subtle">${analysis.heapItems.length} heap objects</span>
        </div>
        <div class="memory-toolbar-group">
          <button id="memoryZoomOut" type="button" class="btn-ghost memory-control-btn" title="Zoom out">-</button>
          <button id="memoryZoomReset" type="button" class="btn-ghost memory-control-btn memory-control-value" title="Reset zoom">100%</button>
          <button id="memoryZoomIn" type="button" class="btn-ghost memory-control-btn" title="Zoom in">+</button>
          <button id="memoryZoomFit" type="button" class="btn-ghost memory-control-btn" title="Fit scene">Fit</button>
        </div>
      </div>
      <div id="memoryViewport" class="memory-viewport">
        <div id="memoryScene" class="memory-scene memory-scene-${this._escapeHtml(analysis.model || 'javascript')}">
          <svg id="memoryArrows" class="memory-arrows" aria-hidden="true"></svg>
          <div class="memory-scene-grid">
            <section class="memory-lane memory-lane-stack">
              <div class="memory-lane-head">
                <span class="memory-lane-title">${this._escapeHtml(analysis.frameLabel || 'Stack Frame')}</span>
                <span class="memory-lane-badge stack">FRAME</span>
              </div>
              <div class="memory-lane-content">
                <div class="mem-frame-block">${frameRows}</div>
              </div>
            </section>
            <section class="memory-lane memory-lane-heap">
              <div class="memory-lane-head">
                <span class="memory-lane-title">${this._escapeHtml(analysis.heapLabel || 'Heap')}</span>
                <span class="memory-lane-badge heap">HEAP</span>
              </div>
              <div class="memory-lane-content">${heapItems}</div>
            </section>
          </div>
        </div>
      </div>
    `;
  }

  bindMemoryViewInteractions() {
    const viewport = document.getElementById('memoryViewport');
    const scene = document.getElementById('memoryScene');
    if (!viewport || !scene) return;

    const applyView = () => {
      this.applyMemoryTransform();
      const zoomLabel = document.getElementById('memoryZoomReset');
      if (zoomLabel) zoomLabel.textContent = `${Math.round(this.memoryZoom * 100)}%`;
    };

    document.getElementById('memoryZoomIn')?.addEventListener('click', () => {
      this.memoryZoom = Math.min(2.4, +(this.memoryZoom + 0.15).toFixed(2));
      applyView();
    });

    document.getElementById('memoryZoomOut')?.addEventListener('click', () => {
      this.memoryZoom = Math.max(0.55, +(this.memoryZoom - 0.15).toFixed(2));
      applyView();
    });

    document.getElementById('memoryZoomReset')?.addEventListener('click', () => {
      this.memoryZoom = 1;
      this.memoryOffsetX = 0;
      this.memoryOffsetY = 0;
      applyView();
    });

    document.getElementById('memoryZoomFit')?.addEventListener('click', () => {
      this.fitMemoryViewport();
      this.drawMemoryArrows();
    });

    viewport.addEventListener('wheel', (event) => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.08 : -0.08;
      this.memoryZoom = Math.max(0.55, Math.min(2.4, +(this.memoryZoom + delta).toFixed(2)));
      applyView();
    }, { passive: false });

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    viewport.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('.memory-node-card, .memory-control-btn, .memory-reference-item')) return;
      isDragging = true;
      startX = event.clientX;
      startY = event.clientY;
      originX = this.memoryOffsetX;
      originY = this.memoryOffsetY;
      viewport.classList.add('is-dragging');
      viewport.setPointerCapture(event.pointerId);
    });

    viewport.addEventListener('pointermove', (event) => {
      if (!isDragging) return;
      this.memoryOffsetX = originX + (event.clientX - startX);
      this.memoryOffsetY = originY + (event.clientY - startY);
      applyView();
    });

    const endDrag = (event) => {
      if (!isDragging) return;
      isDragging = false;
      viewport.classList.remove('is-dragging');
      if (event?.pointerId != null && viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }
    };

    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('pointerleave', endDrag);

    scene.querySelectorAll('.memory-node-card[data-line]').forEach(node => {
      node.addEventListener('click', () => {
        const line = Number(node.dataset.line || 0);
        if (!line || !this.editor) return;
        this.editor.revealLineInCenter(line);
        this.editor.setPosition({ lineNumber: line, column: 1 });
        this.editor.focus();
      });
    });

    const setLinkedState = (linkId, active) => {
      scene.querySelectorAll('[data-link-id]').forEach(node => {
        node.classList.toggle('is-linked', active && node.dataset.linkId === linkId);
      });
      scene.querySelectorAll('.memory-arrow, .memory-arrow-dot').forEach(path => {
        path.classList.toggle('is-linked', active && path.dataset.link === linkId);
      });
    };

    scene.querySelectorAll('.memory-node-card').forEach(node => {
      const linkId = node.dataset.target || node.dataset.nodeId || node.dataset.linkId;
      if (!linkId) return;
      node.addEventListener('mouseenter', () => setLinkedState(linkId, true));
      node.addEventListener('mouseleave', () => setLinkedState(linkId, false));
    });

    applyView();
  }

  fitMemoryViewport() {
    const viewport = document.getElementById('memoryViewport');
    const scene = document.getElementById('memoryScene');
    if (!viewport || !scene) return;

    const padding = 42;
    const sceneWidth = Math.max(scene.offsetWidth, 720);
    const sceneHeight = Math.max(scene.offsetHeight, 420);
    const maxZoomX = (viewport.clientWidth - padding * 2) / sceneWidth;
    const maxZoomY = (viewport.clientHeight - padding * 2) / sceneHeight;
    this.memoryZoom = Math.max(0.55, Math.min(1.05, +(Math.min(maxZoomX, maxZoomY, 1).toFixed(2))));
    this.memoryOffsetX = Math.round((viewport.clientWidth - sceneWidth * this.memoryZoom) / 2);
    this.memoryOffsetY = Math.round((viewport.clientHeight - sceneHeight * this.memoryZoom) / 2);
    this.applyMemoryTransform();
  }

  applyMemoryTransform() {
    const scene = document.getElementById('memoryScene');
    const zoomLabel = document.getElementById('memoryZoomReset');
    if (scene) scene.style.transform = `translate(${this.memoryOffsetX}px, ${this.memoryOffsetY}px) scale(${this.memoryZoom})`;
    if (zoomLabel) zoomLabel.textContent = `${Math.round(this.memoryZoom * 100)}%`;
  }

  drawMemoryArrows() {
    const scene = document.getElementById('memoryScene');
    const svg = document.getElementById('memoryArrows');
    if (!scene || !svg) return;

    const sceneRect = scene.getBoundingClientRect();
    if (!sceneRect.width || !sceneRect.height) return;

    const zoom = this.memoryZoom || 1;
    const width = Math.max(scene.offsetWidth, 720);
    const height = Math.max(scene.offsetHeight, 420);

    let markup = `
      <defs>
        <marker id="memoryArrowHead" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
          <path d="M 0 1 L 8 4.5 L 0 8 z" fill="#60a5fa"></path>
        </marker>
        <marker id="memoryArrowHeadLinked" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
          <path d="M 0 1 L 8 4.5 L 0 8 z" fill="#93c5fd"></path>
        </marker>
      </defs>
    `;

    const targetGroups = new Map();
    scene.querySelectorAll('.memory-binding-card[data-target]').forEach(node => {
      const targetId = node.dataset.target;
      if (!targetGroups.has(targetId)) targetGroups.set(targetId, []);
      targetGroups.get(targetId).push(node);
    });

    // Stagger trunk X positions across the gap so overlapping arrows remain readable
    const gapCenterX = width * 0.505;
    const trunkStep = 16;
    const totalGroups = targetGroups.size;

    Array.from(targetGroups.entries()).forEach(([targetId, nodes], groupIndex) => {
      const target = scene.querySelector(`.memory-heap-card[data-node-id="${targetId}"]`);
      if (!target) return;

      const targetRect = target.getBoundingClientRect();
      const targetX = (targetRect.left - sceneRect.left) / zoom;
      const targetY = ((targetRect.top + targetRect.height / 2) - sceneRect.top) / zoom;

      // Spread trunks evenly; centre them around gapCenterX
      const offset = (groupIndex - (totalGroups - 1) / 2) * trunkStep;
      const trunkX = gapCenterX + offset;

      nodes.forEach(node => {
        const sourceRect = node.getBoundingClientRect();
        const sourceX = (sourceRect.right - sceneRect.left) / zoom;
        const sourceY = ((sourceRect.top + sourceRect.height / 2) - sceneRect.top) / zoom;

        // Strict orthogonal path: right → vertical → right to target left edge
        const path = `M ${sourceX} ${sourceY} H ${trunkX} V ${targetY} H ${targetX}`;
        markup += `<path class="memory-arrow" data-link="${this._escapeHtml(targetId)}" d="${path}" marker-end="url(#memoryArrowHead)"></path>`;
      });
    });

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', `${width}`);
    svg.setAttribute('height', `${height}`);
    svg.innerHTML = markup;
  }

  makeProblem({ message, rawMessage, line, column, endLine, endColumn, source, severity, hint }) {
    return {
      message,
      rawMessage: rawMessage || message,
      line,
      column,
      endLine,
      endColumn,
      source,
      severity,
      hint,
    };
  }

  getLineEndColumn(fileId, line, column = 1, span = 1) {
    const model = fileId && this.models[fileId];
    if (!model) return Math.max(column + span, column + 1);
    const maxColumn = model.getLineMaxColumn(Math.max(1, line));
    return Math.min(maxColumn, Math.max(column + span, column + 1));
  }

  getJsRuntimeProblem(err, fileId = this.activeFile, source = 'JavaScript') {
    const rawMessage = err?.message || String(err);
    const stack = err?.stack || '';
    const match = stack.match(/<anonymous>:(\d+):(\d+)/);
    const rawLine = match ? parseInt(match[1], 10) : 2;
    const column = match ? parseInt(match[2], 10) : 1;
    const line = Math.max(1, rawLine - 1);
    const message = /Unexpected token/.test(rawMessage)
      ? `Syntax error: ${rawMessage}`
      : /is not defined/.test(rawMessage)
        ? `Reference error: ${rawMessage}`
        : rawMessage;
    const hint = /Unexpected token/.test(rawMessage)
      ? 'Check for a missing bracket, quote, comma, or parenthesis just before this spot.'
      : /is not defined/.test(rawMessage)
        ? 'Check the variable or function name for typos and make sure it exists before use.'
        : '';
    return this.makeProblem({
      message,
      rawMessage,
      line,
      column,
      endLine: line,
      endColumn: this.getLineEndColumn(fileId, line, column, 1),
      source,
      severity: 'error',
      hint
    });
  }

  getPythonProblem(err, fileId = this.activeFile) {
    const rawMessage = err?.message || String(err);
    const lineMatch = rawMessage.match(/line (\d+)/i);
    const line = lineMatch ? parseInt(lineMatch[1], 10) : 1;
    const message = /IndentationError/i.test(rawMessage)
      ? `Indentation error: ${rawMessage.split('\n')[0]}`
      : /SyntaxError/i.test(rawMessage)
        ? `Syntax error: ${rawMessage.split('\n')[0]}`
        : rawMessage.split('\n')[0];
    const hint = /IndentationError/i.test(rawMessage)
      ? 'Python uses indentation as syntax, so check the spacing on this block.'
      : /SyntaxError/i.test(rawMessage)
        ? 'Look for an unclosed bracket, quote, or a missing colon near this line.'
        : '';
    return this.makeProblem({
      message,
      rawMessage,
      line,
      column: 1,
      endLine: line,
      endColumn: this.getLineEndColumn(fileId, line, 1, 1),
      source: 'Python',
      severity: 'error',
      hint
    });
  }

  splitSqlStatements(code) {
    const statements = [];
    let current = '';
    let startLine = 1;
    let line = 1;
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      const prev = i > 0 ? code[i - 1] : '';
      if (ch === '\n') line++;
      if (ch === "'" && !inDouble && prev !== '\\') inSingle = !inSingle;
      if (ch === '"' && !inSingle && prev !== '\\') inDouble = !inDouble;
      current += ch;
      if (ch === ';' && !inSingle && !inDouble) {
        statements.push({ text: current, startLine, endLine: line });
        current = '';
        startLine = line;
      }
    }

    if (current.trim()) statements.push({ text: current, startLine, endLine: line });
    return statements.filter(statement => statement.text.trim());
  }

  getSqlProblem(code, err, fileId = this.activeFile) {
    const rawMessage = err?.message || String(err);
    const nearMatch = rawMessage.match(/near ["']?([^"':]+)["']?/i);
    const token = nearMatch ? nearMatch[1].trim() : '';
    const statements = this.splitSqlStatements(code);
    let targetLine = 1;
    let targetColumn = 1;

    if (token) {
      const tokenPattern = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wholeCodeMatch = new RegExp(tokenPattern, 'i').exec(code);
      if (wholeCodeMatch) {
        const before = code.slice(0, wholeCodeMatch.index);
        targetLine = before.split('\n').length;
        const lastNewline = before.lastIndexOf('\n');
        targetColumn = wholeCodeMatch.index - lastNewline;
      }
    } else if (statements.length) {
      const statement = statements[0];
      targetLine = Math.max(1, statement.startLine);
      const lineText = statement.text.split('\n')[0] || '';
      const firstNonSpace = lineText.search(/\S/);
      targetColumn = firstNonSpace >= 0 ? firstNonSpace + 1 : 1;
    }

    return this.makeProblem({
      message: `SQL error: ${rawMessage}`,
      rawMessage,
      line: targetLine,
      column: targetColumn,
      endLine: targetLine,
      endColumn: this.getLineEndColumn(fileId, targetLine, targetColumn, Math.max(token.length, 1)),
      source: 'SQL',
      severity: 'error',
      hint: token ? `Check the SQL syntax near "${token}".` : 'Check the statement order and SQL syntax near this query.'
    });
  }

  getMongoProblem(err, fileId = this.activeFile) {
    const rawMessage = err?.message || String(err);
    const stack = err?.stack || '';
    const match = stack.match(/<anonymous>:(\d+):(\d+)/);
    const rawLine = match ? parseInt(match[1], 10) : 2;
    const column = match ? parseInt(match[2], 10) : 1;
    const line = Math.max(1, rawLine - 1);
    return this.makeProblem({
      message: `MongoDB error: ${rawMessage}`,
      rawMessage,
      line,
      column,
      endLine: line,
      endColumn: this.getLineEndColumn(fileId, line, column, 1),
      source: 'MongoDB',
      severity: 'error',
      hint: 'Check the collection call, query shape, and supported simulator methods near this line.'
    });
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

  updatePracticeButtons() {
    const autoBtn = document.getElementById('autoRunBtn');
    const freshBtn = document.getElementById('freshRunBtn');
    const previewBtn = document.getElementById('previewBtn');
    if (autoBtn) {
      autoBtn.classList.toggle('active', this.autoRunEnabled);
      autoBtn.setAttribute('aria-pressed', this.autoRunEnabled ? 'true' : 'false');
      autoBtn.title = this.autoRunEnabled ? 'JavaScript and React auto run are on' : 'JavaScript and React auto run are off';
    }
    if (freshBtn) {
      freshBtn.classList.toggle('active', this.freshRunEnabled);
      freshBtn.setAttribute('aria-pressed', this.freshRunEnabled ? 'true' : 'false');
      freshBtn.title = this.freshRunEnabled ? 'Manual runs start from a fresh runtime' : 'Manual runs preserve runtime state';
    }
    if (previewBtn) {
      const activeFile = this.activeFile && this.items[this.activeFile];
      const canPreview = !!activeFile && (this._isReactFile(activeFile) || this._isReactProjectFile(activeFile.id));
      previewBtn.classList.toggle('active', canPreview && this.reactPreviewVisible);
      previewBtn.classList.toggle('hidden', !canPreview);
      previewBtn.setAttribute('aria-pressed', canPreview && this.reactPreviewVisible ? 'true' : 'false');
    }
  }

  toggleAutoRun(force) {
    this.autoRunEnabled = typeof force === 'boolean' ? force : !this.autoRunEnabled;
    if (!this.autoRunEnabled && this.autoUpdateTimeout) {
      clearTimeout(this.autoUpdateTimeout);
      this.autoUpdateTimeout = null;
    }
    this.saveToStorage();
    this.updatePracticeButtons();
  }

  toggleFreshRun(force) {
    this.freshRunEnabled = typeof force === 'boolean' ? force : !this.freshRunEnabled;
    this.saveToStorage();
    this.updatePracticeButtons();
  }

  clearInlineDecorations() {
    this.currentDecorationsList = [];
    if (this.decorationCollection) {
      this.decorationCollection.clear();
    }
  }

  async prepareRuntimeForRun(file, silent = false) {
    if (silent || !this.freshRunEnabled || !file) return;

    if (file.lang === 'python') {
      if (this.pyodide) {
        try {
          await this.pyodide.runPythonAsync("globals().pop('__pdx_scope', None)");
        } catch (e) {
          console.warn('[ParadoxEditor] Failed to reset Python scope:', e);
        }
      }
      this.addOutput('log', '[Fresh Run] Python scope reset');
      return;
    }

    if (this._isSqlFile(file)) {
      if (this.sqlDb) {
        try {
          this.sqlDb.close();
        } catch (e) {
          console.warn('[ParadoxEditor] Failed to close SQL runtime cleanly:', e);
        }
      }
      this.sqlDb = null;
      this.dbVisCardPositions = {};
      this.dbVisLastChange = null;
      this._renderDbVisEmpty('Fresh SQL runtime - run a query to populate it');
      this.addOutput('log', '[Fresh Run] SQL database reset');
      return;
    }

    if (this._isMongoFile(file)) {
      this._initMongoEngine();
      if (this.mongoEngine?.resetSession) this.mongoEngine.resetSession();
      this.dbVisCardPositions = {};
      this.dbVisLastChange = null;
      this._renderDbVisEmpty('Fresh MongoDB runtime - run a query to populate it');
      this.addOutput('log', '[Fresh Run] MongoDB database reset');
    }
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

  async autoUpdate() {
    const file = this.items[this.activeFile];
    if (!file) return;
    if (!this.autoRunEnabled || this.isRunning) return;

    const code = this.editor.getValue();

    if (this._isReactFile(file) || this._isReactProjectFile(file.id)) {
      this.refreshReactPreview({ silent: true });
      return;
    }

    // Ghost execution for inline output (JS only, skip SQL/mongo files/python).
    // Complexity remains available in manual run output, but is no longer injected into the editor.
    if (file.lang === 'javascript' && !this._isMongoFile(file)) {
      if (code.length > 5000 || code.includes('while(true)') || code.includes('while (true)')) return;
      this.runCode(true);
    }
  }

  async runCode(silent = false) {
    if (silent && this.isRunning) return;

    if (!silent) {
      this.switchPanel('output');
      this.outputLog = [];
    }
    this.clearInlineDecorations();

    this.isRunning = true;
    this.runAbort = false;

    if (this.decorationCollection) {
      this.decorationCollection.set(this.currentDecorationsList || []);
    } else if (this.editor) {
      this.decorationCollection = this.editor.createDecorationsCollection([]);
    }

    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    const runStatus = document.getElementById('runStatus');

    const code = this.editor.getValue();
    const file = this.items[this.activeFile];
    if (file) this.clearProblems(file.id);

    // SQL and MongoDB run instantly — keep the Run button visible at all times.
    // Only JS/Python (potentially long-running) get the stop button treatment.
    const isDbFile = file && this._isDbFile(file);

    if (!silent && !isDbFile) {
      if (runBtn) runBtn.classList.remove('hidden');
      if (stopBtn) stopBtn.classList.remove('hidden');
      if (runStatus) runStatus.classList.remove('hidden');
    }

    try {
      if (!file) {
        this.addOutput('error', '✗ No active file');
        return;
      }

      if (!silent) {
        this.addOutput('log', `➜ Executing ${file.name}...`);
        this.terminal.writeln(`\r\n\x1b[1;36m➜ Executing ${file.name}...\x1b[0m`);
        // Show complexity in output panel on manual run
        if (!this._isReactFile(file) && !this._isReactProjectFile(file.id) && window.ComplexityAnalyzer && code.trim().length > 10) {
          try {
            const complexResult = window.ComplexityAnalyzer.analyzeFull(code, file.lang);
            this.addOutput('log', `[Complexity] Time: ${complexResult.time}  Space: ${complexResult.space}`);
          } catch (e) { /* ignore */ }
        }
      }

      await this.prepareRuntimeForRun(file, silent);

      if (this._isMongoFile(file)) {
        // MongoDB shell files — skip in silent mode
        if (silent) return;
        await this.runMongo(code);

      } else if (this._isSqlFile(file)) {
        // SQL files - skip in silent mode
        if (silent) return;
        await this.runSql(code);

      } else if (this._isReactFile(file) || this._isReactProjectFile(file.id)) {
        await this.refreshReactPreview({ silent });

      } else if (file.lang === 'javascript') {
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
          const runner = new Function(`return ${wrapped}`);
          await runner();
        } catch (e) {
          const problem = this.getJsRuntimeProblem(e, file.id);
          this.setProblems(file.id, [problem], { switchToProblems: !silent, reveal: !silent });
          if (!silent) {
            this.addOutput('error', problem.message, problem.line);
          }
        } finally {
          console.log = originalLog;
          console.warn = originalWarn;
          console.error = originalError;
        }

      } else if (file.lang === 'python') {
        // Python auto-run is disabled for performance/complexity unless manual
        if (silent) return;

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

        this.pyodide.globals.set('__pdx_inline', (line, text) => {
          this.addInlineDecoration(line, text);
        });

        const pySetup = `
import sys
import inspect
def __pdx_print_wrapper(*args, **kwargs):
    frame = inspect.currentframe().f_back
    line = frame.f_lineno
    text = " ".join(map(str, args))
    __pdx_print(*args, **kwargs)
    __pdx_inline(line, text)

def __pdx_exec(code, fresh=False):
    global __pdx_scope
    if fresh or '__pdx_scope' not in globals():
        __pdx_scope = {'__builtins__': __builtins__}
    __pdx_scope['print'] = __pdx_print_wrapper
    exec(code, __pdx_scope, __pdx_scope)
`;
        if (!this.pyodide._pdx_init_done) {
          await this.pyodide.runPythonAsync(pySetup);
          this.pyodide._pdx_init_done = true;
        }

        try {
          await this.pyodide.runPythonAsync(`__pdx_exec(${JSON.stringify(code)}, ${this.freshRunEnabled ? 'True' : 'False'})`);
        } catch (e) {
          const problem = this.getPythonProblem(e, file.id);
          this.setProblems(file.id, [problem]);
          this.addOutput('error', problem.message, problem.line);
        }
      }

    } finally {
      // ALWAYS restore run button and clear running state, regardless of errors.
      // For DB files we never hid it, so no-op. For JS/Python always restore.
      if (!silent && !isDbFile) {
        if (runStatus) runStatus.classList.add('hidden');
        if (stopBtn) stopBtn.classList.add('hidden');
        if (runBtn) runBtn.classList.remove('hidden');
      }
      this.isRunning = false;
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
        '// Paste reference solution here',
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

  // ===== SQL Runner =====

  async runSql(code) {
    this.switchPanel('output');
    if (this.activeFile) this.clearProblems(this.activeFile);
    if (!this.sqlDb) {
      this.addOutput('log', '⏳ Loading SQL engine (first run only)...');
      this.terminal.writeln('\x1b[33m⏳ Loading SQL engine...\x1b[0m');
      try {
        const SQL = await initSqlJs({
          locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
        });
        this.sqlDb = new SQL.Database();
        this.addOutput('log', '✓ SQL engine ready (SQLite in-browser)');
        this.terminal.writeln('\x1b[32m✓ SQL engine ready\x1b[0m');
      } catch (e) {
        this.addOutput('error', '✗ Failed to load SQL engine: ' + e.message);
        return;
      }
    }

    let sqlProblem = null;
    try {
      const results = this.sqlDb.exec(code);
      if (!results || results.length === 0) {
        this.addOutput('log', '✓ Query executed successfully (no rows returned)');
        this.terminal.writeln('\x1b[32m✓ Done\x1b[0m');
      } else {
        results.forEach((r, ri) => {
          if (ri > 0) this.addOutput('log', '───');
          // Column header
          const colWidths = r.columns.map((col, ci) => {
            const maxVal = r.values.reduce((m, row) => Math.max(m, String(row[ci]).length), col.length);
            return Math.min(maxVal, 30);
          });
          const header = r.columns.map((col, ci) => col.padEnd(colWidths[ci])).join(' │ ');
          const divider = colWidths.map(w => '─'.repeat(w)).join('─┼─');
          this.addOutput('log', header);
          this.addOutput('log', divider);
          this.terminal.writeln('\x1b[36m' + header + '\x1b[0m');
          this.terminal.writeln(divider);
          r.values.forEach(row => {
            const line = row.map((val, ci) => String(val === null ? 'NULL' : val).padEnd(colWidths[ci])).join(' │ ');
            this.addOutput('log', line);
            this.terminal.writeln(line);
          });
          this.addOutput('log', `(${r.values.length} row${r.values.length !== 1 ? 's' : ''})`);
        });
      }
    } catch (e) {
      sqlProblem = this.activeFile ? this.getSqlProblem(code, e, this.activeFile) : null;
      this.addOutput('error', '✗ SQL Error: ' + e.message);
      this.terminal.writeln('\x1b[31m✗ ' + e.message + '\x1b[0m');
    }
    if (sqlProblem && this.activeFile) this.setProblems(this.activeFile, [sqlProblem]);
    // Update live visualizer after every SQL run
    this.dbVisLastChange = this._detectSqlChangeType(code);
    this.refreshDbVis();
  }

  _detectSqlChangeType(code) {
    const upper = (code || '').toUpperCase();
    if (/\bINSERT\b/.test(upper)) return { type: 'insert', ids: new Set() };
    if (/\bUPDATE\b/.test(upper)) return { type: 'update', ids: new Set() };
    if (/\bDELETE\b/.test(upper)) return { type: 'delete', ids: new Set() };
    return null;
  }

  // ===== MongoDB Engine =====

  _initMongoEngine() {
    if (this.mongoEngine) return;

    const matchQuery = (doc, query) => {
      if (!query || typeof query !== 'object') return true;
      return Object.entries(query).every(([key, val]) => {
        if (key === '$and') return val.every(q => matchQuery(doc, q));
        if (key === '$or') return val.some(q => matchQuery(doc, q));
        const fieldVal = key.split('.').reduce((o, k) => o?.[k], doc);
        if (val !== null && typeof val === 'object') {
          if ('$eq'  in val) return fieldVal === val.$eq;
          if ('$ne'  in val) return fieldVal !== val.$ne;
          if ('$gt'  in val) return fieldVal > val.$gt;
          if ('$gte' in val) return fieldVal >= val.$gte;
          if ('$lt'  in val) return fieldVal < val.$lt;
          if ('$lte' in val) return fieldVal <= val.$lte;
          if ('$in'  in val) return Array.isArray(val.$in) && val.$in.includes(fieldVal);
          if ('$nin' in val) return Array.isArray(val.$nin) && !val.$nin.includes(fieldVal);
          if ('$exists' in val) return val.$exists ? fieldVal !== undefined : fieldVal === undefined;
          if ('$regex' in val) return typeof fieldVal === 'string' && new RegExp(val.$regex).test(fieldVal);
        }
        return fieldVal === val;
      });
    };

    const applyUpdate = (doc, updateOp) => {
      Object.entries(updateOp).forEach(([op, fields]) => {
        if (op === '$set') Object.assign(doc, fields);
        else if (op === '$unset') Object.keys(fields).forEach(k => delete doc[k]);
        else if (op === '$inc') Object.entries(fields).forEach(([k, v]) => { doc[k] = (doc[k] || 0) + v; });
        else if (op === '$push') Object.entries(fields).forEach(([k, v]) => { if (!Array.isArray(doc[k])) doc[k] = []; doc[k].push(v); });
        else if (op === '$pull') Object.entries(fields).forEach(([k, v]) => { if (Array.isArray(doc[k])) doc[k] = doc[k].filter(x => !matchQuery({ x }, { x: v })); });
        else if (op === '$addToSet') Object.entries(fields).forEach(([k, v]) => { if (!Array.isArray(doc[k])) doc[k] = []; if (!doc[k].includes(v)) doc[k].push(v); });
      });
    };

    const runAggregate = (docs, pipeline) => {
      let result = [...docs];
      pipeline.forEach(stage => {
        const [op, arg] = Object.entries(stage)[0];
        if (op === '$match') result = result.filter(d => matchQuery(d, arg));
        else if (op === '$limit') result = result.slice(0, arg);
        else if (op === '$skip') result = result.slice(arg);
        else if (op === '$sort') {
          result.sort((a, b) => {
            for (const [k, dir] of Object.entries(arg)) {
              const av = a[k], bv = b[k];
              if (av < bv) return -dir; if (av > bv) return dir;
            }
            return 0;
          });
        } else if (op === '$project') {
          result = result.map(d => {
            const out = {};
            Object.entries(arg).forEach(([k, v]) => { if (v && d[k] !== undefined) out[k] = d[k]; });
            if (arg._id !== 0) out._id = d._id;
            return out;
          });
        } else if (op === '$group') {
          const groups = {};
          result.forEach(d => {
            const keyExpr = arg._id;
            let key;
            if (typeof keyExpr === 'string' && keyExpr.startsWith('$')) key = String(d[keyExpr.slice(1)]);
            else key = JSON.stringify(keyExpr);
            if (!groups[key]) groups[key] = { _id: keyExpr && typeof keyExpr === 'string' && keyExpr.startsWith('$') ? d[keyExpr.slice(1)] : keyExpr, _docs: [] };
            groups[key]._docs.push(d);
          });
          result = Object.values(groups).map(g => {
            const out = { _id: g._id };
            Object.entries(arg).forEach(([k, v]) => {
              if (k === '_id') return;
              if (typeof v === 'object') {
                if ('$sum' in v) {
                  const f = v.$sum;
                  out[k] = typeof f === 'string' && f.startsWith('$') ? g._docs.reduce((s, d) => s + (d[f.slice(1)] || 0), 0) : g._docs.length * f;
                } else if ('$avg' in v) {
                  const f = v.$avg.slice(1);
                  out[k] = g._docs.reduce((s, d) => s + (d[f] || 0), 0) / (g._docs.length || 1);
                } else if ('$count' in v) {
                  out[k] = g._docs.length;
                } else if ('$first' in v) {
                  const f = v.$first.slice(1);
                  out[k] = g._docs[0]?.[f];
                } else if ('$last' in v) {
                  const f = v.$last.slice(1);
                  out[k] = g._docs[g._docs.length - 1]?.[f];
                } else if ('$push' in v) {
                  const f = v.$push.startsWith('$') ? v.$push.slice(1) : null;
                  out[k] = g._docs.map(d => f ? d[f] : d);
                }
              }
            });
            return out;
          });
        }
      });
      return result;
    };

    const dbs = { test: {} };
    const getCollection = (dbName, colName) => {
      if (!dbs[dbName]) dbs[dbName] = {};
      if (!dbs[dbName][colName]) dbs[dbName][colName] = [];
      return dbs[dbName][colName];
    };

    let currentDb = 'test';
    let oidCounter = 1;

    // Track last mutation for row highlights
    const trackChange = (type, ids) => {
      this.dbVisLastChange = { type, ids: new Set(Array.isArray(ids) ? ids : [ids]) };
    };

    const makeCollection = (dbName, name) => {
      const docs = getCollection(dbName, name);
      return {
        insertOne: (doc) => {
          const d = Object.assign({}, doc);
          if (!d._id) d._id = 'ObjectId_' + (oidCounter++);
          docs.push(d);
          trackChange('insert', [d._id]);
          return { acknowledged: true, insertedId: d._id };
        },
        insertMany: (arr) => {
          const ids = [];
          arr.forEach(doc => {
            const d = Object.assign({}, doc);
            if (!d._id) d._id = 'ObjectId_' + (oidCounter++);
            docs.push(d);
            ids.push(d._id);
          });
          trackChange('insert', ids);
          return { acknowledged: true, insertedCount: arr.length, insertedIds: ids };
        },
        find: (query = {}, proj = {}) => {
          const matched = docs.filter(d => matchQuery(d, query));
          return {
            toArray: () => matched.map(d => Object.assign({}, d)),
            sort: (s) => { matched.sort((a, b) => { for (const [k, dir] of Object.entries(s)) { if (a[k] < b[k]) return -dir; if (a[k] > b[k]) return dir; } return 0; }); return { toArray: () => matched.map(d => Object.assign({}, d)) }; },
            limit: (n) => ({ toArray: () => matched.slice(0, n).map(d => Object.assign({}, d)) }),
          };
        },
        findOne: (query = {}) => {
          const d = docs.find(d => matchQuery(d, query));
          return d ? Object.assign({}, d) : null;
        },
        updateOne: (query, update) => {
          const d = docs.find(d => matchQuery(d, query));
          if (d) { applyUpdate(d, update); trackChange('update', [d._id]); }
          return { acknowledged: true, matchedCount: d ? 1 : 0, modifiedCount: d ? 1 : 0 };
        },
        updateMany: (query, update) => {
          const matched = docs.filter(d => matchQuery(d, query));
          matched.forEach(d => applyUpdate(d, update));
          trackChange('update', matched.map(d => d._id));
          return { acknowledged: true, matchedCount: matched.length, modifiedCount: matched.length };
        },
        deleteOne: (query) => {
          const idx = docs.findIndex(d => matchQuery(d, query));
          if (idx !== -1) { trackChange('delete', [docs[idx]._id]); docs.splice(idx, 1); }
          return { acknowledged: true, deletedCount: idx !== -1 ? 1 : 0 };
        },
        deleteMany: (query) => {
          const toRemove = docs.filter(d => matchQuery(d, query));
          trackChange('delete', toRemove.map(d => d._id));
          const remaining = docs.filter(d => !matchQuery(d, query));
          docs.length = 0; remaining.forEach(d => docs.push(d));
          return { acknowledged: true, deletedCount: toRemove.length };
        },
        countDocuments: (query = {}) => docs.filter(d => matchQuery(d, query)).length,
        aggregate: (pipeline) => ({ toArray: () => runAggregate(docs, pipeline) }),
        drop: () => { docs.length = 0; return true; },
      };
    };

    this.mongoEngine = {
      use: (name) => { currentDb = name; },
      getDb: () => ({
        collection: (name) => makeCollection(currentDb, name),
        listCollections: () => ({ toArray: () => Object.keys(dbs[currentDb] || {}).map(n => ({ name: n })) }),
        dropCollection: (name) => { delete dbs[currentDb][name]; return true; },
      }),
      getAllCollections: () => {
        return Object.entries(dbs[currentDb] || {}).map(([name, docs]) => ({
          name,
          docs: docs.map(d => Object.assign({}, d))
        }));
      },
      resetAll: () => {
        Object.keys(dbs[currentDb] || {}).forEach(k => { dbs[currentDb][k] = []; });
        this.dbVisLastChange = null;
      },
      resetSession: () => {
        Object.keys(dbs).forEach(name => delete dbs[name]);
        dbs.test = {};
        currentDb = 'test';
        oidCounter = 1;
        this.dbVisLastChange = null;
      }
    };
  }

  async runMongo(code) {
    this._initMongoEngine();
    this.switchPanel('output');
    this.addOutput('log', '🍃 MongoDB Simulator (in-browser)');
    this.terminal.writeln('\x1b[32m🍃 MongoDB Simulator\x1b[0m');

    if (this.activeFile) this.clearProblems(this.activeFile);
    const db = this.mongoEngine.getDb();
    const printJSON = (v) => {
      const str = JSON.stringify(v, null, 2);
      this.addOutput('log', str);
      this.terminal.writeln(str);
    };
    const print = (...args) => {
      const str = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
      this.addOutput('log', str);
      this.terminal.writeln(str);
    };
    const use = (name) => {
      this.mongoEngine.use(name);
      this.addOutput('log', `switched to db ${name}`);
    };

    let mongoProblem = null;
    try {
      const fn = new Function('db', 'printJSON', 'print', 'use', '"use strict";\n' + code);
      const result = fn(db, printJSON, print, use);
      if (result instanceof Promise) await result;
    } catch (e) {
      mongoProblem = this.activeFile ? this.getMongoProblem(e, this.activeFile) : null;
      this.addOutput('error', '✗ MongoDB Error: ' + e.message);
      this.terminal.writeln('\x1b[31m✗ ' + e.message + '\x1b[0m');
    }
    if (mongoProblem && this.activeFile) this.setProblems(this.activeFile, [mongoProblem]);
    // Update live visualizer after every MongoDB run
    this.refreshDbVis();
  }

  // ===== DB Cheat Sheets System =====

  initDbCheatsheets() {
    const listEl = document.getElementById('dbCheatList');
    if (!listEl || !window.DB_CHEATSHEETS) return;

    // Create SQL / MongoDB tab switcher
    const tabBar = document.createElement('div');
    tabBar.className = 'db-tab-bar';
    tabBar.innerHTML = `
      <button class="db-tab-btn active" data-cat="SQL">🗄️ SQL</button>
      <button class="db-tab-btn" data-cat="MongoDB">🍃 MongoDB</button>`;
    listEl.parentElement.insertBefore(tabBar, listEl);

    let activeCategory = 'SQL';

    const renderList = (cat) => {
      listEl.innerHTML = '';
      const sheets = window.DB_CHEATSHEETS.filter(s => s.category === cat);
      sheets.forEach(sheet => {
        const item = document.createElement('div');
        item.className = 'sidebar-item db-cheat-item';
        item.dataset.id = sheet.id;
        item.style.cursor = 'pointer';
        item.innerHTML = `
          <div class="sidebar-item-label" style="padding-left:12px;gap:8px;display:flex;align-items:center;">
            <span style="font-size:16px">${sheet.emoji}</span>
            <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sheet.name}</span>
          </div>`;
        item.addEventListener('click', () => this.loadDbCheatsheet(sheet.id));
        listEl.appendChild(item);
      });
    };

    tabBar.querySelectorAll('.db-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        tabBar.querySelectorAll('.db-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.cat;
        // Hide detail, show list
        const detail = document.getElementById('dbCheatDetail');
        if (detail) detail.classList.add('hidden');
        listEl.classList.remove('hidden');
        renderList(activeCategory);
      });
    });

    renderList('SQL');

    document.getElementById('dbCheatBackBtn')?.addEventListener('click', () => {
      document.getElementById('dbCheatDetail')?.classList.add('hidden');
      listEl.classList.remove('hidden');
      tabBar.style.display = '';
    });
  }

  loadDbCheatsheet(id) {
    const sheet = window.DB_CHEATSHEETS?.find(s => s.id === id);
    if (!sheet) return;

    const listEl = document.getElementById('dbCheatList');
    const detail = document.getElementById('dbCheatDetail');
    const tabBar = document.querySelector('.db-tab-bar');
    if (!detail) return;

    listEl?.classList.add('hidden');
    if (tabBar) tabBar.style.display = 'none';
    detail.classList.remove('hidden');

    const nameEl = document.getElementById('dbCheatName');
    const emojiEl = document.getElementById('dbCheatEmoji');
    const catEl = document.getElementById('dbCheatCatBadge');
    const topicsEl = document.getElementById('dbCheatTopics');

    if (nameEl) nameEl.textContent = sheet.name;
    if (emojiEl) emojiEl.textContent = sheet.emoji;
    if (catEl) { catEl.textContent = sheet.category; catEl.className = 'pattern-category-badge db-cat-' + sheet.category.toLowerCase(); }

    if (topicsEl) {
      topicsEl.innerHTML = sheet.topics.map((topic, i) => `
        <div class="db-topic-card">
          <div class="db-topic-title">${topic.title}</div>
          ${topic.description ? `<div class="db-topic-desc">${topic.description}</div>` : ''}
          <pre class="pattern-code-block db-code-block" id="db-code-${id}-${i}">${this._escapeHtml(topic.code)}</pre>
          <button class="pattern-load-btn db-load-btn" data-sheet-id="${id}" data-topic-index="${i}">▶ Load in Editor</button>
        </div>`).join('');

      topicsEl.querySelectorAll('.db-load-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const s = window.DB_CHEATSHEETS?.find(x => x.id === btn.dataset.sheetId);
          const t = s?.topics[parseInt(btn.dataset.topicIndex)];
          if (!t) return;
          const lang = s.category === 'MongoDB' ? 'javascript' : 'sql';
          const header = `-- ════════════════════════════════\n-- ${s.name}: ${t.title}\n-- ════════════════════════════════\n\n`;
          this.loadPatternInEditor(t.code, lang, s.name, t.title);
        });
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  DB LIVE VISUALIZER
  // ══════════════════════════════════════════════════════════

  initDbVis() {
    const wrap = document.getElementById('dbVisCanvasWrap');
    const canvas = document.getElementById('dbVisCanvas');
    const visResizer = document.getElementById('dbVisResizer');
    const visPanel = document.getElementById('dbVisPanel');
    const toggleBtn = document.getElementById('dbVisToggleBtn');
    if (!wrap || !canvas || !visPanel) return;

    this.dbVisCollapsed = localStorage.getItem('paradox_dbvis_collapsed') === '1';
    this._setDbVisCollapsed(this.dbVisCollapsed, false);

    // Zoom buttons
    document.getElementById('dbVisZoomIn')?.addEventListener('click', () => {
      this.dbVisZoom = Math.min(2.5, this.dbVisZoom + 0.15);
      this._applyDbVisTransform();
    });
    document.getElementById('dbVisZoomOut')?.addEventListener('click', () => {
      this.dbVisZoom = Math.max(0.3, this.dbVisZoom - 0.15);
      this._applyDbVisTransform();
    });
    document.getElementById('dbVisZoomFit')?.addEventListener('click', () => {
      this._fitDbVis();
    });

    // Scroll-wheel zoom
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      this.dbVisZoom = Math.max(0.3, Math.min(2.5, this.dbVisZoom + delta));
      this._applyDbVisTransform();
    }, { passive: false });

    // Pan (drag canvas background)
    let panStart = null;
    wrap.addEventListener('mousedown', (e) => {
      if (e.target !== wrap && e.target !== canvas && !e.target.classList.contains('db-vis-arrows') && !e.target.classList.contains('db-vis-empty') && !e.target.classList.contains('db-vis-empty-icon')) return;
      panStart = { x: e.clientX - this.dbVisOffsetX, y: e.clientY - this.dbVisOffsetY };
      wrap.classList.add('panning');
    });
    document.addEventListener('mousemove', (e) => {
      if (!panStart) return;
      this.dbVisOffsetX = e.clientX - panStart.x;
      this.dbVisOffsetY = e.clientY - panStart.y;
      this._applyDbVisTransform();
    });
    document.addEventListener('mouseup', () => {
      panStart = null;
      wrap.classList.remove('panning');
    });

    // DB Vis resizer
    let isResizingVis = false;
    visResizer?.addEventListener('mousedown', () => {
      if (this.dbVisCollapsed) return;
      isResizingVis = true;
      visResizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!isResizingVis || !visPanel || this.dbVisCollapsed) return;
      const mainRect = document.querySelector('.main').getBoundingClientRect();
      const minVis = 300;
      const maxVis = Math.min(750, Math.max(minVis, mainRect.width - 460));
      const rawWidth = mainRect.right - e.clientX;
      const newWidth = Math.max(minVis, Math.min(maxVis, rawWidth));
      visPanel.style.width = newWidth + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (isResizingVis) {
        visResizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      isResizingVis = false;
    });

    // Header buttons
    toggleBtn?.addEventListener('click', () => this._setDbVisCollapsed(!this.dbVisCollapsed));
    document.getElementById('dbVisSampleBtn')?.addEventListener('click', () => this._loadSampleData());
    document.getElementById('dbVisResetBtn')?.addEventListener('click', () => this._resetDbVis());
  }

  _setDbVisCollapsed(collapsed, persist = true) {
    this.dbVisCollapsed = !!collapsed;
    const panel = document.getElementById('dbVisPanel');
    const resizer = document.getElementById('dbVisResizer');
    const toggleBtn = document.getElementById('dbVisToggleBtn');

    if (panel) panel.classList.toggle('collapsed', this.dbVisCollapsed);
    if (resizer) {
      const shouldHideResizer = this.dbVisCollapsed || panel?.classList.contains('hidden');
      resizer.classList.toggle('hidden', !!shouldHideResizer);
    }
    if (toggleBtn) {
      toggleBtn.innerHTML = '&#9776;';
      const label = this.dbVisCollapsed ? 'Expand live view' : 'Collapse live view';
      toggleBtn.title = label;
      toggleBtn.setAttribute('aria-label', label);
    }

    if (persist) {
      localStorage.setItem('paradox_dbvis_collapsed', this.dbVisCollapsed ? '1' : '0');
    }
  }

  _showDbVis(type) {
    const panel = document.getElementById('dbVisPanel');
    const badge = document.getElementById('dbVisTypeBadge');
    if (!panel) {
      console.warn('[ParadoxEditor] dbVisPanel not found in DOM; DB visualizer cannot be shown.');
      return;
    }
    panel.classList.remove('hidden');
    this._setDbVisCollapsed(this.dbVisCollapsed, false);
    if (badge) {
      badge.textContent = type === 'mongo' ? 'MongoDB' : 'SQL';
      badge.className = 'db-vis-type-badge ' + (type === 'mongo' ? 'db-vis-type-mongo' : 'db-vis-type-sql');
    }
    this.refreshDbVis();
  }

  _hideDbVis() {
    const panel = document.getElementById('dbVisPanel');
    const resizer = document.getElementById('dbVisResizer');
    if (panel) {
      panel.classList.add('hidden');
    }
    if (resizer) {
      resizer.classList.add('hidden');
    }
  }

  _applyDbVisTransform() {
    const canvas = document.getElementById('dbVisCanvas');
    if (!canvas) return;
    canvas.style.transform = `translate(${this.dbVisOffsetX}px, ${this.dbVisOffsetY}px) scale(${this.dbVisZoom})`;
    const zoomEl = document.getElementById('dbVisZoomLevel');
    if (zoomEl) zoomEl.textContent = Math.round(this.dbVisZoom * 100) + '%';
  }

  _fitDbVis() {
    this.dbVisZoom = 1.0;
    this.dbVisOffsetX = 12;
    this.dbVisOffsetY = 12;
    this._applyDbVisTransform();
  }

  async refreshDbVis() {
    const panel = document.getElementById('dbVisPanel');
    if (!panel || panel.classList.contains('hidden')) return;

    const activeItem = this.activeFile && this.items[this.activeFile];
    if (!activeItem) return;

    const isMongo = this._isMongoFile(activeItem);
    const isSql = this._isSqlFile(activeItem);
    if (!isMongo && !isSql) return;

    if (isSql) {
      await this._refreshSqlVis();
    } else {
      this._refreshMongoVis();
    }
  }

  async _refreshSqlVis() {
    if (!this.sqlDb) {
      this._renderDbVisEmpty('Run a SQL query first to see your tables here');
      return;
    }

    const changeType = this.dbVisLastChange?.type || null;

    // Get all table names
    let tableNames = [];
    try {
      const res = this.sqlDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      tableNames = res.length > 0 ? res[0].values.map(r => r[0]) : [];
    } catch (e) { return; }

    if (tableNames.length === 0) {
      this._renderDbVisEmpty('No tables yet — run CREATE TABLE to see them here');
      return;
    }

    // Get data for each table
    const tables = [];
    for (const name of tableNames) {
      try {
        const res = this.sqlDb.exec(`SELECT * FROM "${name}" LIMIT 200`);
        if (res.length > 0) {
          tables.push({ name, columns: res[0].columns, rows: res[0].values });
        } else {
          // Table exists but is empty — get columns from pragma
          const pragma = this.sqlDb.exec(`PRAGMA table_info("${name}")`);
          const cols = pragma.length > 0 ? pragma[0].values.map(r => r[1]) : [];
          tables.push({ name, columns: cols, rows: [] });
        }
      } catch (e) {
        tables.push({ name, columns: [], rows: [] });
      }
    }

    this._renderVisCards(tables, 'sql', changeType);
    this._drawFkArrows(tables);
  }

  _refreshMongoVis() {
    if (!this.mongoEngine) {
      this._renderDbVisEmpty('Run a MongoDB query first to see your collections here');
      return;
    }

    const collections = this.mongoEngine.getAllCollections();

    if (collections.length === 0) {
      this._renderDbVisEmpty('No collections yet — insert a document to see them here');
      return;
    }

    // Convert collections to table-like format
    const tables = collections.map(col => {
      const allKeys = new Set();
      col.docs.forEach(d => Object.keys(d).forEach(k => allKeys.add(k)));
      const columns = ['_id', ...Array.from(allKeys).filter(k => k !== '_id')];
      const rows = col.docs.map(d => columns.map(k => {
        const v = d[k];
        return v === undefined ? null : (typeof v === 'object' ? JSON.stringify(v) : v);
      }));
      return { name: col.name, columns, rows };
    });

    const change = this.dbVisLastChange;
    this._renderVisCards(tables, 'mongo', change ? change.type : null, change ? change.ids : null);
    // No FK arrows for MongoDB
    const arrows = document.getElementById('dbVisArrows');
    if (arrows) arrows.innerHTML = '';
  }

  _renderDbVisEmpty(msg) {
    const canvas = document.getElementById('dbVisCanvas');
    const empty = document.getElementById('dbVisEmpty');
    if (canvas) {
      // Remove all cards
      canvas.querySelectorAll('.db-table-card').forEach(c => c.remove());
      const arrows = document.getElementById('dbVisArrows');
      if (arrows) arrows.innerHTML = '';
    }
    if (empty) {
      empty.style.display = 'block';
      empty.innerHTML = `<div class="db-vis-empty-icon">🗄️</div><div>${msg}</div>`;
    }
  }

  _renderVisCards(tables, type, changeType, changedIds = null) {
    const canvas = document.getElementById('dbVisCanvas');
    const empty = document.getElementById('dbVisEmpty');
    if (!canvas) return;
    if (empty) empty.style.display = 'none';

    const CARD_W = 260;
    const CARD_GAP_X = 28;
    const CARD_GAP_Y = 24;
    const COLS = 2;

    // Determine grid positions for new cards
    tables.forEach((table, idx) => {
      if (!this.dbVisCardPositions[table.name]) {
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);
        this.dbVisCardPositions[table.name] = {
          x: 16 + col * (CARD_W + CARD_GAP_X),
          y: 16 + row * (CARD_GAP_Y + Math.min(table.rows.length * 22 + 60, 320))
        };
      }
    });

    // Remove cards for tables that no longer exist
    canvas.querySelectorAll('.db-table-card').forEach(card => {
      if (!tables.find(t => t.name === card.dataset.table)) card.remove();
    });

    tables.forEach((table) => {
      const pos = this.dbVisCardPositions[table.name];
      let card = canvas.querySelector(`.db-table-card[data-table="${CSS.escape(table.name)}"]`);
      const isNew = !card;

      if (!card) {
        card = document.createElement('div');
        card.className = 'db-table-card';
        card.dataset.table = table.name;
        canvas.appendChild(card);
      }

      card.style.left = pos.x + 'px';
      card.style.top = pos.y + 'px';

      const icon = type === 'mongo' ? '🍃' : '🗄️';
      const countLabel = table.rows.length === 1 ? '1 row' : `${table.rows.length} rows`;

      // Detect PK column (first column named 'id' or '_id' or ending in 'id')
      const pkIdx = table.columns.findIndex(c =>
        c === 'id' || c === '_id' || c.toLowerCase() === 'id' || c.toLowerCase().endsWith('_id') && table.columns.indexOf(c) === 0
      );

      let bodyHtml = '';
      if (table.columns.length === 0) {
        bodyHtml = '<div class="db-card-empty">No columns</div>';
      } else if (table.rows.length === 0) {
        bodyHtml = `<table class="db-card-table">
          <thead><tr>${table.columns.map((c, ci) => `<th${ci === pkIdx ? ' class="pk-col"' : ''}>${this._escapeHtml(String(c))}</th>`).join('')}</tr></thead>
          <tbody><tr><td colspan="${table.columns.length}" class="db-card-empty" style="text-align:center">Empty</td></tr></tbody>
        </table>`;
      } else {
        const rows = table.rows.map((row, ri) => {
          // For SQL: highlight by changeType (last query). For Mongo: highlight by changedIds.
          let rowClass = '';
          if (changeType && type === 'sql') {
            // Highlight last N rows for inserts, or all for update/delete
            if (changeType === 'insert' && ri === table.rows.length - 1) rowClass = 'row-new';
            else if (changeType === 'update') rowClass = 'row-updated';
          } else if (changedIds && type === 'mongo') {
            const rowId = row[0]; // _id is first column
            if (changedIds.has(rowId)) {
              if (changeType === 'insert') rowClass = 'row-new';
              else if (changeType === 'update') rowClass = 'row-updated';
              else if (changeType === 'delete') rowClass = 'row-deleted';
            }
          }
          const cells = row.map(v => {
            if (v === null || v === undefined) return `<td><span class="db-null-val">NULL</span></td>`;
            const str = String(v);
            const display = str.length > 25 ? str.slice(0, 25) + '…' : str;
            return `<td title="${this._escapeHtml(str)}">${this._escapeHtml(display)}</td>`;
          }).join('');
          return `<tr class="${rowClass}">${cells}</tr>`;
        }).join('');

        bodyHtml = `<table class="db-card-table">
          <thead><tr>${table.columns.map((c, ci) => `<th${ci === pkIdx ? ' class="pk-col"' : ''}>${this._escapeHtml(String(c))}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      }

      card.innerHTML = `
        <div class="db-card-header">
          <span class="db-card-icon">${icon}</span>
          <span class="db-card-name">${this._escapeHtml(table.name)}</span>
          <span class="db-card-count">${countLabel}</span>
        </div>
        <div class="db-card-body">${bodyHtml}</div>`;

      // Make card draggable
      this._makeCardDraggable(card, table.name);
    });
  }

  _makeCardDraggable(card, tableName) {
    const header = card.querySelector('.db-card-header');
    if (!header) return;

    let drag = null;
    header.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const pos = this.dbVisCardPositions[tableName] || { x: 0, y: 0 };
      drag = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
      card.classList.add('db-card-dragging');
      card.style.zIndex = 200;
    });
    document.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / this.dbVisZoom;
      const dy = (e.clientY - drag.startY) / this.dbVisZoom;
      const newX = Math.max(0, drag.origX + dx);
      const newY = Math.max(0, drag.origY + dy);
      this.dbVisCardPositions[tableName] = { x: newX, y: newY };
      card.style.left = newX + 'px';
      card.style.top = newY + 'px';
      this._drawFkArrows(); // update arrows during drag
    });
    document.addEventListener('mouseup', () => {
      if (!drag) return;
      drag = null;
      card.classList.remove('db-card-dragging');
      card.style.zIndex = '';
    });
  }

  _drawFkArrows(tables) {
    const svg = document.getElementById('dbVisArrows');
    if (!svg) return;
    svg.innerHTML = '';

    if (!tables || tables.length < 2) return;

    // Detect FK columns: column named "<other_table>_id" or "<other_table>Id"
    tables.forEach(tableA => {
      tableA.columns.forEach((col, colIdx) => {
        const colLower = col.toLowerCase().replace(/id$/, '').replace(/_$/, '');
        const linked = tables.find(t => t.name !== tableA.name &&
          (t.name.toLowerCase() === colLower ||
           t.name.toLowerCase() + '_id' === col.toLowerCase() ||
           t.name.toLowerCase() + 'id' === col.toLowerCase()));
        if (!linked) return;

        const posA = this.dbVisCardPositions[tableA.name];
        const posB = this.dbVisCardPositions[linked.name];
        if (!posA || !posB) return;

        const CARD_W = 260;
        const ROW_H = 22;
        const HEADER_H = 30;

        // Start point: right side of column row in tableA
        const rowY = posA.y + HEADER_H + (colIdx + 0.5) * ROW_H;
        const x1 = posA.x + CARD_W;
        const y1 = rowY;

        // End point: left side of table B header
        const x2 = posB.x;
        const y2 = posB.y + HEADER_H / 2;

        const cx = (x1 + x2) / 2;

        // Draw curved path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'fk-arrow');
        path.setAttribute('d', `M ${x1},${y1} C ${cx},${y1} ${cx},${y2} ${x2},${y2}`);
        svg.appendChild(path);

        // Arrow head
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrow.setAttribute('class', 'fk-arrow-head');
        arrow.setAttribute('points', `${x2},${y2} ${x2 - 8},${y2 - 4} ${x2 - 8},${y2 + 4}`);
        svg.appendChild(arrow);
      });
    });
  }

  _loadSampleData() {
    const activeItem = this.activeFile && this.items[this.activeFile];
    if (!activeItem) return;

    const isMongo = this._isMongoFile(activeItem);

    if (!isMongo) {
      // SQL sample data
      const sql = `-- Sample data: Employees & Departments
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  budget REAL
);
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  departments_id INTEGER,
  salary REAL,
  FOREIGN KEY(departments_id) REFERENCES departments(id)
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  title TEXT,
  departments_id INTEGER
);
INSERT OR IGNORE INTO departments VALUES (1,'Engineering',500000);
INSERT OR IGNORE INTO departments VALUES (2,'Marketing',200000);
INSERT OR IGNORE INTO departments VALUES (3,'HR',150000);
INSERT OR IGNORE INTO employees VALUES (1,'Alice',1,95000);
INSERT OR IGNORE INTO employees VALUES (2,'Bob',2,72000);
INSERT OR IGNORE INTO employees VALUES (3,'Carol',1,88000);
INSERT OR IGNORE INTO employees VALUES (4,'Dave',3,65000);
INSERT OR IGNORE INTO employees VALUES (5,'Eve',1,91000);
INSERT OR IGNORE INTO projects VALUES (1,'Platform v2',1);
INSERT OR IGNORE INTO projects VALUES (2,'Brand Refresh',2);
INSERT OR IGNORE INTO projects VALUES (3,'Onboarding Flow',3);`;
      this.runSql(sql);
    } else {
      // MongoDB sample data
      const mongo = `db.collection('products').insertMany([
  {_id:1, name:'Laptop', price:999, category:'Electronics', stock:50},
  {_id:2, name:'Phone', price:599, category:'Electronics', stock:120},
  {_id:3, name:'Desk', price:299, category:'Furniture', stock:30},
  {_id:4, name:'Chair', price:199, category:'Furniture', stock:45},
  {_id:5, name:'Monitor', price:449, category:'Electronics', stock:60}
]);
db.collection('orders').insertMany([
  {_id:1, productId:1, qty:2, status:'delivered', customer:'Alice'},
  {_id:2, productId:2, qty:1, status:'pending', customer:'Bob'},
  {_id:3, productId:3, qty:4, status:'shipped', customer:'Carol'},
  {_id:4, productId:1, qty:1, status:'pending', customer:'Dave'}
]);
db.collection('customers').insertMany([
  {_id:1, name:'Alice', email:'alice@example.com', tier:'gold'},
  {_id:2, name:'Bob', email:'bob@example.com', tier:'silver'},
  {_id:3, name:'Carol', email:'carol@example.com', tier:'gold'},
  {_id:4, name:'Dave', email:'dave@example.com', tier:'bronze'}
]);
print('✓ Sample data loaded: products, orders, customers');`;
      this.runMongo(mongo);
    }
  }

  _resetDbVis() {
    const activeItem = this.activeFile && this.items[this.activeFile];
    if (!activeItem) return;

    const isMongo = this._isMongoFile(activeItem);

    if (!isMongo) {
      // Reset SQL: create new empty database
      if (this.sqlDb) {
        this.sqlDb.close();
        this.sqlDb = null;
      }
      this.dbVisCardPositions = {};
      this.dbVisLastChange = null;
      this._renderDbVisEmpty('Database reset — run a query to start fresh');
      this.addOutput('log', '🗑 SQL database reset');
    } else {
      // Reset MongoDB collections
      if (this.mongoEngine) this.mongoEngine.resetAll();
      this.dbVisCardPositions = {};
      this.dbVisLastChange = null;
      this._renderDbVisEmpty('Database reset — insert documents to start fresh');
      this.addOutput('log', '🗑 MongoDB database reset');
    }
  }

  addInlineDecoration(lineNumber, text, isComplexity = false) {
    if (!this.editor || !this.decorationCollection) return;
    if (isComplexity) return;

    const display = text.length > 60 ? text.substring(0, 60) + '...' : text;

    const range = new monaco.Range(lineNumber, 1, lineNumber, 2000);
    const newDeco = {
      range: range,
      options: {
        isWholeLine: false,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        after: {
          content: display,
          inlineClassName: 'inline-result-decoration',
          cursorStops: monaco.editor.InjectedTextCursorStops.None
        }
      }
    };

    if (!this.currentDecorationsList) this.currentDecorationsList = [];

    this.currentDecorationsList.push(newDeco);
    this.decorationCollection.set(this.currentDecorationsList);
  }

  // ===== Command Palette =====
  initCommandPalette() {
    this.commands = [
      { name: 'Run Code', shortcut: 'F5', category: 'Run', action: () => this.runCode() },
      { name: 'Stop Execution', shortcut: 'Shift+F5', category: 'Run', action: () => this.stopRun() },
      { name: 'New File', shortcut: 'Ctrl+N', category: 'File', action: () => this.createNewItem('file') },
      { name: 'New React Project', shortcut: '', category: 'File', action: () => this.createReactProject() },
      { name: 'New React File', shortcut: '', category: 'File', action: () => this.createNewItem('file', null, '.jsx') },
      { name: 'New Folder', shortcut: '', category: 'File', action: () => this.createNewItem('folder') },
      { name: 'Clear Terminal', shortcut: '', category: 'Terminal', action: () => { this.terminal.clear(); } },
      {
        name: 'Clear All', shortcut: '', category: 'Edit', action: () => {
          this.terminal.clear();
          this.outputLog = [];
          if (this.editor) this.editor.setValue('');
          this.clearInlineDecorations();
        }
      },
      { name: 'Run Benchmark', shortcut: '', category: 'Run', action: () => this.runBenchmark() },
      { name: 'Show Memory View', shortcut: '', category: 'View', action: () => this.showMemoryView() },
      { name: 'Toggle React Preview', shortcut: '', category: 'View', action: () => this.toggleReactPreview() },
      { name: 'Show Code Flow Visualizer', shortcut: '', category: 'View', action: () => this.showEventLoopView() },
      { name: 'Clear Inline Output', shortcut: '', category: 'Edit', action: () => this.clearInlineDecorations() },
      { name: 'Toggle Auto Run', shortcut: '', category: 'Run', action: () => this.toggleAutoRun() },
      { name: 'Toggle Fresh Runtime', shortcut: '', category: 'Run', action: () => this.toggleFreshRun() },
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
        name: 'Compare with Reference', shortcut: '', category: 'Diff',
        action: () => this.initDiffEditor()
      },
      {
        name: 'Open DSA Patterns', shortcut: '', category: 'Patterns',
        action: () => document.getElementById('patternsActivityBtn')?.click()
      },
      {
        name: 'Show Golden Theorems', shortcut: '', category: 'Patterns',
        action: () => {
          // Open patterns panel if not open
          const btn = document.getElementById('patternsActivityBtn');
          if (btn && !btn.classList.contains('active')) btn.click();
          // Expand theorems after a short delay to let the panel open
          setTimeout(() => {
            const list = document.getElementById('goldenTheoremsList');
            const toggle = document.getElementById('goldenTheoremsToggle');
            if (list && list.classList.contains('hidden')) {
              list.classList.remove('hidden');
              if (toggle) toggle.textContent = '✦ 10 Golden Theorems ▼';
              if (!list.dataset.rendered && window.GOLDEN_THEOREMS) {
                list.innerHTML = window.GOLDEN_THEOREMS.map(t => `
                  <div class="golden-theorem-card">
                    <div class="golden-theorem-number">#${t.number}</div>
                    <div class="golden-theorem-rule">${t.rule}</div>
                    <div class="golden-theorem-example">${t.example}</div>
                  </div>`).join('');
                list.dataset.rendered = '1';
              }
            }
          }, 150);
        }
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
        const memoryModal = document.getElementById('memoryModal');
        if (memoryModal && !memoryModal.classList.contains('hidden')) this.closeMemoryView();
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

  // ===== DSA Patterns System =====

  initPatterns() {
    const listEl = document.getElementById('patternsList');
    if (!listEl || !window.DSA_PATTERNS) return;

    window.DSA_PATTERNS.forEach((pattern, index) => {
      const btn = document.createElement('div');
      btn.className = 'sidebar-item pattern-list-item';
      btn.dataset.id = pattern.id;
      btn.style.cursor = 'pointer';
      btn.innerHTML = `
        <div class="sidebar-item-label" style="padding-left:12px;gap:8px;display:flex;align-items:center;">
          <span class="pattern-list-emoji">${pattern.emoji}</span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;">${index + 1}. ${pattern.name}</span>
          <span class="pattern-category-tag">${pattern.category}</span>
        </div>`;
      btn.addEventListener('click', () => this.loadPattern(pattern.id));
      listEl.appendChild(btn);
    });

    document.getElementById('patternBackBtn')?.addEventListener('click', () => {
      document.getElementById('patternDetail')?.classList.add('hidden');
      document.getElementById('patternsList')?.classList.remove('hidden');
    });

    document.getElementById('goldenTheoremsToggle')?.addEventListener('click', () => {
      const list = document.getElementById('goldenTheoremsList');
      const toggle = document.getElementById('goldenTheoremsToggle');
      if (!list) return;
      const isHidden = list.classList.contains('hidden');
      if (isHidden) {
        if (!list.dataset.rendered && window.GOLDEN_THEOREMS) {
          list.innerHTML = window.GOLDEN_THEOREMS.map(t => `
            <div class="golden-theorem-card">
              <div class="golden-theorem-number">#${t.number}</div>
              <div class="golden-theorem-rule">${t.rule}</div>
              <div class="golden-theorem-example">${t.example}</div>
            </div>`).join('');
          list.dataset.rendered = '1';
        }
        list.classList.remove('hidden');
        if (toggle) toggle.textContent = '✦ 10 Golden Theorems ▼';
      } else {
        list.classList.add('hidden');
        if (toggle) toggle.textContent = '✦ 10 Golden Theorems ▶';
      }
    });
  }

  loadPattern(id) {
    const pattern = window.DSA_PATTERNS?.find(p => p.id === id);
    if (!pattern) return;

    // Highlight selected in list
    document.querySelectorAll('.pattern-list-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id);
    });

    // Swap list → detail
    document.getElementById('patternsList')?.classList.add('hidden');
    const detailEl = document.getElementById('patternDetail');
    if (detailEl) detailEl.classList.remove('hidden');

    // Populate header
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('patternEmoji', pattern.emoji);
    setText('patternName', pattern.name);
    const catBadge = document.getElementById('patternCategoryBadge');
    if (catBadge) catBadge.textContent = pattern.category;

    // Motivation
    setText('patternMotivation', pattern.motivation);

    // When to use
    const wtuEl = document.getElementById('patternWhenToUse');
    if (wtuEl) wtuEl.innerHTML = (pattern.whenToUse || []).map(item => `<li>${item}</li>`).join('');

    // Key insight
    setText('patternKeyInsight', pattern.keyInsight);

    // Problems
    const problemsEl = document.getElementById('patternProblems');
    if (problemsEl) {
      problemsEl.innerHTML = (pattern.problems || []).map((prob, i) => `
        <div class="pattern-problem-card" data-pattern-id="${pattern.id}" data-problem-index="${i}">
          <div class="problem-title">${prob.title}</div>
          <div class="problem-description">${prob.description}</div>
          <div class="problem-lang-tabs">
            <button class="prob-lang-btn active" data-lang="javascript" data-pattern="${pattern.id}" data-index="${i}">JS</button>
            <button class="prob-lang-btn" data-lang="python" data-pattern="${pattern.id}" data-index="${i}">Python</button>
          </div>
          <pre class="pattern-code-block" id="code-block-${pattern.id}-${i}">${this._escapeHtml(prob.code.javascript)}</pre>
          <button class="pattern-load-btn" data-pattern-id="${pattern.id}" data-problem-index="${i}">▶ Load in Editor</button>
        </div>
      `).join('');

      // Wire language tabs
      problemsEl.querySelectorAll('.prob-lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const lang = btn.dataset.lang;
          const pId = btn.dataset.pattern;
          const idx = parseInt(btn.dataset.index, 10);
          const prob = window.DSA_PATTERNS.find(p => p.id === pId)?.problems[idx];
          if (!prob) return;
          const codeEl = document.getElementById(`code-block-${pId}-${idx}`);
          if (codeEl) codeEl.textContent = prob.code[lang] || '# No separate Python version — the concept is identical.';
          problemsEl.querySelectorAll(`.prob-lang-btn[data-pattern="${pId}"][data-index="${idx}"]`)
            .forEach(b => b.classList.toggle('active', b === btn));
        });
      });

      // Wire Load in Editor buttons
      problemsEl.querySelectorAll('.pattern-load-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const pId = btn.dataset.patternId;
          const idx = parseInt(btn.dataset.problemIndex, 10);
          const p = window.DSA_PATTERNS.find(p => p.id === pId);
          const prob = p?.problems[idx];
          if (!prob) return;
          const activeTab = problemsEl.querySelector(`.prob-lang-btn.active[data-pattern="${pId}"][data-index="${idx}"]`);
          const lang = activeTab?.dataset.lang || 'javascript';
          this.loadPatternInEditor(prob.code[lang], lang, p.name, prob.title);
        });
      });
    }

    // Reset golden theorems toggle state
    const gtToggle = document.getElementById('goldenTheoremsToggle');
    const gtList = document.getElementById('goldenTheoremsList');
    if (gtToggle) gtToggle.textContent = '✦ 10 Golden Theorems ▶';
    if (gtList) { gtList.classList.add('hidden'); }

    this.addOutput('log', `[DSA] Pattern: ${pattern.name} — ${pattern.problems.length} example(s) ready. Click "Load in Editor" to practice.`);
    this.switchPanel('output');
  }

  loadPatternInEditor(code, lang, patternName, problemTitle) {
    const header = `// ═══════════════════════════════════════\n// Pattern: ${patternName}\n// Problem: ${problemTitle}\n// ═══════════════════════════════════════\n\n`;
    const fullCode = header + code;

    if (!this.editor) return;

    this.editor.setValue(fullCode);

    // Update active file language if switching languages
    const file = this.items[this.activeFile];
    if (file && file.lang !== lang) {
      file.lang = lang;
      if (this.models[this.activeFile]) this.models[this.activeFile].dispose();
      this.models[this.activeFile] = monaco.editor.createModel(fullCode, this._getMonacoLang(lang));
      this.editor.setModel(this.models[this.activeFile]);
    }

    this.addOutput('log', `[Pattern] Loaded "${problemTitle}" (${lang}) into editor.`);
    this.addOutput('log', `Press Ctrl+Enter or the Run button to execute.`);
    this.switchPanel('output');
  }

  // ═══════════════════════════════════════════════════════
  //  CODE FLOW VISUALIZER  (Event Loop / Interpreter)
  // ═══════════════════════════════════════════════════════

  showEventLoopView() {
    const container = document.getElementById('flowView');
    const modal = document.getElementById('flowModal');
    const file = this.activeFile && this.items[this.activeFile];
    if (!container || !file || file.type !== 'file' || !this.editor) {
      if (container) container.innerHTML = '<div class="eloop-empty">Open a JavaScript or Python file to use the Code Flow Visualizer.</div>';
      if (modal) modal.classList.remove('hidden');
      return;
    }
    const lang = file.lang === 'python' ? 'python' : 'javascript';
    if (this._isSqlFile(file) || this._isMongoFile(file)) {
      if (container) container.innerHTML = '<div class="eloop-empty">Code Flow Visualizer supports JavaScript and Python files.</div>';
      if (modal) modal.classList.remove('hidden');
      return;
    }
    const data = this.buildEventLoopSteps(this.editor.getValue(), lang);
    container.innerHTML = this.renderEventLoopHtml(data);
    if (modal) modal.classList.remove('hidden');
    this.bindEventLoopInteractions(data);
  }

  closeEventLoopView() {
    document.getElementById('flowModal')?.classList.add('hidden');
  }

  buildEventLoopSteps(code, lang) {
    return lang === 'python' ? this._buildPythonFlowSteps(code) : this._buildJsEventLoopSteps(code);
  }

  _buildJsEventLoopSteps(code) {
    const steps = [];
    const has = (re) => re.test(code);
    const hasSetTimeout    = has(/\bsetTimeout\s*\(/);
    const hasSetInterval   = has(/\bsetInterval\s*\(/);
    const hasFetch         = has(/\bfetch\s*\(/);
    const hasPromise       = has(/\bnew Promise\s*\(|Promise\.(resolve|reject|all|race|allSettled)/);
    const hasThen          = has(/\.then\s*\(/);
    const hasAsync         = has(/\basync\s+(function|\w+\s*=>|\()/);
    const hasAwait         = has(/\bawait\b/);
    const hasEventListener = has(/\.addEventListener\s*\(/);
    const isAsync = hasSetTimeout || hasSetInterval || hasFetch || hasPromise || hasThen || hasAsync || hasAwait;

    const fnMatches = [...code.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+(\w+)|(?:^|\n)\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\(|[a-z_$])/gm)];
    const fnNames = [...new Set(fnMatches.map(m => m[1] || m[2]).filter(n => n && !['console','setTimeout','setInterval','Promise','fetch','require','module','exports'].includes(n)))];

    const tmMatch = code.match(/setTimeout\s*\([^,]+,\s*(\d+)/);
    const tmDelay = tmMatch ? tmMatch[1] : '1000';
    const ivMatch = code.match(/setInterval\s*\([^,]+,\s*(\d+)/);
    const ivDelay = ivMatch ? ivMatch[1] : '500';

    const push = (desc, subtext, callStack, webApis, taskQueue, microtasks, phase, activeZone) =>
      steps.push({ desc, subtext, callStack: callStack || [], webApis: webApis || [], taskQueue: taskQueue || [], microtasks: microtasks || [], phase, activeZone });

    push("Script starts executing",
      "The JS engine begins reading your file. JavaScript is single-threaded — only one thing runs at a time.",
      [], [], [], [], "start", null);

    push("Global Execution Context pushed onto Call Stack",
      "A global frame is created. All top-level code runs inside it. Think of it as the 'main' of your script.",
      ["(global)"], [], [], [], "sync", "callstack");

    if (fnNames.length > 0) {
      push(`Function${fnNames.length > 1 ? 's' : ''} defined: ${fnNames.slice(0, 3).map(n => n + '()').join(', ')}`,
        "Function declarations are stored on the heap. The name is bound in the current frame. Body is NOT called yet.",
        ["(global)"], [], [], [], "sync", "callstack");

      push(`${fnNames[0]}() is called`,
        `A new execution context for "${fnNames[0]}" is pushed. Local variables live here. The stack grows.`,
        [fnNames[0] + "()", "(global)"], [], [], [], "sync", "callstack");

      if (fnNames.length > 1) {
        push(`${fnNames[1]}() called from inside ${fnNames[0]}()`,
          "Each function call adds a new frame. Deep nesting = tall stack. Too deep → RangeError: Maximum call stack size exceeded.",
          [fnNames[1] + "()", fnNames[0] + "()", "(global)"], [], [], [], "sync", "callstack");
        push(`${fnNames[1]}() returns → frame popped`,
          "When a function returns, its frame is removed (popped). Control and the return value go back to the caller.",
          [fnNames[0] + "()", "(global)"], [], [], [], "sync", "callstack");
      }

      push(`${fnNames[0]}() returns → frame popped`,
        `${fnNames[0]} is done. Its locals are gone. The call stack shrinks.`,
        ["(global)"], [], [], [], "sync", "callstack");
    }

    if (hasSetTimeout) {
      push("setTimeout() called",
        "setTimeout is a browser Web API — not part of the JS engine. JS hands it off and moves on immediately.",
        ["setTimeout()", "(global)"], [], [], [], "webapi", "callstack");
      push(`Timer registered in Web APIs (${tmDelay}ms)`,
        `JS pops setTimeout off the stack. The browser starts the ${tmDelay}ms timer. JS keeps running — no blocking!`,
        ["(global)"], [`⏱ timer: ${tmDelay}ms`], [], [], "webapi", "webapis");
    }

    if (hasSetInterval) {
      push(`setInterval registered in Web APIs (every ${ivDelay}ms)`,
        "setInterval fires repeatedly until clearInterval is called. Each tick pushes a new callback to the Task Queue.",
        ["(global)"], [`🔁 interval: every ${ivDelay}ms`], [], [], "webapi", "webapis");
    }

    if (hasFetch) {
      const existingApis = [
        ...(hasSetTimeout ? [`⏱ timer: ${tmDelay}ms`] : []),
        ...(hasSetInterval ? [`🔁 interval: ${ivDelay}ms`] : [])
      ];
      push("fetch() → Web APIs (HTTP request)",
        "Network I/O runs outside the JS engine. The browser handles it. JS is free to keep executing other code.",
        hasFetch && !hasSetTimeout ? ["fetch()", "(global)"] : ["(global)"],
        [...existingApis, "🌐 HTTP request"], [], [], "webapi", "webapis");
    }

    if (isAsync) {
      const activeApis = [
        ...(hasSetTimeout ? [`⏱ timer: ${tmDelay}ms`] : []),
        ...(hasSetInterval ? [`🔁 interval: ${ivDelay}ms`] : []),
        ...(hasFetch ? ["🌐 HTTP request"] : [])
      ];
      push("Synchronous code done — call stack empty",
        "All sync code ran. The event loop now watches the queues and waits for work.",
        [], activeApis, [], [], "eventloop", "eventloop");

      if (hasPromise || hasThen || (hasAsync && !hasFetch)) {
        push("Promise resolves → .then() queued as Microtask",
          "Resolved Promises don't run immediately. Their callbacks enter the Microtask Queue — NOT the Task Queue.",
          [], hasSetTimeout ? [`⏱ timer: ${tmDelay}ms`] : [],
          [], ["then(result => ...)"], "async", "microtasks");
      }

      if (hasFetch && hasThen) {
        push("fetch() resolves → .then() queued as Microtask",
          "When the HTTP response arrives, the .then() callback is added to the Microtask Queue (high priority).",
          [], hasSetTimeout ? [`⏱ timer: ${tmDelay}ms`] : [],
          [], ["then(response => ...)"], "async", "microtasks");
      }

      if (hasPromise || hasThen || hasFetch) {
        push("⚡ Event Loop: drain ALL Microtasks first",
          "Critical rule: every time the call stack empties, ALL microtasks run before any Task Queue item. Always.",
          ["then callback"], hasSetTimeout ? [`⏱ timer: ${tmDelay}ms`] : [],
          hasSetTimeout ? ["setTimeout callback"] : [], [], "async", "microtasks");
        push("Microtask executes and returns",
          "The .then() callback runs to completion, pops off. The event loop checks for more microtasks first.",
          [], hasSetTimeout ? [`⏱ timer: ${tmDelay}ms`] : [],
          hasSetTimeout ? ["setTimeout callback"] : [], [], "async", "callstack");
      }

      if (hasAsync && hasAwait) {
        push("await keyword — async function suspends",
          "'await' pauses the function at that line and releases the call stack entirely. Other code can now run.",
          [], [...(hasFetch ? ["🌐 HTTP request"] : []), "async fn: paused"],
          [], [], "async", "webapis");
        push("Awaited value resolves → resume scheduled as Microtask",
          "The rest of the async function becomes a microtask. It will resume before any setTimeout callback.",
          [], [], [], ["async fn: resume"], "async", "microtasks");
        push("Async function resumes after await",
          "Execution continues from the next line after 'await', as if synchronous. The stack rebuilds.",
          ["async function"], [], [], [], "async", "callstack");
      }

      if (hasSetTimeout) {
        push(`Timer fires after ${tmDelay}ms → Task Queue`,
          "The browser moves the callback from Web APIs into the Task Queue (also called Macrotask Queue).",
          [], [], ["⚡ setTimeout callback"], [], "eventloop", "taskqueue");
        push("Event Loop: stack empty + microtasks empty → dequeue task",
          "Only now does the event loop pull a task. If new microtasks are queued during a task, they run before the next task.",
          ["setTimeout callback"], [], [], [], "eventloop", "callstack");
        push("setTimeout callback executes and returns",
          "The callback runs synchronously. When done, the stack empties and the event loop checks again.",
          [], [], hasSetInterval ? ["next interval tick"] : [], [], "sync", "callstack");
      }

      if (hasEventListener) {
        push("Event listeners wait in Web APIs (indefinitely)",
          "Registered handlers live in Web APIs forever until removed. They fire when the browser detects an event.",
          [], ["click → handler()", "keydown → handler()"], [], [], "webapi", "webapis");
        push("User event fires → handler → Task Queue",
          "When the user clicks, the browser moves the handler into the Task Queue. Same flow as setTimeout from here.",
          [], [], ["click handler()"], [], "eventloop", "taskqueue");
      }
    }

    push("All tasks complete ✓",
      isAsync
        ? "Call stack, Microtask Queue, and Task Queue are all empty. The event loop is idle, waiting for future events."
        : "All synchronous code ran. JavaScript is idle — the event loop watches for future events or user input.",
      [], hasEventListener ? ["(listeners active)"] : [], [], [], "done", null);

    return { steps, lang: 'javascript' };
  }

  _buildPythonFlowSteps(code) {
    const steps = [];
    const has = (re) => re.test(code);
    const hasDef       = has(/^\s*def\s+\w+/m);
    const hasClass     = has(/^\s*class\s+\w+/m);
    const hasAsync     = has(/^\s*async\s+def/m);
    const hasAwait     = has(/\bawait\b/);
    const hasImport    = has(/^(?:import|from)\s+/m);
    const hasThreading = has(/\bthreading\b/);
    const hasAsyncio   = has(/\basyncio\b/);
    const hasGenerator = has(/\byield\b/);

    const fns = [...code.matchAll(/^\s*(?:async\s+)?def\s+(\w+)/mg)].map(m => m[1]);
    const cls = [...code.matchAll(/^\s*class\s+(\w+)/mg)].map(m => m[1]);

    const push = (desc, subtext, callStack, webApis, taskQueue, microtasks, phase, activeZone) =>
      steps.push({ desc, subtext, callStack: callStack || [], webApis: webApis || [], taskQueue: taskQueue || [], microtasks: microtasks || [], phase, activeZone });

    push("Python interpreter starts",
      "Python reads your file, compiles it to bytecode, then executes it. No JIT — interpreted top to bottom.",
      [], [], [], [], "start", null);

    push("<module> frame pushed onto Call Stack",
      "A global frame for your module is created. All top-level code (indentation 0) runs inside this frame.",
      ["<module>"], [], [], [], "sync", "callstack");

    if (hasImport) {
      push("import statements run",
        "Python runs each imported module (unless cached in sys.modules) and binds names into the current namespace.",
        ["<module>"], [], [], [], "sync", "callstack");
    }

    if (hasDef && fns.length > 0) {
      push(`def ${fns[0]}(...) — function object created`,
        "The 'def' statement creates a function object on the heap and binds the name in the current frame. Body not run yet.",
        ["<module>"], [], [], [], "sync", "callstack");

      push(`${fns[0]}() is called`,
        "Python creates a new stack frame with its own local namespace and pushes it. Parameters become local variables.",
        [fns[0] + "()", "<module>"], [], [], [], "sync", "callstack");

      if (fns.length > 1) {
        push(`${fns[1]}() called from ${fns[0]}()`,
          "Each nested call adds a new frame. Python's default recursion limit is 1000 — exceeded → RecursionError.",
          [fns[1] + "()", fns[0] + "()", "<module>"], [], [], [], "sync", "callstack");
        push(`${fns[1]}() returns — frame popped`,
          "Return pops the frame. Local variables are released. The return value passes back to the caller's frame.",
          [fns[0] + "()", "<module>"], [], [], [], "sync", "callstack");
      }

      push(`${fns[0]}() returns — frame popped`,
        "The function's local variables are garbage-collected. Control returns to the <module> frame.",
        ["<module>"], [], [], [], "sync", "callstack");
    }

    if (hasClass && cls.length > 0) {
      push(`class ${cls[0]} — class body executes`,
        "Python executes the class body in a temporary namespace, defining methods and class attributes.",
        ["<class " + cls[0] + ">", "<module>"], [], [], [], "sync", "callstack");
      push(`${cls[0]} object created on heap`,
        "The class itself is an object! Stored on the heap, bound to the name in the module namespace.",
        ["<module>"], [], [], [], "sync", "callstack");
    }

    if (hasGenerator) {
      push("yield — generator suspends",
        "A generator pauses at 'yield', saves all local state, and hands a value to the caller. Unlike return, it can resume.",
        ["<module>"], ["generator (suspended)"], [], [], "webapi", "webapis");
      push("next() — generator resumes",
        "Calling next() pushes the generator's saved frame back and continues exactly from where it paused.",
        ["gen.__next__()", "<module>"], [], [], [], "sync", "callstack");
    }

    if (hasThreading) {
      push("GIL — Global Interpreter Lock",
        "Python's GIL allows only ONE thread to execute Python bytecode at a time. Threads are real OS threads but take turns.",
        ["<module>"], ["Thread-1: waiting", "Thread-2: waiting"], [], [], "webapi", "webapis");
      push("Thread-1 acquires GIL — runs Python bytecode",
        "A thread runs for ~5ms (sys.getswitchinterval), then Python forces a GIL release so others get a turn.",
        ["Thread-1: run()", "<module>"], ["Thread-2: waiting"], [], [], "webapi", "callstack");
      push("GIL switches to Thread-2",
        "The GIL is non-deterministic. For CPU-bound parallelism, use multiprocessing — each process has its own GIL.",
        ["Thread-2: run()", "<module>"], ["Thread-1: waiting"], [], [], "webapi", "callstack");
      push("I/O operations release the GIL automatically",
        "During file/network I/O, Python releases the GIL. Other threads can run Python code during the wait.",
        ["<module>"], ["Thread-1: I/O (GIL free)", "Thread-2: running ✓"], [], [], "webapi", "webapis");
    }

    if (hasAsyncio || (hasAsync && hasAwait)) {
      push("asyncio event loop starts",
        "asyncio is single-threaded cooperative concurrency. Coroutines voluntarily yield at 'await' — no GIL issues.",
        ["asyncio.run()", "<module>"], [], [], ["main() coroutine"], "async", "microtasks");
      push("async def coroutine runs until await",
        "A coroutine runs like normal sync code until it hits 'await'. Then it voluntarily suspends.",
        ["main()"], [], [], [], "async", "callstack");
      push("await — coroutine suspends, releases event loop",
        "The coroutine pauses. No thread is blocked. The event loop picks the next ready coroutine.",
        [], ["awaiting I/O"], [], ["other coroutines..."], "async", "microtasks");
      push("I/O completes → coroutine rescheduled",
        "asyncio adds the resumed coroutine to the ready queue. It will run on the next event loop iteration.",
        ["main() (resumed)"], [], [], [], "async", "callstack");
    }

    push("<module> completes ✓",
      hasThreading
        ? "All threads join. The program exits."
        : (hasAsyncio || (hasAsync && hasAwait))
          ? "The asyncio event loop closes. All coroutines finished."
          : "All top-level code finished. The interpreter exits.",
      [], [], [], [], "done", null);

    return { steps, lang: 'python', hasThreading };
  }

  renderEventLoopHtml(data) {
    const { steps, lang, hasThreading } = data;
    const isPython = lang === 'python';
    const hasAsyncio = isPython && steps.some(s => s.microtasks?.length);
    const first = steps[0] || {};

    // Labels per language
    const p2label = isPython ? 'I/O / Threads / Generators' : 'Web APIs';
    const p2tag   = isPython ? 'ASYNC I/O' : 'BROWSER';
    const p3label = isPython ? 'asyncio Task Queue' : 'Task Queue';
    const p3tag   = isPython ? 'TASKS' : 'MACROTASK';
    const p4label = isPython ? 'Coroutine Ready Queue' : 'Microtasks';
    const p4tag   = isPython ? 'ASYNCIO' : 'HIGH PRIORITY';

    // Center spine badge
    const badgeIcon  = isPython ? '⟳' : '↻';
    const badgeLabel = isPython
      ? (hasAsyncio ? 'asyncio\nEvent Loop' : 'Interpreter')
      : 'Event\nLoop';
    const badgeCls   = isPython ? 'eloop-loop-python' : '';

    // Priority note text
    const priorityNote = isPython
      ? (hasThreading ? 'GIL: one thread runs Python bytecode at a time'
                      : 'asyncio: coroutines cooperate at await points, no threads')
      : 'Microtasks drain completely before the next Task Queue item runs';

    // Flow label between queues (right column)
    const flow2to3 = isPython ? '↓ I/O completion fires task' : '↓ fires callback to queue';
    const flow3to4 = isPython ? '↓ next ready coroutine' : '↓ microtasks run before tasks ⚡';

    return `
      <div class="eloop-view">
        <div class="eloop-layout">

          <!-- LEFT: Call Stack (tall, grows from bottom) -->
          <div class="eloop-col-left">
            <div class="eloop-panel eloop-panel-stack" id="eloopCallStack">
              <div class="eloop-panel-head">
                <span class="eloop-panel-title">Call Stack</span>
                <span class="eloop-panel-tag stack">LIFO — newest on top</span>
              </div>
              <div class="eloop-panel-items" id="eloopCallStackItems">
                <div class="eloop-panel-empty">empty</div>
              </div>
            </div>
          </div>

          <!-- CENTER: Event Loop spine -->
          <div class="eloop-col-center">
            <div class="eloop-spine">
              <div class="eloop-spine-line"></div>
              <div class="eloop-spine-arrow">←</div>
              <div class="eloop-spine-line"></div>
              <div class="eloop-loop-badge ${this._escapeHtml(badgeCls)}" id="eloopIndicator">
                <span class="eloop-loop-icon">${this._escapeHtml(badgeIcon)}</span>
                <span class="eloop-loop-label">${this._escapeHtml(badgeLabel)}</span>
              </div>
              <div class="eloop-spine-line"></div>
              <div class="eloop-spine-arrow">→</div>
              <div class="eloop-spine-line"></div>
            </div>
          </div>

          <!-- RIGHT: Stacked queues -->
          <div class="eloop-col-right">
            <div class="eloop-panel" id="eloopWebApis">
              <div class="eloop-panel-head">
                <span class="eloop-panel-title">${this._escapeHtml(p2label)}</span>
                <span class="eloop-panel-tag webapi">${this._escapeHtml(p2tag)}</span>
              </div>
              <div class="eloop-panel-items" id="eloopWebApisItems">
                <div class="eloop-panel-empty">idle</div>
              </div>
            </div>
            <div class="eloop-flow-down">
              <span class="eloop-flow-down-arrow">↓</span>
              <span>${this._escapeHtml(flow2to3)}</span>
            </div>
            <div class="eloop-panel" id="eloopTaskQueue">
              <div class="eloop-panel-head">
                <span class="eloop-panel-title">${this._escapeHtml(p3label)}</span>
                <span class="eloop-panel-tag task">${this._escapeHtml(p3tag)}</span>
              </div>
              <div class="eloop-panel-items" id="eloopTaskQueueItems">
                <div class="eloop-panel-empty">empty</div>
              </div>
            </div>
            <div class="eloop-flow-down eloop-flow-priority">
              <span class="eloop-flow-down-arrow">↓</span>
              <span>${this._escapeHtml(flow3to4)}</span>
            </div>
            <div class="eloop-panel eloop-panel-micro" id="eloopMicrotaskPanel">
              <div class="eloop-panel-head">
                <span class="eloop-panel-title">${this._escapeHtml(p4label)}</span>
                <span class="eloop-panel-tag micro">${this._escapeHtml(p4tag)}</span>
              </div>
              <div class="eloop-panel-items" id="eloopMicrotasksItems">
                <div class="eloop-panel-empty">empty</div>
              </div>
            </div>
          </div>

        </div>
        <div class="eloop-priority-note">${this._escapeHtml(priorityNote)}</div>
        <div class="eloop-step-box">
          <div class="eloop-step-top">
            <span class="eloop-step-counter" id="eloopStepCounter">Step 1 / ${steps.length}</span>
            <span class="eloop-step-phase phase-${this._escapeHtml(first.phase || 'start')}" id="eloopStepPhase">${this._escapeHtml(first.phase || 'start')}</span>
          </div>
          <div class="eloop-step-desc" id="eloopStepDesc">${this._escapeHtml(first.desc || '')}</div>
          <div class="eloop-step-subtext" id="eloopStepSubtext">${this._escapeHtml(first.subtext || '')}</div>
        </div>
        <div class="eloop-controls">
          <div class="eloop-controls-nav">
            <button id="eloopRestart" class="eloop-btn" title="Restart">↩ Restart</button>
            <button id="eloopPrev" class="eloop-btn" title="Previous step" disabled>◄ Prev</button>
            <button id="eloopPlayPause" class="eloop-btn eloop-btn-play" title="Play">▶ Play</button>
            <button id="eloopNext" class="eloop-btn" title="Next step">Next ►</button>
          </div>
          <div class="eloop-controls-speed">
            <span class="eloop-speed-label">Speed</span>
            <button class="eloop-speed-btn" data-speed="2400">🐢 Slow</button>
            <button class="eloop-speed-btn eloop-speed-active" data-speed="1100">▶ Normal</button>
            <button class="eloop-speed-btn" data-speed="380">⚡ Fast</button>
          </div>
        </div>
      </div>
    `;
  }

  bindEventLoopInteractions(data) {
    const { steps } = data;
    let idx = 0, playing = false, timer = null, speed = 1100;

    const renderPanel = (elId, items, emptyText, isStack) => {
      const el = document.getElementById(elId);
      if (!el) return;
      if (!items || !items.length) { el.innerHTML = `<div class="eloop-panel-empty">${emptyText}</div>`; return; }
      // Stack: index 0 = top (most recently pushed). Render as-is — top item first in DOM = top of visual.
      el.innerHTML = items.map((item, i) =>
        `<div class="eloop-item${i === 0 && isStack ? ' eloop-item-top' : ''}">${this._escapeHtml(item)}</div>`
      ).join('');
    };

    const render = (i) => {
      const s = steps[i];
      if (!s) return;
      document.getElementById('eloopStepCounter').textContent = `Step ${i + 1} / ${steps.length}`;
      document.getElementById('eloopStepDesc').textContent = s.desc;
      document.getElementById('eloopStepSubtext').textContent = s.subtext;
      const phaseEl = document.getElementById('eloopStepPhase');
      if (phaseEl) { phaseEl.textContent = s.phase; phaseEl.className = `eloop-step-phase phase-${s.phase}`; }

      renderPanel('eloopCallStackItems', s.callStack, 'empty', true);
      renderPanel('eloopWebApisItems',   s.webApis,   'idle',  false);
      renderPanel('eloopTaskQueueItems', s.taskQueue,  'empty', false);
      renderPanel('eloopMicrotasksItems',s.microtasks, 'empty', false);

      ['eloopCallStack','eloopWebApis','eloopTaskQueue','eloopMicrotaskPanel'].forEach(id =>
        document.getElementById(id)?.classList.remove('is-active'));
      const zoneMap = { callstack:'eloopCallStack', webapis:'eloopWebApis', taskqueue:'eloopTaskQueue', microtasks:'eloopMicrotaskPanel', eventloop:'eloopCallStack' };
      if (s.activeZone && zoneMap[s.activeZone]) document.getElementById(zoneMap[s.activeZone])?.classList.add('is-active');

      document.getElementById('eloopIndicator')?.classList.toggle('is-spinning', s.phase === 'eventloop');
      document.getElementById('eloopPrev').disabled  = i === 0;
      document.getElementById('eloopNext').disabled  = i === steps.length - 1;
    };

    const goTo = (i) => { idx = Math.max(0, Math.min(steps.length - 1, i)); render(idx); };

    const stopPlay = () => {
      playing = false; clearTimeout(timer);
      const btn = document.getElementById('eloopPlayPause');
      if (btn) btn.textContent = '▶ Play';
    };

    const startPlay = () => {
      if (idx >= steps.length - 1) idx = 0;
      playing = true;
      const btn = document.getElementById('eloopPlayPause');
      if (btn) btn.textContent = '⏸ Pause';
      const tick = () => {
        if (!playing) return;
        if (idx >= steps.length - 1) { stopPlay(); return; }
        goTo(idx + 1);
        timer = setTimeout(tick, speed);
      };
      render(idx);
      timer = setTimeout(tick, speed);
    };

    document.getElementById('eloopPlayPause').addEventListener('click', () => playing ? stopPlay() : startPlay());
    document.getElementById('eloopPrev').addEventListener('click', () => { stopPlay(); goTo(idx - 1); });
    document.getElementById('eloopNext').addEventListener('click', () => { stopPlay(); goTo(idx + 1); });
    document.getElementById('eloopRestart').addEventListener('click', () => { stopPlay(); goTo(0); });

    document.querySelectorAll('.eloop-speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        speed = +btn.dataset.speed;
        document.querySelectorAll('.eloop-speed-btn').forEach(b => b.classList.remove('eloop-speed-active'));
        btn.classList.add('eloop-speed-active');
      });
    });

    render(0);
  }

  _escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

}

window.onload = () => { window.app = new EditorApp(); };
