import {
  compareRuntimeValues,
  createRuntimeError,
  diffRuntimeValues,
  serializeRuntimeValue,
} from '../runtime/errors.js';

export function renderTestDetail(result) {
  if (result.error) {
    const error = result.error;
    const location = error.line ? `Line ${error.line}${error.column ? `, Col ${error.column}` : ''}` : 'No line';
    const hint = error.hint ? `\nHint: ${error.hint}` : '';
    return `${error.message} (${location})${hint}`;
  }
  if (result.expected !== undefined || result.actual !== undefined) {
    const diff = diffRuntimeValues(result.expected, result.actual);
    return diff || `Expected ${serializeRuntimeValue(result.expected)} but got ${serializeRuntimeValue(result.actual)}`;
  }
  return result.detail || '';
}

export async function runTests(problem, code, runtimes) {
  const lang = problem.lang;
  if (lang === 'javascript') {
    return runtimes.js.runTests({ code, functionName: problem.functionName, tests: problem.testCases || [] });
  }
  if (lang === 'python') {
    return runtimes.python.runTests({ code, functionName: problem.functionName, tests: problem.testCases || [] });
  }
  if (lang === 'sql') {
    return runtimes.sql.runTests({ code, setupSql: problem.setupSql || '', tests: problem.testCases || [] });
  }
  if (lang === 'mongodb') {
    return runtimes.mongo.runTests({
      code,
      setupDocs: problem.setupMongo || [],
      collection: problem.setupCollection || '',
      tests: problem.testCases || [],
    });
  }
  return {
    results: [{
      pass: false,
      label: 'Unsupported language',
      error: createRuntimeError({
        type: 'SandboxError',
        lang: 'js',
        message: `Unsupported test language: ${lang}`,
      }),
    }],
  };
}
