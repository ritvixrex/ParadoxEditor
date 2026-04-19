importScripts(new URL('../../../vendor/acorn.js', self.location.href).href);

let currentDb = 'test';
let oidCounter = 1;
const dbs = { test: {} };

function respond(requestId, result) {
  self.postMessage({ requestId, result });
}

function postEvent(requestId, event, payload) {
  self.postMessage({ requestId, event, payload });
}

function sourceLine(code, line) {
  if (!line || line < 1) return '';
  return (String(code).split('\n')[line - 1] || '').trimEnd();
}

function createError({ type = 'RuntimeError', message, line = null, column = null, hint = null, stack = null, code = '' }) {
  return {
    type,
    lang: 'mongo',
    message,
    line,
    column,
    stack,
    hint,
    source: sourceLine(code, line),
  };
}

function resetSession() {
  Object.keys(dbs).forEach((name) => delete dbs[name]);
  dbs.test = {};
  currentDb = 'test';
  oidCounter = 1;
}

function getCollection(dbName, collectionName) {
  if (!dbs[dbName]) dbs[dbName] = {};
  if (!dbs[dbName][collectionName]) dbs[dbName][collectionName] = [];
  return dbs[dbName][collectionName];
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function matchQuery(doc, query) {
  if (!query || typeof query !== 'object') return true;
  return Object.entries(query).every(([key, value]) => {
    if (key === '$and') return value.every((item) => matchQuery(doc, item));
    if (key === '$or') return value.some((item) => matchQuery(doc, item));
    const fieldValue = key.split('.').reduce((acc, part) => acc?.[part], doc);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('$eq' in value) return fieldValue === value.$eq;
      if ('$ne' in value) return fieldValue !== value.$ne;
      if ('$gt' in value) return fieldValue > value.$gt;
      if ('$gte' in value) return fieldValue >= value.$gte;
      if ('$lt' in value) return fieldValue < value.$lt;
      if ('$lte' in value) return fieldValue <= value.$lte;
      if ('$in' in value) return Array.isArray(value.$in) && value.$in.includes(fieldValue);
      if ('$nin' in value) return Array.isArray(value.$nin) && !value.$nin.includes(fieldValue);
      if ('$exists' in value) return value.$exists ? fieldValue !== undefined : fieldValue === undefined;
    }
    return fieldValue === value;
  });
}

function applyUpdate(doc, updateOp) {
  Object.entries(updateOp || {}).forEach(([op, fields]) => {
    if (op === '$set') Object.assign(doc, fields);
    else if (op === '$unset') Object.keys(fields).forEach((key) => delete doc[key]);
    else if (op === '$inc') Object.entries(fields).forEach(([key, value]) => { doc[key] = (doc[key] || 0) + value; });
    else if (op === '$push') Object.entries(fields).forEach(([key, value]) => { if (!Array.isArray(doc[key])) doc[key] = []; doc[key].push(value); });
    else if (op === '$addToSet') Object.entries(fields).forEach(([key, value]) => {
      if (!Array.isArray(doc[key])) doc[key] = [];
      if (!doc[key].some((entry) => JSON.stringify(entry) === JSON.stringify(value))) doc[key].push(value);
    });
  });
}

function runAggregate(docs, pipeline) {
  let result = docs.map((doc) => clone(doc));
  for (let stageIndex = 0; stageIndex < pipeline.length; stageIndex += 1) {
    const stage = pipeline[stageIndex];
    const [stageName, stageArg] = Object.entries(stage)[0] || [];
    try {
      if (stageName === '$match') result = result.filter((doc) => matchQuery(doc, stageArg));
      else if (stageName === '$limit') result = result.slice(0, stageArg);
      else if (stageName === '$skip') result = result.slice(stageArg);
      else if (stageName === '$sort') {
        result.sort((left, right) => {
          for (const [key, direction] of Object.entries(stageArg)) {
            if (left[key] < right[key]) return -direction;
            if (left[key] > right[key]) return direction;
          }
          return 0;
        });
      } else if (stageName === '$project') {
        result = result.map((doc) => {
          const projected = {};
          Object.entries(stageArg).forEach(([key, value]) => {
            if (value === 1 && doc[key] !== undefined) projected[key] = doc[key];
            if (typeof value === 'string' && value.startsWith('$')) projected[key] = doc[value.slice(1)];
          });
          if (stageArg._id !== 0 && doc._id !== undefined) projected._id = doc._id;
          return projected;
        });
      } else {
        const stageError = new Error(`Unsupported aggregation stage ${stageName}`);
        stageError.stageIndex = stageIndex;
        stageError.stageName = stageName;
        throw stageError;
      }
    } catch (error) {
      error.stageIndex = stageIndex;
      error.stageName = stageName || 'unknown';
      throw error;
    }
  }
  return result;
}

function makeCollection(dbName, name, trackChange) {
  const docs = getCollection(dbName, name);
  return {
    insertOne(doc) {
      const entry = clone(doc);
      if (!entry._id) entry._id = `ObjectId_${oidCounter++}`;
      docs.push(entry);
      trackChange('insert', [entry._id]);
      return { acknowledged: true, insertedId: entry._id };
    },
    insertMany(list) {
      const ids = [];
      list.forEach((doc) => {
        const entry = clone(doc);
        if (!entry._id) entry._id = `ObjectId_${oidCounter++}`;
        docs.push(entry);
        ids.push(entry._id);
      });
      trackChange('insert', ids);
      return { acknowledged: true, insertedCount: ids.length, insertedIds: ids };
    },
    find(query = {}) {
      const matched = docs.filter((doc) => matchQuery(doc, query)).map((doc) => clone(doc));
      return makeCursor(matched);
    },
    findOne(query = {}) {
      const found = docs.find((doc) => matchQuery(doc, query));
      return found ? clone(found) : null;
    },
    updateOne(query, update) {
      const found = docs.find((doc) => matchQuery(doc, query));
      if (found) {
        applyUpdate(found, update);
        trackChange('update', [found._id]);
      }
      return { acknowledged: true, matchedCount: found ? 1 : 0, modifiedCount: found ? 1 : 0 };
    },
    updateMany(query, update) {
      const matched = docs.filter((doc) => matchQuery(doc, query));
      matched.forEach((doc) => applyUpdate(doc, update));
      trackChange('update', matched.map((doc) => doc._id));
      return { acknowledged: true, matchedCount: matched.length, modifiedCount: matched.length };
    },
    deleteOne(query) {
      const index = docs.findIndex((doc) => matchQuery(doc, query));
      if (index >= 0) {
        trackChange('delete', [docs[index]._id]);
        docs.splice(index, 1);
      }
      return { acknowledged: true, deletedCount: index >= 0 ? 1 : 0 };
    },
    deleteMany(query) {
      const toDelete = docs.filter((doc) => matchQuery(doc, query));
      trackChange('delete', toDelete.map((doc) => doc._id));
      const keep = docs.filter((doc) => !matchQuery(doc, query));
      docs.length = 0;
      keep.forEach((doc) => docs.push(doc));
      return { acknowledged: true, deletedCount: toDelete.length };
    },
    countDocuments(query = {}) {
      return docs.filter((doc) => matchQuery(doc, query)).length;
    },
    aggregate(pipeline = []) {
      return makeCursor(runAggregate(docs, pipeline));
    },
    drop() {
      docs.length = 0;
      return true;
    },
  };
}

function makeCursor(seedDocs) {
  let docs = seedDocs.map((doc) => clone(doc));
  return {
    sort(sortSpec = {}) {
      docs.sort((left, right) => {
        for (const [key, direction] of Object.entries(sortSpec)) {
          if (left[key] < right[key]) return -direction;
          if (left[key] > right[key]) return direction;
        }
        return 0;
      });
      return this;
    },
    limit(count) {
      docs = docs.slice(0, count);
      return this;
    },
    skip(count) {
      docs = docs.slice(count);
      return this;
    },
    toArray() {
      return docs.map((doc) => clone(doc));
    },
  };
}

function createContext(requestId) {
  let lastChange = null;
  const trackChange = (type, ids) => {
    lastChange = { type, ids: Array.isArray(ids) ? ids : [ids] };
  };
  return {
    vars: new Map(),
    outputs: [],
    db: {
      collection(name) {
        return makeCollection(currentDb, name, trackChange);
      },
      use(name) {
        currentDb = name;
      },
      listCollections() {
        return {
          toArray() {
            return Object.keys(dbs[currentDb] || {}).map((name) => ({ name }));
          },
        };
      },
      dropCollection(name) {
        delete dbs[currentDb]?.[name];
        return true;
      },
    },
    use(name) {
      currentDb = name;
      postEvent(requestId, 'stdout', { text: `switched to db ${name}` });
      return currentDb;
    },
    printJSON(value) {
      const output = clone(value);
      this.outputs.push(output);
      postEvent(requestId, 'stdout', { text: JSON.stringify(output, null, 2) });
      return output;
    },
    print(...args) {
      const text = args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2)).join(' ');
      postEvent(requestId, 'stdout', { text });
      return text;
    },
    getLastChange() {
      return lastChange;
    },
  };
}

function buildSnapshot(context) {
  const collections = Object.entries(dbs[currentDb] || {}).map(([name, docs]) => ({
    name,
    docs: docs.map((doc) => clone(doc)),
  }));
  return {
    currentDb,
    collections,
    lastChange: context.getLastChange(),
  };
}

function unsupported(node, code, message = 'Unsupported MongoDB syntax in the sandbox.') {
  return createError({
    type: 'SandboxError',
    lang: 'mongo',
    message,
    line: node?.loc?.start?.line || null,
    column: node?.loc?.start?.column != null ? node.loc.start.column + 1 : null,
    hint: 'Only db.collection(...), chained cursor calls, object literals, print, printJSON, use(...), and simple const bindings are supported.',
    code,
  });
}

function evaluate(node, context, code) {
  if (!node) return undefined;
  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'Identifier':
      if (node.name === 'db') return context.db;
      if (node.name === 'printJSON') return context.printJSON.bind(context);
      if (node.name === 'print') return context.print.bind(context);
      if (node.name === 'use') return context.use.bind(context);
      if (context.vars.has(node.name)) return context.vars.get(node.name);
      throw unsupported(node, code, `Unknown identifier "${node.name}" in MongoDB sandbox.`);
    case 'ArrayExpression':
      return node.elements.map((entry) => evaluate(entry, context, code));
    case 'ObjectExpression': {
      const value = {};
      node.properties.forEach((property) => {
        if (property.type !== 'Property' || property.kind !== 'init') throw unsupported(property, code);
        const key = property.key.type === 'Identifier' ? property.key.name : property.key.value;
        value[key] = evaluate(property.value, context, code);
      });
      return value;
    }
    case 'ExpressionStatement':
      return evaluate(node.expression, context, code);
    case 'CallExpression': {
      const callee = resolveCallable(node.callee, context, code);
      const args = node.arguments.map((arg) => evaluate(arg, context, code));
      try {
        return callee.fn(...args);
      } catch (error) {
        const hint = error.stageName ? `Pipeline stage ${error.stageIndex + 1} (${error.stageName}) failed.` : 'Check the collection call, query shape, and supported simulator methods.';
        throw createError({
          type: 'RuntimeError',
          message: error.message || String(error),
          line: node.loc?.start?.line || null,
          column: node.loc?.start?.column != null ? node.loc.start.column + 1 : null,
          hint,
          code,
        });
      }
    }
    default:
      throw unsupported(node, code);
  }
}

function resolveCallable(node, context, code) {
  if (node.type === 'Identifier') {
    const fn = evaluate(node, context, code);
    if (typeof fn !== 'function') throw unsupported(node, code, `Unsupported call target "${node.name}".`);
    return { fn };
  }
  if (node.type !== 'MemberExpression' || node.computed) throw unsupported(node, code);
  const target = evaluate(node.object, context, code);
  const property = node.property.name;
  if (!target || typeof target[property] !== 'function') {
    throw unsupported(node, code, `Unsupported MongoDB method "${property}".`);
  }
  return { fn: target[property].bind(target) };
}

function executeProgram(code, context) {
  let ast;
  try {
    ast = self.acorn.parse(code, { ecmaVersion: 'latest', locations: true, sourceType: 'script' });
  } catch (error) {
    return {
      error: createError({
        type: 'SyntaxError',
        message: error.message || 'MongoDB syntax error',
        line: error.loc?.line || null,
        column: error.loc?.column != null ? error.loc.column + 1 : null,
        hint: 'The MongoDB sandbox only supports a small subset of JavaScript shell syntax.',
        code,
      }),
    };
  }

  try {
    for (const statement of ast.body) {
      if (statement.type === 'VariableDeclaration') {
        if (statement.kind !== 'const') throw unsupported(statement, code, 'Only const bindings are supported in MongoDB sandbox.');
        statement.declarations.forEach((declaration) => {
          if (!declaration.id || declaration.id.type !== 'Identifier') throw unsupported(declaration, code);
          context.vars.set(declaration.id.name, evaluate(declaration.init, context, code));
        });
        continue;
      }
      if (statement.type !== 'ExpressionStatement') throw unsupported(statement, code);
      evaluate(statement, context, code);
    }
    return { snapshot: buildSnapshot(context), outputs: context.outputs };
  } catch (error) {
    if (error?.lang === 'mongo' && error?.type) return { error };
    return {
      error: createError({
        type: 'RuntimeError',
        message: error.message || String(error),
        line: error.line || ast.body?.[0]?.loc?.start?.line || null,
        column: error.column || 1,
        hint: error.hint || 'Check the MongoDB query shape and supported sandbox syntax.',
        code,
      }),
    };
  }
}

function stripIds(docs = []) {
  return docs.map((doc) => {
    const copy = { ...doc };
    delete copy._id;
    return copy;
  });
}

function docsMatch(got, expected, orderInsensitive) {
  if (!expected) return true;
  const actual = stripIds(got);
  const wanted = stripIds(expected);
  if (actual.length !== wanted.length) return false;
  const serializeDocs = (docs) => docs.map((doc) => JSON.stringify(doc, Object.keys(doc).sort()));
  if (orderInsensitive) {
    const actualSet = new Set(serializeDocs(actual));
    return serializeDocs(wanted).every((doc) => actualSet.has(doc));
  }
  return serializeDocs(actual).join('|') === serializeDocs(wanted).join('|');
}

function seedTestData(setupDocs = [], collection = '') {
  resetSession();
  currentDb = 'interview';
  if (setupDocs.length && collection) {
    makeCollection(currentDb, collection, () => {} ).insertMany(setupDocs);
  }
}

async function handleRun(requestId, payload) {
  if (payload.fresh) resetSession();
  const context = createContext(requestId);
  const result = executeProgram(payload.code || '', context);
  respond(requestId, result);
}

async function handleTests(requestId, payload) {
  const results = [];
  for (const test of payload.tests || []) {
    seedTestData(payload.setupDocs || [], payload.collection || '');
    const context = createContext(requestId);
    const execution = executeProgram(payload.code || '', context);
    if (execution.error) {
      results.push({
        pass: false,
        label: test.label || '',
        error: execution.error,
        expected: test.expectedDocs,
      });
      continue;
    }
    const captured = Array.isArray(execution.outputs) ? execution.outputs.flatMap((entry) => Array.isArray(entry) ? entry : [entry]) : [];
    if (!captured.length) {
      results.push({
        pass: false,
        label: test.label || '',
        error: createError({
          type: 'RuntimeError',
          message: 'No output. Call printJSON(...) to output your query results.',
          hint: 'The MongoDB test runner captures printed documents. Return them with printJSON(result).',
          code: payload.code || '',
        }),
      });
      continue;
    }
    results.push({
      pass: docsMatch(captured, test.expectedDocs, test.orderInsensitive),
      label: test.label || '',
      expected: test.expectedDocs,
      actual: captured,
    });
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
