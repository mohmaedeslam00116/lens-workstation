export interface EngineServerOptions {
  port?: number;
  host?: string;
  staticDir?: string;
  initialWorkspace?: string;
}

export class EngineServer {
  port: number;
  host: string;
  staticDir: string | null;
  workspacePath: string;
  capabilityGrant: string;

  constructor(options?: EngineServerOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  broadcast(event: unknown): void;
}
