import { randomUUID } from 'node:crypto';
import { STANDARD_TOOLS } from './tools.mjs';

export class AgentRuntime {
  constructor(options = {}) {
    this.inspectionPort = options.inspectionPort;
    this.telemetryPort = options.telemetryPort;
    this.modelProvider = options.modelProvider;
    this.tools = options.tools || STANDARD_TOOLS;

    this.state = 'IDLE';
    this.pendingApprovals = new Map();
  }

  getState() {
    return this.state;
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
    this.state = 'STREAMING_THOUGHT';

    let finalText = '';

    const checkCancellation = () => {
      if (cancellationToken && cancellationToken.isCancelled) {
        this.state = 'IDLE';
        this.emit('done', { status: 'cancelled' });
        return true;
      }
      return false;
    };

    if (checkCancellation()) return { status: 'cancelled' };

    try {
      const stream = this.modelProvider.generateStream(prompt);
      const turnResult = await this.consumeStream(stream, cancellationToken, (text) => {
        finalText += text;
      });

      if (turnResult && turnResult.status === 'cancelled') {
        this.state = 'IDLE';
        return { status: 'cancelled' };
      }

      if (turnResult && turnResult.status === 'rejected') {
        this.state = 'IDLE';
        return { status: 'rejected', reason: turnResult.reason };
      }

      this.state = 'IDLE';
      this.emit('done', { status: 'completed', finalText });
      return { status: 'completed', finalText };
    } catch (err) {
      this.state = 'IDLE';
      this.emit('error', { error: err.message });
      throw err;
    }
  }

  async consumeStream(stream, cancellationToken, onContent) {
    for await (const chunk of stream) {
      if (cancellationToken && cancellationToken.isCancelled) {
        return { status: 'cancelled' };
      }

      if (chunk.type === 'thought') {
        this.emit('thought', { text: chunk.text });
      } else if (chunk.type === 'content') {
        onContent(chunk.text);
      } else if (chunk.type === 'tool_call') {
        const tool = this.tools[chunk.toolName];
        if (!tool) {
          throw new Error(`Unknown tool requested: ${chunk.toolName}`);
        }

        this.emit('tool_call', {
          callId: chunk.callId,
          toolName: chunk.toolName,
          args: chunk.args,
        });

        // Mutating Tool -> Checkpoint requiring human approval
        if (tool.isMutating) {
          this.state = 'WAITING_FOR_APPROVAL';
          const approvalId = randomUUID();

          this.emit('approval_request', {
            approvalId,
            callId: chunk.callId,
            toolName: chunk.toolName,
            args: chunk.args,
          });

          const approvalResponse = await new Promise((resolve) => {
            this.pendingApprovals.set(approvalId, { resolve });

            // If cancelled while waiting for approval
            if (cancellationToken) {
              cancellationToken.onCancel(() => {
                this.pendingApprovals.delete(approvalId);
                resolve({ approved: false, cancelled: true });
              });
            }
          });

          if (approvalResponse.cancelled || (cancellationToken && cancellationToken.isCancelled)) {
            return { status: 'cancelled' };
          }

          if (!approvalResponse.approved) {
            return { status: 'rejected', reason: approvalResponse.reason };
          }

          // Approved -> execute tool and continue
          this.state = 'EXECUTING_MUTATING_TOOL';
          const toolResult = await tool.execute(chunk.args, {
            inspectionPort: this.inspectionPort,
          });
          this.emit('tool_result', { callId: chunk.callId, result: toolResult });
        } else {
          // Read-only tool -> Execute autonomously
          this.state = 'EXECUTING_READONLY_TOOLS';
          const toolResult = await tool.execute(chunk.args, {
            inspectionPort: this.inspectionPort,
          });

          this.emit('tool_result', { callId: chunk.callId, result: toolResult });

          // Continue stream with tool result if model supports it
          if (typeof this.modelProvider.continueStreamWithToolResult === 'function') {
            const nextStream = this.modelProvider.continueStreamWithToolResult(toolResult);
            const nestedResult = await this.consumeStream(nextStream, cancellationToken, onContent);
            if (nestedResult) return nestedResult;
          }
        }
      }
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
