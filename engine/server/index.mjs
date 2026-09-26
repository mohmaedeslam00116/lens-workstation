import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

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

    this.httpServer = null;
    this.wss = null;
    this.clients = new Set();
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

        ws.on('close', () => {
          this.clients.delete(ws);
        });

        ws.on('error', () => {
          this.clients.delete(ws);
        });
      });

      this.httpServer.on('error', rejectPromise);

      this.httpServer.listen(this.port, this.host, () => {
        resolvePromise();
      });
    });
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
