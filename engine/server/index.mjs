import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { AgentRuntime } from '../core/runtime.mjs';
import { WorkspaceInspectionPort } from '../core/inspection.mjs';
import { AtomicTransactionEngine } from '../filesystem/engine.mjs';
import { SanitizedProcessRunner } from '../terminal/runner.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

export class EngineServer {
  constructor(options = {}) {
    this.port = options.port || 8000;
    this.host = options.host || '127.0.0.1';
    this.staticDir = options.staticDir ? resolve(process.cwd(), options.staticDir) : null;
    this.workspacePath = options.initialWorkspace || process.cwd();
    this.capabilityGrant = 'READ_ONLY_INSPECTION';
    this.modelProvider = options.modelProvider || null;

    this.httpServer = null;
    this.wss = null;
    this.clients = new Set();

    this.initSubsystems();
  }

  initSubsystems() {
    this.inspectionPort = new WorkspaceInspectionPort(this.workspacePath);
    this.atomicFs = new AtomicTransactionEngine({ workspaceRoot: this.workspacePath });
    this.processRunner = new SanitizedProcessRunner();
    this.proposedDiffs = new Map();

    const tools = {
      view_file: {
        name: 'view_file',
        description: 'View contents of a file within the workspace',
        isMutating: false,
        execute: async (args) => {
          return await this.inspectionPort.viewFile(args.path, args.startLine, args.endLine);
        },
      },
      list_dir: {
        name: 'list_dir',
        description: 'List contents of a directory',
        isMutating: false,
        execute: async (args) => {
          return await this.inspectionPort.listDir(args ? args.path : '.');
        },
      },
      grep_search: {
        name: 'grep_search',
        description: 'Search for text across workspace files',
        isMutating: false,
        execute: async (args) => {
          return await this.inspectionPort.grepSearch(args.query, args.path);
        },
      },
      find_by_name: {
        name: 'find_by_name',
        description: 'Find files matching a pattern',
        isMutating: false,
        execute: async (args) => {
          return await this.inspectionPort.findByName(args.pattern, args.path);
        },
      },
      propose_diff: {
        name: 'propose_diff',
        description: 'Propose a file modification diff requiring human approval',
        isMutating: true,
        execute: async (args) => {
          let original = '';
          try {
            original = await this.inspectionPort.viewFile(args.path);
          } catch {
            // New file or empty
          }

          const modified = args.content || args.modified || '';
          this.proposedDiffs.set(args.path, { path: args.path, original, modified });

          this.broadcast({
            type: 'diff_preview',
            file: { path: args.path, original, modified },
          });

          return { status: 'diff_proposed', path: args.path };
        },
      },
      run_command: {
        name: 'run_command',
        description: 'Run a shell command requiring human approval',
        isMutating: true,
        execute: async (args) => {
          let cmd = args.command;
          let cmdArgs = args.args || [];

          if (process.platform === 'win32') {
            cmdArgs = ['/c', cmd];
            cmd = 'cmd.exe';
          }

          const result = await this.processRunner.execute({
            command: cmd,
            args: cmdArgs,
            cwd: this.workspacePath,
            onStdout: (text) => {
              this.broadcast({ type: 'terminal_output', stream: 'stdout', data: text });
            },
            onStderr: (text) => {
              this.broadcast({ type: 'terminal_output', stream: 'stderr', data: text });
            },
          });

          return {
            status: result.exitCode === 0 ? 'success' : 'failed',
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          };
        },
      },
    };

    const telemetryPort = {
      emit: (event) => {
        this.handleRuntimeTelemetry(event);
      },
    };

    this.agentRuntime = new AgentRuntime({
      inspectionPort: this.inspectionPort,
      telemetryPort,
      modelProvider: this.modelProvider || this.createDefaultModelProvider(),
      tools,
    });
  }

  createDefaultModelProvider() {
    return {
      generateStream: async function* (prompt) {
        if (prompt.startsWith('/test')) {
          yield { type: 'thought', text: 'Analyzing project tests and sanitized runner configuration...' };
          yield {
            type: 'tool_call',
            callId: `call-${Date.now()}`,
            toolName: 'run_command',
            args: { command: 'echo "LENS Test Runner OK"' },
          };
          yield { type: 'content', text: 'Test execution finished.' };
        } else if (prompt.startsWith('/plan')) {
          yield { type: 'thought', text: 'Inspecting repository file hierarchy and dependencies...' };
          yield {
            type: 'tool_call',
            callId: `call-${Date.now()}`,
            toolName: 'list_dir',
            args: { path: '.' },
          };
          yield { type: 'content', text: 'Implementation plan ready. Workspace structure analyzed.' };
        } else if (prompt.startsWith('/modify') || prompt.startsWith('modify:')) {
          yield { type: 'thought', text: 'Preparing atomic change proposal for file...' };
          const targetPath = prompt.split(/\s+/)[1] || 'sample.txt';
          yield {
            type: 'tool_call',
            callId: `call-${Date.now()}`,
            toolName: 'propose_diff',
            args: { path: targetPath, content: '// Updated by LENS autonomous agent\nconst status = "ok";\n' },
          };
          yield { type: 'content', text: 'Modification diff proposed for review.' };
        } else {
          yield { type: 'thought', text: `Processing instruction: "${prompt}"...` };
          yield {
            type: 'tool_call',
            callId: `call-${Date.now()}`,
            toolName: 'list_dir',
            args: { path: '.' },
          };
          yield { type: 'content', text: `Acknowledged instruction: "${prompt}". Workspace scan complete.` };
        }
      },
    };
  }

  handleRuntimeTelemetry(event) {
    const { type, payload } = event;
    if (type === 'thought') {
      this.broadcast({ type: 'thought', text: payload.text });
    } else if (type === 'chunk') {
      this.broadcast({ type: 'chunk', text: payload.text });
    } else if (type === 'tool_call') {
      this.broadcast({
        type: 'tool_call',
        callId: payload.callId,
        toolName: payload.toolName,
        args: payload.args,
      });
    } else if (type === 'approval_request') {
      this.broadcast({
        type: 'tool_status',
        toolId: payload.approvalId,
        callId: payload.callId,
        status: 'waiting_approval',
        name: payload.toolName,
        args: payload.args,
      });
    } else if (type === 'tool_result') {
      this.broadcast({
        type: 'tool_result',
        toolId: payload.callId,
        result: payload.result,
      });
    } else if (type === 'done') {
      this.broadcast({
        type: 'done',
        status: payload.status,
        finalText: payload.finalText,
      });
    } else if (type === 'error') {
      this.broadcast({
        type: 'error',
        error: payload.error,
      });
    }
  }

  async handleWsMessage(_ws, rawData) {
    let msg;
    try {
      msg = JSON.parse(rawData);
    } catch {
      return;
    }

    if (msg.type === 'user_turn') {
      const prompt = msg.prompt || '';

      // Special handling for /rollback
      if (prompt.trim() === '/rollback') {
        try {
          const latest = await this.atomicFs.getLatestTransaction();
          if (!latest) {
            this.broadcast({
              type: 'chunk',
              text: 'No recorded filesystem transactions found to rollback in this workspace.',
            });
            this.broadcast({ type: 'done', status: 'completed' });
            return;
          }

          const rolled = await this.atomicFs.rollbackTransaction(latest.id);
          this.broadcast({
            type: 'terminal_output',
            stream: 'stdout',
            data: `[AtomicEngine] Rolled back transaction ${latest.id} (${rolled.revertedFiles.length} file(s) restored).`,
          });
          this.broadcast({
            type: 'chunk',
            text: `Reverted transaction \`${latest.id}\` successfully. Restored ${rolled.revertedFiles.join(', ')}.`,
          });
          this.broadcast({ type: 'done', status: 'completed' });
        } catch (err) {
          this.broadcast({
            type: 'terminal_output',
            stream: 'stderr',
            data: `[AtomicEngine Rollback Error]: ${err.message}`,
          });
          this.broadcast({
            type: 'chunk',
            text: `Rollback failed: ${err.message}`,
          });
          this.broadcast({ type: 'done', status: 'failed' });
        }
        return;
      }

      // Normal turn execution
      try {
        await this.agentRuntime.runTurn(prompt);
      } catch (err) {
        this.broadcast({ type: 'error', error: err.message });
      }
    } else if (msg.type === 'tool_approval') {
      const { toolId, approved, reason } = msg;
      this.agentRuntime.respondToApproval(toolId, {
        approved: !!approved,
        reason: reason || (approved ? undefined : 'User denied permission'),
      });
    } else if (msg.type === 'diff_decision') {
      const { path: filePath, decision } = msg;
      const proposed = this.proposedDiffs.get(filePath);

      if (decision === 'accept' && proposed) {
        try {
          const changeSet = await this.atomicFs.prepareChangeSet([
            { path: proposed.path, type: 'modify', newContent: proposed.modified },
          ]);
          const result = await this.atomicFs.applyTransaction(changeSet);
          this.proposedDiffs.delete(filePath);

          const txId = result.id || result.transactionId;
          this.broadcast({
            type: 'terminal_output',
            stream: 'stdout',
            data: `[AtomicEngine] Transaction ${txId} applied for ${filePath}.`,
          });
          this.broadcast({
            type: 'transaction_applied',
            transactionId: txId,
            id: txId,
            path: filePath,
          });
        } catch (err) {
          this.broadcast({
            type: 'terminal_output',
            stream: 'stderr',
            data: `[AtomicEngine Error] Failed to apply diff: ${err.message}`,
          });
        }
      } else {
        this.proposedDiffs.delete(filePath);
      }
    }
  }

  async start() {
    return new Promise((resolvePromise, rejectPromise) => {
      this.httpServer = createServer((req, res) => this.handleHttpRequest(req, res));

      this.wss = new WebSocketServer({ noServer: true });

      this.httpServer.on('upgrade', (request, socket, head) => {
        const { pathname } = new URL(request.url, `http://${request.headers.host}`);
        if (pathname === '/ws') {
          this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.wss.emit('connection', ws, request);
          });
        } else {
          socket.destroy();
        }
      });

      this.wss.on('connection', (ws) => {
        this.clients.add(ws);
        const sessionId = randomUUID();

        // Send connection acknowledgement
        ws.send(JSON.stringify({
          type: 'connected',
          sessionId,
          capabilityGrant: this.capabilityGrant,
          workspacePath: this.workspacePath,
        }));

        ws.on('message', (rawData) => {
          this.handleWsMessage(ws, rawData);
        });

        ws.on('close', () => {
          this.clients.delete(ws);
        });

        ws.on('error', () => {
          this.clients.delete(ws);
        });
      });

      this.httpServer.on('error', rejectPromise);

      this.httpServer.listen(this.port, this.host, () => {
        const addr = this.httpServer.address();
        this.actualPort = typeof addr === 'object' && addr ? addr.port : this.port;
        resolvePromise();
      });
    });
  }

  getPort() {
    return this.actualPort || this.port;
  }

  async stop() {
    return new Promise((resolvePromise) => {
      // Close all connected WS clients
      for (const client of this.clients) {
        try {
          if (client.readyState === WebSocket.OPEN) {
            client.close();
          }
        } catch { /* ignore */ }
      }
      this.clients.clear();

      if (this.wss) {
        this.wss.close();
      }

      if (this.httpServer) {
        if (typeof this.httpServer.closeAllConnections === 'function') {
          this.httpServer.closeAllConnections();
        }
        this.httpServer.close(() => {
          resolvePromise();
        });
      } else {
        resolvePromise();
      }
    });
  }

  broadcast(event) {
    const payload = typeof event === 'string' ? event : JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  async handleHttpRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // CORS & Content-Type defaults
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 1. Health check
    if (pathname === '/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: '0.1.0' }));
      return;
    }

    // 2. Active workspace state
    if (pathname === '/api/workspace' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        workspacePath: this.workspacePath,
        capabilityGrant: this.capabilityGrant,
      }));
      return;
    }

    // 3. Select workspace
    if (pathname === '/api/workspace/select' && method === 'POST') {
      try {
        const body = await this.readJsonBody(req);
        if (body && typeof body.workspacePath === 'string') {
          this.workspacePath = body.workspacePath;
          this.initSubsystems();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, workspacePath: this.workspacePath }));
          return;
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'workspacePath must be a string' }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
      return;
    }

    // 4. Static file serving with SPA fallback
    if (this.staticDir && method === 'GET') {
      let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
      let filePath = join(this.staticDir, relativePath);

      if (existsSync(filePath) && statSync(filePath).isFile()) {
        const ext = extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(readFileSync(filePath));
        return;
      }

      // SPA fallback to index.html for client-side routing
      const indexPath = join(this.staticDir, 'index.html');
      if (existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(readFileSync(indexPath));
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  readJsonBody(req) {
    return new Promise((resolvePromise, rejectPromise) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 1e6) { // 1MB limit
          req.destroy();
          rejectPromise(new Error('Body too large'));
        }
      });
      req.on('end', () => {
        try {
          resolvePromise(data ? JSON.parse(data) : {});
        } catch (err) {
          rejectPromise(err);
        }
      });
      req.on('error', rejectPromise);
    });
  }
}
