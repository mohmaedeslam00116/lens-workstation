import { EventEmitter } from 'node:events';

/**
 * EventBus
 * Centralized asynchronous event bus for subagents and engine subsystems.
 * Relays real-time events over WebSocket and internal listeners.
 */
export class EventBus extends EventEmitter {
  constructor() {
    super();
  }

  emitEvent(type, payload = {}) {
    const event = {
      ...payload,
      type,
      timestamp: Date.now(),
    };
    this.emit(type, event);
    this.emit('event', event);
    return event;
  }

  emitSubagentStarted({ id, role, type, prompt, metadata = {} }) {
    return this.emitEvent('subagent:started', {
      id,
      role,
      type,
      prompt,
      metadata,
    });
  }

  emitSubagentStep({ id, stepIndex, state, stateDetail, thought, chunk, toolCall, toolResult }) {
    return this.emitEvent('subagent:step', {
      id,
      stepIndex,
      state,
      stateDetail,
      thought,
      chunk,
      toolCall,
      toolResult,
    });
  }

  emitSubagentDone({ id, result, durationMs, turns }) {
    return this.emitEvent('subagent:done', {
      id,
      status: 'completed',
      result,
      durationMs,
      turns,
    });
  }

  emitSubagentFailed({ id, error, durationMs }) {
    return this.emitEvent('subagent:failed', {
      id,
      status: 'failed',
      error: typeof error === 'string' ? error : error?.message || 'Unknown error',
      durationMs,
    });
  }
}
