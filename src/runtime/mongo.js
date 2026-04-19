import { createRuntimeError } from './errors.js';
import { WorkerSandboxManager } from './sandbox.js';

const DEFAULT_TIMEOUT_MS = 5000;

export class MongoRuntimeAdapter {
  constructor() {
    this.sandbox = new WorkerSandboxManager(new URL('./workers/mongo.worker.js', import.meta.url), {
      defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    });
  }

  async run({ code, fresh = false, timeoutMs = DEFAULT_TIMEOUT_MS, onEvent } = {}) {
    try {
      return await this.sandbox.request('run', { code, fresh }, { timeoutMs, onEvent });
    } catch (error) {
      if (error?.code === 'WORKER_TIMEOUT') {
        return { error: createRuntimeError({ type: 'TimeoutError', lang: 'mongo', message: 'MongoDB execution timed out after 5s.', hint: 'Check for a pipeline or loop that never finishes.', code }) };
      }
      if (error?.code === 'WORKER_STOPPED') {
        return { stopped: true };
      }
      return { error: createRuntimeError({ type: 'SandboxError', lang: 'mongo', message: error.message || 'MongoDB worker failed.', code }) };
    }
  }

  async runTests({ code, setupDocs = [], collection = '', tests = [], timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    try {
      return await this.sandbox.request('tests', { code, setupDocs, collection, tests }, { timeoutMs });
    } catch (error) {
      if (error?.code === 'WORKER_TIMEOUT') {
        return {
          results: [{
            pass: false,
            label: 'Timeout',
            error: createRuntimeError({ type: 'TimeoutError', lang: 'mongo', message: 'MongoDB tests timed out after 5s.', hint: 'Check for a pipeline or unsupported chained call that never finishes.', code }),
          }],
        };
      }
      return {
        results: [{
          pass: false,
          label: 'Worker error',
          error: createRuntimeError({ type: 'SandboxError', lang: 'mongo', message: error.message || 'MongoDB worker failed.', code }),
        }],
      };
    }
  }

  reset() {
    this.stop();
  }

  stop() {
    this.sandbox.stopCurrent();
  }
}
