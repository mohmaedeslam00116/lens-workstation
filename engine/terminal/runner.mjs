import { spawn } from 'node:child_process';
import { killProcessTree } from './tree-killer.mjs';

/**
 * Standard allowlist of safe system environment variables.
 * Sensitive variables (API keys, authentication tokens, cloud secrets) are omitted.
 */
export const DEFAULT_ALLOWED_ENV_VARS = new Set([
  'PATH',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'SHELL',
  'HOMEDRIVE',
  'HOMEPATH',
  'USERPROFILE',
  'HOME',
  'COMSPEC',
  'PATHEXT',
  'APPDATA',
  'LOCALAPPDATA',
  'ALLUSERSPROFILE',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'COMMONPROGRAMFILES',
  'WINDIR',
  'TERM',
  'COLORTERM',
  'TERM_PROGRAM',
]);

/**
 * Strip sensitive credentials, tokens, and keys from the environment,
 * preserving only explicitly allowlisted system variables.
 *
 * @param {Record<string, string>} [customEnv={}] - Optional explicit overrides from caller
 * @param {string[]} [extraAllowed=[]] - Optional additional keys to permit
 * @returns {Record<string, string>} Sanitized environment dictionary
 */
export function sanitizeEnvironment(customEnv = {}, extraAllowed = []) {
  const allowed = new Set(DEFAULT_ALLOWED_ENV_VARS);
  for (const item of extraAllowed) {
    if (typeof item === 'string') {
      allowed.add(item.toUpperCase());
    }
  }

  const result = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (allowed.has(key.toUpperCase())) {
      result[key] = value;
    }
  }

  // Caller-provided explicit variables are merged
  for (const [key, value] of Object.entries(customEnv)) {
    if (value !== undefined) {
      result[key] = String(value);
    }
  }

  return result;
}

export class SanitizedProcessRunner {
  /**
   * @param {object} [options={}]
   * @param {number} [options.defaultTimeout=30000] - Default timeout in milliseconds
   * @param {number} [options.defaultMaxOutputBytes=1048576] - Default max bytes (1 MB)
   */
  constructor(options = {}) {
    this.defaultTimeout = options.defaultTimeout ?? 30000;
    this.defaultMaxOutputBytes = options.defaultMaxOutputBytes ?? 1024 * 1024;
  }

  /**
   * Execute a command with strict environment sanitization and resource guardrails.
   *
   * @param {import('./types.js').ExecutionOptions} options
   * @returns {Promise<import('./types.js').ExecutionResult>}
   */
  async execute(options) {
    const {
      command,
      args = [],
      cwd = process.cwd(),
      env = {},
      timeout = this.defaultTimeout,
      maxOutputBytes = this.defaultMaxOutputBytes,
      onStdout,
      onStderr,
      signal,
    } = options;

    const startTime = Date.now();
    const sanitizedEnv = sanitizeEnvironment(env);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let currentBytes = 0;
      let timedOut = false;
      let truncated = false;
      let settled = false;
      let timeoutId = null;

      const child = spawn(command, args, {
        cwd,
        env: sanitizedEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      const finish = (exitCode, exitSignal) => {
        if (settled) return;
        settled = true;
        cleanup();

        resolve({
          exitCode,
          signal: exitSignal,
          stdout,
          stderr,
          durationMs: Date.now() - startTime,
          timedOut,
          truncated,
        });
      };

      if (timeout > 0) {
        timeoutId = setTimeout(async () => {
          timedOut = true;
          if (child.pid) {
            await killProcessTree(child.pid);
          }
          finish(null, 'SIGTIMEOUT');
        }, timeout);
      }

      const onAbort = async () => {
        if (child.pid) {
          await killProcessTree(child.pid);
        }
        finish(null, 'SIGABORT');
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      const handleData = (chunk, isStderr) => {
        const str = chunk.toString();
        const chunkLen = Buffer.byteLength(chunk);

        if (currentBytes + chunkLen > maxOutputBytes) {
          truncated = true;
          const allowedLen = Math.max(0, maxOutputBytes - currentBytes);
          if (allowedLen > 0) {
            const partial = str.slice(0, allowedLen);
            if (isStderr) {
              stderr += partial;
              onStderr?.(partial);
            } else {
              stdout += partial;
              onStdout?.(partial);
            }
          }
          if (child.pid) {
            killProcessTree(child.pid).catch(() => {});
          }
          return;
        }

        currentBytes += chunkLen;
        if (isStderr) {
          stderr += str;
          onStderr?.(str);
        } else {
          stdout += str;
          onStdout?.(str);
        }
      };

      child.stdout?.on('data', (chunk) => handleData(chunk, false));
      child.stderr?.on('data', (chunk) => handleData(chunk, true));

      child.on('error', (err) => {
        stderr += `\n${String(err)}`;
        finish(1, null);
      });

      child.on('close', (code, sig) => {
        finish(code, sig);
      });
    });
  }
}
