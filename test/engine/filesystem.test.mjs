import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  AtomicTransactionEngine,
  computeSha256,
} from '../../engine/filesystem/index.mjs';

describe('Atomic Filesystem & Rollback Engine (Ticket #6)', () => {
  let tempWorkspace;
  let engine;

  beforeEach(() => {
    tempWorkspace = mkdtempSync(join(tmpdir(), 'lens-atomic-fs-'));
    engine = new AtomicTransactionEngine({ workspaceRoot: tempWorkspace });
  });

  afterEach(() => {
    if (tempWorkspace && existsSync(tempWorkspace)) {
      rmSync(tempWorkspace, { recursive: true, force: true });
    }
  });

  describe('SHA-256 Hash Validation & Pre-Write Checks', () => {
    it('computes sha256 of strings and buffers correctly', () => {
      const hash1 = computeSha256('hello world');
      assert.equal(hash1, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');

      const hashEmpty = computeSha256('');
      assert.equal(hashEmpty, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('prepares changeset and detects expected hashes for new and existing files', async () => {
      const existingFile = join(tempWorkspace, 'config.json');
      writeFileSync(existingFile, '{"port": 8000}', 'utf8');

      const changeSet = await engine.prepareChangeSet([
        {
          path: 'config.json',
          type: 'modify',
          newContent: '{"port": 9000}',
        },
        {
          path: 'src/index.ts',
          type: 'create',
          newContent: 'console.log("hello");',
        },
      ]);

      assert.equal(changeSet.files.length, 2);
      assert.equal(changeSet.files[0].path, 'config.json');
      assert.equal(changeSet.files[0].beforeSha256, computeSha256('{"port": 8000}'));
      assert.equal(changeSet.files[0].afterSha256, computeSha256('{"port": 9000}'));

      assert.equal(changeSet.files[1].path, 'src/index.ts');
      assert.equal(changeSet.files[1].beforeSha256, null);
      assert.equal(changeSet.files[1].afterSha256, computeSha256('console.log("hello");'));
    });

    it('rejects transaction if target file changed concurrently on disk', async () => {
      const targetFile = join(tempWorkspace, 'state.txt');
      writeFileSync(targetFile, 'initial state', 'utf8');

      const changeSet = await engine.prepareChangeSet([
        {
          path: 'state.txt',
          type: 'modify',
          newContent: 'new state',
        },
      ]);

      // Simulate concurrent external edit on disk after changeset was prepared
      writeFileSync(targetFile, 'concurrent rogue edit', 'utf8');

      await assert.rejects(
        async () => {
          await engine.applyTransaction(changeSet);
        },
        {
          name: 'ConcurrencyConflictError',
        }
      );

      // Verify disk was NOT overwritten
      assert.equal(readFileSync(targetFile, 'utf8'), 'concurrent rogue edit');
    });
  });

  describe('Atomic Transaction Application & Rollback Manifest', () => {
    it('applies multi-file transaction atomically and stores manifest in .lens/transactions', async () => {
      const fileA = join(tempWorkspace, 'fileA.txt');
      writeFileSync(fileA, 'initial A', 'utf8');

      const changeSet = await engine.prepareChangeSet([
        { path: 'fileA.txt', type: 'modify', newContent: 'updated A' },
        { path: 'nested/dir/fileB.txt', type: 'create', newContent: 'created B' },
      ]);

      const manifest = await engine.applyTransaction(changeSet, {
        description: 'Update file A and create nested file B',
      });

      assert.ok(manifest.id, 'Manifest must have a transaction ID');
      assert.equal(manifest.files.length, 2);
      assert.equal(manifest.status, 'applied');

      // Verify files on disk
      assert.equal(readFileSync(fileA, 'utf8'), 'updated A');
      assert.equal(readFileSync(join(tempWorkspace, 'nested/dir/fileB.txt'), 'utf8'), 'created B');

      // Verify manifest file exists in .lens/transactions/tx-<id>.json
      const manifestPath = join(tempWorkspace, '.lens', 'transactions', `${manifest.id}.json`);
      assert.ok(existsSync(manifestPath), `Manifest must exist at ${manifestPath}`);
    });

    it('rolls back transaction cleanly byte-for-byte to original disk state', async () => {
      const fileA = join(tempWorkspace, 'fileA.txt');
      const fileToDelete = join(tempWorkspace, 'toDelete.txt');
      writeFileSync(fileA, 'original content A', 'utf8');
      writeFileSync(fileToDelete, 'to be deleted', 'utf8');

      const changeSet = await engine.prepareChangeSet([
        { path: 'fileA.txt', type: 'modify', newContent: 'modified content A' },
        { path: 'createdNew.txt', type: 'create', newContent: 'newly created' },
        { path: 'toDelete.txt', type: 'delete' },
      ]);

      const manifest = await engine.applyTransaction(changeSet);

      // Verify changes were applied
      assert.equal(readFileSync(fileA, 'utf8'), 'modified content A');
      assert.equal(readFileSync(join(tempWorkspace, 'createdNew.txt'), 'utf8'), 'newly created');
      assert.equal(existsSync(fileToDelete), false);

      // Perform rollback
      const rollbackResult = await engine.rollback(manifest.id);

      assert.equal(rollbackResult.success, true);
      assert.equal(rollbackResult.revertedFiles.length, 3);

      // Verify byte-for-byte exact restoration
      assert.equal(readFileSync(fileA, 'utf8'), 'original content A');
      assert.equal(readFileSync(fileToDelete, 'utf8'), 'to be deleted');
      assert.equal(existsSync(join(tempWorkspace, 'createdNew.txt')), false, 'Created file must be removed');
    });

    it('lists transactions chronologically with metadata', async () => {
      const changeSet1 = await engine.prepareChangeSet([
        { path: 'f1.txt', type: 'create', newContent: '1' },
      ]);
      await engine.applyTransaction(changeSet1, { description: 'Transaction 1' });

      const changeSet2 = await engine.prepareChangeSet([
        { path: 'f2.txt', type: 'create', newContent: '2' },
      ]);
      await engine.applyTransaction(changeSet2, { description: 'Transaction 2' });

      const transactions = await engine.listTransactions();
      assert.equal(transactions.length, 2);
      assert.equal(transactions[0].description, 'Transaction 2');
      assert.equal(transactions[1].description, 'Transaction 1');
    });
  });
});
