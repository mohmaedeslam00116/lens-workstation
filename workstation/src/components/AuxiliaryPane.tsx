import React, { useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import {
  FileDiff,
  Terminal as TerminalIcon,
  Search,
  Check,
  RotateCcw,
  X,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import type { TabType, DiffFile, TerminalLine, EvidenceItem, Language } from '../types';

interface AuxiliaryPaneProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  diffFiles: DiffFile[];
  terminalLogs: TerminalLine[];
  evidenceItems: EvidenceItem[];
  language: Language;
  onAcceptDiff?: (file: DiffFile) => void;
  onRejectDiff?: (file: DiffFile) => void;
  onClearTerminal?: () => void;
}

export const AuxiliaryPane: React.FC<AuxiliaryPaneProps> = ({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  diffFiles,
  terminalLogs,
  evidenceItems,
  language,
  onAcceptDiff,
  onRejectDiff,
  onClearTerminal,
}) => {
  const isRtl = language === 'ar';
  const [selectedDiffIndex, setSelectedDiffIndex] = useState(0);

  // Clamp index within valid diffFiles bounds
  const clampedDiffIndex = diffFiles.length > 0 ? Math.min(selectedDiffIndex, diffFiles.length - 1) : 0;
  const activeDiff = diffFiles.length > 0 ? diffFiles[clampedDiffIndex] : null;

  const isHttpUrl = (url?: string) => {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="w-[540px] flex flex-col border-l border-[#2a2a2a] bg-[#141414] text-gray-200 select-none overflow-hidden h-full">
      {/* Pane Top Bar */}
      <div className="flex h-10 items-center justify-between border-b border-[#262626] bg-[#191919] px-3">
        {/* Tab Switcher */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSelectTab('diff')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-mono transition-colors ${
              activeTab === 'diff'
                ? 'bg-[#252525] text-white border border-[#3a3a3a]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <FileDiff size={13} className="text-gray-300" />
            <span>
              {isRtl ? 'الفروقات' : 'Diff'} {diffFiles.length > 0 && `(${diffFiles.length})`}
            </span>
          </button>

          <button
            onClick={() => onSelectTab('terminal')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-mono transition-colors ${
              activeTab === 'terminal'
                ? 'bg-[#252525] text-white border border-[#3a3a3a]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <TerminalIcon size={13} className="text-gray-300" />
            <span>{isRtl ? 'الطرفية' : 'Terminal'}</span>
          </button>

          <button
            onClick={() => onSelectTab('evidence')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-mono transition-colors ${
              activeTab === 'evidence'
                ? 'bg-[#252525] text-white border border-[#3a3a3a]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Search size={13} className="text-gray-300" />
            <span>{isRtl ? 'الأدلة' : 'Evidence'}</span>
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="h-6 w-6 rounded flex items-center justify-center text-gray-400 hover:bg-[#252525] hover:text-white transition-colors"
          title={isRtl ? 'إغلاق اللوحة الجانبية' : 'Close auxiliary pane'}
        >
          <X size={14} />
        </button>
      </div>

      {/* Pane Content */}
      <div className="flex-1 overflow-hidden">
        {/* TAB 1: MONACO DIFF EDITOR */}
        {activeTab === 'diff' && (
          <div className="flex flex-col h-full">
            {diffFiles.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
                <FileDiff size={32} className="mb-2 text-gray-600" />
                <p className="text-xs font-mono">
                  {isRtl ? 'لا توجد فروقات ملفات مقترحة حالياً.' : 'No active file diffs pending review.'}
                </p>
              </div>
            ) : (
              <>
                {/* File list header */}
                <div className="flex items-center justify-between border-b border-[#242424] bg-[#121212] px-3 py-1.5 text-xs">
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {diffFiles.map((f, idx) => (
                      <button
                        key={f.path}
                        onClick={() => setSelectedDiffIndex(idx)}
                        className={`rounded px-2 py-0.5 font-mono text-[11px] truncate max-w-[140px] ${
                          idx === clampedDiffIndex
                            ? 'bg-[#252525] text-gray-100 border border-gray-500'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        {f.path.split(/[\\/]/).pop()}
                      </button>
                    ))}
                  </div>

                  {activeDiff && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onRejectDiff?.(activeDiff)}
                        className="flex items-center gap-1 rounded border border-[#444444] bg-[#1e1e1e] px-2 py-0.5 text-[11px] text-gray-300 hover:bg-[#2a2a2a] hover:text-white transition-colors"
                        title={isRtl ? 'تراجع عن التغييرات المقترحة' : 'Reject and revert proposed diff'}
                      >
                        <RotateCcw size={11} />
                        <span>{isRtl ? 'تراجع' : 'Revert'}</span>
                      </button>
                      <button
                        onClick={() => onAcceptDiff?.(activeDiff)}
                        className="flex items-center gap-1 rounded border border-gray-400 bg-white px-2 py-0.5 text-[11px] text-black hover:bg-gray-200 transition-colors font-medium"
                        title={isRtl ? 'قبول التغييرات وتطبيقها' : 'Accept and apply proposed diff'}
                      >
                        <Check size={11} strokeWidth={2.5} />
                        <span>{isRtl ? 'قبول' : 'Accept'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Monaco Diff Viewer */}
                <div className="flex-1 overflow-hidden">
                  {activeDiff && (
                    <DiffEditor
                      height="100%"
                      original={activeDiff.original}
                      modified={activeDiff.modified}
                      language="typescript"
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        renderSideBySide: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 12,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: SANITIZED TERMINAL LOG */}
        {activeTab === 'terminal' && (
          <div className="flex flex-col h-full bg-[#0d0d0d] font-mono text-xs">
            <div className="flex items-center justify-between border-b border-[#222222] bg-[#161616] px-3 py-1 text-[11px] text-gray-400">
              <span>{isRtl ? 'مخرجات الطرفية المعقمة' : 'Sanitized Process Runner Output'}</span>
              {onClearTerminal && (
                <button
                  onClick={onClearTerminal}
                  className="flex items-center gap-1 hover:text-gray-200"
                  title={isRtl ? 'مسح سجل الطرفية' : 'Clear terminal log'}
                >
                  <Trash2 size={11} />
                  <span>{isRtl ? 'مسح' : 'Clear'}</span>
                </button>
              )}
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-1">
              {terminalLogs.length === 0 ? (
                <div className="text-gray-600 italic">
                  {isRtl ? 'لا توجد مخرجات أوامر بعد.' : 'No terminal command output yet.'}
                </div>
              ) : (
                terminalLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`leading-relaxed whitespace-pre-wrap ${
                      log.type === 'stderr'
                        ? 'text-red-400'
                        : log.type === 'system'
                        ? 'text-gray-400 italic'
                        : 'text-gray-300'
                    }`}
                  >
                    {log.text}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: EVIDENCE & CITATIONS */}
        {activeTab === 'evidence' && (
          <div className="flex flex-col h-full p-4 overflow-y-auto space-y-3 bg-[#111111] text-xs">
            {evidenceItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
                <Search size={32} className="mb-2 text-gray-600" />
                <p className="font-mono">
                  {isRtl ? 'لا توجد أدلة بحثية أو شواهد مسترجعة حالياً.' : 'No retrieved research evidence yet.'}
                </p>
              </div>
            ) : (
              evidenceItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-[#262626] bg-[#161616] p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between font-medium text-gray-200">
                    <span className="truncate">{item.title}</span>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#222222] border border-[#333333] px-1.5 py-0.5 text-[9px] font-mono text-gray-400">
                        {isRtl ? 'مصدر خارجي' : 'External Evidence'}
                      </span>
                      {isHttpUrl(item.url) && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-400 hover:text-white"
                          title="Open external evidence link"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono">{item.source}</div>
                  <p className="text-gray-400 text-[11px] leading-relaxed line-clamp-4">
                    {item.snippet}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
