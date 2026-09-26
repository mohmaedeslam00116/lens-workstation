import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SanitizedProcessRunner,
  sanitizeEnvironment,
  DEFAULT_ALLOWED_ENV_VARS,
  killProcessTree,
} from '../../engine/terminal/index.mjs';

describe('Sanitized Terminal & Process-Tree Terminator (Ticket #5)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Inject mock sensitive credentials into process.env to verify stripping
    process.env.OPENAI_API_KEY = 'sk-mock-super-secret-key-12345';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-mock-secret-key';
    process.env.GEMINI_API_KEY = 'AIzaSyMockKey';
    process.env.GITHUB_TOKEN = 'ghp_secret_token_abc';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret-aws-key';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  });

  describe('Environment Sanitization', () => {
    it('strips all non-allowlisted environment variables', () => {
      const sanitized = sanitizeEnvironment();

      assert.equal(sanitized.OPENAI_API_KEY, undefined);
      assert.equal(sanitized.ANTHROPIC_API_KEY, undefined);
      assert.equal(sanitized.GEMINI_API_KEY, undefined);
      assert.equal(sanitized.GITHUB_TOKEN, undefined);
      assert.equal(sanitized.AWS_SECRET_ACCESS_KEY, undefined);

      // Preserves essential system path/env variables
      if (process.env.PATH) {
        assert.ok(sanitized.PATH, 'PATH must be preserved');
      }
      if (process.platform === 'win32') {
        assert.ok(sanitized.SYSTEMROOT || sanitized.SystemRoot, 'SystemRoot must be preserved on Windows');
      }
    });

    it('allows caller to pass explicit custom environment overrides', () => {
      const sanitized = sanitizeEnvironment({
        CUSTOM_TOOL_VAR: 'custom_value',
        NODE_ENV: 'production',
      });

      assert.equal(sanitized.CUSTOM_TOOL_VAR, 'custom_value');
      assert.equal(sanitized.NODE_ENV, 'production');
      assert.equal(sanitized.OPENAI_API_KEY, undefined);
    });
  });

  describe('SanitizedProcessRunner Execution', () => {
    const runner = new SanitizedProcessRunner();

    it('executes command and captures stdout cleanly', async () => {
      const result = await runner.execute({
        command: process.execPath,
        args: ['-e', 'console.log("hello from sanitized runner")'],
      });

      assert.equal(result.exitCode, 0);
      assert.ok(result.stdout.includes('hello from sanitized runner'));
      assert.equal(result.stderr, '');
      assert.equal(result.timedOut, false);
      assert.equal(result.truncated, false);
      assert.ok(result.durationMs >= 0);
    });

    it('captures stderr and non-zero exit code', async () => {
      const result = await runner.execute({
        command: process.execPath,
        args: ['-e', 'console.error("fatal failure"); process.exit(42)'],
      });

      assert.equal(result.exitCode, 42);
      assert.ok(result.stderr.includes('fatal failure'));
      assert.equal(result.timedOut, false);
    });

    it('ensures child process does not receive stripped credentials', async () => {
      const result = await runner.execute({
        command: process.execPath,
        args: [
          '-e',
          'console.log(JSON.stringify({ hasKey: Boolean(process.env.OPENAI_API_KEY), hasToken: Boolean(process.env.GITHUB_TOKEN) }))',
        ],
      });

      assert.equal(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout.trim());
      assert.equal(parsed.hasKey, false, 'OPENAI_API_KEY must not leak into child process');
      assert.equal(parsed.hasToken, false, 'GITHUB_TOKEN must not leak into child process');
    });

    it('streams stdout and stderr via callbacks', async () => {
      const stdoutChunks = [];
      const stderrChunks = [];

      const result = await runner.execute({
        command: process.execPath,
        args: ['-e', 'console.log("line1"); console.error("err1"); console.log("line2");'],
        onStdout: (chunk) => stdoutChunks.push(chunk),
        onStderr: (chunk) => stderrChunks.push(chunk),
      });

      assert.equal(result.exitCode, 0);
      assert.ok(stdoutChunks.join('').includes('line1'));
      assert.ok(stdoutChunks.join('').includes('line2'));
      assert.ok(stderrChunks.join('').includes('err1'));
    });

    it('enforces maxOutputBytes and marks output as truncated', async () => {
      const result = await runner.execute({
        command: process.execPath,
        args: ['-e', 'for (let i = 0; i < 5000; i++) console.log("overflowing-data-stream");'],
        maxOutputBytes: 200,
      });

      assert.equal(result.truncated, true);
      assert.ok(result.stdout.length <= 500, 'stdout must be capped near maxOutputBytes');
    });

    it('enforces execution timeout and terminates runaway process tree', async () => {
      const start = Date.now();
      const result = await runner.execute({
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000)'],
        timeout: 500,
      });

      const elapsed = Date.now() - start;
      assert.equal(result.timedOut, true);
      assert.ok(elapsed < 4000, `Process should be terminated promptly, took ${elapsed}ms`);
    });

    it('supports external AbortSignal cancellation', async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 200);

      const result = await runner.execute({
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000)'],
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      assert.ok(result.timedOut === false);
      assert.ok(result.exitCode !== 0 || result.signal !== null);
    });
  });

  describe('CrossPlatformProcessTreeTerminator', () => {
    it('gracefully handles non-existent or already dead PID', async () => {
      // Should not throw or crash on dead PID (e.g. 999999)
      await assert.doesNotReject(async () => {
        await killProcessTree(999999);
      });
    });
  });
});
