import React from 'react';
import { ShieldCheck, Zap } from 'lucide-react';
import type { AutonomyMode, Language } from '../types';

interface AutonomyModeToggleProps {
  mode: AutonomyMode;
  onToggle: () => void;
  language: Language;
  disabled?: boolean;
}

export const AutonomyModeToggle: React.FC<AutonomyModeToggleProps> = ({
  mode,
  onToggle,
  language,
  disabled = false,
}) => {
  const isRtl = language === 'ar';
  const isAutonomous = mode === 'autonomous';

  const label = isAutonomous
    ? (isRtl ? 'مستقل (YOLO)' : 'Autonomous (YOLO)')
    : (isRtl ? 'بإشراف' : 'Supervised');

  const tooltip = isAutonomous
    ? (isRtl
        ? 'الوضع المستقل (YOLO): يتم تنفيذ تعديلات الملفات وأوامر الطرفية تلقائياً دون انتظار موافقة'
        : 'Autonomous (YOLO) Mode: File mutations and shell commands run automatically without pausing')
    : (isRtl
        ? 'وضع الإشراف: تتطلب العمليات المعدلة موافقة يدوية قبل التنفيذ'
        : 'Supervised Mode: Mutating operations pause for manual approval before execution');

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      title={tooltip}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[11px] border transition-colors ${
        isAutonomous
          ? 'bg-[#222222] border-gray-400 text-white hover:bg-[#2a2a2a]'
          : 'bg-[#141414] border-[#333333] text-gray-300 hover:bg-[#1a1a1a] hover:border-gray-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {isAutonomous ? (
        <Zap size={12} className="text-white fill-white" />
      ) : (
        <ShieldCheck size={12} className="text-gray-400" />
      )}
      <span>{label}</span>
    </button>
  );
};
