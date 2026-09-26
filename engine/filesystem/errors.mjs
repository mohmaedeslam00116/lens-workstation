export class ConcurrencyConflictError extends Error {
  constructor(message, path, expectedSha256, actualSha256) {
    super(message);
    this.name = 'ConcurrencyConflictError';
    this.path = path;
    this.expectedSha256 = expectedSha256;
    this.actualSha256 = actualSha256;
  }
}

export class TransactionError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'TransactionError';
    this.cause = cause;
  }
}
