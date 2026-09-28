import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentRuntime } from '../../engine/core/runtime.mjs';
import { CancellationSource } from '../../engine/core/ports.mjs';
import { ContextCompactor } from '../../engine/core/ContextCompactor.mjs';

describe('Multi-Step Autonomous ReAct Loop & Dual Autonomy (Ticket #25)', () => {
  function createMockEnvironment() {
    const emittedEvents = [];
    const files = {
      'src/main.ts': 'export const greeting = "hello world";\nexport const version = "2.0.0";',
      'README.md': '# Project\nAutonomous research workstation.',
    };

    const mockInspectionPort = {
      async viewFile(path) {
        if (!files[path]) throw new Error(`File not found: ${path}`);
        return files[path];
      },
      async listDir() {
        return Object.keys(files);
      },
    };

    const mockTelemetryPort = {
      emit(event) {
        emittedEvents.push(event);
      },
    };

    const tools = {
      list_dir: {
        name: 'list_dir',
        isMutating: false,
        async execute() {
          return Object.keys(files);
        },
      },
      view_file: {
        name: 'view_file',
        isMutating: false,
        async execute(args) {
          return files[args.path] || 'not found';
        },
      },
      propose_diff: {
        name: 'propose_diff',
        isMutating: true,
        async execute(args) {
          return { status: 'diff_proposed', path: args.path, diff: args.diff };
        },
      },
      run_command: {
        name: 'run_command',
        isMutating: true,
        async execute(args) {
          return { status: 'success', command: args.command, stdout: 'Build successful' };
        },
      },
    };

    return { mockInspectionPort, mockTelemetryPort, emittedEvents, tools };
  }

  it('executes a multi-turn ReAct reasoning loop across multiple tool turns until final answer', async () => {
    const { mockInspectionPort, mockTelemetryPort, emittedEvents, tools } = createMockEnvironment();

    // Multi-turn model generator simulating a real LLM reasoning loop
    const model = {
      async *generateStream(messages) {
        const lastMsg = messages[messages.length - 1];

        if (lastMsg.role === 'user') {
          // Turn 1: Reason and list directory
          yield { type: 'thought', text: 'Listing files in workspace to locate source entrypoint...' };
          yield {
            type: 'tool_call',
            callId: 'call-list-1',
            toolName: 'list_dir',
            args: {},
          };
        } else if (lastMsg.role === 'tool' && lastMsg.name === 'list_dir') {
          // Turn 2: Reason about files and inspect src/main.ts
          yield { type: 'thought', text: 'Directory scan completed. Reading src/main.ts...' };
          yield {
            type: 'tool_call',
            callId: 'call-view-2',
            toolName: 'view_file',
            args: { path: 'src/main.ts' },
          };
        } else if (lastMsg.role === 'tool' && lastMsg.name === 'view_file') {
          // Turn 3: Conclude with final answer
          yield { type: 'thought', text: 'Inspected src/main.ts. Version found.' };
          yield { type: 'content', text: 'The greeting is "hello world" and version is 2.0.0.' };
        }
      },
    };

    const runtime = new AgentRuntime({
      inspectionPort: mockInspectionPort,
      telemetryPort: mockTelemetryPort,
      modelProvider: model,
      tools,
      autonomyMode: 'supervised',
    });

    const result = await runtime.runTurn('What is greeting and version in source?');

    assert.equal(result.status, 'completed');
    assert.equal(result.turns, 3);
    assert.equal(result.finalText, 'The greeting is "hello world" and version is 2.0.0.');
    assert.ok(result.messages.length >= 6, 'Should maintain full conversation history');

    // Verify telemetry event order
    const eventTypes = emittedEvents.map((e) => e.type);
    assert.ok(eventTypes.includes('thought'));
    assert.ok(eventTypes.includes('tool_call'));
    assert.ok(eventTypes.includes('tool_result'));
    assert.ok(eventTypes.includes('chunk'));
    assert.ok(eventTypes.includes('done'));
  });

  it('Autonomous / YOLO mode: executes mutating tools without pausing for approval', async () => {
    const { mockInspectionPort, mockTelemetryPort, emittedEvents, tools } = createMockEnvironment();

    const model = {
      async *generateStream(messages) {
        const lastMsg = messages[messages.length - 1];

        if (lastMsg.role === 'user') {
          yield { type: 'thought', text: 'Mutating codebase via propose_diff...' };
          yield {
            type: 'tool_call',
            callId: 'call-mutate-1',
            toolName: 'propose_diff',
            args: { path: 'src/main.ts', diff: '+ const yolo = true;' },
          };
        } else if (lastMsg.role === 'tool' && lastMsg.name === 'propose_diff') {
          yield { type: 'thought', text: 'Diff proposed. Now running build command...' };
          yield {
            type: 'tool_call',
            callId: 'call-cmd-2',
            toolName: 'run_command',
            args: { command: 'npm run build' },
          };
        } else {
          yield { type: 'content', text: 'Changes applied and build verified successfully in autonomous mode.' };
        }
      },
    };

    const runtime = new AgentRuntime({
      inspectionPort: mockInspectionPort,
      telemetryPort: mockTelemetryPort,
      modelProvider: model,
      tools,
      autonomyMode: 'autonomous', // YOLO MODE
    });

    const result = await runtime.runTurn('Apply yolo update and build');

    assert.equal(result.status, 'completed');
    assert.equal(result.turns, 3);
    assert.ok(result.finalText.includes('Changes applied and build verified'));

    // Should NOT have emitted any approval_request events in YOLO mode
    const approvalEvents = emittedEvents.filter((e) => e.type === 'approval_request');
    assert.equal(approvalEvents.length, 0, 'No approval requests should be emitted in autonomous/YOLO mode');
  });

  it('Supervised mode: pauses on mutating tools and continues when approved', async () => {
    const { mockInspectionPort, mockTelemetryPort, emittedEvents, tools } = createMockEnvironment();

    const model = {
      async *generateStream(messages) {
        const lastMsg = messages[messages.length - 1];

        if (lastMsg.role === 'user') {
          yield {
            type: 'tool_call',
            callId: 'call-mutate-supervised',
            toolName: 'propose_diff',
            args: { path: 'src/main.ts', diff: '+ const supervised = true;' },
          };
        } else if (lastMsg.role === 'tool') {
          yield { type: 'content', text: 'Supervised modification approved and finalized.' };
        }
      },
    };

    const runtime = new AgentRuntime({
      inspectionPort: mockInspectionPort,
      telemetryPort: mockTelemetryPort,
      modelProvider: model,
      tools,
      autonomyMode: 'supervised',
    });

    const turnPromise = runtime.runTurn('Run supervised edit');

    // Wait short tick for approval pause
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(runtime.getState(), 'WAITING_FOR_APPROVAL');
    const approvalEvent = emittedEvents.find((e) => e.type === 'approval_request');
    assert.ok(approvalEvent, 'Must emit approval_request');

    // Approve the mutating tool
    runtime.respondToApproval(approvalEvent.payload.approvalId, { approved: true });

    const result = await turnPromise;
    assert.equal(result.status, 'completed');
    assert.equal(result.finalText, 'Supervised modification approved and finalized.');
  });

  it('enforces maxTurns limit to prevent infinite reasoning loops', async () => {
    const { mockInspectionPort, mockTelemetryPort, tools } = createMockEnvironment();

    // Model that loops indefinitely requesting list_dir
    const infiniteModel = {
      async *generateStream() {
        yield {
          type: 'tool_call',
          callId: `call-loop-${Math.random()}`,
          toolName: 'list_dir',
          args: {},
        };
      },
    };

    const runtime = new AgentRuntime({
      inspectionPort: mockInspectionPort,
      telemetryPort: mockTelemetryPort,
      modelProvider: infiniteModel,
      tools,
      maxTurns: 3,
      autonomyMode: 'autonomous',
    });

    const result = await runtime.runTurn('Infinite loop task');
    assert.equal(result.status, 'max_turns_exceeded');
    assert.equal(result.turns, 3);
  });

  it('compacts older tool results in multi-turn conversation via ContextCompactor', async () => {
    const { mockInspectionPort, mockTelemetryPort, tools } = createMockEnvironment();

    let compactionObserved = false;

    // Custom compactor to spy on compaction calls
    const compactor = new ContextCompactor({ recentToolKeepCount: 2 });

    const model = {
      async *generateStream(messages) {
        const toolMessages = messages.filter((m) => m.role === 'tool');
        if (toolMessages.length >= 3) {
          // Check that older tool messages were summarized
          if (toolMessages[0].content.includes('summarized')) {
            compactionObserved = true;
          }
        }

        if (toolMessages.length < 3) {
          yield {
            type: 'tool_call',
            callId: `call-${toolMessages.length + 1}`,
            toolName: 'list_dir',
            args: {},
          };
        } else {
          yield { type: 'content', text: 'All 3 turns executed with compaction active.' };
        }
      },
    };

    const runtime = new AgentRuntime({
      inspectionPort: mockInspectionPort,
      telemetryPort: mockTelemetryPort,
      modelProvider: model,
      tools,
      compactor,
      autonomyMode: 'autonomous',
    });

    const result = await runtime.runTurn('Run multi-turn compaction test');
    assert.equal(result.status, 'completed');
    assert.ok(compactionObserved, 'Compaction should summarize older tool results when > 2 tools run');
  });

  it('aborts cleanly when cancelled during multi-turn loop', async () => {
    const { mockInspectionPort, mockTelemetryPort, tools } = createMockEnvironment();
    const cancellation = new CancellationSource();

    let turnsRun = 0;
    const model = {
      async *generateStream() {
        turnsRun++;
        await new Promise((r) => setTimeout(r, 15));
        yield {
          type: 'tool_call',
          callId: `call-cancel-${turnsRun}`,
          toolName: 'list_dir',
          args: {},
        };
      },
    };

    const runtime = new AgentRuntime({
      inspectionPort: mockInspectionPort,
      telemetryPort: mockTelemetryPort,
      modelProvider: model,
      tools,
      autonomyMode: 'autonomous',
    });

    // Cancel after 30ms
    setTimeout(() => cancellation.cancel(), 30);

    const result = await runtime.runTurn('Cancel task', {
      cancellationToken: cancellation.token,
    });

    assert.equal(result.status, 'cancelled');
    assert.equal(runtime.getState(), 'IDLE');
  });
});
