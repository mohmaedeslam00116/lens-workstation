import React, { useState, useEffect } from 'react';
import {
  Search,
  FileCode,
  Bot,
  CheckCircle,
  AlertCircle,
  Clock,
  Square,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import type { SubagentInfo, Language } from '../types';

export interface SubagentCardProps {
  subagent: SubagentInfo;
  language: Language;
  onInspect?: (id: string) => void;
  onKill?: (id: string) => void;
  className?: string;
}

export const SubagentCard: React.FC<SubagentCardProps> = ({
  subagent,
  language,
  onInspect,
  onKill,
  className = '',
}) => {
  const isRtl = language === 'ar';
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());

  const isRunning = subagent.status === 'running';

  // Live timer tick for active subagents
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => clearInterval(interval);
  }, [isRunning]);

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

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(deepLink);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getArchetypeBadge = () => {
    const type = (subagent.type || 'general').toLowerCase();
    if (type === 'research') {
      return {
        icon: <Search size={13} className="text-gray-300" />,
        label: isRtl ? 'بحث معرفي' : 'RESEARCH',
      };
    }
    if (type === 'code_reviewer') {
      return {
        icon: <FileCode size={13} className="text-gray-300" />,
        label: isRtl ? 'مراجعة كود' : 'CODE REVIEWER',
      };
    }
    return {
      icon: <Bot size={13} className="text-gray-300" />,
      label: isRtl ? 'وكيل عام' : 'GENERAL',
    };
  };

  const archetypeInfo = getArchetypeBadge();

  return (
    <div
      onClick={() => onInspect?.(subagent.id)}
      className={`group relative rounded-xl border border-[#262626] bg-[#141414] hover:bg-[#181818] hover:border-[#383838] p-3.5 transition-all cursor-pointer shadow-sm select-none ${className}`}
    >
      {/* Top Bar: Role, Archetype Badge, Status & Timer */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#2d2d2d] bg-[#1c1c1c] text-gray-300">
            {archetypeInfo.icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-gray-100 truncate">
                {subagent.role}
              </span>
              <span className="rounded px-1.5 py-0.5 font-mono text-[9px] bg-[#222222] text-gray-400 border border-[#333333]">
                {archetypeInfo.label}
              </span>
            </div>
          </div>
        </div>

        {/* Status Badge & Actions */}
        <div className="flex items-center gap-2 shrink-0">
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

          {/* Elapsed Duration */}
          <span className="font-mono text-[11px] text-gray-500">
            {formatDuration(elapsedMs)}
          </span>

          {/* Stop / Kill Button if Running */}
          {isRunning && onKill && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onKill(subagent.id);
              }}
              title={isRtl ? 'إيقاف الوكيل' : 'Stop Subagent'}
              className="flex items-center gap-1 rounded bg-[#222222] border border-[#383838] text-gray-300 px-2 py-0.5 text-[10px] font-mono hover:bg-red-950/40 hover:text-red-300 hover:border-red-900/50 transition-colors"
            >
              <Square size={10} />
              <span>{isRtl ? 'إيقاف' : 'Stop'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Middle Bar: Live State Detail or Activity */}
      <div className="mt-2.5 font-mono text-xs">
        {subagent.stateDetail ? (
          <div className="flex items-center gap-1.5 text-gray-300 truncate bg-[#0f0f0f] border border-[#222222] rounded px-2.5 py-1.5">
            {isRunning && (
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse shrink-0" />
            )}
            <span className="truncate">{subagent.stateDetail}</span>
          </div>
        ) : subagent.prompt ? (
          <div className="text-gray-400 truncate bg-[#0f0f0f] border border-[#222222] rounded px-2.5 py-1.5">
            <span className="text-gray-600 mr-1.5">task:</span>
            <span>{subagent.prompt}</span>
          </div>
        ) : null}
      </div>

      {/* Bottom Bar: Deep-link URI & Inspect Trigger */}
      <div className="mt-2.5 pt-2 border-t border-[#1f1f1f] flex items-center justify-between text-[11px] text-gray-500">
        <div className="flex items-center gap-1.5 font-mono">
          <span className="text-gray-500 hover:text-gray-300 truncate max-w-[260px]">
            {deepLink}
          </span>
          <button
            onClick={handleCopyLink}
            title={isRtl ? 'نسخ الرابط المباشر' : 'Copy deep-link URI'}
            className="text-gray-500 hover:text-gray-300 p-0.5 rounded transition-colors"
          >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          </button>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onInspect?.(subagent.id);
          }}
          className="flex items-center gap-1 text-gray-400 group-hover:text-gray-200 transition-colors font-mono"
        >
          <span>{isRtl ? 'فحص المجريات' : 'Inspect'}</span>
          <ExternalLink size={11} />
        </button>
      </div>
    </div>
  );
};
