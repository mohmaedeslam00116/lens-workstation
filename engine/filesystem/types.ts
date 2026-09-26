export type FileChangeType = 'create' | 'modify' | 'delete';

export interface FileChangeRequest {
  path: string;
  type: FileChangeType;
  newContent?: string;
  expectedSha256?: string | null;
}

export interface AtomicFileChange {
  path: string;
  type: FileChangeType;
  beforeSha256: string | null;
  afterSha256: string | null;
  beforeContent: string | null;
  afterContent: string | null;
}

export interface AtomicChangeSet {
  id: string;
  timestamp: number;
  workspaceRoot: string;
  files: AtomicFileChange[];
}

export interface RollbackManifest {
  id: string;
  timestamp: number;
  description?: string;
  status: 'applied' | 'rolled_back' | 'failed';
  workspaceRoot: string;
  files: AtomicFileChange[];
}

export interface RollbackResult {
  success: boolean;
  manifestId: string;
  revertedFiles: string[];
  error?: string;
}

export interface RollbackManifestHeader {
  id: string;
  timestamp: number;
  description?: string;
  status: 'applied' | 'rolled_back' | 'failed';
  fileCount: number;
}
