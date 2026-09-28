import { randomUUID } from 'node:crypto';
import { STANDARD_TOOLS } from './tools.mjs';
import { ContextCompactor } from './ContextCompactor.mjs';

export class AgentRuntime {
  constructor(options = {}) {
    this.inspectionPort = options.inspectionPort;
    this.telemetryPort = options.telemetryPort;
    this.modelProvider = options.modelProvider;
    this.tools = options.tools || STANDARD_TOOLS;
    this.compactor = options.compactor || new ContextCompactor(options.compactorOptions);
    this.autonomyMode = options.autonomyMode || 'supervised'; // 'supervised' | 'autonomous' | 'yolo'
    this.maxTurns = options.maxTurns || 30;
    this.systemPrompt = options.systemPrompt || 'You are LENS, an autonomous developer research and coding agent.';

    this.state = 'IDLE';
    this.pendingApprovals = new Map();
  }

  getState() {
    return this.state;
  }

  getAutonomyMode() {
    return this.autonomyMode;
  }

  setAutonomyMode(mode) {
    this.autonomyMode = (mode === 'yolo' || mode === 'autonomous') ? 'autonomous' : 'supervised';
  }

  respondToApproval(approvalId, response) {
    const pending = this.pendingApprovals.get(approvalId);
    if (pending) {
      this.pendingApprovals.delete(approvalId);
      pending.resolve(response);
    }
  }

  async runTurn(prompt, options = {}) {
    const cancellationToken = options.cancellationToken;
    const autonomyMode = options.autonomyMode || this.autonomyMode || 'supervised';
    const isAutonomous = autonomyMode === 'autonomous' || autonomyMode === 'yolo';
    const maxTurns = options.maxTurns || this.maxTurns || 30;

    const checkCancellation = () => {
      if (cancellationToken && cancellationToken.isCancelled) {
        this.state = 'IDLE';
        this.emit('done', { status: 'cancelled' });
        return true;
      }
      return false;
    };

    if (checkCancellation()) return { status: 'cancelled' };

    const systemPrompt = options.systemPrompt || this.systemPrompt;
    let messages = [];
    if (options.initialMessages && Array.isArray(options.initialMessages)) {
      messages = [...options.initialMessages];
    } else if (Array.isArray(prompt)) {
      messages = [...prompt];
    } else {
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: typeof prompt === 'string' ? prompt : JSON.stringify(prompt) },
      ];
    }

    let turn = 0;
    let finalText = '';
    let lastToolResult = null;

    try {
      while (turn < maxTurns) {
        if (checkCancellation()) {
          return { status: 'cancelled', messages };
        }

        // Sliding window & token compaction
        const compactedMessages = this.compactor.compact(messages);

        this.state = 'STREAMING_THOUGHT';

        let stream;
        if (turn > 0 && typeof this.modelProvider.continueStreamWithToolResult === 'function') {
          stream = this.modelProvider.continueStreamWithToolResult(lastToolResult);
        } else {
          // Pass compacted messages to provider
          stream = this.modelProvider.generateStream(compactedMessages, { cancellationToken, prompt });
        }

        let turnContent = '';
        let turnThought = '';
        const turnToolCalls = [];

        for await (const chunk of stream) {
          if (cancellationToken && cancellationToken.isCancelled) {
            this.state = 'IDLE';
            this.emit('done', { status: 'cancelled' });
            return { status: 'cancelled', messages };
          }

          if (chunk.type === 'thought') {
            turnThought += chunk.text || '';
            this.emit('thought', { text: chunk.text });
          } else if (chunk.type === 'content') {
            turnContent += chunk.text || '';
            this.emit('chunk', { text: chunk.text });
          } else if (chunk.type === 'tool_call') {
            turnToolCalls.push(chunk);
          }
        }

        finalText = turnContent;

        // Base case: Assistant concluded with final answer (no tools requested)
        if (turnToolCalls.length === 0) {
          messages.push({ role: 'assistant', content: turnContent });
          this.state = 'IDLE';
          this.emit('done', { status: 'completed', finalText, turns: turn + 1 });
          return { status: 'completed', finalText, turns: turn + 1, messages };
        }

        // Assistant requested tool executions
        messages.push({
          role: 'assistant',
          content: turnContent,
          tool_calls: turnToolCalls.map((tc) => ({
            id: tc.callId,
            type: 'function',
            function: {
              name: tc.toolName,
              arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}),
            },
          })),
        });

        // Execute all tool calls
        for (const call of turnToolCalls) {
          if (checkCancellation()) {
            return { status: 'cancelled', messages };
          }

          const tool = this.tools[call.toolName];
          this.emit('tool_call', {
            callId: call.callId,
            toolName: call.toolName,
            args: call.args,
          });

          if (!tool) {
            const errMsg = `Unknown tool requested: ${call.toolName}`;
            this.emit('tool_result', { callId: call.callId, result: errMsg, error: errMsg });
            messages.push({
              role: 'tool',
              tool_call_id: call.callId,
              name: call.toolName,
              content: errMsg,
            });
            continue;
          }

          const isMutating = Boolean(tool.isMutating);

          if (isMutating && !isAutonomous) {
            // Supervised mode: Pause and emit approval_request
            this.state = 'WAITING_FOR_APPROVAL';
            const approvalId = randomUUID();

            this.emit('approval_request', {
              approvalId,
              callId: call.callId,
              toolName: call.toolName,
              args: call.args,
            });

            const approvalResponse = await new Promise((resolve) => {
              this.pendingApprovals.set(approvalId, { resolve });

              if (cancellationToken) {
                cancellationToken.onCancel(() => {
                  this.pendingApprovals.delete(approvalId);
                  resolve({ approved: false, cancelled: true });
                });
              }
            });

            if (approvalResponse.cancelled || (cancellationToken && cancellationToken.isCancelled)) {
              this.state = 'IDLE';
              this.emit('done', { status: 'cancelled' });
              return { status: 'cancelled', messages };
            }

            if (!approvalResponse.approved) {
              this.state = 'IDLE';
              this.emit('done', { status: 'rejected', reason: approvalResponse.reason });
              return { status: 'rejected', reason: approvalResponse.reason, messages };
            }

            // Approved -> execute tool
            this.state = 'EXECUTING_MUTATING_TOOL';
            const toolResult = await tool.execute(call.args, {
              inspectionPort: this.inspectionPort,
            });
            lastToolResult = toolResult;
            this.emit('tool_result', { callId: call.callId, result: toolResult });
            messages.push({
              role: 'tool',
              tool_call_id: call.callId,
              name: call.toolName,
              content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
            });
          } else {
            // Autonomous execution (read-only tool, or mutating tool in YOLO mode)
            this.state = isMutating ? 'EXECUTING_MUTATING_TOOL' : 'EXECUTING_READONLY_TOOLS';
            const toolResult = await tool.execute(call.args, {
              inspectionPort: this.inspectionPort,
            });
            lastToolResult = toolResult;
            this.emit('tool_result', { callId: call.callId, result: toolResult });
            messages.push({
              role: 'tool',
              tool_call_id: call.callId,
              name: call.toolName,
              content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
            });
          }
        }

        turn++;
      }

      // If loop exhausted maxTurns
      this.state = 'IDLE';
      this.emit('done', {
        status: 'max_turns_exceeded',
        reason: `Maximum turns limit reached (${maxTurns})`,
        finalText,
        turns: turn,
      });
      return {
        status: 'max_turns_exceeded',
        reason: `Maximum turns limit reached (${maxTurns})`,
        finalText,
        turns: turn,
        messages,
      };
    } catch (err) {
      this.state = 'IDLE';
      this.emit('error', { error: err.message });
      throw err;
    }
  }

  emit(type, payload) {
    if (this.telemetryPort && typeof this.telemetryPort.emit === 'function') {
      this.telemetryPort.emit({
        type,
        payload,
        timestamp: Date.now(),
      });
    }
  }
}
