export type Language = 'en' | 'ar';

export type CapabilityMode = 'READ_ONLY_INSPECTION' | 'WORKSPACE_MUTATION';

export type AutonomyMode = 'supervised' | 'autonomous';

export type TabType = 'diff' | 'terminal' | 'evidence';

export interface ThoughtBlock {
  id: string;
  text: string;
  collapsed: boolean;
  durationMs?: number;
}

export interface ToolExecution {
  id: string;
  name: string;
  type: 'read_only' | 'mutating';
  args: Record<string, unknown>;
  status: 'running' | 'waiting_approval' | 'approved' | 'rejected' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

export interface CanvasMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thoughts?: ThoughtBlock[];
  tools?: ToolExecution[];
  timestamp: number;
}

export interface DiffFile {
  path: string;
  original: string;
  modified: string;
}

export interface TerminalLine {
  id: string;
  type: 'stdout' | 'stderr' | 'system';
  text: string;
  timestamp: number;
}

export interface EvidenceItem {
  id: string;
  title: string;
  source: string;
  snippet: string;
  url?: string;
}
