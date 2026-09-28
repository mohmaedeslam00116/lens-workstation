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
  subagents?: SubagentInfo[];
  timestamp: number;
}

export type SubagentArchetype = 'research' | 'code_reviewer' | 'general' | string;
export type SubagentStatus = 'running' | 'completed' | 'failed' | 'killed';

export interface SubagentTranscriptEntry {
  id?: string;
  stepIndex?: number;
  step_index?: number;
  type?: 'thought' | 'tool_call' | 'tool_result' | 'assistant' | 'error' | 'user' | 'init' | string;
  content?: string;
  text?: string;
  thought?: string;
  chunk?: string;
  toolName?: string;
  toolCallId?: string;
  toolCall?: { name?: string; args?: Record<string, unknown> };
  toolResult?: unknown;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  state?: string;
  stateDetail?: string;
  prompt?: string;
  timestamp?: number;
}

export interface SubagentInfo {
  id: string;
  role: string;
  type: SubagentArchetype;
  prompt?: string;
  status: SubagentStatus;
  stateDetail?: string;
  startTime: number;
  endTime?: number | null;
  durationMs?: number;
  result?: unknown;
  error?: string | null;
  transcript?: SubagentTranscriptEntry[];
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

export interface GroundedExcerpt {
  index: number;
  bracket: string;
  chunkId: string;
  milestoneId: string;
  text: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceDomain: string;
  relevanceScore: number;
}

export interface ContradictionClaim {
  sourceIndex: number;
  assertion: string;
  domain: string;
}

export interface ContradictionCallout {
  topicOrMetric: string;
  claims: ContradictionClaim[];
  explanation: string;
}

export interface GroundingAuditRecord {
  sanitizedReportMarkdown: string;
  totalCitationsFound: number;
  validCitationsCount: number;
  hallucinatedCitationsCount: number;
  validIndices: number[];
  hallucinatedIndices: number[];
  contradictionsDetected: ContradictionCallout[];
}
