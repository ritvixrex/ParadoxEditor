import { createRuntimeError } from './errors.js';
import { WorkerSandboxManager } from './sandbox.js';

const DEFAULT_TIMEOUT_MS = 5000;

export class SqlRuntimeAdapter {
  constructor() {
    this.sandbox = new WorkerSandboxManager(new URL('./workers/sql.worker.js', import.meta.url), {
      defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    });
  }

  async run({ code, fresh = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    try {
      return await this.sandbox.request('run', { code, fresh }, { timeoutMs });
    } catch (error) {
      if (error?.code === 'WORKER_TIMEOUT') {
        return { error: createRuntimeError({ type: 'TimeoutError', lang: 'sql', message: 'SQL execution timed out after 5s.', hint: 'Check for a statement that never completes.', code }) };
      }
      if (error?.code === 'WORKER_STOPPED') {
        return { stopped: true };
      }
      return { error: createRuntimeError({ type: 'SandboxError', lang: 'sql', message: error.message || 'SQL worker failed.', code }) };
    }
  }

  async runTests({ code, setupSql = '', tests = [], timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    try {
      return await this.sandbox.request('tests', { code, setupSql, tests }, { timeoutMs });
    } catch (error) {
      if (error?.code === 'WORKER_TIMEOUT') {
        return {
          results: [{
            pass: false,
            label: 'Timeout',
            error: createRuntimeError({ type: 'TimeoutError', lang: 'sql', message: 'SQL tests timed out after 5s.', hint: 'Check for a query or trigger that never finishes.', code }),
          }],
        };
      }
      return {
        results: [{
          pass: false,
          label: 'Worker error',
          error: createRuntimeError({ type: 'SandboxError', lang: 'sql', message: error.message || 'SQL worker failed.', code }),
        }],
      };
    }
  }

  async reset() {
    this.stop();
    return this.run({ code: '', fresh: true, timeoutMs: DEFAULT_TIMEOUT_MS });
  }

  stop() {
    this.sandbox.stopCurrent();
  }
}
