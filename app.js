
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
    this.buildVersion = '2026-02-23.2';
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
    this.initResizing();
    this.initEventListeners();
    this.initCommandPalette();
    this.renderSidebar();
    this.initPatterns();
    this.initDbCheatsheets();
    this.initDbVis();
    this.updateTabs();
    this.updateBreadcrumbs();
    // Belt-and-suspenders: force correct vis panel state after full init
    this._syncDbVisPanel();
    this._syncRunControls();
    setTimeout(() => {
      this._syncRunControls();
      this._syncDbVisPanel();
    }, 0);

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

      // Backfill legacy saved files so SQL/Mongo detection is consistent.
      Object.values(this.items).forEach(item => {
        if (!item || item.type !== 'file') return;
        const inferredLang = this._getLang(item.name || '');
        if (!item.lang || this._nameHasExt(item.name, '.py') || this._nameHasExt(item.name, '.sql') || this._nameHasExt(item.name, '.mongo') || this._nameHasExt(item.name, '.js')) {
          item.lang = inferredLang;
        }
      });

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
    document.getElementById('clearBtn').addEventListener('click', () => {
      this.terminal.clear();
      this.outputLog = [];
      const outputEl = document.getElementById('output');
      if (outputEl) outputEl.innerHTML = '';
      if (this.editor) this.editor.setValue('');
      if (this.decorationCollection) this.decorationCollection.clear();
      this.currentDecorationsList = [];
    });
    document.getElementById('newFileBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.showLangPicker(e.currentTarget);
    });
    document.getElementById('newFolderBtn').addEventListener('click', () => this.createNewItem('folder'));
    document.getElementById('benchmarkBtn').addEventListener('click', () => this.runBenchmark());
    document.getElementById('diffBtn')?.addEventListener('click', () => this.initDiffEditor());
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

  _getLang(name) {
    if (this._nameHasExt(name, '.py')) return 'python';
    if (this._nameHasExt(name, '.sql')) return 'sql';
    if (this._isMongoFile(name)) return 'javascript'; // Mongo shell is JS-like
    return 'javascript';
  }

  _getMonacoLang(lang) {
    if (lang === 'python') return 'python';
    if (lang === 'sql') return 'sql';
    return 'javascript';
  }

  _getFileIconHtml(name) {
    if (this._nameHasExt(name, '.js')) return '<span class="file-icon file-icon-js">JS</span>';
    if (this._nameHasExt(name, '.py')) return '<span class="file-icon file-icon-py">PY</span>';
    if (this._nameHasExt(name, '.sql')) return '<span class="file-icon file-icon-sql">SQL</span>';
    if (this._isMongoFile(name)) return '<span class="file-icon file-icon-mongo">MDB</span>';
    return '<span class="file-icon file-icon-default"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg></span>';
  }

  _getFolderIconHtml(isExpanded) {
    return isExpanded
      ? `<span class="file-icon file-icon-folder-open"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="2" y1="10" x2="22" y2="10"></line></svg></span>`
      : `<span class="file-icon file-icon-folder"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></span>`;
  }

  // ─── Create new file/folder with inline input ──────────────────────────────
  createNewItem(type, parentId = null, defaultExt = '') {
    const targetParentId = parentId || this.activeFolderId || null;
    const explorer = document.getElementById('fileExplorer');
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
        this.items[id] = { id, name, type: 'folder', parentId: targetParentId };
        if (!targetParentId) this.rootIds.push(id);
        else if (targetParentId) this.expandedFolders.add(targetParentId);
      } else {
        const isMongo = this._isMongoFile(name);
        const defaultContent = lang === 'python' ? '# Python\n' : lang === 'sql' ? '-- SQL\n' : isMongo ? '// MongoDB\n// Use db.collection("name").find() etc.\n' : '// JavaScript\n';
        this.items[id] = { id, name, type: 'file', lang, content: defaultContent, parentId: targetParentId };
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
      this.activeFile = this.openFiles[0] || this.rootIds.find(r => this.items[r]?.type === 'file') || null;
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
    const openEditors = document.getElementById('openEditors');
    if (!explorer || !openEditors) return;
    explorer.innerHTML = ''; openEditors.innerHTML = '';

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

    // Sort root: folders first, then files, both alphabetically
    const sortedRootIds = [...this.rootIds].sort((a, b) => {
      const ia = this.items[a], ib = this.items[b];
      if (!ia || !ib) return 0;
      if (ia.type !== ib.type) return ia.type === 'folder' ? -1 : 1;
      return ia.name.localeCompare(ib.name);
    });

    if (sortedRootIds.length === 0) {
      explorer.innerHTML = '<div class="explorer-empty">No files yet<br><small>Click + to create a file</small></div>';
    } else {
      sortedRootIds.forEach(id => renderItem(id, explorer));
    }

    // Open Editors panel
    this.openFiles.forEach(id => {
      const file = this.items[id];
      if (!file || file.type === 'folder') return;
      const btn = document.createElement('button');
      btn.className = `tab${this.activeFile === id ? ' active' : ''}`;
      btn.innerHTML = `<div class="sidebar-item-label">${this._getFileIconHtml(file.name)}<span class="item-name">${this._escapeHtml(file.name)}</span></div>`;
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
      bc.innerHTML = `<span>src</span><span class="separator">/</span><span class="current-file">${item.name}</span>`;
    }
    // Keep run controls resilient even if DB visualizer logic errors.
    this._syncRunControls();
    try {
      this._syncDbVisPanel();
    } catch (e) {
      console.error('[ParadoxEditor] DB visualizer sync failed:', e);
      this._hideDbVis();
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

    // Complexity analysis — runs for JS and Python only (not SQL/mongo files)
    if (window.ComplexityAnalyzer && code.trim().length > 10 && !this._isDbFile(file)) {
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

    // Ghost execution for inline output (JS only, skip SQL/mongo files/python)
    if (file.lang === 'javascript' && !this._isMongoFile(file)) {
      if (code.length > 5000 || code.includes('while(true)') || code.includes('while (true)')) return;
      this.runCode(true);
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

    const code = this.editor.getValue();
    const file = this.items[this.activeFile];

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
        if (window.ComplexityAnalyzer && code.trim().length > 10) {
          try {
            const complexResult = window.ComplexityAnalyzer.analyzeFull(code, file.lang);
            this.addOutput('log', `[Complexity] Time: ${complexResult.time}  Space: ${complexResult.space}`);
          } catch (e) { /* ignore */ }
        }
      }

      if (this._isMongoFile(file)) {
        // MongoDB shell files — skip in silent mode
        if (silent) return;
        await this.runMongo(code);

      } else if (this._isSqlFile(file)) {
        // SQL files - skip in silent mode
        if (silent) return;
        await this.runSql(code);

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
`;
        if (!this.pyodide._pdx_init_done) {
          await this.pyodide.runPythonAsync(pySetup);
          this.pyodide._pdx_init_done = true;
        }

        await this.pyodide.runPythonAsync(`import builtins; builtins.print = __pdx_print_wrapper`);

        try {
          await this.pyodide.runPythonAsync(code);
        } catch (e) {
          const line = this.parsePyErrorLine(e);
          this.addOutput('error', e.message || String(e), line);
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
      this.addOutput('error', '✗ SQL Error: ' + e.message);
      this.terminal.writeln('\x1b[31m✗ ' + e.message + '\x1b[0m');
    }
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
      }
    };
  }

  async runMongo(code) {
    this._initMongoEngine();
    this.switchPanel('output');
    this.addOutput('log', '🍃 MongoDB Simulator (in-browser)');
    this.terminal.writeln('\x1b[32m🍃 MongoDB Simulator\x1b[0m');

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

    try {
      const fn = new Function('db', 'printJSON', 'print', 'use', '"use strict";\n' + code);
      const result = fn(db, printJSON, print, use);
      if (result instanceof Promise) await result;
    } catch (e) {
      this.addOutput('error', '✗ MongoDB Error: ' + e.message);
      this.terminal.writeln('\x1b[31m✗ ' + e.message + '\x1b[0m');
    }
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
