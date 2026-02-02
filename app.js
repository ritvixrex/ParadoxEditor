// Embedded Complexity Analyzer to ensure availability across all protocols
const InternalAnalyzer = (() => {
  function stripCommentsAndStrings(code) {
    return code
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      .replace(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g, '""');
  }
  function detectRecursion(cleanCode, lang) {
    const patterns = lang === 'python'
      ? [/def\s+([a-zA-Z0-9_]+)\s*\(/]
      : [/function\s+([a-zA-Z0-9_$]+)\s*\(/, /(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:function|\([^)]*\)\s*=>)/];
    for (const pattern of patterns) {
      const match = cleanCode.match(pattern);
      if (match) {
        const fn = match[1];
        const body = cleanCode.substring(match.index + match[0].length);
        const re = new RegExp(`\\b${fn}\\b\\s*\\(`, 'g');
        if (re.test(body)) return true;
      }
    }
    return false;
  }
  function detectLogPattern(cleanCode, lang) {
    const logPatterns = lang === 'python'
      ? [/\w+\s*=\s*\w+\s*\/\s*2/, /\w+\s*\/=\s*2/, /\w+\s*\/\/=\s*2/, /binary_search/i, /mid\s*=/, /left.*right/i]
      : [/\w+\s*\/=\s*2/, /\w+\s*=\s*\w+\s*\/\s*2/, /\w+\s*>>=\s*1/, /Math\.floor\(/, /binarySearch/i, /mid\s*=/, /left.*right/i, /low.*high/i];
    return logPatterns.some(p => p.test(cleanCode));
  }
  function maxLoopNesting(cleanCode, lang) {
    const loopKeywords = lang === 'python'
      ? ['for ', 'while ']
      : ['for ', 'while ', '.forEach(', '.map(', '.filter(', '.reduce('];
    const tokens = cleanCode.split(/({|})/);
    let currentDepth = 0;
    let activeLoopDepths = [];
    let maxNesting = 0;
    tokens.forEach(token => {
      if (token === '{') { currentDepth++; }
      else if (token === '}') {
        activeLoopDepths = activeLoopDepths.filter(d => d < currentDepth);
        currentDepth = Math.max(0, currentDepth - 1);
      } else {
        if (loopKeywords.some(kw => token.includes(kw))) {
          activeLoopDepths.push(currentDepth);
          maxNesting = Math.max(maxNesting, activeLoopDepths.length);
        }
      }
    });
    return maxNesting;
  }

  // Space complexity detection
  function analyzeSpace(cleanCode, lang, hasRecursion) {
    // Check for new array/list creation inside loops
    const arrayInLoop = lang === 'python'
      ? /(?:for|while)[^:]*:[\s\S]*?\[/
      : /(?:for|while)\s*\([^)]*\)\s*{[\s\S]*?\[\s*\]/;

    // New array/list creation patterns
    const newArrayPatterns = lang === 'python'
      ? [/\[\s*\]/, /list\(/, /dict\(/, /set\(/, /\.copy\(\)/, /\[.*for.*in/]
      : [/\[\s*\]/, /new\s+Array/, /\.slice\(/, /\.concat\(/, /\.map\(/, /\.filter\(/, /\[\.\.\./];

    // Check for growing data structures
    const growingPatterns = lang === 'python'
      ? [/\.append\(/, /\.extend\(/, /\.add\(/]
      : [/\.push\(/, /\.unshift\(/, /\.concat\(/];

    const hasNewArray = newArrayPatterns.some(p => p.test(cleanCode));
    const hasGrowing = growingPatterns.some(p => p.test(cleanCode));
    const hasArrayInLoop = arrayInLoop.test(cleanCode);

    // Determine space complexity
    if (hasRecursion) {
      // Recursive functions have at least O(n) space for call stack
      return hasNewArray ? 'O(n)' : 'O(n)';
    }
    if (hasArrayInLoop) {
      return 'O(n²)';
    }
    if (hasGrowing || hasNewArray) {
      return 'O(n)';
    }
    return 'O(1)';
  }

  function analyze(code, lang = 'javascript') {
    if (!code || typeof code !== 'string') return { time: 'O(1)', best: 'O(1)', worst: 'O(1)', space: 'O(1)' };
    const clean = stripCommentsAndStrings(code);
    const hasRecursion = detectRecursion(clean, lang);
    const hasLog = detectLogPattern(clean, lang);
    const nesting = maxLoopNesting(clean, lang);

    let time, best, worst;

    // Divide-and-conquer: recursion + halving pattern = O(log n)
    if (hasRecursion && hasLog) {
      time = 'O(log n)';
      best = 'O(1)';
      worst = 'O(log n)';
    } else if (hasRecursion) {
      time = 'O(2^n)';
      best = 'O(1)';
      worst = 'O(2^n)';
    } else if (nesting === 1 && hasLog) {
      // Single loop with halving pattern (iterative binary search) = O(log n)
      time = 'O(log n)';
      best = 'O(1)';
      worst = 'O(log n)';
    } else if (nesting === 0) {
      time = hasLog ? 'O(log n)' : 'O(1)';
      best = 'O(1)';
      worst = time;
    } else if (nesting === 1) {
      time = 'O(n)';
      best = 'O(n)';
      worst = time;
    } else if (nesting === 2) {
      time = hasLog ? 'O(n² log n)' : 'O(n²)';
      best = 'O(n²)';
      worst = time;
    } else {
      time = `O(n^${nesting})`;
      best = time;
      worst = time;
    }

    const space = analyzeSpace(clean, lang, hasRecursion);
    return { time, best, worst, space };
  }
  return {
    analyzeFull: (code, lang) => {
      const res = analyze(code, lang);
      const timePart = res.best === res.worst ? res.time : `${res.time}`;
      const singleLine = `Time: ${timePart} | Space: ${res.space}`;
      return { ...res, summary: singleLine, singleLine };
    }
  };
})();

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
        const model = monaco.editor.createModel(file.content || '', file.lang || 'javascript');
        this.models[file.id] = model;
      }
    });

    this.editor = monaco.editor.create(document.getElementById('editor'), {
      model: this.models[this.activeFile] || null,
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: false },
      fontFamily: 'var(--font-code)',
      cursorSmoothCaretAnimation: 'on',
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      roundedSelection: true,
      scrollBeyondLastLine: false,
      padding: { top: 10, bottom: 10 },
      bracketPairColorization: { enabled: true },
      lineNumbersMinChars: 3
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
    document.getElementById('analyzeBtn').addEventListener('click', () => this.analyzeComplexity());
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

  async autoUpdate() {
    this.analyzeComplexity();

    // Ghost execution for inline output (JS only for now)
    const file = this.items[this.activeFile];
    if (file && file.lang === 'javascript') {
      const code = this.editor.getValue();
      // Skip if code is too long or looks dangerous (very basic check)
      if (code.length > 5000 || code.includes('while(true)') || code.includes('while (true)')) return;

      // We run a silent version of runCode
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

  analyzeComplexity() {
    const file = this.items[this.activeFile];
    if (!file) return;
    const lang = file.lang === 'python' ? 'python' : 'javascript';
    const code = this.editor.getValue();

    // Use internal analyzer if window one is missing
    const analyzer = window.ComplexityAnalyzer || InternalAnalyzer;
    const result = analyzer.analyzeFull(code, lang);

    // Show in panel
    const text = result ? result.summary : 'Analysis failed.';
    const panelEl = document.getElementById('complexity');
    if (panelEl) panelEl.innerText = text;

    // Add inline decoration to function definitions
    if (result && this.editor) {
      if (!this.decorationCollection) {
        this.decorationCollection = this.editor.createDecorationsCollection([]);
      }

      // Clear old complexity decorations specifically
      this.currentDecorationsList = (this.currentDecorationsList || []).filter(d =>
        !d.options.after || d.options.after.inlineClassName !== 'inline-complexity-decoration'
      );

      const lines = code.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i].trim();
        if (lineText.match(/^(function\s+|def\s+|const\s+\w+\s*=\s*(\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>|class\s+)/)) {
          const lineNumber = i + 1;
          this.addInlineDecoration(lineNumber, ` // ${result.singleLine}`, true);
          break;
        }
      }
    }
  }

}

window.onload = () => { window.app = new EditorApp(); };
