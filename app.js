// ParadoxEditor: JS + Python practice in the browser

const outputEl = document.getElementById('output');
const complexityEl = document.getElementById('complexity');
const runBtn = document.getElementById('runBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearBtn = document.getElementById('clearBtn');
const pyStatus = document.getElementById('pyStatus');

let activeLang = 'js';
let editor;
let models = {};
let pyodide = null;

const jsStarter = `// JavaScript example\nfunction sum(arr) {\n  let s = 0;\n  for (let i = 0; i < arr.length; i++) {\n    s += arr[i];\n  }\n  return s;\n}\n\nconsole.log(sum([1,2,3,4]));`;

const pyStarter = `# Python example\ndef sum_list(arr):\n    s = 0\n    for x in arr:\n        s += x\n    return s\n\nprint(sum_list([1,2,3,4]))`;

function logOutput(msg) {
  outputEl.textContent += msg + "\n";
}

function clearOutput() {
  outputEl.textContent = "";
}

function setComplexity(msg) {
  complexityEl.textContent = msg;
}

function estimateComplexity(code, lang) {
  // Very rough heuristic: count nested loops and simple recursion.
  let loops = 0;
  let nestedScore = 0;
  let recursion = false;

  if (lang === 'js') {
    const loopMatches = code.match(/\b(for|while|forEach|map|reduce|filter)\b/g);
    loops = loopMatches ? loopMatches.length : 0;
    const nestedMatches = code.match(/for\s*\([^)]*\)[^{]*\{[^}]*for\s*\(/s);
    nestedScore = nestedMatches ? 2 : (loops > 1 ? 2 : 1);

    // recursion heuristic
    const fnMatch = code.match(/function\s+(\w+)\s*\(/);
    if (fnMatch) {
      const fn = fnMatch[1];
      const re = new RegExp(`\\b${fn}\\s*\\(`, 'g');
      const calls = (code.match(re) || []).length;
      recursion = calls > 1; // definition + call
    }
  } else {
    const loopMatches = code.match(/\b(for|while)\b/g);
    loops = loopMatches ? loopMatches.length : 0;
    const nestedMatches = code.match(/for\s+.*:\s*[\s\S]*for\s+.*:/m);
    nestedScore = nestedMatches ? 2 : (loops > 1 ? 2 : 1);

    const fnMatch = code.match(/def\s+(\w+)\s*\(/);
    if (fnMatch) {
      const fn = fnMatch[1];
      const re = new RegExp(`\\b${fn}\\s*\\(`, 'g');
      const calls = (code.match(re) || []).length;
      recursion = calls > 1;
    }
  }

  let estimate = 'O(1)';
  if (recursion && loops > 0) estimate = 'O(n * ?) (recursive + loops)';
  else if (recursion) estimate = 'O(?) recursive';
  else if (loops === 1) estimate = 'O(n)';
  else if (loops >= 2) estimate = nestedScore >= 2 ? 'O(n^2)' : 'O(n log n)';

  return `Estimated: ${estimate}\nLoops detected: ${loops}\nRecursion: ${recursion ? 'yes' : 'no'}\nNote: heuristic only.`;
}

async function loadPyodideIfNeeded() {
  if (pyodide) return pyodide;
  pyStatus.textContent = 'Pyodide: loading…';
  const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.mjs');
  pyodide = await loadPyodide();
  pyStatus.textContent = 'Pyodide: ready';
  return pyodide;
}

function initEditor() {
  window.require.config({
    paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.43.0/min/vs' }
  });

  window.require(['vs/editor/editor.main'], () => {
    models.js = monaco.editor.createModel(jsStarter, 'javascript');
    models.py = monaco.editor.createModel(pyStarter, 'python');

    editor = monaco.editor.create(document.getElementById('editor'), {
      model: models.js,
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: false }
    });
  });
}

async function runCode() {
  clearOutput();
  const code = editor.getValue();
  if (activeLang === 'js') {
    try {
      const consoleLog = console.log;
      console.log = (...args) => logOutput(args.join(' '));
      const fn = new Function(code);
      fn();
      console.log = consoleLog;
    } catch (e) {
      logOutput('Error: ' + e.message);
    }
  } else {
    try {
      const py = await loadPyodideIfNeeded();
      const result = await py.runPythonAsync(code);
      if (result !== undefined) logOutput(String(result));
    } catch (e) {
      logOutput('Error: ' + e.message);
    }
  }
}

function switchLang(lang) {
  activeLang = lang;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.lang === lang));
  if (editor && models[lang]) editor.setModel(models[lang]);
}

runBtn.addEventListener('click', runCode);
clearBtn.addEventListener('click', clearOutput);
analyzeBtn.addEventListener('click', () => {
  const code = editor.getValue();
  setComplexity(estimateComplexity(code, activeLang));
});

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchLang(tab.dataset.lang));
});

initEditor();
