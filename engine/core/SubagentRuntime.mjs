import { randomUUID } from 'node:crypto';
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgentRuntime } from './runtime.mjs';
import { CancellationSource } from './ports.mjs';
import { EventBus } from './EventBus.mjs';

/**
 * SubagentRuntime
 * Spawns and manages isolated child agent contexts with their own UUID, prompt,
 * archetype-scoped toolsets, and streaming transcript.jsonl persistence.
 */
export class SubagentRuntime {
  constructor(options = {}) {
    this.workspacePath = options.workspacePath || process.cwd();
    this.conversationsDir = options.conversationsDir || join(this.workspacePath, '.lens', 'conversations');
    this.eventBus = options.eventBus || new EventBus();
    this.modelProvider = options.modelProvider || null;
    this.inspectionPort = options.inspectionPort || null;
    this.tools = options.tools || {};

    this.subagents = new Map();
  }

  /**
   * Filter and scope tools according to subagent archetype
   */
  getScopedTools(archetype) {
    const scoped = {};

    for (const [name, tool] of Object.entries(this.tools)) {
      if (archetype === 'research' || archetype === 'code_reviewer') {
        // Research and Code Reviewer are read-only / inspection only
        if (!tool.isMutating) {
          scoped[name] = tool;
        }
      } else {
        // General archetype gets available tools
        scoped[name] = tool;
      }
    }

    return scoped;
  }

  async spawnSubagent({ role, type, typeName, prompt, model, systemPrompt }) {
    const subagentType = (type || typeName || 'general').toLowerCase();
    const id = `subagent-${randomUUID()}`;

    const subagentDir = join(this.conversationsDir, id);
    if (!existsSync(subagentDir)) {
      mkdirSync(subagentDir, { recursive: true });
    }

    const transcriptPath = join(subagentDir, 'transcript.jsonl');

    const subagent = {
      id,
      role: role || (subagentType === 'research' ? 'Research Assistant' : (subagentType === 'code_reviewer' ? 'Code Reviewer' : 'Subagent Worker')),
      type: subagentType,
      prompt: prompt || '',
      status: 'running',
      stateDetail: 'Initializing subagent context...',
      startTime: Date.now(),
      endTime: null,
      durationMs: 0,
      result: null,
      error: null,
      transcriptPath,
      cancellation: new CancellationSource(),
    };

    this.subagents.set(id, subagent);

    const appendTranscript = (record) => {
      try {
        const line = JSON.stringify({
          timestamp: Date.now(),
          id,
          ...record,
        }) + '\n';
        appendFileSync(transcriptPath, line, 'utf8');
      } catch {
        // Safe logging fallback
      }
    };

    appendTranscript({
      type: 'init',
      role: subagent.role,
      archetype: subagent.type,
      prompt: subagent.prompt,
    });

    let stepIndex = 0;
    const toolCallNames = new Map();

    const childTelemetry = {
      emit: (event) => {
        stepIndex++;
        const { type, payload } = event;

        if (type === 'thought') {
          subagent.stateDetail = payload.text ? `Thinking: ${payload.text.slice(0, 80)}...` : 'Thinking...';
          appendTranscript({ type: 'thought', step: stepIndex, stepIndex, text: payload.text });
          this.eventBus.emitSubagentStep({
            id,
            stepIndex,
            state: subagent.status,
            stateDetail: subagent.stateDetail,
            thought: payload.text,
          });
        } else if (type === 'chunk') {
          appendTranscript({ type: 'content', step: stepIndex, stepIndex, text: payload.text });
          this.eventBus.emitSubagentStep({
            id,
            stepIndex,
            state: subagent.status,
            stateDetail: subagent.stateDetail,
            chunk: payload.text,
          });
        } else if (type === 'tool_call') {
          toolCallNames.set(payload.callId, payload.toolName);
          subagent.stateDetail = `Calling tool: ${payload.toolName}`;
          appendTranscript({
            type: 'tool_call',
            step: stepIndex,
            stepIndex,
            toolName: payload.toolName,
            callId: payload.callId,
            args: payload.args,
          });
          this.eventBus.emitSubagentStep({
            id,
            stepIndex,
            state: subagent.status,
            stateDetail: subagent.stateDetail,
            toolCall: payload,
          });
        } else if (type === 'tool_result') {
          const toolName = toolCallNames.get(payload.callId);
          subagent.stateDetail = `Completed tool: ${payload.callId}`;
          appendTranscript({
            type: 'tool_result',
            step: stepIndex,
            stepIndex,
            callId: payload.callId,
            toolName,
            result: payload.result,
            error: payload.error,
          });
          this.eventBus.emitSubagentStep({
            id,
            stepIndex,
            state: subagent.status,
            stateDetail: subagent.stateDetail,
            toolResult: payload,
          });
        }
      },
    };

    let archetypePrompt = 'You are an autonomous subagent assistant.';
    if (subagentType === 'research') {
      archetypePrompt = 'You are a dedicated Research Subagent. Your goal is to thoroughly investigate questions, inspect codebase files, search repositories, and summarize findings with evidence quotes and clear analysis.';
    } else if (subagentType === 'code_reviewer') {
      archetypePrompt = 'You are a dedicated Code Review Subagent. Your goal is to review code changes for correctness, security vulnerabilities, edge cases, and architectural integrity.';
    }

    const scopedTools = this.getScopedTools(subagentType);

    const childRuntime = new AgentRuntime({
      inspectionPort: this.inspectionPort,
      telemetryPort: childTelemetry,
      modelProvider: model || this.modelProvider,
      tools: scopedTools,
      autonomyMode: 'autonomous',
      systemPrompt: systemPrompt || archetypePrompt,
    });

    this.eventBus.emitSubagentStarted({
      id,
      role: subagent.role,
      type: subagent.type,
      prompt: subagent.prompt,
    });

    const completionPromise = (async () => {
      try {
        const turnResult = await childRuntime.runTurn(prompt, {
          cancellationToken: subagent.cancellation.token,
          autonomyMode: 'autonomous',
        });

        subagent.endTime = Date.now();
        subagent.durationMs = subagent.endTime - subagent.startTime;

        if (turnResult.status === 'cancelled') {
          subagent.status = 'cancelled';
          subagent.stateDetail = 'Subagent execution cancelled';
          appendTranscript({
            type: 'done',
            status: 'cancelled',
            durationMs: subagent.durationMs,
          });
          this.eventBus.emitEvent('subagent:cancelled', {
            id,
            status: 'cancelled',
            durationMs: subagent.durationMs,
          });
        } else if (turnResult.status === 'completed') {
          subagent.status = 'completed';
          subagent.stateDetail = 'Task completed successfully';
          subagent.result = turnResult.finalText || '';
          appendTranscript({
            type: 'done',
            status: 'completed',
            result: subagent.result,
            durationMs: subagent.durationMs,
            turns: turnResult.turns,
          });
          this.eventBus.emitSubagentDone({
            id,
            result: subagent.result,
            durationMs: subagent.durationMs,
            turns: turnResult.turns,
          });
        } else {
          subagent.status = turnResult.status;
          subagent.stateDetail = turnResult.reason || 'Subagent terminated';
          appendTranscript({
            type: 'done',
            status: turnResult.status,
            reason: turnResult.reason,
            durationMs: subagent.durationMs,
          });
          this.eventBus.emitSubagentFailed({
            id,
            error: turnResult.reason,
            durationMs: subagent.durationMs,
          });
        }
        return subagent;
      } catch (err) {
        subagent.endTime = Date.now();
        subagent.durationMs = subagent.endTime - subagent.startTime;
        subagent.status = 'failed';
        subagent.stateDetail = `Error: ${err.message}`;
        subagent.error = err.message;
        appendTranscript({
          type: 'error',
          error: err.message,
          durationMs: subagent.durationMs,
        });
        this.eventBus.emitSubagentFailed({
          id,
          error: err.message,
          durationMs: subagent.durationMs,
        });
        return subagent;
      }
    })();

    return {
      conversationId: id,
      id,
      role: subagent.role,
      type: subagent.type,
      status: 'running',
      startTime: subagent.startTime,
      completionPromise,
    };
  }

  getSubagents() {
    return Array.from(this.subagents.values()).map((s) => ({
      id: s.id,
      role: s.role,
      type: s.type,
      prompt: s.prompt,
      status: s.status,
      stateDetail: s.stateDetail,
      startTime: s.startTime,
      endTime: s.endTime,
      durationMs: s.durationMs || (s.status === 'running' ? Date.now() - s.startTime : 0),
      result: s.result,
      error: s.error,
      transcriptPath: s.transcriptPath,
    }));
  }

  getSubagent(id) {
    const s = this.subagents.get(id);
    if (!s) return null;
    return {
      id: s.id,
      role: s.role,
      type: s.type,
      prompt: s.prompt,
      status: s.status,
      stateDetail: s.stateDetail,
      startTime: s.startTime,
      endTime: s.endTime,
      durationMs: s.durationMs || (s.status === 'running' ? Date.now() - s.startTime : 0),
      result: s.result,
      error: s.error,
      transcriptPath: s.transcriptPath,
    };
  }

  async getTranscript(id) {
    const s = this.subagents.get(id);
    const filePath = s?.transcriptPath || join(this.conversationsDir, id, 'transcript.jsonl');

    if (!existsSync(filePath)) {
      return [];
    }

    try {
      const raw = readFileSync(filePath, 'utf8');
      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  }

  killSubagent(id) {
    const s = this.subagents.get(id);
    if (s && s.status === 'running') {
      s.cancellation.cancel();
      return true;
    }
    return false;
  }

  createInvokeTool() {
    return {
      name: 'invoke_subagent',
      description: 'Spawn an isolated background subagent (research, code_reviewer, general) to perform specialized tasks autonomously',
      isMutating: false,
      execute: async (args) => {
        const handle = await this.spawnSubagent({
          role: args.role || 'Background Subagent',
          type: args.type || args.typeName || 'general',
          prompt: args.prompt || args.task || '',
        });

        return {
          status: 'subagent_spawned',
          conversationId: handle.conversationId,
          role: handle.role,
          type: handle.type,
          message: `Subagent "${handle.role}" [${handle.conversationId}] spawned in background.`,
        };
      },
    };
  }
}
