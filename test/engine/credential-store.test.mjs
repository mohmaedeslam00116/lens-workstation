import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DPAPICredentialStore, maskApiKey } from '../../engine/security/CredentialStore.mjs';

describe('DPAPICredentialStore & Security (Ticket #24)', () => {
  let tempDir;
  let storeFile;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'lens-cred-test-'));
    storeFile = join(tempDir, 'credentials.enc');
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('masks API keys securely showing only prefix and suffix', () => {
    assert.equal(maskApiKey('sk-kilo-1234567890abcdef'), 'sk-k...cdef');
    assert.equal(maskApiKey('short'), '****');
    assert.equal(maskApiKey(''), '');
    assert.equal(maskApiKey(null), '');
  });

  it('stores and retrieves encrypted credentials at rest', () => {
    const store = new DPAPICredentialStore({ storePath: storeFile });

    store.setCredential('kilo', {
      apiKey: 'sk-kilo-secret-token-12345',
      model: 'anthropic/claude-3-7-sonnet',
    });

    const retrieved = store.getCredential('kilo');
    assert.equal(retrieved.apiKey, 'sk-kilo-secret-token-12345');
    assert.equal(retrieved.model, 'anthropic/claude-3-7-sonnet');

    // Verify on disk file is encrypted (not plain text)
    const rawDiskContent = store.readRawDiskContent();
    assert.equal(rawDiskContent.includes('sk-kilo-secret-token-12345'), false);
  });

  it('lists masked credentials for safe UI exposure', () => {
    const store = new DPAPICredentialStore({ storePath: storeFile });

    store.setCredential('kilo', { apiKey: 'sk-kilo-secret-token-12345', model: 'anthropic/claude-3-7-sonnet' });
    store.setCredential('gemini', { apiKey: 'AIzaSyA1234567890XYZ', model: 'gemini-2.5-flash' });

    const masked = store.getAllCredentialsMasked();
    assert.equal(masked.kilo.apiKey, 'sk-k...2345');
    assert.equal(masked.kilo.model, 'anthropic/claude-3-7-sonnet');
    assert.equal(masked.gemini.apiKey, 'AIza...0XYZ');
  });

  it('falls back to environment variables when no key is explicitly saved', () => {
    process.env.TEST_KILO_KEY = 'kilo-env-secret-999';
    try {
      const store = new DPAPICredentialStore({
        storePath: storeFile,
        envMap: { kilo: 'TEST_KILO_KEY' },
      });

      const retrieved = store.getCredential('kilo');
      assert.equal(retrieved.apiKey, 'kilo-env-secret-999');
      assert.equal(retrieved.source, 'environment');
    } finally {
      delete process.env.TEST_KILO_KEY;
    }
  });

  it('loads environment variables from workspace .env file', () => {
    const envFile = join(tempDir, '.env');
    writeFileSync(envFile, 'OPENAI_API_KEY=sk-from-dotenv-workspace-file\n');

    const store = new DPAPICredentialStore({
      storePath: storeFile,
      workspacePath: tempDir,
    });

    const retrieved = store.getCredential('openai');
    assert.equal(retrieved.apiKey, 'sk-from-dotenv-workspace-file');
    assert.equal(retrieved.source, 'dotenv');
  });
});
