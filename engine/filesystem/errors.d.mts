export declare class ConcurrencyConflictError extends Error {
  path?: string;
  expectedSha256?: string | null;
  actualSha256?: string | null;
  constructor(message: string, path?: string, expectedSha256?: string | null, actualSha256?: string | null);
}

export declare class TransactionError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown);
}
