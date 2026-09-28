import React, { useState } from 'react';
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Search,
  AlertTriangle,
  ShieldCheck,
  Globe,
  Quote,
  Filter,
} from 'lucide-react';
import type {
  GroundedExcerpt,
  ContradictionCallout,
  GroundingAuditRecord,
  Language,
} from '../types';

export interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  excerpts: GroundedExcerpt[];
  contradictions?: ContradictionCallout[];
  auditRecord?: GroundingAuditRecord | null;
  language: Language;
  onSelectExcerpt?: (excerpt: GroundedExcerpt) => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  isOpen,
  onClose,
  excerpts = [],
  contradictions = [],
  auditRecord = null,
  language = 'en',
  onSelectExcerpt,
}) => {
  const isRtl = language === 'ar';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMilestone, setSelectedMilestone] = useState<string>('all');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!isOpen) {
    return null;
  }

  // Handle copying excerpt quote
  const handleCopyExcerpt = (excerpt: GroundedExcerpt) => {
    try {
      navigator.clipboard.writeText(`[${excerpt.index}] "${excerpt.text}" — ${excerpt.sourceTitle} (${excerpt.sourceUrl})`);
      setCopiedIndex(excerpt.index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Fallback
    }
  };

  // Get unique milestones
  const milestones = Array.from(new Set(excerpts.map((e) => e.milestoneId || 'default')));

  // Filter excerpts
  const filteredExcerpts = excerpts.filter((ex) => {
    const matchesMilestone = selectedMilestone === 'all' || ex.milestoneId === selectedMilestone;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesMilestone;

    const matchesSearch =
      ex.text.toLowerCase().includes(q) ||
      ex.sourceTitle.toLowerCase().includes(q) ||
      ex.sourceDomain.toLowerCase().includes(q) ||
      ex.bracket.toLowerCase().includes(q);

    return matchesMilestone && matchesSearch;
  });

  const uniqueDomains = new Set(excerpts.map((e) => e.sourceDomain)).size;
  const validCitationsCount = auditRecord?.validCitationsCount ?? excerpts.length;
  const hallucinatedCount = auditRecord?.hallucinatedCitationsCount ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <aside
        className="w-full max-w-[620px] h-full flex flex-col bg-[#141414] border-l border-[#262626] text-gray-200 shadow-2xl overflow-hidden font-sans"
        style={{ fontFamily: isRtl ? 'Cairo, sans-serif' : 'Inter, sans-serif' }}
      >
        {/* TOP HEADER */}
        <div className="flex h-14 items-center justify-between border-b border-[#242424] bg-[#191919] px-4 select-none">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#222222] border border-[#333333] text-gray-300">
              <ShieldCheck size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white tracking-wide">
                  {isRtl ? 'درج الأدلة والشواهد المحققة' : 'Verified Evidence Drawer'}
                </span>
                <span className="rounded bg-[#202020] border border-[#333333] px-1.5 py-0.2 text-[10px] font-mono text-emerald-400">
                  {isRtl ? 'مدقق ضد الهلوسة' : 'Zero-Hallucination'}
                </span>
              </div>
              <p className="text-[10px] text-gray-400">
                {isRtl
                  ? `${excerpts.length} شاهد مدقق من ${uniqueDomains} نطاق موثوق`
                  : `${excerpts.length} grounded excerpts across ${uniqueDomains} verified domains`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-[#252525] hover:text-white transition-colors"
            title={isRtl ? 'إغلاق' : 'Close'}
          >
            <X size={15} />
          </button>
        </div>

        {/* METRIC KPI TILES */}
        <div className="grid grid-cols-3 gap-2 border-b border-[#222222] bg-[#121212] p-3 text-xs select-none">
          <div className="rounded border border-[#222222] bg-[#171717] p-2 text-center">
            <div className="text-[10px] text-gray-400">{isRtl ? 'الشواهد المعتمدة' : 'Verified Excerpts'}</div>
            <div className="text-base font-semibold font-mono text-white mt-0.5">{validCitationsCount}</div>
          </div>
          <div className="rounded border border-[#222222] bg-[#171717] p-2 text-center">
            <div className="text-[10px] text-gray-400">{isRtl ? 'تناقضات مرصودة' : 'Contradictions'}</div>
            <div
              className={`text-base font-semibold font-mono mt-0.5 ${
                contradictions.length > 0 ? 'text-amber-400' : 'text-gray-400'
              }`}
            >
              {contradictions.length}
            </div>
          </div>
          <div className="rounded border border-[#222222] bg-[#171717] p-2 text-center">
            <div className="text-[10px] text-gray-400">{isRtl ? 'استشهادات مقطوعة' : 'Hallucinations Stripped'}</div>
            <div className="text-base font-semibold font-mono text-emerald-400 mt-0.5">
              {hallucinatedCount}
            </div>
          </div>
        </div>

        {/* CONTRADICTION ALERT SECTION */}
        {contradictions.length > 0 && (
          <div className="border-b border-[#332508] bg-[#1c1608] p-3 text-xs space-y-2.5">
            <div className="flex items-center gap-1.5 text-amber-400 font-medium">
              <AlertTriangle size={14} />
              <span>{isRtl ? 'تنبيه: تم رصد تناقضات بين المصادر' : 'Warning: Empirical Contradictions Detected'}</span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {contradictions.map((c, cIdx) => (
                <div
                  key={cIdx}
                  className="rounded-md border border-[#443310] bg-[#141005] p-2.5 space-y-1.5 text-[11px]"
                >
                  <div className="font-semibold text-amber-200">{c.topicOrMetric}</div>
                  <div className="space-y-1 font-mono text-gray-300">
                    {c.claims.map((claim, clIdx) => (
                      <div key={clIdx} className="flex items-start gap-1.5">
                        <span className="text-amber-400 font-bold shrink-0">[{claim.sourceIndex}]</span>
                        <span className="text-gray-400 shrink-0">({claim.domain}):</span>
                        <span className="text-gray-200 break-words">{claim.assertion}</span>
                      </div>
                    ))}
                  </div>
                  {c.explanation && (
                    <div className="text-[10px] text-gray-400 italic pt-1 border-t border-[#33270a]">
                      {c.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SEARCH & FILTER BAR */}
        <div className="flex items-center gap-2 border-b border-[#222222] bg-[#181818] px-3 py-2 text-xs">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isRtl ? 'ابحث في الشواهد والمصادر والنطاقات...' : 'Filter citations, domains, or excerpts...'}
              className="w-full rounded bg-[#101010] border border-[#2c2c2c] py-1.5 pl-8 pr-3 text-xs text-gray-200 placeholder-gray-500 focus:border-[#4a4a4a] focus:outline-none"
            />
          </div>

          {milestones.length > 1 && (
            <div className="flex items-center gap-1">
              <Filter size={12} className="text-gray-400" />
              <select
                value={selectedMilestone}
                onChange={(e) => setSelectedMilestone(e.target.value)}
                className="rounded bg-[#101010] border border-[#2c2c2c] py-1.5 px-2 text-[11px] text-gray-300 focus:outline-none"
              >
                <option value="all">{isRtl ? 'كل المراحل' : 'All Milestones'}</option>
                {milestones.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* EXCERPT LIST */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#111111]">
          {filteredExcerpts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-gray-500">
              <Quote size={28} className="text-gray-600 mb-2" />
              <p className="text-xs font-mono">
                {isRtl ? 'لا توجد شواهد مطابقة لمعايير البحث.' : 'No grounded excerpts match the current filter.'}
              </p>
            </div>
          ) : (
            filteredExcerpts.map((excerpt) => (
              <div
                key={`${excerpt.index}-${excerpt.chunkId}`}
                onClick={() => onSelectExcerpt && onSelectExcerpt(excerpt)}
                className="group relative rounded-lg border border-[#242424] bg-[#161616] p-3 text-xs transition-colors hover:border-[#383838] space-y-2"
              >
                {/* Header: Bracket + Domain + Relevance Score */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-6 items-center justify-center rounded bg-[#202020] border border-[#333333] font-mono text-[11px] font-bold text-white">
                      {excerpt.bracket}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[10px] text-gray-400">
                      <Globe size={11} className="text-gray-500" />
                      <span>{excerpt.sourceDomain}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {excerpt.relevanceScore > 0 && (
                      <span className="rounded bg-[#1a1a1a] border border-[#2c2c2c] px-1.5 py-0.5 font-mono text-[9px] text-gray-400">
                        score: {excerpt.relevanceScore.toFixed(2)}
                      </span>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyExcerpt(excerpt);
                      }}
                      className="text-gray-400 hover:text-white transition-colors"
                      title={isRtl ? 'نسخ الشاهد' : 'Copy excerpt'}
                    >
                      {copiedIndex === excerpt.index ? (
                        <Check size={12} className="text-emerald-400" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>

                    {excerpt.sourceUrl && (
                      <a
                        href={excerpt.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-gray-400 hover:text-white transition-colors"
                        title={isRtl ? 'فتح المصدر الأصلي' : 'Open external source link'}
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Source Title */}
                <div className="font-medium text-gray-200 text-[11px] truncate">
                  {excerpt.sourceTitle}
                </div>

                {/* Verbatim Excerpt Text */}
                <div className="relative rounded bg-[#101010] border border-[#1f1f1f] p-2.5 text-[11px] text-gray-300 leading-relaxed font-sans">
                  <Quote size={11} className="text-gray-600 mb-1 inline mr-1" />
                  <span>{excerpt.text}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
};
