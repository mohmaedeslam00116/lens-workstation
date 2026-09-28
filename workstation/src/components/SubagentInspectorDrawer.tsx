import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Square,
  Copy,
  Check,
  Brain,
  Terminal,
  FileCode,
  Search,
  Bot,
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { SubagentInfo, SubagentTranscriptEntry, Language } from '../types';

export interface SubagentInspectorDrawerProps {
  isOpen: boolean;
  subagent: SubagentInfo | null;
  transcript: SubagentTranscriptEntry[];
  onClose: () => void;
  onKill?: (id: string) => void;
  language: Language;
}

export const SubagentInspectorDrawer: React.FC<SubagentInspectorDrawerProps> = ({
  isOpen,
  subagent,
  transcript,
  onClose,
  onKill,
  language,
}) => {
  const isRtl = language === 'ar';
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const transcriptBottomRef = useRef<HTMLDivElement | null>(null);

  const isRunning = subagent?.status === 'running';

  // Live timer tick for active subagent
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Auto-scroll transcript stream
  useEffect(() => {
    if (isOpen) {
      transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript, isOpen]);

  if (!isOpen || !subagent) {
    return null;
  }

  const elapsedMs =
    subagent.durationMs && subagent.durationMs > 0
      ? subagent.durationMs
      : isRunning
      ? Math.max(0, now - (subagent.startTime || now))
      : subagent.endTime
      ? Math.max(0, subagent.endTime - subagent.startTime)
      : 0;

  const formatDuration = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    if (totalSec < 60) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs}s`;
  };

  const deepLink = `lens://conversation/${subagent.id}`;

  const handleCopyLink = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(deepLink);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getRoleIcon = () => {
    const type = (subagent.type || 'general').toLowerCase();
    if (type === 'research') return <Search size={15} className="text-gray-300" />;
    if (type === 'code_reviewer') return <FileCode size={15} className="text-gray-300" />;
    return <Bot size={15} className="text-gray-300" />;
  };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`fixed inset-y-0 ${
        isRtl ? 'left-0 border-r' : 'right-0 border-l'
      } z-40 flex w-[520px] max-w-[95vw] flex-col bg-[#121212] border-[#262626] shadow-2xl text-gray-200 select-none font-sans ${
        isRtl ? 'font-cairo' : 'font-inter'
      }`}
    >
      {/* Header Bar */}
      <div className="flex flex-col border-b border-[#222222] bg-[#161616] px-4 py-3 gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#2e2e2e] bg-[#1a1a1a]">
              {getRoleIcon()}
            </div>
            <div className="min-w-0">
              <h3 className="font-mono text-xs font-semibold text-gray-100 truncate">
                {subagent.role}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="rounded px-1.5 py-0.2 font-mono text-[9px] bg-[#222222] text-gray-400 border border-[#333333]">
                  {(subagent.type || 'general').toUpperCase()}
                </span>
                <span className="font-mono text-[10px] text-gray-500">
                  {formatDuration(elapsedMs)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Status Indicator */}
            {isRunning && (
              <div className="flex items-center gap-1.5 rounded-full border border-gray-600 bg-[#1e1e1e] px-2.5 py-0.5 font-mono text-[10px] text-gray-200">
                <Clock size={11} className="text-white animate-spin" />
                <span>{isRtl ? 'قيد التنفيذ' : 'RUNNING'}</span>
              </div>
            )}
            {subagent.status === 'completed' && (
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-800/60 bg-emerald-950/30 px-2.5 py-0.5 font-mono text-[10px] text-emerald-300">
                <CheckCircle size={11} className="text-emerald-400" />
                <span>{isRtl ? 'مكتمل' : 'COMPLETED'}</span>
              </div>
            )}
            {subagent.status === 'failed' && (
              <div className="flex items-center gap-1.5 rounded-full border border-red-900/60 bg-red-950/30 px-2.5 py-0.5 font-mono text-[10px] text-red-300">
                <AlertCircle size={11} className="text-red-400" />
                <span>{isRtl ? 'فشل' : 'FAILED'}</span>
              </div>
            )}
            {subagent.status === 'killed' && (
              <div className="flex items-center gap-1.5 rounded-full border border-[#383838] bg-[#202020] px-2.5 py-0.5 font-mono text-[10px] text-gray-400">
                <Square size={11} className="text-gray-400" />
                <span>{isRtl ? 'تم الإنهاء' : 'STOPPED'}</span>
              </div>
            )}

            {/* Stop Subagent Button */}
            {isRunning && onKill && (
              <button
                onClick={() => onKill(subagent.id)}
                className="flex items-center gap-1 rounded bg-[#242424] border border-[#3a3a3a] text-gray-300 px-2.5 py-1 text-xs font-mono hover:bg-red-950/40 hover:text-red-300 hover:border-red-900/50 transition-colors"
              >
                <Square size={11} />
                <span>{isRtl ? 'إيقاف' : 'Stop'}</span>
              </button>
            )}

            {/* Close Drawer Button */}
            <button
              onClick={onClose}
              title={isRtl ? 'إغلاق اللوحة' : 'Close Drawer'}
              className="rounded p-1 text-gray-400 hover:bg-[#252525] hover:text-gray-200 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Deep link bar */}
        <div className="flex items-center justify-between rounded bg-[#101010] border border-[#202020] px-2.5 py-1 font-mono text-[10px] text-gray-400">
          <span className="truncate max-w-[380px]">{deepLink}</span>
          <button
            onClick={handleCopyLink}
            title={isRtl ? 'نسخ الرابط المباشر' : 'Copy deep-link URI'}
            className="flex items-center gap-1 text-gray-400 hover:text-gray-200 transition-colors"
          >
            {copied ? (
              <>
                <Check size={11} className="text-emerald-400" />
                <span className="text-emerald-400">{isRtl ? 'تم النسخ' : 'Copied'}</span>
              </>
            ) : (
              <>
                <Copy size={11} />
                <span>{isRtl ? 'نسخ' : 'Copy'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Subagent Task/Prompt Banner */}
      {subagent.prompt && (
        <div className="border-b border-[#1f1f1f] bg-[#141414] px-4 py-2.5 text-xs text-gray-300 font-mono">
          <span className="text-gray-500 mr-2 font-semibold">
            {isRtl ? 'المهمة المكلف بها:' : 'ASSIGNED TASK:'}
          </span>
          <span className="text-gray-200">{subagent.prompt}</span>
        </div>
      )}

      {/* Live Transcript Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#0f0f0f]">
        {transcript.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-8 text-gray-500">
            <Clock size={24} className="animate-spin text-gray-600 mb-2" />
            <p className="text-xs font-mono">
              {isRtl
                ? 'في انتظار وصول أولى خطوات التنفيذ والتفكير...'
                : 'Awaiting execution steps and reasoning stream...'}
            </p>
          </div>
        ) : (
          transcript.map((entry, idx) => (
            <TranscriptRecordView
              key={`${entry.id || 'step'}-${entry.stepIndex || entry.step_index || idx}`}
              entry={entry}
              isRtl={isRtl}
            />
          ))
        )}
        <div ref={transcriptBottomRef} />
      </div>

      {/* Footer Status Bar */}
      <div className="border-t border-[#222222] bg-[#141414] px-4 py-2 flex items-center justify-between text-[11px] font-mono text-gray-400">
        <div className="flex items-center gap-2 truncate max-w-[340px]">
          {isRunning ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-gray-300 truncate">
                {subagent.stateDetail || (isRtl ? 'الوكيل نشط...' : 'Subagent active...')}
              </span>
            </>
          ) : (
            <span className="text-gray-500">
              {isRtl ? 'انتهت الجلسة' : 'Subagent session ended'}
            </span>
          )}
        </div>
        <div className="text-gray-500 shrink-0">
          {transcript.length} {isRtl ? 'خطوة' : 'steps'}
        </div>
      </div>
    </div>
  );
};

const TranscriptRecordView: React.FC<{
  entry: SubagentTranscriptEntry;
  isRtl: boolean;
}> = ({ entry, isRtl }) => {
  const [collapsed, setCollapsed] = useState(false);

  const type = entry.type || (entry.toolCall ? 'tool_call' : entry.thought ? 'thought' : 'info');

  // Thought block
  if (type === 'thought' || entry.thought) {
    const text = entry.thought || entry.content || entry.text || '';
    return (
      <div className="rounded-lg border border-[#242424] bg-[#141414] overflow-hidden text-xs">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Brain size={13} className="text-purple-400" />
            <span className="font-mono text-purple-300 font-medium">
              {isRtl ? 'سلسلة التفكير' : 'Thinking Step'}
            </span>
          </div>
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
        {!collapsed && (
          <div className="px-3 py-2 border-t border-[#202020] bg-[#0c0c0c] text-gray-400 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
            {text}
          </div>
        )}
      </div>
    );
  }

  // Tool Call block
  if (type === 'tool_call' || entry.toolCall) {
    const toolName = entry.toolName || entry.toolCall?.name || 'tool';
    const args = entry.args || entry.toolCall?.args || {};
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#161616] overflow-hidden text-xs">
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1a1a] border-b border-[#252525]">
          <div className="flex items-center gap-2 font-mono">
            <Terminal size={13} className="text-gray-300" />
            <span className="font-semibold text-gray-100">{toolName}</span>
            <span className="text-[10px] px-1 py-0.2 rounded bg-[#242424] text-gray-400 border border-[#333333]">
              TOOL CALL
            </span>
          </div>
          {entry.stateDetail && (
            <span className="text-[10px] text-gray-400 font-mono truncate max-w-[180px]">
              {entry.stateDetail}
            </span>
          )}
        </div>
        <div className="p-2.5 bg-[#0e0e0e] font-mono text-[11px]">
          <pre className="text-gray-300 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(args, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  // Tool Result block
  if (type === 'tool_result' || entry.toolResult !== undefined) {
    const toolName = entry.toolName || 'tool';
    const result = entry.result !== undefined ? entry.result : entry.toolResult;
    const isError = Boolean(entry.error);

    return (
      <div
        className={`rounded-lg border overflow-hidden text-xs ${
          isError ? 'border-red-900/50 bg-red-950/20' : 'border-[#222222] bg-[#141414]'
        }`}
      >
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#171717] border-b border-[#222222]">
          <div className="flex items-center gap-2 font-mono">
            {isError ? (
              <AlertCircle size={13} className="text-red-400" />
            ) : (
              <CheckCircle size={13} className="text-emerald-400" />
            )}
            <span className="font-semibold text-gray-200">
              {toolName} {isRtl ? 'النتيجة' : 'Result'}
            </span>
          </div>
          <span
            className={`font-mono text-[10px] px-1.5 py-0.2 rounded ${
              isError
                ? 'bg-red-900/40 text-red-300 border border-red-800/60'
                : 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/40'
            }`}
          >
            {isError ? 'ERROR' : 'SUCCESS'}
          </span>
        </div>
        <div className="p-2.5 bg-[#0a0a0a] font-mono text-[11px] max-h-56 overflow-y-auto">
          {entry.error ? (
            <pre className="text-red-300 whitespace-pre-wrap">{entry.error}</pre>
          ) : (
            <pre className="text-emerald-300/90 whitespace-pre-wrap overflow-x-auto">
              {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  // Assistant Content / Chunk / Result block
  if (type === 'assistant' || type === 'result' || entry.content || entry.chunk) {
    const content = entry.content || entry.chunk || (typeof entry.result === 'string' ? entry.result : JSON.stringify(entry.result));
    return (
      <div className="rounded-lg border border-[#222222] bg-[#161616] p-3 text-xs leading-relaxed text-gray-100 font-sans whitespace-pre-wrap">
        {content}
      </div>
    );
  }

  // Error block
  if (type === 'error' || entry.error) {
    return (
      <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-xs font-mono text-red-300 flex items-start gap-2">
        <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
        <div className="whitespace-pre-wrap">{entry.error || 'Subagent execution error'}</div>
      </div>
    );
  }

  // Default / Init / Info record
  return (
    <div className="rounded border border-[#1f1f1f] bg-[#111111] px-3 py-1.5 font-mono text-[10px] text-gray-500">
      <span className="font-semibold text-gray-400 mr-2">[{type.toUpperCase()}]</span>
      <span>{entry.prompt || entry.stateDetail || JSON.stringify(entry)}</span>
    </div>
  );
};
