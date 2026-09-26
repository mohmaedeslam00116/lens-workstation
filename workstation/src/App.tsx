import { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { AgentCanvas } from './components/AgentCanvas';
import { PromptInput } from './components/PromptInput';
import { AuxiliaryPane } from './components/AuxiliaryPane';
import { useEngineClient } from './hooks/useEngineClient';
import type {
  CanvasMessage,
  Language,
  TabType,
  DiffFile,
  TerminalLine,
  EvidenceItem,
  ToolExecution,
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
  const [activeTab, setActiveTab] = useState<TabType>('diff');

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

  const handleSendPrompt = (promptText: string) => {
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
    });

    if (!sent) {
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
        language={language}
        onToggleLanguage={() => setLanguage((l) => (l === 'en' ? 'ar' : 'en'))}
        paneOpen={paneOpen}
        onTogglePane={() => setPaneOpen(!paneOpen)}
        connected={connected}
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
          />
          <PromptInput
            onSend={handleSendPrompt}
            language={language}
            capability={capability}
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
        />
      </div>
    </div>
  );
}
