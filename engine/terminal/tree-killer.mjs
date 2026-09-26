import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Terminate a process and all its child processes across platforms.
 * On Windows: Uses taskkill.exe /pid <PID> /T /F
 * On POSIX: Sends SIGKILL to the process group, falling back to process.kill
 *
 * @param {number} pid - Target process ID to terminate
 * @param {string} [signal='SIGKILL'] - Signal to send on POSIX platforms
 * @returns {Promise<void>}
 */
export async function killProcessTree(pid, signal = 'SIGKILL') {
  if (!pid || pid <= 0) return;

  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', ['/pid', String(pid), '/T', '/F']);
    } catch {
      // Swallowed: error when process already dead or not found is expected
    }
  } else {
    try {
      // Negative PID targets the entire process group
      process.kill(-pid, signal);
    } catch (err) {
      if (err && err.code === 'ESRCH') {
        return; // Already dead
      }
      try {
        process.kill(pid, signal);
      } catch {
        // Swallowed fallback error
      }
    }
  }
}
