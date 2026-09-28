import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  readdirSync,
} from 'node:fs';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { computeSha256 } from './hash.mjs';
import { ConcurrencyConflictError, TransactionError } from './errors.mjs';

export class AtomicTransactionEngine {
  /**
   * @param {object} [options={}]
   * @param {string} [options.workspaceRoot=process.cwd()]
   */
  constructor(options = {}) {
    this.workspaceRoot = resolve(options.workspaceRoot || process.cwd());
  }

  /**
   * Resolves a path safely within the workspace, preventing directory traversal.
   *
   * @param {string} relPath
   * @returns {string} Absolute normalized path
   */
  resolvePath(relPath) {
    const absPath = isAbsolute(relPath)
      ? resolve(relPath)
      : resolve(this.workspaceRoot, relPath);

    if (!absPath.startsWith(this.workspaceRoot)) {
      throw new Error(`Path traversal denied: ${relPath} is outside workspace root`);
    }
    return absPath;
  }

  /**
   * Prepare an atomic change set, inspecting current disk state and calculating hashes.
   *
   * @param {import('./types.js').FileChangeRequest[]} requests
   * @returns {Promise<import('./types.js').AtomicChangeSet>}
   */
  async prepareChangeSet(requests) {
    const files = [];

    for (const req of requests) {
      const absPath = this.resolvePath(req.path);
      let beforeContent = null;
      let beforeSha256 = null;

      if (existsSync(absPath)) {
        beforeContent = readFileSync(absPath, 'utf8');
        beforeSha256 = computeSha256(beforeContent);
      }

      let afterContent = null;
      let afterSha256 = null;
      const fileType = req.type || (beforeContent !== null ? 'modify' : 'create');

      if (fileType !== 'delete') {
        afterContent = req.newContent ?? req.content ?? '';
        afterSha256 = computeSha256(afterContent);
      }

      files.push({
        path: req.path,
        type: fileType,
        beforeSha256,
        afterSha256,
        beforeContent,
        afterContent,
      });
    }

    return {
      id: `tx-${Date.now()}-${randomUUID().slice(0, 8)}`,
      timestamp: Date.now(),
      workspaceRoot: this.workspaceRoot,
      files,
    };
  }

  /**
   * Atomically apply a prepared change set with pre-write validation and automatic rollback.
   *
   * @param {import('./types.js').AtomicChangeSet} changeSet
   * @param {object} [options={}]
   * @param {string} [options.description]
   * @returns {Promise<import('./types.js').RollbackManifest>}
   */
  async applyTransaction(changeSet, options = {}) {
    // Phase 1: Pre-write SHA-256 validation against live disk state
    for (const file of changeSet.files) {
      const absPath = this.resolvePath(file.path);
      let currentSha256 = null;

      if (existsSync(absPath)) {
        const currentContent = readFileSync(absPath, 'utf8');
        currentSha256 = computeSha256(currentContent);
      }

      if (currentSha256 !== file.beforeSha256) {
        throw new ConcurrencyConflictError(
          `Concurrent modification detected on ${file.path}. Expected SHA ${file.beforeSha256}, found ${currentSha256}`,
          file.path,
          file.beforeSha256,
          currentSha256
        );
      }
    }

    // Phase 2: Atomic execution with automatic rollback on error
    const appliedActions = [];

    try {
      for (const file of changeSet.files) {
        const absPath = this.resolvePath(file.path);

        if (file.type === 'delete') {
          if (existsSync(absPath)) {
            unlinkSync(absPath);
            appliedActions.push({ file, previousState: 'existed' });
          }
        } else {
          // create or modify
          const parentDir = dirname(absPath);
          if (!existsSync(parentDir)) {
            mkdirSync(parentDir, { recursive: true });
          }
          const existed = existsSync(absPath);
          writeFileSync(absPath, file.afterContent ?? '', 'utf8');
          appliedActions.push({ file, previousState: existed ? 'existed' : 'nonexistent' });
        }
      }
    } catch (err) {
      // Revert applied actions in reverse order
      for (let i = appliedActions.length - 1; i >= 0; i--) {
        const { file, previousState } = appliedActions[i];
        const absPath = this.resolvePath(file.path);
        try {
          if (previousState === 'nonexistent') {
            if (existsSync(absPath)) {
              unlinkSync(absPath);
            }
          } else if (file.beforeContent !== null) {
            writeFileSync(absPath, file.beforeContent, 'utf8');
          }
        } catch {
          // Best effort rollback
        }
      }
      throw new TransactionError(`Transaction failed and was rolled back: ${String(err)}`, err);
    }

    // Phase 3: Manifest persistence
    const manifest = {
      id: changeSet.id,
      timestamp: changeSet.timestamp,
      description: options.description || 'Atomic transaction',
      status: 'applied',
      workspaceRoot: this.workspaceRoot,
      files: changeSet.files,
    };

    const transactionsDir = join(this.workspaceRoot, '.lens', 'transactions');
    if (!existsSync(transactionsDir)) {
      mkdirSync(transactionsDir, { recursive: true });
    }

    const manifestPath = join(transactionsDir, `${manifest.id}.json`);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    return manifest;
  }

  /**
   * Revert a transaction byte-for-byte to its original pre-transaction state.
   *
   * @param {string | import('./types.js').RollbackManifest} manifestOrId
   * @returns {Promise<import('./types.js').RollbackResult>}
   */
  async rollback(manifestOrId) {
    let manifest;

    if (typeof manifestOrId === 'string') {
      const manifestPath = join(this.workspaceRoot, '.lens', 'transactions', `${manifestOrId}.json`);
      if (!existsSync(manifestPath)) {
        throw new Error(`Rollback manifest not found: ${manifestOrId}`);
      }
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } else {
      manifest = manifestOrId;
    }

    const revertedFiles = [];

    // Process files in reverse order
    for (let i = manifest.files.length - 1; i >= 0; i--) {
      const file = manifest.files[i];
      const absPath = this.resolvePath(file.path);

      if (file.type === 'create') {
        // File was created in transaction, so remove it on rollback
        if (existsSync(absPath)) {
          unlinkSync(absPath);
        }
      } else if (file.type === 'modify' || file.type === 'delete') {
        // Restore beforeContent
        const parentDir = dirname(absPath);
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }
        writeFileSync(absPath, file.beforeContent ?? '', 'utf8');
      }

      revertedFiles.push(file.path);
    }

    // Update manifest status to rolled_back
    manifest.status = 'rolled_back';
    const manifestPath = join(this.workspaceRoot, '.lens', 'transactions', `${manifest.id}.json`);
    if (existsSync(manifestPath)) {
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    }

    return {
      success: true,
      manifestId: manifest.id,
      revertedFiles,
    };
  }

  /**
   * Alias for rollback method.
   *
   * @param {string | import('./types.js').RollbackManifest} manifestOrId
   * @returns {Promise<import('./types.js').RollbackResult>}
   */
  async rollbackTransaction(manifestOrId) {
    return await this.rollback(manifestOrId);
  }

  /**
   * List historical transactions stored in .lens/transactions/
   *
   * @returns {Promise<import('./types.js').RollbackManifestHeader[]>}
   */
  async listTransactions() {
    const transactionsDir = join(this.workspaceRoot, '.lens', 'transactions');
    if (!existsSync(transactionsDir)) {
      return [];
    }

    const files = readdirSync(transactionsDir).filter((f) => f.endsWith('.json'));
    const manifests = [];

    for (const f of files) {
      try {
        const content = readFileSync(join(transactionsDir, f), 'utf8');
        const parsed = JSON.parse(content);
        manifests.push({
          id: parsed.id,
          timestamp: parsed.timestamp,
          description: parsed.description,
          status: parsed.status,
          fileCount: Array.isArray(parsed.files) ? parsed.files.length : 0,
        });
      } catch {
        // ignore corrupted or unreadable manifest
      }
    }

    return manifests.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get the most recent active transaction applied to this workspace.
   *
   * @returns {Promise<import('./types.js').RollbackManifestHeader | null>}
   */
  async getLatestTransaction() {
    const list = await this.listTransactions();
    const applied = list.filter((tx) => tx.status === 'applied');
    return applied.length > 0 ? applied[0] : null;
  }
}
