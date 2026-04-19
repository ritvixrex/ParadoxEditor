let SQLReady = null;
let SQL = null;
let db = null;

function respond(requestId, result) {
  self.postMessage({ requestId, result });
}

function sourceLine(code, line) {
  if (!line || line < 1) return '';
  return (String(code).split('\n')[line - 1] || '').trimEnd();
}

function createError({ type = 'RuntimeError', message, line = null, column = null, hint = null, stack = null, code = '' }) {
  return {
    type,
    lang: 'sql',
    message,
    line,
    column,
    stack,
    hint,
    source: sourceLine(code, line),
  };
}

function ensureSql() {
  if (SQLReady) return SQLReady;
  SQLReady = (async () => {
    const sqlScriptUrl = new URL('../../../vendor/sql-wasm.js', self.location.href).href;
    const sqlWasmUrl = new URL('../../../vendor/sql-wasm.wasm', self.location.href).href;
    importScripts(sqlScriptUrl);
    SQL = await self.initSqlJs({
      locateFile: () => sqlWasmUrl,
    });
    db = new SQL.Database();
    return SQL;
  })();
  return SQLReady;
}

function resetDb() {
  if (db) {
    try { db.close(); } catch (error) { /* ignore */ }
  }
  db = new SQL.Database();
}

function splitStatements(code = '') {
  const statements = [];
  let start = 0;
  let i = 0;
  let state = 'base';
  let dollarTag = null;

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    if (state === 'line-comment') {
      if (ch === '\n') state = 'base';
      i += 1;
      continue;
    }
    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        state = 'base';
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (state === 'single') {
      if (ch === "'" && next === "'") { i += 2; continue; }
      if (ch === "'") state = 'base';
      i += 1;
      continue;
    }
    if (state === 'double') {
      if (ch === '"') state = 'base';
      i += 1;
      continue;
    }
    if (state === 'dollar') {
      if (code.startsWith(dollarTag, i)) {
        i += dollarTag.length;
        state = 'base';
        continue;
      }
      i += 1;
      continue;
    }

    if (ch === '-' && next === '-') {
      state = 'line-comment';
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      state = 'block-comment';
      i += 2;
      continue;
    }
    if (ch === "'") {
      state = 'single';
      i += 1;
      continue;
    }
    if (ch === '"') {
      state = 'double';
      i += 1;
      continue;
    }
    if (ch === '$') {
      const tagMatch = code.slice(i).match(/^\$[A-Za-z_0-9]*\$/);
      if (tagMatch) {
        dollarTag = tagMatch[0];
        state = 'dollar';
        i += dollarTag.length;
        continue;
      }
    }
    if (ch === ';') {
      const text = code.slice(start, i + 1);
      statements.push({ text, startOffset: start, endOffset: i + 1 });
      start = i + 1;
    }
    i += 1;
  }

  if (code.slice(start).trim()) {
    statements.push({ text: code.slice(start), startOffset: start, endOffset: code.length });
  }
  return statements.filter((statement) => statement.text.trim());
}

function offsetToLocation(code, offset) {
  const before = code.slice(0, Math.max(0, offset));
  const lines = before.split('\n');
  return {
    line: lines.length,
    column: (lines[lines.length - 1] || '').length + 1,
  };
}

function locateSqlError(code, statement, message) {
  const nearMatch = String(message).match(/near ["'`]?([^"'`:]+)["'`]?/i);
  let absoluteOffset = statement.startOffset;
  let token = '';

  if (nearMatch) {
    token = nearMatch[1].trim();
    const relativeIndex = statement.text.toLowerCase().indexOf(token.toLowerCase());
    if (relativeIndex >= 0) {
      absoluteOffset = statement.startOffset + relativeIndex;
    }
  }
  const location = offsetToLocation(code, absoluteOffset);
  return {
    ...location,
    token,
  };
}

function buildSnapshot(database) {
  const tables = [];
  const tableNames = database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const names = tableNames.length ? tableNames[0].values.map((row) => row[0]) : [];
  names.forEach((name) => {
    try {
      const rowsResult = database.exec(`SELECT * FROM "${name}" LIMIT 200`);
      if (rowsResult.length) {
        tables.push({ name, columns: rowsResult[0].columns, rows: rowsResult[0].values });
        return;
      }
      const pragma = database.exec(`PRAGMA table_info("${name}")`);
      const columns = pragma.length ? pragma[0].values.map((row) => row[1]) : [];
      tables.push({ name, columns, rows: [] });
    } catch (error) {
      tables.push({ name, columns: [], rows: [] });
    }
  });
  return { tables };
}

function executeStatements(database, code) {
  const statements = splitStatements(code);
  const results = [];
  for (const statement of statements) {
    try {
      const execResult = database.exec(statement.text);
      if (execResult?.length) results.push(...execResult);
    } catch (error) {
      const location = locateSqlError(code, statement, error.message || String(error));
      return {
        error: createError({
          type: /syntax error/i.test(error.message || '') ? 'SyntaxError' : 'RuntimeError',
          message: `SQL error: ${error.message || String(error)}`,
          line: location.line,
          column: location.column,
          hint: location.token ? `Check the SQL syntax near "${location.token}".` : 'Check the SQL syntax near this statement.',
          stack: null,
          code,
        }),
      };
    }
  }
  return { results };
}

async function handleRun(requestId, payload) {
  await ensureSql();
  if (payload.fresh) resetDb();
  const output = executeStatements(db, payload.code || '');
  if (output.error) {
    respond(requestId, { error: output.error });
    return;
  }
  respond(requestId, {
    results: output.results,
    snapshot: buildSnapshot(db),
  });
}

function rowsMatch(got, expected, orderInsensitive) {
  if (!expected) return true;
  if (got.length !== expected.length) return false;
  const serializeRows = (rows) => rows.map((row) => JSON.stringify(row));
  if (orderInsensitive) {
    const gotSet = new Set(serializeRows(got));
    return serializeRows(expected).every((row) => gotSet.has(row));
  }
  return serializeRows(got).join('|') === serializeRows(expected).join('|');
}

async function handleTests(requestId, payload) {
  await ensureSql();
  const results = [];
  for (const test of payload.tests || []) {
    const testDb = new SQL.Database();
    try {
      if (payload.setupSql) {
        const setupResult = executeStatements(testDb, payload.setupSql);
        if (setupResult.error) throw new Error(setupResult.error.message);
      }
      const execResult = executeStatements(testDb, payload.code || '');
      if (execResult.error) {
        results.push({
          pass: false,
          label: test.label || '',
          error: execResult.error,
          expected: test.expectedRows,
          testInput: null,
        });
      } else {
        const rows = execResult.results?.[0]?.values || [];
        results.push({
          pass: rowsMatch(rows, test.expectedRows, test.orderInsensitive),
          label: test.label || '',
          expected: test.expectedRows,
          actual: rows,
        });
      }
    } catch (error) {
      results.push({
        pass: false,
        label: test.label || '',
        error: createError({
          type: 'RuntimeError',
          message: error.message || String(error),
          hint: 'Check the setup SQL and the query under test.',
          code: payload.code || '',
        }),
      });
    } finally {
      testDb.close();
    }
  }
  respond(requestId, { results });
}

self.onmessage = async (event) => {
  const { requestId, action, payload } = event.data || {};
  if (action === 'tests') {
    await handleTests(requestId, payload || {});
    return;
  }
  await handleRun(requestId, payload || {});
};
