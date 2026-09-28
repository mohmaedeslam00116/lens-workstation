import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EngineServer } from '../../engine/server/index.mjs';

describe('Settings API & Provider Endpoints (Ticket #24)', () => {
  let server;
  let baseUrl;
  let tempDir;

  before(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'lens-settings-test-'));
    server = new EngineServer({
      port: 0,
      host: '127.0.0.1',
      initialWorkspace: tempDir,
      credentialStoreOptions: {
        storePath: join(tempDir, 'credentials.enc'),
      },
    });
    await server.start();
    baseUrl = `http://127.0.0.1:${server.getPort()}`;
  });

  after(async () => {
    if (server) await server.stop();
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('GET /api/settings/credentials returns initial credentials object', async () => {
    const res = await fetch(`${baseUrl}/api/settings/credentials`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.credentials !== undefined);
  });

  it('POST /api/settings/credentials stores provider key and sets active provider', async () => {
    const payload = {
      provider: 'kilo',
      apiKey: 'sk-kilo-test-999888777',
      model: 'anthropic/claude-3-7-sonnet',
    };

    const res = await fetch(`${baseUrl}/api/settings/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.provider, 'kilo');
    assert.equal(json.maskedKey, 'sk-k...8777');

    // Verify GET reflects the masked key
    const getRes = await fetch(`${baseUrl}/api/settings/credentials`);
    const getJson = await getRes.json();
    assert.equal(getJson.credentials.kilo.apiKey, 'sk-k...8777');
    assert.equal(getJson.activeProvider, 'kilo');
  });

  it('POST /api/settings/credentials rejects invalid requests', async () => {
    const res = await fetch(`${baseUrl}/api/settings/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  it('GET /api/providers/kilo/models fetches model list via Kilo gateway provider', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, opts) => {
        if (url.includes('api.kilo.ai')) {
          return {
            ok: true,
            json: async () => ({
              data: [
                { id: 'anthropic/claude-3-7-sonnet' },
                { id: 'deepseek/deepseek-chat' },
              ]
            })
          };
        }
        return originalFetch(url, opts);
      };

      const res = await fetch(`${baseUrl}/api/providers/kilo/models`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.models));
      assert.equal(json.models.length, 2);
      assert.equal(json.models[0].id, 'anthropic/claude-3-7-sonnet');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
