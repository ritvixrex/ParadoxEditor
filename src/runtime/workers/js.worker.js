const USER_LINE_OFFSET = 1;

function postEvent(requestId, event, payload) {
  self.postMessage({ requestId, event, payload });
}

function serialize(value) {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function sourceLine(code, line) {
  if (!line || line < 1) return '';
  return (String(code).split('\n')[line - 1] || '').trimEnd();
}

function makeError({ type = 'RuntimeError', message, line = null, column = null, stack = null, hint = null, code = '' }) {
  return {
    type,
    lang: 'js',
    message,
    line,
    column,
    stack,
    hint,
    source: sourceLine(code, line),
  };
}

function parseStack(stack = '') {
  const match = String(stack).match(/user\.js:(\d+):(\d+)/);
  if (!match) return { line: null, column: null };
  return {
    line: Math.max(1, Number(match[1]) - USER_LINE_OFFSET),
    column: Number(match[2]) || 1,
  };
}

function getHint(message = '') {
  if (/Unexpected token|missing\)|missing ]|missing }/i.test(message)) {
    return 'Check for a missing bracket, quote, comma, or parenthesis before this line.';
  }
  if (/is not defined/i.test(message)) {
    return 'Check the variable or function name and make sure it exists before use.';
  }
  if (/fetch|XMLHttpRequest|WebSocket|importScripts|postMessage/.test(message)) {
    return 'Network and worker APIs are blocked in the JavaScript sandbox.';
  }
  return null;
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (!a || !b || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => deepEqual(a[key], b[key]));
}

function createSandbox(requestId, stdin = null) {
  let logIndex = 0;
  const consoleApi = {
    log: (...args) => postEvent(requestId, 'console', { level: 'log', text: args.map(serialize).join(' '), index: logIndex++ }),
    warn: (...args) => postEvent(requestId, 'console', { level: 'warn', text: args.map(serialize).join(' '), index: null }),
    error: (...args) => postEvent(requestId, 'console', { level: 'error', text: args.map(serialize).join(' '), index: null }),
    info: (...args) => postEvent(requestId, 'console', { level: 'info', text: args.map(serialize).join(' '), index: null }),
  };

  const sandbox = {
    console: consoleApi,
    stdin,
    fetch: undefined,
    XMLHttpRequest: undefined,
    WebSocket: undefined,
    importScripts: undefined,
    postMessage: undefined,
    self: undefined,
    window: undefined,
    globalThis: undefined,
    Math,
    JSON,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };

  const proxy = new Proxy(sandbox, {
    has(target, prop) { return prop in target; },
    get(target, prop) {
      if (prop === Symbol.unscopables) return undefined;
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  sandbox.globalThis = proxy;
  return proxy;
}

async function executeCode(code, requestId, stdin) {
  const proxy = createSandbox(requestId, stdin);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runner = new AsyncFunction('sandbox', `with (sandbox) {\n${code}\n}\n//# sourceURL=user.js`);
  return runner(proxy);
}

async function handleRun(requestId, payload) {
  try {
    await executeCode(payload.code || '', requestId, payload.stdin);
    self.postMessage({ requestId, result: { success: true } });
  } catch (error) {
    const location = parseStack(error.stack || '');
    const type = /SyntaxError/.test(error.name || '') ? 'SyntaxError' : 'RuntimeError';
    self.postMessage({
      requestId,
      result: {
        error: makeError({
          type,
          message: error.message || String(error),
          line: location.line,
          column: location.column,
          stack: error.stack || null,
          hint: getHint(error.message || ''),
          code: payload.code || '',
        }),
      },
    });
  }
}

async function handleTests(requestId, payload) {
  const { code = '', functionName = '', tests = [] } = payload;
  const results = [];
  try {
    const proxy = createSandbox(requestId, null);
    const loader = new Function('sandbox', `with (sandbox) {\n${code}\nreturn (typeof ${functionName} !== 'undefined') ? ${functionName} : undefined;\n}\n//# sourceURL=user.js`);
    const fn = loader(proxy);
    if (typeof fn !== 'function') {
      throw new Error(`${functionName} is not defined as a function`);
    }
    for (const test of tests) {
      try {
        const actual = await fn(...(test.input || []));
        const pass = deepEqual(actual, test.expected);
        results.push({
          pass,
          label: test.label || '',
          expected: test.expected,
          actual,
          testInput: test.input,
        });
      } catch (error) {
        const location = parseStack(error.stack || '');
        results.push({
          pass: false,
          label: test.label || '',
          error: makeError({
            type: /SyntaxError/.test(error.name || '') ? 'SyntaxError' : 'RuntimeError',
            message: error.message || String(error),
            line: location.line,
            column: location.column,
            stack: error.stack || null,
            hint: getHint(error.message || ''),
            code,
          }),
          testInput: test.input,
          expected: test.expected,
        });
      }
    }
  } catch (error) {
    const location = parseStack(error.stack || '');
    results.push({
      pass: false,
      label: 'Setup error',
      error: makeError({
        type: /SyntaxError/.test(error.name || '') ? 'SyntaxError' : 'RuntimeError',
        message: error.message || String(error),
        line: location.line,
        column: location.column,
        stack: error.stack || null,
        hint: getHint(error.message || ''),
        code,
      }),
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
