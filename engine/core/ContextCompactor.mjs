/**
 * ContextCompactor
 * Sliding Tool Output Window and Checkpoint Summarizer for Multi-Turn ReAct loops.
 */
export class ContextCompactor {
  constructor(options = {}) {
    this.recentToolKeepCount = options.recentToolKeepCount ?? 3;
    this.maxTokens = options.maxTokens;
    this.charLimit = options.charLimit ?? (this.maxTokens ? Math.floor(this.maxTokens * 4 * 0.8) : 100000);
  }

  compact(messages = []) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return [];
    }

    // 1. Identify indices of all tool-result messages
    const toolIndices = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'tool') {
        toolIndices.push(i);
      }
    }

    // 2. The most recent N tool messages are kept intact
    const keepIndices = new Set(
      toolIndices.slice(-this.recentToolKeepCount)
    );

    // 3. Clone and compact older tool messages
    const compacted = messages.map((msg, idx) => {
      if (msg.role === 'tool' && !keepIndices.has(idx)) {
        const rawContent = String(msg.content || '');
        const lines = rawContent.split('\n').length;
        const toolName = msg.name || 'tool';
        return {
          ...msg,
          content: `[Tool ${toolName} output: ${lines} lines summarized]`,
          isSummarized: true,
        };
      }
      return { ...msg };
    });

    // 4. Check total character budget
    let totalChars = 0;
    for (const msg of compacted) {
      totalChars += typeof msg.content === 'string' ? msg.content.length : 0;
    }

    if (totalChars > this.charLimit) {
      // Find pivot point to insert checkpoint marker
      const checkpointIndex = Math.min(2, compacted.length);
      compacted.splice(checkpointIndex, 0, {
        role: 'system',
        content: '[Context Compaction Checkpoint: Progress so far summarized to maintain token budget]',
      });
    }

    return compacted;
  }
}
