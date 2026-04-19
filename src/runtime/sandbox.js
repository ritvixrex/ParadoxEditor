export class WorkerSandboxManager {
  constructor(workerUrl, options = {}) {
    this.workerUrl = workerUrl;
    this.workerOptions = options.workerOptions || {};
    this.defaultTimeoutMs = options.defaultTimeoutMs || 5000;
    this.worker = null;
    this.requestSeq = 0;
    this.pending = new Map();
  }

  _createWorker() {
    if (this.worker) return this.worker;
    this.worker = new Worker(this.workerUrl, this.workerOptions);
    this.worker.onmessage = (event) => {
      const data = event.data || {};
      const pending = this.pending.get(data.requestId);
      if (!pending) return;

      if (data.event) {
        pending.onEvent?.(data.event, data.payload);
        return;
      }

      if (pending.timeoutId) clearTimeout(pending.timeoutId);
      this.pending.delete(data.requestId);
      pending.resolve(data.result);
    };

    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Worker crashed');
      for (const pending of this.pending.values()) {
        if (pending.timeoutId) clearTimeout(pending.timeoutId);
        pending.reject(error);
      }
      this.pending.clear();
      this._destroyWorker();
    };

    return this.worker;
  }

  _destroyWorker() {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
  }

  stopCurrent(reason = 'Execution stopped') {
    for (const pending of this.pending.values()) {
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
      const error = new Error(reason);
      error.code = 'WORKER_STOPPED';
      pending.reject(error);
    }
    this.pending.clear();
    this._destroyWorker();
  }

  async request(action, payload = {}, options = {}) {
    const worker = this._createWorker();
    const requestId = ++this.requestSeq;
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;

    return new Promise((resolve, reject) => {
      const timeoutId = timeoutMs > 0 ? setTimeout(() => {
        this.pending.delete(requestId);
        this._destroyWorker();
        const error = new Error(`Timed out after ${timeoutMs}ms`);
        error.code = 'WORKER_TIMEOUT';
        reject(error);
      }, timeoutMs) : null;

      this.pending.set(requestId, {
        resolve,
        reject,
        onEvent: options.onEvent,
        timeoutId,
      });

      worker.postMessage({ requestId, action, payload });
    });
  }

  dispose() {
    this.stopCurrent('Runtime disposed');
  }
}
