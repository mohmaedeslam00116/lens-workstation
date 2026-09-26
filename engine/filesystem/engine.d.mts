import type {
  FileChangeRequest,
  AtomicChangeSet,
  RollbackManifest,
  RollbackResult,
  RollbackManifestHeader,
} from './types.js';

export interface AtomicTransactionEngineOptions {
  workspaceRoot?: string;
}

export declare class AtomicTransactionEngine {
  workspaceRoot: string;
  constructor(options?: AtomicTransactionEngineOptions);
  resolvePath(relPath: string): string;
  prepareChangeSet(requests: FileChangeRequest[]): Promise<AtomicChangeSet>;
  applyTransaction(
    changeSet: AtomicChangeSet,
    options?: { description?: string }
  ): Promise<RollbackManifest>;
  rollback(manifestOrId: string | RollbackManifest): Promise<RollbackResult>;
  listTransactions(): Promise<RollbackManifestHeader[]>;
}
