import React from 'react';
import { FolderOpen, Shield, Globe, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { CapabilityMode, Language } from '../types';

interface HeaderProps {
  workspace: string;
  onSelectWorkspace: () => void;
  capability: CapabilityMode;
  onToggleCapability: () => void;
  language: Language;
  onToggleLanguage: () => void;
  paneOpen: boolean;
  onTogglePane: () => void;
  connected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  workspace,
  onSelectWorkspace,
  capability,
  onToggleCapability,
  language,
  onToggleLanguage,
  paneOpen,
  onTogglePane,
  connected,
}) => {
  const isRtl = language === 'ar';
  const folderName = workspace ? workspace.split(/[\\/]/).filter(Boolean).pop() || workspace : 'Select Workspace';

  return (
    <header className="flex h-12 w-full items-center justify-between border-b border-[#2a2a2a] bg-[#191919] px-4 text-xs select-none">
      {/* Brand & Workspace */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {/* Concentric LENS Mark */}
          <div className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-400 bg-transparent">
            <div className="h-2.5 w-2.5 rounded-full bg-white" />
          </div>
          <span className="font-semibold tracking-wider text-gray-100 text-sm font-sans">
            LENS WORKSTATION
          </span>
          <span className="rounded bg-[#222222] px-1.5 py-0.5 font-mono text-[10px] text-gray-400">
            v0.1.0
          </span>
        </div>

        <div className="h-4 w-[1px] bg-[#333333]" />

        {/* Workspace Selector */}
        <button
          onClick={onSelectWorkspace}
          className="flex items-center gap-1.5 rounded border border-[#2a2a2a] bg-[#141414] px-2.5 py-1 text-gray-300 hover:border-gray-600 hover:bg-[#1f1f1f] transition-colors"
          title={workspace || 'Click to select workspace folder'}
        >
          <FolderOpen size={13} className="text-gray-400" />
          <span className="font-mono text-gray-200 truncate max-w-[200px]">
            {folderName}
          </span>
        </button>
      </div>

      {/* Controls & Badges */}
      <div className="flex items-center gap-2.5">
        {/* Connection Indicator */}
        <div className="flex items-center gap-1.5 px-2 py-1 text-gray-400 font-mono text-[11px]">
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
            }`}
          />
          <span>{connected ? 'ENGINE ONLINE' : 'DISCONNECTED'}</span>
        </div>

        <div className="h-4 w-[1px] bg-[#333333]" />

        {/* Capability Grant Badge */}
        <button
          onClick={onToggleCapability}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[11px] border transition-colors ${
            capability === 'WORKSPACE_MUTATION'
              ? 'bg-amber-950/50 border-amber-700/60 text-amber-300 hover:bg-amber-900/60'
              : 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60'
          }`}
          title="Click to toggle between Read-Only Inspection and Workspace Mutation mode"
        >
          <Shield size={12} />
          <span>{capability}</span>
        </button>

        {/* Language Toggle */}
        <button
          onClick={onToggleLanguage}
          className="flex items-center gap-1.5 rounded border border-[#2a2a2a] bg-[#141414] px-2.5 py-1 text-gray-300 hover:border-gray-600 hover:bg-[#1f1f1f] transition-colors font-mono"
          title="Switch interface language / تبديل اللغة"
        >
          <Globe size={13} className="text-gray-400" />
          <span>{isRtl ? 'EN' : 'العربية (AR)'}</span>
        </button>

        {/* Auxiliary Pane Toggle */}
        <button
          onClick={onTogglePane}
          className="flex items-center justify-center h-7 w-7 rounded border border-[#2a2a2a] bg-[#141414] text-gray-300 hover:border-gray-600 hover:bg-[#1f1f1f] transition-colors"
          title={paneOpen ? 'Collapse auxiliary workstation pane' : 'Expand auxiliary workstation pane'}
        >
          {paneOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
        </button>
      </div>
    </header>
  );
};
