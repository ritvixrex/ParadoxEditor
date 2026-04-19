export const RUNTIME_ERROR_TYPES = Object.freeze([
  'SyntaxError',
  'RuntimeError',
  'TimeoutError',
  'SandboxError',
]);

const LANG_LABELS = Object.freeze({
  js: 'JavaScript',
  python: 'Python',
  sql: 'SQL',
  mongo: 'MongoDB',
});

function getCodeLine(code = '', line = null) {
  if (!code || !line || line < 1) return '';
  return (String(code).split('\n')[line - 1] || '').trimEnd();
}

export function serializeRuntimeValue(value) {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

export function compareRuntimeValues(left, right) {
  return serializeRuntimeValue(left) === serializeRuntimeValue(right);
}

export function diffRuntimeValues(expected, actual) {
  const left = serializeRuntimeValue(expected);
  const right = serializeRuntimeValue(actual);
  if (left === right) return '';

  const max = Math.max(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) index += 1;

  const leftFocus = left.slice(Math.max(0, index - 12), Math.min(left.length, index + 28));
  const rightFocus = right.slice(Math.max(0, index - 12), Math.min(right.length, index + 28));
  return `Expected: ${leftFocus}\nActual:   ${rightFocus}`;
}

export function createRuntimeError({
  type = 'RuntimeError',
  lang = 'js',
  message = 'Unknown error',
  line = null,
  column = null,
  stack = null,
  hint = null,
  source = '',
  code = '',
  testInput,
  expected,
  actual,
} = {}) {
  const normalizedType = RUNTIME_ERROR_TYPES.includes(type) ? type : 'RuntimeError';
  const normalizedLine = Number.isFinite(line) && line > 0 ? line : null;
  const normalizedColumn = Number.isFinite(column) && column > 0 ? column : null;
  const normalizedSource = source || getCodeLine(code, normalizedLine);

  return {
    type: normalizedType,
    lang,
    message: String(message || 'Unknown error'),
    line: normalizedLine,
    column: normalizedColumn,
    stack: stack ? String(stack) : null,
    hint: hint ? String(hint) : null,
    source: normalizedSource || '',
    ...(testInput !== undefined ? { testInput } : {}),
    ...(expected !== undefined ? { expected } : {}),
    ...(actual !== undefined ? { actual } : {}),
  };
}

export function normalizeRuntimeError(error, defaults = {}) {
  if (!error) return createRuntimeError(defaults);
  if (error.type && error.lang && Object.prototype.hasOwnProperty.call(error, 'source')) {
    return createRuntimeError({ ...defaults, ...error });
  }
  return createRuntimeError({
    ...defaults,
    message: error.message || String(error),
    stack: error.stack || null,
  });
}

export function getRuntimeSourceLabel(error) {
  const langLabel = LANG_LABELS[error?.lang] || 'Runtime';
  const typeLabel = error?.type || 'RuntimeError';
  return `${langLabel} ${typeLabel}`;
}

export function formatRuntimeError(error) {
  const normalized = normalizeRuntimeError(error);
  const location = normalized.line ? ` (line ${normalized.line}${normalized.column ? `, col ${normalized.column}` : ''})` : '';
  return `${getRuntimeSourceLabel(normalized)}: ${normalized.message}${location}`;
}
