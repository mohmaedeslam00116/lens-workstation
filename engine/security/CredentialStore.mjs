import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Masks an API key for safe UI and log display
 */
export function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

const DEFAULT_ENV_MAP = {
  kilo: 'KILO_API_KEY',
  opencode: 'OPENCODE_API_KEY',
  cline: 'CLINE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  gemini: 'GEMINI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  ollama: 'OLLAMA_API_KEY',
  tavily: 'TAVILY_API_KEY',
  brave: 'BRAVE_API_KEY',
};

export class DPAPICredentialStore {
  constructor(options = {}) {
    this.safeStorage = options.safeStorage || null;
    this.workspacePath = options.workspacePath || null;
    this.envMap = { ...DEFAULT_ENV_MAP, ...(options.envMap || {}) };

    if (options.storePath) {
      this.storePath = options.storePath;
    } else {
      const baseDir = process.env.APPDATA || join(homedir(), '.lens');
      this.storePath = join(baseDir, 'LENS', 'credentials.enc');
    }

    this.cache = new Map();
    this.dotEnvCache = new Map();

    if (this.workspacePath) {
      this.loadWorkspaceDotenv(this.workspacePath);
    }
    this.loadFromDisk();
  }

  loadWorkspaceDotenv(workspacePath) {
    const envFile = join(workspacePath, '.env');
    if (!existsSync(envFile)) return;

    try {
      const content = readFileSync(envFile, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          this.dotEnvCache.set(key, val);
        }
      }
    } catch {
      // Ignore unreadable .env
    }
  }

  /**
   * Derives a machine-bound encryption key when electron.safeStorage is not present
   */
  getMachineDerivedKey() {
    const machineSeed = [
      process.env.COMPUTERNAME || 'COMPUTER',
      process.env.USERNAME || 'USER',
      'lens-workstation-secure-v2',
    ].join('::');
    return createHash('sha256').update(machineSeed).digest();
  }

  encrypt(plaintext) {
    if (this.safeStorage && typeof this.safeStorage.encryptString === 'function') {
      const encryptedBuffer = this.safeStorage.encryptString(plaintext);
      return `dpapi:${encryptedBuffer.toString('base64')}`;
    }

    // Node.js fallback: AES-256-GCM
    const key = this.getMachineDerivedKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    let ciphertext = cipher.update(plaintext, 'utf-8', 'base64');
    ciphertext += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');
    return `gcm:${iv.toString('base64')}:${authTag}:${ciphertext}`;
  }

  decrypt(payload) {
    if (typeof payload !== 'string') return '';

    if (payload.startsWith('dpapi:') && this.safeStorage && typeof this.safeStorage.decryptString === 'function') {
      const buffer = Buffer.from(payload.slice(6), 'base64');
      return this.safeStorage.decryptString(buffer);
    }

    if (payload.startsWith('gcm:')) {
      const [, ivB64, tagB64, cipherB64] = payload.split(':');
      const key = this.getMachineDerivedKey();
      const iv = Buffer.from(ivB64, 'base64');
      const authTag = Buffer.from(tagB64, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      let plaintext = decipher.update(cipherB64, 'base64', 'utf-8');
      plaintext += decipher.final('utf-8');
      return plaintext;
    }

    return '';
  }

  loadFromDisk() {
    if (!existsSync(this.storePath)) return;
    try {
      const raw = readFileSync(this.storePath, 'utf-8');
      const decryptedJson = this.decrypt(raw);
      if (decryptedJson) {
        const parsed = JSON.parse(decryptedJson);
        for (const [provider, data] of Object.entries(parsed)) {
          this.cache.set(provider.toLowerCase(), data);
        }
      }
    } catch {
      // Ignore corrupted or unreadable store
    }
  }

  saveToDisk() {
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const payload = {};
    for (const [provider, data] of this.cache.entries()) {
      payload[provider] = data;
    }

    const encrypted = this.encrypt(JSON.stringify(payload));
    writeFileSync(this.storePath, encrypted, 'utf-8');
  }

  readRawDiskContent() {
    if (!existsSync(this.storePath)) return '';
    return readFileSync(this.storePath, 'utf-8');
  }

  setCredential(provider, data) {
    if (!provider) throw new Error('Provider name is required');
    const p = provider.toLowerCase();
    const entry = typeof data === 'string' ? { apiKey: data } : { ...data };
    this.cache.set(p, entry);
    this.saveToDisk();
    return entry;
  }

  getCredential(provider) {
    if (!provider) return null;
    const p = provider.toLowerCase();

    // 1. Explicitly saved in store
    if (this.cache.has(p)) {
      const entry = this.cache.get(p);
      return { ...entry, source: 'store' };
    }

    const envVar = this.envMap[p];

    // 2. Workspace .env
    if (envVar && this.dotEnvCache.has(envVar)) {
      return { apiKey: this.dotEnvCache.get(envVar), source: 'dotenv' };
    }

    // 3. Process environment
    if (envVar && process.env[envVar]) {
      return { apiKey: process.env[envVar], source: 'environment' };
    }

    return null;
  }

  deleteCredential(provider) {
    if (!provider) return false;
    const p = provider.toLowerCase();
    const deleted = this.cache.delete(p);
    if (deleted) {
      this.saveToDisk();
    }
    return deleted;
  }

  getAllCredentialsMasked() {
    const result = {};

    // 1. Gather all providers in store
    for (const [provider, data] of this.cache.entries()) {
      result[provider] = {
        ...data,
        apiKey: maskApiKey(data.apiKey),
        source: 'store',
      };
    }

    // 2. Add any environment or dotenv fallbacks if not already present
    for (const [provider, envVar] of Object.entries(this.envMap)) {
      if (!result[provider]) {
        let keyVal = null;
        let source = null;

        if (this.dotEnvCache.has(envVar)) {
          keyVal = this.dotEnvCache.get(envVar);
          source = 'dotenv';
        } else if (process.env[envVar]) {
          keyVal = process.env[envVar];
          source = 'environment';
        }

        if (keyVal) {
          result[provider] = {
            apiKey: maskApiKey(keyVal),
            source,
          };
        }
      }
    }

    return result;
  }
}
