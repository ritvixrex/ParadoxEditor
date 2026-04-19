import { createRuntimeError } from './errors.js';
import { WorkerSandboxManager } from './sandbox.js';

const DEFAULT_TIMEOUT_MS = 5000;

export class JavaScriptRuntimeAdapter {
  constructor() {
    this.sandbox = new WorkerSandboxManager(new URL('./workers/js.worker.js', import.meta.url), {
      defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
      workerOptions: {},
    });
  }

  async run({ code, stdin = null, timeoutMs = DEFAULT_TIMEOUT_MS, onEvent } = {}) {
    try {
      return await this.sandbox.request('run', { code, stdin }, { timeoutMs, onEvent });
    } catch (error) {
      if (error?.code === 'WORKER_TIMEOUT') {
        return { error: createRuntimeError({ type: 'TimeoutError', lang: 'js', message: 'Execution timed out after 5s.', hint: 'Check for an infinite loop or a Promise that never resolves.', code }) };
      }
      if (error?.code === 'WORKER_STOPPED') {
        return { stopped: true };
      }
      return { error: createRuntimeError({ type: 'SandboxError', lang: 'js', message: error.message || 'JavaScript worker failed.', code }) };
    }
  }

  async runTests({ code, functionName, tests = [], timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    try {
      return await this.sandbox.request('tests', { code, functionName, tests }, { timeoutMs });
    } catch (error) {
      if (error?.code === 'WORKER_TIMEOUT') {
        return {
          results: [{
            pass: false,
            label: 'Timeout',
            error: createRuntimeError({ type: 'TimeoutError', lang: 'js', message: 'Tests timed out after 5s.', hint: 'Check for an infinite loop or recursion without a base case.', code }),
          }],
        };
      }
      return {
        results: [{
          pass: false,
          label: 'Worker error',
          error: createRuntimeError({ type: 'SandboxError', lang: 'js', message: error.message || 'JavaScript worker failed.', code }),
        }],
      };
    }
  }

  stop() {
    this.sandbox.stopCurrent();
  }
}
