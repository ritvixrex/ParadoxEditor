let pyodideReady = null;
let pyodide = null;

function postEvent(requestId, event, payload) {
  self.postMessage({ requestId, event, payload });
}

function sourceLine(code, line) {
  if (!line || line < 1) return '';
  return (String(code).split('\n')[line - 1] || '').trimEnd();
}

function makeError({ type = 'RuntimeError', message, line = null, column = 1, stack = null, hint = null, code = '' }) {
  return {
    type,
    lang: 'python',
    message,
    line,
    column,
    stack,
    hint,
    source: sourceLine(code, line),
  };
}

function ensurePyodide() {
  if (pyodideReady) return pyodideReady;
  pyodideReady = (async () => {
    importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');
    pyodide = await self.loadPyodide();
    pyodide.globals.set('__pdx_post_stdout', (line, text) => {
      postEvent(self.__currentRequestId, 'stdout', { line, text });
    });
    await pyodide.runPythonAsync(`
import json
import inspect
import traceback

def __pdx_print_wrapper(*args, **kwargs):
    frame = inspect.currentframe().f_back
    line = frame.f_lineno
    text = " ".join(map(str, args))
    __pdx_post_stdout(line, text)

def __pdx_get_scope(fresh=False):
    global __pdx_scope
    if fresh or '__pdx_scope' not in globals():
        __pdx_scope = {'__builtins__': __builtins__}
    __pdx_scope['print'] = __pdx_print_wrapper
    return __pdx_scope

def __pdx_exec(code, fresh=False):
    scope = __pdx_get_scope(fresh)
    exec(compile(code, '<user>', 'exec'), scope, scope)

def __pdx_run_test(code, function_name, args_json):
    scope = {'__builtins__': __builtins__}
    scope['print'] = __pdx_print_wrapper
    exec(compile(code, '<user>', 'exec'), scope, scope)
    result = scope[function_name](*json.loads(args_json))
    return json.dumps(result)
`);
    return pyodide;
  })();
  return pyodideReady;
}

function extractPythonLine(message = '') {
  const match = String(message).match(/File "<user>", line (\d+)/);
  return match ? Number(match[1]) : null;
}

function getHint(message = '') {
  const raw = String(message);
  if (/TypeError/.test(raw)) return 'Check the argument types and the number of arguments passed to the function.';
  if (/AttributeError/.test(raw)) return 'This object does not have that attribute or method.';
  if (/ZeroDivisionError/.test(raw)) return 'Check the divisor before dividing.';
  if (/IndexError/.test(raw)) return 'Check that the index exists before reading or removing an item.';
  if (/KeyError/.test(raw)) return 'Use dict.get(...) or check that the key exists before reading it.';
  if (/NameError/.test(raw)) return 'Make sure the variable or function name exists before use.';
  if (/SyntaxError/.test(raw)) return 'Look for an unclosed bracket, quote, or a missing colon near this line.';
  if (/IndentationError/.test(raw)) return 'Python uses indentation as syntax. Check the spacing on this block.';
  return null;
}

function buildPythonError(error, code) {
  const message = error?.message || String(error);
  const line = extractPythonLine(message);
  const lines = String(message).split('\n').map((entry) => entry.trimEnd()).filter(Boolean);
  const cleanedFrames = lines.filter((entry) => entry.includes('<user>') || /^[A-Za-z]+Error:/.test(entry));
  const summary = [...cleanedFrames].reverse().find((entry) => /^[A-Za-z]+Error:/.test(entry))
    || lines[lines.length - 1]
    || 'Python runtime error';
  const typeMatch = summary.match(/^([A-Za-z]+Error):/);
  const type = typeMatch && typeMatch[1] === 'SyntaxError' ? 'SyntaxError' : 'RuntimeError';
  return makeError({
    type,
    message: summary,
    line,
    column: 1,
    stack: cleanedFrames.join('\n') || message,
    hint: getHint(message),
    code,
  });
}

async function handleRun(requestId, payload) {
  try {
    await ensurePyodide();
    self.__currentRequestId = requestId;
    await pyodide.runPythonAsync(`__pdx_exec(${JSON.stringify(payload.code || '')}, ${payload.fresh ? 'True' : 'False'})`);
    self.postMessage({ requestId, result: { success: true } });
  } catch (error) {
    self.postMessage({ requestId, result: { error: buildPythonError(error, payload.code || '') } });
  }
}

async function handleTests(requestId, payload) {
  const { code = '', functionName = '', tests = [] } = payload;
  const results = [];
  try {
    await ensurePyodide();
    self.__currentRequestId = requestId;
    for (const test of tests) {
      try {
        const raw = await pyodide.runPythonAsync(`__pdx_run_test(${JSON.stringify(code)}, ${JSON.stringify(functionName)}, ${JSON.stringify(JSON.stringify(test.input || []))})`);
        const actual = JSON.parse(raw);
        results.push({
          pass: JSON.stringify(actual) === JSON.stringify(test.expected),
          label: test.label || '',
          expected: test.expected,
          actual,
          testInput: test.input,
        });
      } catch (error) {
        results.push({
          pass: false,
          label: test.label || '',
          error: buildPythonError(error, code),
          expected: test.expected,
          testInput: test.input,
        });
      }
    }
  } catch (error) {
    results.push({
      pass: false,
      label: 'Setup error',
      error: buildPythonError(error, code),
    });
  }
  self.postMessage({ requestId, result: { results } });
}

self.onmessage = async (event) => {
  const { requestId, action, payload } = event.data || {};
  if (action === 'tests') {
    await handleTests(requestId, payload || {});
    return;
  }
  await handleRun(requestId, payload || {});
};
