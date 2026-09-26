import type { ExecutionOptions, ExecutionResult } from './types.js';

export declare const DEFAULT_ALLOWED_ENV_VARS: Set<string>;

export declare function sanitizeEnvironment(
  customEnv?: Record<string, string>,
  extraAllowed?: string[]
): Record<string, string>;

export interface RunnerOptions {
  defaultTimeout?: number;
  defaultMaxOutputBytes?: number;
}

export declare class SanitizedProcessRunner {
  defaultTimeout: number;
  defaultMaxOutputBytes: number;
  constructor(options?: RunnerOptions);
  execute(options: ExecutionOptions): Promise<ExecutionResult>;
}
