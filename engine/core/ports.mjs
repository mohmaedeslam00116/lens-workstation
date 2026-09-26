/**
 * Hexagonal Typed Ports for LENS Workstation Agent Core
 */

export class CancellationToken {
  constructor() {
    this._isCancelled = false;
    this._listeners = new Set();
  }

  get isCancelled() {
    return this._isCancelled;
  }

  onCancel(callback) {
    if (this._isCancelled) {
      callback();
      return () => {};
    }
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _trigger() {
    this._isCancelled = true;
    for (const cb of this._listeners) {
      try {
        cb();
      } catch { /* ignore listener error */ }
    }
    this._listeners.clear();
  }
}

export class CancellationSource {
  constructor() {
    this.token = new CancellationToken();
  }

  cancel() {
    this.token._trigger();
  }
}
