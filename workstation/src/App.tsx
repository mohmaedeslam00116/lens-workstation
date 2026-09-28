import { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { AgentCanvas } from './components/AgentCanvas';
import { PromptInput } from './components/PromptInput';
import { AuxiliaryPane } from './components/AuxiliaryPane';
import { SettingsModal } from './components/SettingsModal';
import { SubagentInspectorDrawer } from './components/SubagentInspectorDrawer';
import { EvidenceDrawer } from './components/EvidenceDrawer';
import { useEngineClient } from './hooks/useEngineClient';
import type {
  CanvasMessage,
  Language,
  TabType,
  DiffFile,
  TerminalLine,
  EvidenceItem,
  ToolExecution,
  AutonomyMode,
  SubagentInfo,
  SubagentTranscriptEntry,
  GroundedExcerpt,
  ContradictionCallout,
  GroundingAuditRecord,
} from './types';

// Electron bridge global interface
declare global {
  interface Window {
    electronDialogs?: {
      openDirectory: () => Promise<string | null>;
      openFile: () => Promise<string | null>;
    };
  }
}

export function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [paneOpen, setPaneOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('diff');
  const [autonomyMode, setAutonomyMode] = useState<AutonomyMode>('supervised');
  const [isProcessing, setIsProcessing] = useState(false);
  const [subagents, setSubagents] = useState<Map<string, SubagentInfo>>(new Map());
  const [inspectingSubagentId, setInspectingSubagentId] = useState<string | null>(null);
  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false);
  const [groundedExcerpts, setGroundedExcerpts] = useState<GroundedExcerpt[]>([]);
  const [contradictionCallouts, setContradictionCallouts] = useState<ContradictionCallout[]>([]);
  const [groundingAuditRecord, setGroundingAuditRecord] = useState<GroundingAuditRecord | null>(null);


  const [messages, setMessages] = useState<CanvasMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        'Welcome to LENS Workstation (v0.1.0). I am your autonomous developer research and coding harness. You can prompt me to explore this codebase, plan refactors, or execute atomic multi-file changes.',
      timestamp: Date.now(),
    },
  ]);

  const [diffFiles, setDiffFiles] = useState<DiffFile[]>([]);
  const [terminalLogs, setTerminalLogs] = useState<TerminalLine[]>([]);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);

  // Engine client connection
  const handleEngineEvent = useCallback((event: Record<string, unknown>) => {
    const type = event.type as string;

    if (type === 'diff_preview') {
      const file = event.file as DiffFile;
      if (file) {
        setDiffFiles((prev) => [...prev.filter((f) => f.path !== file.path), file]);
      }
    } else if (type === 'evidence_item') {
      const item = event.item as EvidenceItem;
      if (item) {
        setEvidenceItems((prev) => [...prev, item]);
      }
    } else if (type === 'chunk') {
      const text = event.text as string;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant') {
          return [
            ...prev.slice(0, -1),
            { ...last, content: (last.content || '') + text },
          ];
        }
        return prev;
      });
    } else if (type === 'thought') {
      const text = event.text as string;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant') {
          const thoughts = last.thoughts || [];
          const lastThought = thoughts[thoughts.length - 1];
          if (lastThought && !lastThought.collapsed) {
            const updatedThoughts = [
              ...thoughts.slice(0, -1),
              { ...lastThought, text: lastThought.text + text },
            ];
            return [...prev.slice(0, -1), { ...last, thoughts: updatedThoughts }];
          } else {
            const newThought = {
              id: `th-${Date.now()}`,
              text,
              collapsed: false,
            };
            return [
              ...prev.slice(0, -1),
              { ...last, thoughts: [...thoughts, newThought] },
            ];
          }
        }
        return prev;
      });
    } else if (type === 'terminal_output') {
      setTerminalLogs((prev) => [
        ...prev,
        {
          id: `log-${Date.now()}-${Math.random()}`,
          type: (event.stream as 'stdout' | 'stderr') || 'stdout',
          text: (event.data as string) || '',
          timestamp: Date.now(),
        },
      ]);
    } else if (type === 'tool_status' || type === 'tool_result') {
      const toolId = event.toolId as string;
      const status = (event.status as ToolExecution['status']) || (type === 'tool_result' ? 'completed' : undefined);
      const result = event.result as string | undefined;
      const error = event.error as string | undefined;

      setMessages((prev) =>
        prev.map((msg) => {
          if (!msg.tools) return msg;
          return {
            ...msg,
            tools: msg.tools.map((t) => {
              if (t.id !== toolId) return t;
              return {
                ...t,
                status: status || t.status,
                result: result !== undefined ? result : t.result,
                error: error !== undefined ? error : t.error,
              };
            }),
          };
        })
      );
    } else if (type === 'done' || type === 'turn_cancelled' || type === 'error') {
      setIsProcessing(false);
    } else if (type === 'autonomy_mode_changed') {
      const mode = event.mode as AutonomyMode;
      if (mode) setAutonomyMode(mode);
    } else if (type === 'subagent:started') {
      const subId = (event.id as string) || (event.conversationId as string);
      if (subId) {
        setSubagents((prev) => {
          const next = new Map(prev);
          const existing = next.get(subId);
          next.set(subId, {
            id: subId,
            role: (event.role as string) || existing?.role || 'Subagent Worker',
            type: (event.type as string) || (event.subagentType as string) || existing?.type || 'general',
            prompt: (event.prompt as string) || existing?.prompt || '',
            status: 'running',
            stateDetail: 'Initializing subagent task...',
            startTime: (event.timestamp as number) || Date.now(),
            transcript: existing?.transcript || [],
          });
          return next;
        });
      }
    } else if (type === 'subagent:step') {
      const subId = (event.id as string) || (event.conversationId as string);
      if (subId) {
        setSubagents((prev) => {
          const next = new Map(prev);
          const existing = next.get(subId);
          if (!existing) return prev;
          const entry: SubagentTranscriptEntry = {
            id: subId,
            stepIndex: event.stepIndex as number,
            step_index: event.stepIndex as number,
            type: (event.step ? (event.step as Record<string, unknown>).type : undefined) as string || (event.toolCall ? 'tool_call' : event.thought ? 'thought' : (event.type as string) || 'step'),
            state: event.state as string,
            stateDetail: (event.stateDetail as string) || (event.step ? (event.step as Record<string, unknown>).stateDetail as string : undefined),
            thought: event.thought as string,
            chunk: event.chunk as string,
            toolCall: event.toolCall as { name?: string; args?: Record<string, unknown> } | undefined,
            toolResult: event.toolResult,
            toolName: (event.toolCall as Record<string, unknown>)?.name as string || (event.step as Record<string, unknown>)?.toolName as string,
            args: (event.toolCall as Record<string, unknown>)?.args as Record<string, unknown> || (event.step as Record<string, unknown>)?.args as Record<string, unknown>,
            result: event.toolResult || (event.step as Record<string, unknown>)?.result,
            error: (event.step as Record<string, unknown>)?.error as string,
            timestamp: (event.timestamp as number) || Date.now(),
          };
          const updatedTranscript = [...(existing.transcript || []), entry];
          next.set(subId, {
            ...existing,
            stateDetail: entry.stateDetail || existing.stateDetail,
            transcript: updatedTranscript,
          });
          return next;
        });
      }
    } else if (type === 'subagent:done') {
      const subId = (event.id as string) || (event.conversationId as string);
      if (subId) {
        setSubagents((prev) => {
          const next = new Map(prev);
          const existing = next.get(subId);
          if (!existing) return prev;
          const durationMs = (event.durationMs as number) || (Date.now() - existing.startTime);
          const entry: SubagentTranscriptEntry = {
            id: subId,
            type: 'result',
            result: event.result,
            content: typeof event.result === 'string' ? event.result : JSON.stringify(event.result),
            timestamp: (event.timestamp as number) || Date.now(),
          };
          next.set(subId, {
            ...existing,
            status: 'completed',
            result: event.result,
            durationMs,
            endTime: Date.now(),
            stateDetail: 'Task completed successfully',
            transcript: [...(existing.transcript || []), entry],
          });
          return next;
        });
      }
    } else if (type === 'subagent:failed') {
      const subId = (event.id as string) || (event.conversationId as string);
      if (subId) {
        setSubagents((prev) => {
          const next = new Map(prev);
          const existing = next.get(subId);
          if (!existing) return prev;
          const durationMs = (event.durationMs as number) || (Date.now() - existing.startTime);
          const entry: SubagentTranscriptEntry = {
            id: subId,
            type: 'error',
            error: (event.error as string) || 'Subagent execution error',
            timestamp: (event.timestamp as number) || Date.now(),
          };
          next.set(subId, {
            ...existing,
            status: 'failed',
            error: (event.error as string) || 'Subagent execution error',
            durationMs,
            endTime: Date.now(),
            stateDetail: `Failed: ${event.error}`,
            transcript: [...(existing.transcript || []), entry],
          });
          return next;
        });
      }
    } else if (type === 'subagent_killed') {
      const subId = event.id as string;
      if (subId) {
        setSubagents((prev) => {
          const next = new Map(prev);
          const existing = next.get(subId);
          if (!existing) return prev;
          next.set(subId, {
            ...existing,
            status: 'killed',
            endTime: Date.now(),
            durationMs: Date.now() - existing.startTime,
            stateDetail: 'Terminated by developer',
          });
          return next;
        });
      }
    } else if (type === 'research_evidence' || type === 'research:evidence') {
      if (Array.isArray(event.excerpts)) {
        setGroundedExcerpts(event.excerpts as GroundedExcerpt[]);
      }
      if (Array.isArray(event.contradictions)) {
        setContradictionCallouts(event.contradictions as ContradictionCallout[]);
      }
      if (event.audit) {
        setGroundingAuditRecord(event.audit as GroundingAuditRecord);
      }
      setEvidenceDrawerOpen(true);
    }
  }, []);

  const {
    connected,
    activeWorkspace,
    capability,
    setCapability,
    selectWorkspace,
    sendMessage,
  } = useEngineClient({ onEvent: handleEngineEvent });

  const handleSelectWorkspace = async () => {
    if (window.electronDialogs?.openDirectory) {
      const selected = await window.electronDialogs.openDirectory();
      if (selected) {
        await selectWorkspace(selected);
      }
    } else {
      const input = window.prompt('Enter workspace directory path:', activeWorkspace);
      if (input) {
        await selectWorkspace(input);
      }
    }
  };

  const handleToggleAutonomyMode = () => {
    const nextMode: AutonomyMode = autonomyMode === 'supervised' ? 'autonomous' : 'supervised';
    setAutonomyMode(nextMode);
    sendMessage({ type: 'set_autonomy_mode', mode: nextMode });
  };

  const handleStopTurn = () => {
    setIsProcessing(false);
    sendMessage({ type: 'stop_turn' });
  };

  const handleSendPrompt = (promptText: string) => {
    setIsProcessing(true);

    const userMsg: CanvasMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: promptText,
      timestamp: Date.now(),
    };

    const assistantMsg: CanvasMessage = {
      id: `asst-${Date.now()}`,
      role: 'assistant',
      content: '',
      thoughts: [
        {
          id: `thought-${Date.now()}`,
          text: 'Analyzing request and scanning workspace context...',
          collapsed: false,
          durationMs: 450,
        },
      ],
      tools: promptText.startsWith('/test')
        ? [
            {
              id: `tool-${Date.now()}`,
              name: 'execute_command',
              type: 'mutating',
              args: { command: 'npm test' },
              status: 'waiting_approval',
            },
          ]
        : undefined,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    const sent = sendMessage({
      type: 'user_turn',
      prompt: promptText,
      workspace: activeWorkspace,
      autonomyMode,
    });

    if (!sent) {
      setIsProcessing(false);
      // Offline fallback demo behavior
      setTimeout(() => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                content: promptText.startsWith('/test')
                  ? 'I have scheduled the test execution. Please review the mutation request above and grant approval to run.'
                  : `Acknowledged instruction: "${promptText}". Workspace inspection is active.`,
              },
            ];
          }
          return prev;
        });
      }, 600);
    }
  };

  const handleApproveTool = (toolId: string) => {
    const sent = sendMessage({ type: 'tool_approval', toolId, approved: true });

    setMessages((prev) =>
      prev.map((msg) => {
        if (!msg.tools) return msg;
        return {
          ...msg,
          tools: msg.tools.map((t) => {
            if (t.id !== toolId) return t;
            if (sent) {
              return {
                ...t,
                status: 'running',
              };
            } else {
              return {
                ...t,
                status: 'failed',
                error: 'Failed to deliver approval to local engine (disconnected).',
              };
            }
          }),
        };
      })
    );
  };

  const handleRejectTool = (toolId: string) => {
    const sent = sendMessage({ type: 'tool_approval', toolId, approved: false });

    setMessages((prev) =>
      prev.map((msg) => {
        if (!msg.tools) return msg;
        return {
          ...msg,
          tools: msg.tools.map((t) => {
            if (t.id !== toolId) return t;
            if (sent) {
              return {
                ...t,
                status: 'rejected',
                error: 'User denied permission for mutating operation.',
              };
            } else {
              return {
                ...t,
                status: 'failed',
                error: 'Failed to deliver rejection to local engine (disconnected).',
              };
            }
          }),
        };
      })
    );
  };

  const handleAcceptDiff = (file: DiffFile) => {
    setDiffFiles((prev) => prev.filter((f) => f.path !== file.path));
    sendMessage({ type: 'diff_decision', path: file.path, decision: 'accept' });
  };

  const handleRejectDiff = (file: DiffFile) => {
    setDiffFiles((prev) => prev.filter((f) => f.path !== file.path));
    sendMessage({ type: 'diff_decision', path: file.path, decision: 'reject' });
  };

  const handleInspectSubagent = async (subagentId: string) => {
    setInspectingSubagentId(subagentId);
    try {
      const res = await fetch(`/api/subagents/${encodeURIComponent(subagentId)}/transcript`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.transcript) && data.transcript.length > 0) {
          setSubagents((prev) => {
            const next = new Map(prev);
            const existing = next.get(subagentId);
            if (existing) {
              next.set(subagentId, {
                ...existing,
                transcript: data.transcript,
              });
            }
            return next;
          });
        }
      }
    } catch {
      // Ignore network errors in test/offline environments
    }
  };

  const handleKillSubagent = (subagentId: string) => {
    sendMessage({ type: 'kill_subagent', id: subagentId });
    setSubagents((prev) => {
      const next = new Map(prev);
      const existing = next.get(subagentId);
      if (existing) {
        next.set(subagentId, {
          ...existing,
          status: 'killed',
          stateDetail: 'Terminated by developer',
        });
      }
      return next;
    });
  };

  const isRtl = language === 'ar';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`flex h-screen w-screen flex-col bg-[#111111] text-gray-200 overflow-hidden font-sans ${
        isRtl ? 'font-cairo' : 'font-inter'
      }`}
    >
      {/* Top Application Bar */}
      <Header
        workspace={activeWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        capability={capability}
        onToggleCapability={() =>
          setCapability((c) =>
            c === 'READ_ONLY_INSPECTION'
              ? 'WORKSPACE_MUTATION'
              : 'READ_ONLY_INSPECTION'
          )
        }
        autonomyMode={autonomyMode}
        onToggleAutonomyMode={handleToggleAutonomyMode}
        isProcessing={isProcessing}
        onStopTurn={handleStopTurn}
        language={language}
        onToggleLanguage={() => setLanguage((l) => (l === 'en' ? 'ar' : 'en'))}
        paneOpen={paneOpen}
        onTogglePane={() => setPaneOpen(!paneOpen)}
        connected={connected}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main Dual-Surface Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Surface 1: Center Agent Canvas */}
        <main className="flex flex-1 flex-col overflow-hidden min-w-[400px]">
          <AgentCanvas
            messages={messages}
            language={language}
            onApproveTool={handleApproveTool}
            onRejectTool={handleRejectTool}
            subagents={subagents}
            onInspectSubagent={handleInspectSubagent}
            onKillSubagent={handleKillSubagent}
          />
          <PromptInput
            onSend={handleSendPrompt}
            language={language}
            capability={capability}
            autonomyMode={autonomyMode}
            onToggleAutonomyMode={handleToggleAutonomyMode}
            isProcessing={isProcessing}
            onStop={handleStopTurn}
          />
        </main>

        {/* Surface 2: Auxiliary Workstation Pane */}
        <AuxiliaryPane
          isOpen={paneOpen}
          onClose={() => setPaneOpen(false)}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          diffFiles={diffFiles}
          terminalLogs={terminalLogs}
          evidenceItems={evidenceItems}
          language={language}
          onAcceptDiff={handleAcceptDiff}
          onRejectDiff={handleRejectDiff}
          onClearTerminal={() => setTerminalLogs([])}
          onOpenEvidenceDrawer={() => setEvidenceDrawerOpen(true)}
        />
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        language={language}
      />

      {/* Subagent Inspector Drawer */}
      <SubagentInspectorDrawer
        isOpen={Boolean(inspectingSubagentId)}
        subagent={inspectingSubagentId ? subagents.get(inspectingSubagentId) || null : null}
        transcript={
          inspectingSubagentId
            ? subagents.get(inspectingSubagentId)?.transcript || []
            : []
        }
        onClose={() => setInspectingSubagentId(null)}
        onKill={handleKillSubagent}
        language={language}
      />

      {/* Verified Evidence Drawer */}
      <EvidenceDrawer
        isOpen={evidenceDrawerOpen}
        onClose={() => setEvidenceDrawerOpen(false)}
        excerpts={groundedExcerpts}
        contradictions={contradictionCallouts}
        auditRecord={groundingAuditRecord}
        language={language}
      />
    </div>
  );
}

