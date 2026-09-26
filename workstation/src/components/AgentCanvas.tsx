import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Brain,
  Terminal,
  FileCode,
  CheckCircle,
  AlertCircle,
  Clock,
  Check,
  X,
  User,
  Sparkles,
} from 'lucide-react';
import type { CanvasMessage, ToolExecution, ThoughtBlock, Language } from '../types';

interface AgentCanvasProps {
  messages: CanvasMessage[];
  language: Language;
  onApproveTool: (toolId: string) => void;
  onRejectTool: (toolId: string) => void;
}

export const AgentCanvas: React.FC<AgentCanvasProps> = ({
  messages,
  language,
  onApproveTool,
  onRejectTool,
}) => {
  const isRtl = language === 'ar';
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#111111] text-gray-200">
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-center select-none py-20">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#161616] text-gray-400 mb-4">
            <Sparkles size={22} />
          </div>
          <h2 className="text-base font-medium text-gray-200">
            {isRtl ? 'منصة لنس جاهزة للعمل' : 'LENS Workstation Canvas Standing By'}
          </h2>
          <p className="mt-1 text-xs text-gray-500 max-w-sm">
            {isRtl
              ? 'اطرح سؤالاً بحثياً أو كلف الوكيل بمهمة برمجية لفحص الكود وتطبيق التعديلات الذاتية.'
              : 'Prompt the agent with an inquiry, code inspection, or autonomous multi-file development task.'}
          </p>
        </div>
      ) : (
        messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col space-y-3 ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            {/* Message Header */}
            <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
              {msg.role === 'user' ? (
                <>
                  <span className="font-semibold text-gray-300">
                    {isRtl ? 'المطور' : 'Developer'}
                  </span>
                  <User size={13} className="text-gray-400" />
                </>
              ) : (
                <>
                  <div className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-500 bg-transparent">
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>
                  <span className="font-semibold text-gray-300">
                    {isRtl ? 'وكيل لنس' : 'LENS Agent'}
                  </span>
                </>
              )}
              <span className="text-[10px] text-gray-600">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>

            {/* User Message Bubble */}
            {msg.role === 'user' && (
              <div className="rounded-xl bg-[#1f1f1f] border border-[#2e2e2e] px-4 py-2.5 max-w-2xl text-sm leading-relaxed text-gray-100 whitespace-pre-wrap">
                {msg.content}
              </div>
            )}

            {/* Assistant Turn: Thoughts, Tools, Content */}
            {msg.role === 'assistant' && (
              <div className="w-full max-w-3xl space-y-3">
                {/* Thinking Streams */}
                {msg.thoughts?.map((thought) => (
                  <ThoughtBlockView key={thought.id} thought={thought} isRtl={isRtl} />
                ))}

                {/* Tool Executions */}
                {msg.tools?.map((tool) => (
                  <ToolExecutionCard
                    key={tool.id}
                    tool={tool}
                    isRtl={isRtl}
                    onApprove={() => onApproveTool(tool.id)}
                    onReject={() => onRejectTool(tool.id)}
                  />
                ))}

                {/* Assistant Markdown Content */}
                {msg.content && (
                  <div className="rounded-xl bg-[#161616] border border-[#242424] px-4 py-3 text-sm leading-relaxed text-gray-100 whitespace-pre-wrap font-sans">
                    {msg.content}
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
};

const ThoughtBlockView: React.FC<{ thought: ThoughtBlock; isRtl: boolean }> = ({
  thought,
  isRtl,
}) => {
  const [collapsed, setCollapsed] = useState(thought.collapsed ?? false);

  return (
    <div className="rounded-lg border border-[#262626] bg-[#141414] overflow-hidden text-xs">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2 text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a] transition-colors select-none"
      >
        <div className="flex items-center gap-2">
          <Brain size={13} className="text-purple-400" />
          <span className="font-mono font-medium text-purple-300">
            {isRtl ? 'سلسلة التفكير (Thinking Stream)' : 'Thinking Process'}
          </span>
          {thought.durationMs && (
            <span className="text-[10px] text-gray-500 font-mono">
              ({(thought.durationMs / 1000).toFixed(1)}s)
            </span>
          )}
        </div>
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
      </button>

      {!collapsed && (
        <div className="px-3 py-2 border-t border-[#222222] bg-[#0f0f0f] text-gray-400 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
          {thought.text}
        </div>
      )}
    </div>
  );
};

const ToolExecutionCard: React.FC<{
  tool: ToolExecution;
  isRtl: boolean;
  onApprove: () => void;
  onReject: () => void;
}> = ({ tool, isRtl, onApprove, onReject }) => {
  const [expanded, setExpanded] = useState(false);
  const isMutating = tool.type === 'mutating';
  const isWaiting = tool.status === 'waiting_approval';

  return (
    <div
      className={`rounded-lg border text-xs overflow-hidden transition-colors ${
        isWaiting
          ? 'border-gray-500 bg-[#181818]'
          : 'border-[#262626] bg-[#141414]'
      }`}
    >
      {/* Tool Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          {isMutating ? (
            <FileCode size={14} className="text-gray-200" />
          ) : (
            <Terminal size={14} className="text-gray-400" />
          )}
          <span className="font-mono font-semibold text-gray-200">
            {tool.name}
          </span>
          <span className="rounded px-1.5 py-0.5 font-mono text-[10px] bg-[#222222] text-gray-300 border border-[#333333]">
            {tool.type.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Badge */}
          <span className="flex items-center gap-1 font-mono text-[11px] text-gray-400">
            {tool.status === 'completed' && (
              <CheckCircle size={13} className="text-gray-200" />
            )}
            {tool.status === 'failed' && (
              <AlertCircle size={13} className="text-gray-400" />
            )}
            {tool.status === 'running' && (
              <Clock size={13} className="text-gray-300 animate-spin" />
            )}
            {tool.status === 'waiting_approval' && (
              <span className="text-gray-100 font-bold border border-gray-500 px-1 py-0.5 rounded text-[10px]">
                {isRtl ? 'بانتظار الموافقة' : 'APPROVAL REQUIRED'}
              </span>
            )}
            {tool.status}
          </span>

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 hover:text-gray-300"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* Human-in-the-loop Approval Banner for Mutating Operations */}
      {isWaiting && (
        <div className="flex items-center justify-between border-t border-[#333333] bg-[#1a1a1a] px-3 py-2">
          <span className="text-gray-200 text-xs font-medium">
            {isRtl
              ? 'يتطلب هذا الإجراء تعديلاً على ملفات المشروع أو تنفيذ أمر نظام.'
              : 'This action mutates workspace files or executes commands.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onReject}
              className="flex items-center gap-1 rounded bg-[#161616] border border-[#333333] text-gray-300 px-2.5 py-1 text-xs hover:bg-[#252525] hover:text-white transition-colors"
            >
              <X size={12} />
              <span>{isRtl ? 'رفض' : 'Reject'}</span>
            </button>
            <button
              onClick={onApprove}
              className="flex items-center gap-1 rounded bg-white border border-gray-400 text-black px-3 py-1 text-xs hover:bg-gray-200 transition-colors font-medium"
            >
              <Check size={12} strokeWidth={2.5} />
              <span>{isRtl ? 'موافقة وتنفيذ' : 'Approve & Execute'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Arguments & Output */}
      {expanded && (
        <div className="border-t border-[#222222] bg-[#0c0c0c] p-3 space-y-2 text-[11px] font-mono">
          <div>
            <div className="text-gray-500 font-semibold mb-1">
              {isRtl ? 'المعاملات (Arguments):' : 'Arguments:'}
            </div>
            <pre className="rounded bg-[#141414] p-2 text-gray-300 overflow-x-auto">
              {JSON.stringify(tool.args, null, 2)}
            </pre>
          </div>
          {tool.result !== undefined && (
            <div>
              <div className="text-gray-500 font-semibold mb-1">
                {isRtl ? 'النتيجة (Result):' : 'Result:'}
              </div>
              <pre className="rounded bg-[#141414] p-2 text-emerald-300 overflow-x-auto max-h-40 overflow-y-auto">
                {typeof tool.result === 'string'
                  ? tool.result
                  : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}
          {tool.error && (
            <div>
              <div className="text-red-400 font-semibold mb-1">
                {isRtl ? 'خطأ التنفيذ:' : 'Execution Error:'}
              </div>
              <pre className="rounded bg-red-950/30 border border-red-900/50 p-2 text-red-300 overflow-x-auto">
                {tool.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
