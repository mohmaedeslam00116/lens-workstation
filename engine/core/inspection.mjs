import { readFileSync, existsSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { resolve, join, isAbsolute, relative, sep } from 'node:path';

/**
 * Production-ready inspection port safely scoped to the active workspace directory.
 * Prevents directory traversal and excludes large/binary build artifacts.
 */
export class WorkspaceInspectionPort {
  /**
   * @param {string} [workspaceRoot=process.cwd()]
   */
  constructor(workspaceRoot = process.cwd()) {
    const absRoot = resolve(workspaceRoot);
    this.workspaceRoot = existsSync(absRoot) ? realpathSync(absRoot) : absRoot;
    this.ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'dist-package', '.lens']);
  }

  /**
   * Resolves and validates a relative path inside the workspace.
   * Throws if path attempts directory traversal or points outside via symlink.
   *
   * @param {string} relPath
   * @returns {string} Absolute resolved path
   */
  resolveSafePath(relPath) {
    const absPath = isAbsolute(relPath)
      ? resolve(relPath)
      : resolve(this.workspaceRoot, relPath);

    const isOutside = (targetPath) => {
      const rel = relative(this.workspaceRoot, targetPath);
      return rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel);
    };

    if (isOutside(absPath)) {
      throw new Error(`Path traversal denied: "${relPath}" is outside workspace root`);
    }

    if (existsSync(absPath) && isOutside(realpathSync(absPath))) {
      throw new Error(`Path traversal denied: "${relPath}" resolves outside workspace root`);
    }

    return absPath;
  }

  /**
   * View lines of a text file.
   *
   * @param {string} filePath
   * @param {number} [startLine=1]
   * @param {number} [endLine=200]
   * @returns {Promise<string>}
   */
  async viewFile(filePath, startLine = 1, endLine = 200) {
    const safePath = this.resolveSafePath(filePath);
    if (!existsSync(safePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(safePath, 'utf8');
    const lines = content.split('\n');
    const start = Math.max(1, startLine) - 1;
    const end = Math.min(lines.length, endLine);

    return lines.slice(start, end).join('\n');
  }

  /**
   * List files and directories within a workspace subpath.
   *
   * @param {string} [dirPath='.']
   * @returns {Promise<string[]>}
   */
  async listDir(dirPath = '.') {
    const safePath = this.resolveSafePath(dirPath);
    if (!existsSync(safePath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const entries = readdirSync(safePath, { withFileTypes: true });
    return entries
      .filter((e) => !this.ignoredDirs.has(e.name))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
  }

  /**
   * Search for text matches across workspace files.
   *
   * @param {string} query
   * @param {string} [subPath='.']
   * @returns {Promise<Array<{ path: string, line: number, preview: string }>>}
   */
  async grepSearch(query, subPath = '.') {
    const results = [];
    const safeBase = this.resolveSafePath(subPath);

    const walk = (dir) => {
      if (results.length >= 50) return;
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (this.ignoredDirs.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          try {
            const text = readFileSync(full, 'utf8');
            if (text.includes(query)) {
              const lines = text.split('\n');
              lines.forEach((lineText, idx) => {
                if (lineText.includes(query) && results.length < 50) {
                  results.push({
                    path: relative(this.workspaceRoot, full).replace(/\\/g, '/'),
                    line: idx + 1,
                    preview: lineText.trim().slice(0, 120),
                  });
                }
              });
            }
          } catch {
            // Skip non-utf8 or binary files
          }
        }
      }
    };

    walk(safeBase);
    return results;
  }

  /**
   * Find files matching a pattern.
   *
   * @param {string} pattern
   * @param {string} [subPath='.']
   * @returns {Promise<string[]>}
   */
  async findByName(pattern, subPath = '.') {
    const results = [];
    const safeBase = this.resolveSafePath(subPath);
    const lowerPattern = pattern.toLowerCase();

    const walk = (dir) => {
      if (results.length >= 100) return;
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (this.ignoredDirs.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.name.toLowerCase().includes(lowerPattern)) {
          results.push(relative(this.workspaceRoot, full).replace(/\\/g, '/'));
        }
        if (entry.isDirectory()) {
          walk(full);
        }
      }
    };

    walk(safeBase);
    return results;
  }
}
