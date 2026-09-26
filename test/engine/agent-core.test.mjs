import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentRuntime } from '../../engine/core/runtime.mjs';
import { CancellationSource } from '../../engine/core/ports.mjs';

describe('Agent Core Hexagonal Loop & TurnLifecycle (Ticket #7)', () => {
  // Helper to create mock ports
  function createMockPorts() {
    const emittedEvents = [];
    const files = {
      'src/index.ts': 'console.log("hello world");\nconst x = 42;\nexport default x;',
      'package.json': '{\n  "name": "mock-app",\n  "version": "1.0.0"\n}',
    };

    const mockInspectionPort = {
      async viewFile(path, startLine = 1, endLine = 100) {
        if (!files[path]) throw new Error(`File not found: ${path}`);
        const lines = files[path].split('\n').slice(startLine - 1, endLine);
        return lines.join('\n');
      },
      async listDir(dirPath = '.') {
        return Object.keys(files);
      },
      async grepSearch(query) {
        const matches = [];
        for (const [path, content] of Object.entries(files)) {
          if (content.includes(query)) {
            matches.push({ path, line: 1, preview: query });
          }
        }
        return matches;
      },
      async findByName(pattern) {
        return Object.keys(files).filter((p) => p.includes(pattern));
      },
    };

    const mockTelemetryPort = {
      emit(event) {
        emittedEvents.push(event);
      },
    };

    return { mockInspectionPort, mockTelemetryPort, emittedEvents };
  }

  it('executes autonomous read-only tool calls without pausing', async () => {
    const { mockInspectionPort, mockTelemetryPort, emittedEvents } = createMockPorts();
    const cancellation = new CancellationSource();

    // Mock Model Provider that streams thinking, calls view_file, then completes
    const mockModel = {
      async *generateStream() {
        yield { type: 'thought', text: 'Inspecting package.json to verify dependencies...' };
        yield { 
          type: 'tool_call', 
          toolName: 'view_file', 
          callId: 'call-1', 
          args: { path: 'package.json' } 
        };
      },
      async *continueStreamWithToolResult(result) {
        yield { type: 'thought', text: `Got file content. Version is confirmed.` };
        yield { type: 'content', text: 'The project version is 1.0.0.' };
      }
    };

    const runtime = new AgentRuntime({
      inspectionPort: mockInspectionPort,
      telemetryPort: mockTelemetryPort,
      modelProvider: mockModel,
    });

    const result = await runtime.runTurn('What is the project version?', { cancellationToken: cancellation.token });

    assert.equal(result.status, 'completed');
    assert.equal(result.finalText, 'The project version is 1.0.0.');

    // Verify event flow
    const eventTypes = emittedEvents.map((e) => e.type);
    assert.ok(eventTypes.includes('thought'));
    assert.ok(eventTypes.includes('tool_call'));
    assert.ok(eventTypes.includes('tool_result'));
    assert.ok(eventTypes.includes('done'));

    const toolCallEvent = emittedEvents.find((e) => e.type === 'tool_call');
    assert.equal(toolCallEvent.payload.toolName, 'view_file');

    const toolResultEvent = emittedEvents.find((e) => e.type === 'tool_result');
    assert.ok(toolResultEvent.payload.result.includes('mock-app'));
  });

  it('pauses and enters WAITING_FOR_APPROVAL on mutating tool calls', async () => {
    const { mockInspectionPort, mockTelemetryPort, emittedEvents } = createMockPorts();
    const cancellation = new CancellationSource();

    // Mock Model that wants to mutate a file via propose_diff
    const mockModel = {
      async *generateStream() {
        yield { type: 'thought', text: 'Preparing to modify index.ts...' };
        yield {
          type: 'tool_call',
          toolName: 'propose_diff',
          callId: 'call-mutate-1',
          args: {
            path: 'src/index.ts',
            diff: '+ const updated = true;',
          },
        };
      },
    };

    const runtime = new AgentRuntime({
      inspectionPort: mockInspectionPort,
      telemetryPort: mockTelemetryPort,
      modelProvider: mockModel,
    });

    // Run turn — should pause at checkpoint
    const turnPromise = runtime.runTurn('Add updated flag to index.ts', { cancellationToken: cancellation.token });

    // Wait short tick for runtime to reach checkpoint
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(runtime.getState(), 'WAITING_FOR_APPROVAL');
    const checkpointEvent = emittedEvents.find((e) => e.type === 'approval_request');
    assert.ok(checkpointEvent, 'Must emit approval_request event');
    assert.equal(checkpointEvent.payload.toolName, 'propose_diff');

    // Simulate developer rejecting the mutation
    runtime.respondToApproval(checkpointEvent.payload.approvalId, {
      approved: false,
      reason: 'Please donot edit index.ts directly',
    });

    const result = await turnPromise;
    assert.equal(result.status, 'rejected');
    assert.equal(runtime.getState(), 'IDLE');
  });

  it('supports cancellation during execution', async () => {
    const { mockInspectionPort, mockTelemetryPort } = createMockPorts();
    const cancellation = new CancellationSource();

    const mockModel = {
      async *generateStream() {
        yield { type: 'thought', text: 'Starting very long computation...' };
        // Wait a bit
        await new Promise((r) => setTimeout(r, 200));
        yield { type: 'content', text: 'Should not reach here' };
      },
    };

    const runtime = new AgentRuntime({
      inspectionPort: mockInspectionPort,
      telemetryPort: mockTelemetryPort,
      modelProvider: mockModel,
    });

    const turnPromise = runtime.runTurn('Run long task', { cancellationToken: cancellation.token });

    // Cancel after 50ms
    setTimeout(() => cancellation.cancel(), 50);

    const result = await turnPromise;
    assert.equal(result.status, 'cancelled');
  });
});
