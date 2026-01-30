// Configure require.js
    require.config({
      paths: {
        'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.43.0/min/vs',
        'xterm': 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm',
        'fit': 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit'
      }
    });

    // We need to handle the FitAddon carefully because it's usually bundled as a global or UMD
    // but with require.js it might behave differently.

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
          'index_js': { name: 'index.js', content: `console.log("Hello from ParadoxEditor!");\n\nconst data = [\n  { id: 1, name: "Alpha" },\n  { id: 2, name: "Beta" }\n];\n\nconsole.log("Current Data:", data);`, lang: 'javascript', type: 'file' },
          'main_py': { name: 'main.py', content: `print("Hello from Python!")\nprint("Line 2")\n\ndef greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("World"))`, lang: 'python', type: 'file' }
        };

        // Initialize when libraries are ready
        this.initLibraries();
      }

      async initLibraries() {
        require(['vs/editor/editor.main', 'xterm', 'fit'], (monaco, xterm, fit) => {
          // Attach to global for easy access (if needed) but use instances
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
        } catch (e) { console.warn('Persistence failed:', e); }
      }

      saveToStorage() {
        localStorage.setItem('paradox_files', JSON.stringify(this.files));
        localStorage.setItem('paradox_active', this.activeFile);
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
        for (const [id, file] of Object.entries(this.files)) {
          if (file.type === 'file') this.models[id] = monaco.editor.createModel(file.content, file.lang);
        }

        this.editor = monaco.editor.create(document.getElementById('editor'), {
          model: this.models[this.activeFile] || null,
          theme: 'vs-dark',
          automaticLayout: true,
          fontSize: 14,
          minimap: { enabled: false },
          fontFamily: 'var(--font-code)'
        });

        this.editor.onDidChangeModelContent(() => {
          if (this.activeFile) {
            this.files[this.activeFile].content = this.editor.getValue();
            this.saveToStorage();
          }
        });

        this.editor.onDidChangeCursorPosition((e) => {
          const { lineNumber, column } = e.position;
          const statusSection = document.querySelector('.statusbar .right');
          if (statusSection) statusSection.innerHTML = `Ln ${lineNumber}, Col ${column}`;
        });

        this.renderSidebar();
        this.updateTabs();
        this.updateBreadcrumbs();
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
          this.files[id] = { name, type: 'folder' };
        } else {
          const content = lang === 'python' ? '# Python' : '// JavaScript';
          this.files[id] = { name, content, lang, type: 'file' };
          if (typeof monaco !== 'undefined') this.models[id] = monaco.editor.createModel(content, lang);
          this.openFiles.push(id);
          this.switchFile(id);
        }
        this.renderSidebar();
        this.saveToStorage();
      }

      renderSidebar() {
        const explorer = document.getElementById('fileExplorer');
        const openEditors = document.getElementById('openEditors');
        if (!explorer || !openEditors) return;
        explorer.innerHTML = ''; openEditors.innerHTML = '';
        for (const [id, file] of Object.entries(this.files)) {
          explorer.appendChild(this.createFileItem(id, file));
        }
        this.openFiles.forEach(id => {
          if (this.files[id] && this.files[id].type !== 'folder') {
            openEditors.appendChild(this.createFileItem(id, this.files[id], true));
          }
        });
      }

      createFileItem(id, file, isOpenSection = false) {
        const btn = document.createElement('button');
        btn.className = `tab ${this.activeFile === id && !isOpenSection ? 'active' : ''}`;
        const icon = file.type === 'folder'
          ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
          : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;

        btn.innerHTML = `<div class="sidebar-item-label">${icon}<span>${file.name}</span></div>`;
        btn.addEventListener('click', () => file.type === 'file' && this.switchFile(id));
        return btn;
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
          const tab = document.createElement('div');
          tab.className = `tabheader ${this.activeFile === id ? 'active' : ''}`;
          tab.innerHTML = `<span>${this.files[id].name}</span>`;
          tab.addEventListener('click', () => this.switchFile(id));
          container.appendChild(tab);
        });
      }

      updateBreadcrumbs() {
        const bc = document.getElementById('breadcrumbs');
        if (bc && this.files[this.activeFile]) bc.innerHTML = `<span>src</span><span class="separator">/</span><span class="current-file">${this.files[this.activeFile].name}</span>`;
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

      async runCode() {
        this.switchPanel('terminal');
        const code = this.editor.getValue();
        const file = this.files[this.activeFile];
        this.terminal.writeln(`\r\n\x1b[1;36m➜ Executing ${file.name}...\x1b[0m`);
        this.capturedOutput = {}; this._clearDecorations();

        if (file.lang === 'javascript') {
          const originalLog = console.log;
          const lines = code.split('\n');
          const instrumented = lines.map((l, i) => {
            return l.replace(/\bconsole\.log\s*\(/g, `console.log("__pdx_ln__:${i + 1}", `);
          }).join('\n');

          console.log = (...args) => {
            let ln = null;
            if (args.length > 0 && typeof args[0] === 'string' && args[0].startsWith('__pdx_ln__:')) {
              ln = parseInt(args[0].split(':')[1]);
              args.shift();
            }
            const text = args.map(a => this.formatValue(a)).join(' ');
            this.terminal.writeln(text);
            if (ln) {
              if (!this.capturedOutput[ln]) this.capturedOutput[ln] = [];
              this.capturedOutput[ln].push(text);
              this.updateInlineDecorations();
            }
          };
          try {
            const wrapped = `(async () => {
              try {
                ${instrumented}
              } catch (e) {
                console.error(e);
              }
            })()`;
            new Function('console', wrapped)(console);
          } catch (e) {
            this.terminal.writeln(`\x1b[31m${e.message}\x1b[0m`);
          } finally {
            setTimeout(() => { if (console.log === originalLog) return; console.log = originalLog; }, 100);
          }
        } else if (file.lang === 'python') {
          if (!this.pyodide) {
            document.getElementById('pyStatus').innerText = 'Pyodide: loading...';
            try {
              this.pyodide = await loadPyodide();
              document.getElementById('pyStatus').innerText = 'Pyodide: ready';
            } catch (e) {
              this.terminal.writeln('\x1b[31mFailed to load Pyodide\x1b[0m');
              return;
            }
          }

          const lines = code.split('\n');
          const instrumentedLines = lines.map((l, i) => {
            return l.replace(/\bprint\s*\(/g, `__pdx_print(${i + 1}, `);
          });

          const instrumentedCode = instrumentedLines.join('\n');

          this.pyodide.globals.set('__pdx_print', (ln, ...args) => {
            const text = args.map(a => String(a)).join(' ');
            this.terminal.writeln(text);
            if (ln) {
              if (!this.capturedOutput[ln]) this.capturedOutput[ln] = [];
              this.capturedOutput[ln].push(text);
              this.updateInlineDecorations();
            }
          });

          try {
            await this.pyodide.runPythonAsync(instrumentedCode);
          } catch (e) {
            this.terminal.writeln(`\x1b[31m${e.message}\x1b[0m`);
          }
        }
      }

      updateInlineDecorations() {
        const decs = Object.entries(this.capturedOutput).map(([ln, outs]) => {
          const line = parseInt(ln);
          const model = this.editor.getModel();
          const maxCol = model ? model.getLineMaxColumn(line) : 1;
          return {
            range: new monaco.Range(line, maxCol, line, maxCol),
            options: {
              after: {
                content: ` // ${outs.join(', ')}`,
                inlineClassName: 'inline-output-decoration'
              },
              isWholeLine: false,
              stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
            }
          };
        });
        this.decorations = this.editor.deltaDecorations(this.decorations, decs);
      }

      _clearDecorations() { this.decorations = this.editor.deltaDecorations(this.decorations, []); }

      runBenchmark() {
        this.terminal.writeln('Benchmarking started...');
        const start = performance.now();
        try { new Function(this.editor.getValue())(); } catch (e) { }
        this.terminal.writeln(`Execution time: ${(performance.now() - start).toFixed(4)}ms`);
      }

      analyzeComplexity() {
        this.switchPanel('complexity');
        const file = this.files[this.activeFile];
        const lang = file.lang === 'python' ? 'python' : 'javascript';
        const result = window.ComplexityAnalyzer?.analyze(this.editor.getValue(), lang) || 'O(n)';
        document.getElementById('complexity').innerText = `Analysis: ${result}`;
      }

      exportProject() {
        alert('Project exported to console.');
        console.log(this.files);
      }
    }
    window.onload = () => { window.app = new EditorApp(); };
