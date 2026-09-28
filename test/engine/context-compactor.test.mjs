import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ContextCompactor } from '../../engine/core/ContextCompactor.mjs';

describe('ContextCompactor (Ticket #25)', () => {
  it('preserves initial user prompt and system messages intact', () => {
    const compactor = new ContextCompactor();
    const messages = [
      { role: 'system', content: 'You are LENS agent.' },
      { role: 'user', content: 'Refactor the authentication module' },
      { role: 'assistant', content: 'I will list the files first.' },
    ];

    const compacted = compactor.compact(messages);
    assert.equal(compacted.length, 3);
    assert.equal(compacted[0].content, 'You are LENS agent.');
    assert.equal(compacted[1].content, 'Refactor the authentication module');
  });

  it('keeps 3 most recent tool results in full and compresses older ones to 1-line summaries', () => {
    const compactor = new ContextCompactor({ recentToolKeepCount: 3 });

    const multilineOutput = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10';

    const messages = [
      { role: 'user', content: 'Start task' },
      // Older tool 1
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', function: { name: 'list_dir' } }] },
      { role: 'tool', tool_call_id: 'c1', name: 'list_dir', content: multilineOutput },
      // Older tool 2
      { role: 'assistant', content: '', tool_calls: [{ id: 'c2', function: { name: 'read_file' } }] },
      { role: 'tool', tool_call_id: 'c2', name: 'read_file', content: multilineOutput },
      // Recent tool 1 (3rd from end)
      { role: 'assistant', content: '', tool_calls: [{ id: 'c3', function: { name: 'grep_search' } }] },
      { role: 'tool', tool_call_id: 'c3', name: 'grep_search', content: multilineOutput },
      // Recent tool 2 (2nd from end)
      { role: 'assistant', content: '', tool_calls: [{ id: 'c4', function: { name: 'read_file' } }] },
      { role: 'tool', tool_call_id: 'c4', name: 'read_file', content: multilineOutput },
      // Recent tool 3 (1st from end)
      { role: 'assistant', content: '', tool_calls: [{ id: 'c5', function: { name: 'read_file' } }] },
      { role: 'tool', tool_call_id: 'c5', name: 'read_file', content: multilineOutput },
    ];

    const compacted = compactor.compact(messages);

    // Oldest tool results should be summarized
    assert.match(compacted[2].content, /\[Tool list_dir output: 10 lines summarized\]/);
    assert.match(compacted[4].content, /\[Tool read_file output: 10 lines summarized\]/);

    // 3 recent tool results should remain full
    assert.equal(compacted[6].content, multilineOutput);
    assert.equal(compacted[8].content, multilineOutput);
    assert.equal(compacted[10].content, multilineOutput);
  });

  it('triggers checkpoint summary marker when character budget is exceeded', () => {
    const compactor = new ContextCompactor({
      charLimit: 500,
      recentToolKeepCount: 1,
    });

    const longText = 'A'.repeat(300);
    const messages = [
      { role: 'user', content: 'Objective' },
      { role: 'assistant', content: longText },
      { role: 'tool', tool_call_id: 't1', name: 'big_file', content: longText },
      { role: 'assistant', content: 'Next action' },
    ];

    const compacted = compactor.compact(messages);
    const hasCheckpoint = compacted.some((m) => m.role === 'system' && m.content?.includes('Context Compaction Checkpoint'));
    assert.ok(hasCheckpoint, 'Must include checkpoint compaction marker');
  });

  it('triggers checkpoint summary marker based on 80% model token limit calculation', () => {
    // 200 tokens * 4 chars/token * 0.8 = 640 charLimit
    const compactor = new ContextCompactor({
      maxTokens: 200,
      recentToolKeepCount: 1,
    });
    assert.equal(compactor.charLimit, 640);

    const longText = 'B'.repeat(350);
    const messages = [
      { role: 'user', content: 'Objective' },
      { role: 'assistant', content: longText },
      { role: 'tool', tool_call_id: 't1', name: 'big_file', content: longText },
    ];

    const compacted = compactor.compact(messages);
    const hasCheckpoint = compacted.some((m) => m.role === 'system' && m.content?.includes('Context Compaction Checkpoint'));
    assert.ok(hasCheckpoint, 'Must include checkpoint compaction marker at 80% token limit');
  });
});
