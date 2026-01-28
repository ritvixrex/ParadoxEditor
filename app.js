/**
 * ParadoxEditor: A VS Code replica in the browser.
 */

class EditorApp {
  constructor() {
    this.models = {};
    this.activeFile = 'index_js';
    this.activeLang = 'js';
    this.pyodide = null;
    this.terminal = null;
    this.fitAddon = null;
    this.editor = null;

    this.files = {
      'index_js': { name: 'index.js', content: `// JavaScript example\nfunction sum(arr) {\n  let s = 0;\n  for (let i = 0; i < arr.length; i++) {\n    s += arr[i];\n  }\n  return s;\n}\n\nconsole.log(sum([1,2,3,4]));`, lang: 'javascript' },
      'main_py': { name: 'main.py', content: `# Python example\ndef sum_list(arr):\n    s = 0\n    for x in arr:\n        s += x\n    return s\n\nprint(sum_list([1,2,3,4]))`, lang: 'python' }
    };

    this.init();
  }

  async init() {
    this.initTerminal();
    this.initMonaco();
    this.initResizing();
    this.initEventListeners();
  }

  initTerminal() {
    this.terminal = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#aeafad'
      },
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
      cursorBlink: true
    });
    this.fitAddon = new FitAddon.FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(document.getElementById('terminal-container'));
    this.fitAddon.fit();
    this.terminal.writeln('\x1b[1;34mWelcome to ParadoxEditor Terminal\x1b[0m');
    this.terminal.writeln('Type your code and press "Run" to see output here.');
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
        padding: { top: 10 }
      });

      this.editor.onDidChangeCursorPosition((e) => {
        const { lineNumber, column } = e.position;
        document.querySelector('.statusbar .section:last-child').innerHTML = `<span>Ln ${lineNumber}, Col ${column}</span>`;
      });

      this.renderExplorer();
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
        const width = e.clientX - 48; // Activity bar width
        if (width > 150 && width < 600) {
          sidebar.style.width = width + 'px';
        }
      } else if (isResizingPanel) {
        const height = window.innerHeight - e.clientY - 22; // Status bar height
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
    document.getElementById('clearBtn').addEventListener('click', () => this.clearTerminal());
    document.getElementById('analyzeBtn').addEventListener('click', () => this.analyzeComplexity());
    document.getElementById('exportBtn').addEventListener('click', () => this.exportProject());
    document.getElementById('newFileBtn').addEventListener('click', () => this.createNewFile());

    // Delegate file clicks
    document.getElementById('fileExplorer').addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) this.switchFile(tab.dataset.file);
    });

    // Switch panels
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchPanel(tab.dataset.panel));
    });
  }

  createNewFile() {
    const fileName = prompt('Enter file name (e.g. script.js or data.py):');
    if (!fileName) return;

    const id = fileName.replace('.', '_') + '_' + Date.now();
    const lang = fileName.endsWith('.py') ? 'python' : 'javascript';
    const content = lang === 'python' ? '# New Python file' : '// New JavaScript file';

    this.files[id] = { name: fileName, content, lang };
    this.models[id] = monaco.editor.createModel(content, lang);

    this.renderExplorer();
    this.switchFile(id);
  }

  renderExplorer() {
    const explorer = document.getElementById('fileExplorer');
    explorer.innerHTML = '';
    for (const [id, file] of Object.entries(this.files)) {
      const btn = document.createElement('button');
      btn.className = `tab ${this.activeFile === id ? 'active' : ''}`;
      btn.dataset.file = id;
      btn.innerHTML = `<span>${file.name}</span> <span class="delete-file" data-id="${id}">×</span>`;
      explorer.appendChild(btn);

      btn.querySelector('.delete-file').onclick = (e) => {
        e.stopPropagation();
        this.deleteFile(id);
      };
    }
  }

  deleteFile(id) {
    if (Object.keys(this.files).length <= 1) {
      alert('Cannot delete the last file.');
      return;
    }
    if (confirm(`Delete ${this.files[id].name}?`)) {
      delete this.files[id];
      if (this.models[id]) this.models[id].dispose();
      delete this.models[id];
      if (this.activeFile === id) {
        this.switchFile(Object.keys(this.files)[0]);
      }
      this.renderExplorer();
    }
  }

  switchFile(id) {
    if (!this.models[id]) return;
    this.activeFile = id;
    this.activeLang = this.files[id].lang === 'python' ? 'py' : 'js';

    this.renderExplorer();

    // Update tab headers (placeholder for multi-tab support)
    const tabsContainer = document.querySelector('.tabs');
    tabsContainer.innerHTML = `<div class="tabheader active">${this.files[id].name}</div>`;

    if (this.editor) {
      this.editor.setModel(this.models[id]);
    }
  }

  switchPanel(panelId) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === panelId));
    document.querySelectorAll('.panel-view').forEach(v => v.classList.toggle('active', v.id === `${panelId}-container`));
    if (panelId === 'terminal' && this.fitAddon) this.fitAddon.fit();
  }

  clearTerminal() {
    this.terminal.clear();
  }

  async loadPyodideIfNeeded() {
    if (this.pyodide) return this.pyodide;
    const statusEl = document.getElementById('pyStatus');
    statusEl.textContent = 'Pyodide: loading…';
    const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.mjs');
    this.pyodide = await loadPyodide();
    statusEl.textContent = 'Pyodide: ready';
    return this.pyodide;
  }

  async runCode() {
    this.switchPanel('terminal');
    const code = this.editor.getValue();
    this.terminal.writeln(`\r\n\x1b[1;32m[Running ${this.files[this.activeFile].name}...]\x1b[0m`);

    if (this.activeLang === 'js') {
      try {
        const consoleLog = (...args) => this.terminal.writeln(args.join(' '));
        const originalLog = console.log;
        console.log = consoleLog;
        try {
          const fn = new Function(code);
          fn();
        } finally {
          console.log = originalLog;
        }
      } catch (e) {
        this.terminal.writeln(`\x1b[1;31mError: ${e.message}\x1b[0m`);
      }
    } else {
      try {
        const py = await this.loadPyodideIfNeeded();
        // Redirect stdout
        py.setStdout({ batched: (str) => this.terminal.writeln(str) });
        py.setStderr({ batched: (str) => this.terminal.writeln(`\x1b[1;31m${str}\x1b[0m`) });
        await py.runPythonAsync(code);
      } catch (e) {
        this.terminal.writeln(`\x1b[1;31mError: ${e.message}\x1b[0m`);
      }
    }
  }

  async runBenchmark() {
    this.switchPanel('terminal');
    const code = this.editor.getValue();
    if (this.activeLang !== 'js') {
      this.terminal.writeln('\x1b[1;33mBenchmarking is currently only supported for JavaScript.\x1b[0m');
      return;
    }

    this.terminal.writeln(`\r\n\x1b[1;36m[Benchmarking ${this.files[this.activeFile].name}...]\x1b[0m`);
    const iterations = 5;
    let totalTime = 0;

    try {
      const fn = new Function(code);
      // Warm up
      fn();

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        const end = performance.now();
        totalTime += (end - start);
      }

      const avg = (totalTime / iterations).toFixed(4);
      this.terminal.writeln(`\x1b[1;32mAverage execution time over ${iterations} runs: ${avg}ms\x1b[0m`);
    } catch (e) {
      this.terminal.writeln(`\x1b[1;31mBenchmark Error: ${e.message}\x1b[0m`);
    }
  }

  exportProject() {
    let zipContent = "PARADOX EDITOR EXPORT\n\n";
    for (const [id, file] of Object.entries(this.files)) {
      const content = this.models[id] ? this.models[id].getValue() : file.content;
      zipContent += `FILE: ${file.name}\n${'='.repeat(file.name.length + 6)}\n${content}\n\n`;
    }

    const blob = new Blob([zipContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project_export.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  analyzeComplexity() {
    this.switchPanel('complexity');
    const code = this.editor.getValue();
    const result = this.estimateComplexity(code, this.activeLang);
    document.getElementById('complexity').textContent = result;
  }

  estimateComplexity(code, lang) {
    let loops = 0;
    let maxDepth = 0;
    let recursion = false;
    let logPatterns = false;

    if (lang === 'js') {
      // Loop detection
      const loopMatches = code.match(/\b(for|while|forEach|map|reduce|filter)\b/g);
      loops = loopMatches ? loopMatches.length : 0;

      // Nested loop depth (simple heuristic)
      const lines = code.split('\n');
      let currentDepth = 0;
      lines.forEach(line => {
        if (/\b(for|while)\b/.test(line)) {
          currentDepth++;
          if (currentDepth > maxDepth) maxDepth = currentDepth;
        }
        if (line.includes('}')) {
          currentDepth = Math.max(0, currentDepth - 1);
        }
      });

      // Recursion
      const fnMatch = code.match(/function\s+(\w+)\s*\(/) || code.match(/const\s+(\w+)\s*=\s*\([^)]*\)\s*=>/);
      if (fnMatch) {
        const fn = fnMatch[1];
        const re = new RegExp(`\\b${fn}\\s*\\(`, 'g');
        const calls = (code.match(re) || []).length;
        recursion = calls > 1;
      }

      // Logarithmic patterns
      if (code.includes('/ 2') || code.includes('>> 1') || code.includes('Math.floor')) {
        if (loops > 0) logPatterns = true;
      }
    } else {
      const loopMatches = code.match(/\b(for|while)\b/g);
      loops = loopMatches ? loopMatches.length : 0;

      let currentDepth = 0;
      code.split('\n').forEach(line => {
        const indent = line.search(/\S/);
        if (/\b(for|while)\b/.test(line)) {
          currentDepth++; // This is very rough for Python
          if (currentDepth > maxDepth) maxDepth = currentDepth;
        }
      });

      const fnMatch = code.match(/def\s+(\w+)\s*\(/);
      if (fnMatch) {
        const fn = fnMatch[1];
        const re = new RegExp(`\\b${fn}\\s*\\(`, 'g');
        const calls = (code.match(re) || []).length;
        recursion = calls > 1;
      }

      if (code.includes('// 2') || code.includes('>> 1')) logPatterns = true;
    }

    let estimate = 'O(1)';
    if (recursion) {
      estimate = 'O(2^n) or O(n!) - Potential exponential';
      if (logPatterns) estimate = 'O(log n) recursive';
    } else if (maxDepth >= 3) {
      estimate = `O(n^${maxDepth})`;
    } else if (maxDepth === 2) {
      estimate = 'O(n^2)';
    } else if (maxDepth === 1) {
      estimate = logPatterns ? 'O(log n)' : 'O(n)';
    } else if (loops > 1) {
      estimate = 'O(n)'; // Consecutive loops
    }

    return `Estimated Time Complexity: ${estimate}\n` +
      `--------------------------------\n` +
      `Max Loop Depth: ${maxDepth}\n` +
      `Total Loops: ${loops}\n` +
      `Recursion Detected: ${recursion ? 'Yes' : 'No'}\n` +
      `Logarithmic Patterns: ${logPatterns ? 'Yes' : 'No'}\n\n` +
      `Note: This is a static analysis heuristic and may be inaccurate for complex logic.`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new EditorApp();
});

