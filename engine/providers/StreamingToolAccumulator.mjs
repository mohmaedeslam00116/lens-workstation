/**
 * Stateful Tool Call Accumulator for Fragmented SSE Chunks
 * Handles partial JSON arguments across multiple OpenAI/Kilo deltas.
 */
export class StreamingToolAccumulator {
  constructor() {
    this.activeTools = new Map(); // index -> { id, name, rawArgs }
  }

  processChunkDelta(delta) {
    if (!delta || !delta.tool_calls || !Array.isArray(delta.tool_calls)) {
      return;
    }

    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0;
      let record = this.activeTools.get(idx);
      if (!record) {
        record = {
          id: tc.id || `call_${Date.now()}_${idx}`,
          name: tc.function?.name || '',
          rawArgs: '',
        };
        this.activeTools.set(idx, record);
      }

      if (tc.id && (!record.id || record.id.startsWith('call_'))) {
        record.id = tc.id;
      }

      if (tc.function?.name && !record.name) {
        record.name = tc.function.name;
      }

      if (tc.function?.arguments) {
        record.rawArgs += tc.function.arguments;
      }
    }
  }

  finalize() {
    const finalized = [];
    for (const [, record] of this.activeTools.entries()) {
      let parsed = {};
      if (record.rawArgs) {
        try {
          parsed = JSON.parse(record.rawArgs);
        } catch {
          parsed = { raw: record.rawArgs };
        }
      }
      finalized.push({
        type: 'tool_call',
        callId: record.id,
        toolName: record.name,
        args: parsed,
      });
    }
    this.activeTools.clear();
    return finalized;
  }
}
