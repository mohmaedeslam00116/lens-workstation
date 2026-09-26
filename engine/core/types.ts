/**
 * Core domain types and ports for LENS Workstation Engine
 */

export type CapabilityGrant = 
  | 'READ_ONLY_INSPECTION'
  | 'MUTATING_FILE_WRITE'
  | 'RESTRICTED_TERMINAL_COMMAND';

export interface TurnEvent {
  type: 'thought' | 'tool_call' | 'tool_result' | 'approval_request' | 'error' | 'done';
  payload: unknown;
  timestamp: number;
}
