import React from 'react';
import { FolderOpen, Shield, Globe, PanelRightClose, PanelRightOpen, Settings } from 'lucide-react';
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
  onOpenSettings?: () => void;
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
  onOpenSettings,
}) => {

  const isRtl = language === 'ar';
  const defaultWorkspaceLabel = isRtl ? 'اختر مساحة العمل' : 'Select Workspace';
  const folderName = workspace ? workspace.split(/[\\/]/).filter(Boolean).pop() || workspace : defaultWorkspaceLabel;

  const connectionLabel = connected
    ? (isRtl ? 'المحرك متصل' : 'ENGINE ONLINE')
    : (isRtl ? 'غير متصل' : 'DISCONNECTED');

  const capabilityLabel = capability === 'WORKSPACE_MUTATION'
    ? (isRtl ? 'تعديل مساحة العمل' : 'WORKSPACE_MUTATION')
    : (isRtl ? 'معاينة للقراءة فقط' : 'READ_ONLY_INSPECTION');

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
          title={workspace || (isRtl ? 'انقر لاختيار مجلد مساحة العمل' : 'Click to select workspace folder')}
        >
          <FolderOpen size={13} className="text-gray-400" />
          <span className="font-mono text-gray-200 truncate max-w-[200px]">
            {folderName}
          </span>
        </button>
      </div>

      {/* Controls & Badges */}
      <div className="flex items-center gap-2.5">
        {/* Connection Indicator - Strict monochrome neutral styling */}
        <div className="flex items-center gap-1.5 px-2 py-1 text-gray-400 font-mono text-[11px]">
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? 'bg-white opacity-90' : 'border border-gray-500 bg-transparent'
            }`}
          />
          <span>{connectionLabel}</span>
        </div>

        <div className="h-4 w-[1px] bg-[#333333]" />

        {/* Capability Grant Badge - Strict monochrome neutral styling */}
        <button
          onClick={onToggleCapability}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[11px] border transition-colors ${
            capability === 'WORKSPACE_MUTATION'
              ? 'bg-[#1e1e1e] border-gray-500 text-gray-100 hover:bg-[#252525]'
              : 'bg-[#141414] border-[#333333] text-gray-300 hover:bg-[#1a1a1a]'
          }`}
          title={
            isRtl
              ? 'انقر للتبديل بين وضع المعاينة للقراءة فقط ووضع تعديل الملفات'
              : 'Click to toggle between Read-Only Inspection and Workspace Mutation mode'
          }
        >
          <Shield size={12} className={capability === 'WORKSPACE_MUTATION' ? 'text-white' : 'text-gray-400'} />
          <span>{capabilityLabel}</span>
        </button>

        {/* Language Toggle */}
        <button
          onClick={onToggleLanguage}
          className="flex items-center gap-1.5 rounded border border-[#2a2a2a] bg-[#141414] px-2.5 py-1 text-gray-300 hover:border-gray-600 hover:bg-[#1f1f1f] transition-colors font-mono"
          title={isRtl ? 'تبديل اللغة إلى الإنجليزية' : 'Switch interface language / تبديل اللغة'}
        >
          <Globe size={13} className="text-gray-400" />
          <span>{isRtl ? 'EN' : 'العربية (AR)'}</span>
        </button>

        {/* Model Providers Settings Toggle */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 rounded border border-[#2a2a2a] bg-[#141414] px-2.5 py-1 text-gray-300 hover:border-gray-600 hover:bg-[#1f1f1f] transition-colors font-mono"
            title={isRtl ? 'إعدادات النماذج والـ API Keys' : 'Model Providers & API Settings'}
          >
            <Settings size={13} className="text-gray-400" />
            <span>{isRtl ? 'النماذج' : 'Settings'}</span>
          </button>
        )}

        {/* Auxiliary Pane Toggle */}
        <button
          onClick={onTogglePane}
          className="flex items-center justify-center h-7 w-7 rounded border border-[#2a2a2a] bg-[#141414] text-gray-300 hover:border-gray-600 hover:bg-[#1f1f1f] transition-colors"
          title={
            paneOpen
              ? (isRtl ? 'إغلاق اللوحة الجانبية' : 'Collapse auxiliary workstation pane')
              : (isRtl ? 'فتح اللوحة الجانبية' : 'Expand auxiliary workstation pane')
          }
        >
          {paneOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
        </button>

      </div>
    </header>
  );
};
