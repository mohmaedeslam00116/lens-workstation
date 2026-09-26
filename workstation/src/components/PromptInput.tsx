import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, AtSign, Slash } from 'lucide-react';
import type { Language, CapabilityMode } from '../types';

interface PromptInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  language: Language;
  capability: CapabilityMode;
}

const COMMON_COMMANDS = [
  { name: '/plan', desc: 'Plan an architecture implementation or refactor' },
  { name: '/test', desc: 'Execute the project test suite via sanitized runner' },
  { name: '/rollback', desc: 'Revert the latest atomic filesystem transaction' },
  { name: '/clear', desc: 'Clear the current canvas conversation session' },
  { name: '/review', desc: 'Inspect recent changes for security and quality' },
];

const COMMON_FILES = [
  'package.json',
  'tsconfig.json',
  'src/App.tsx',
  'src/index.css',
  'engine/core/runtime.mjs',
  'engine/server/index.mjs',
  'engine/terminal/runner.mjs',
  'engine/filesystem/engine.mjs',
];

export const PromptInput: React.FC<PromptInputProps> = ({
  onSend,
  disabled,
  language,
  capability,
}) => {
  const isRtl = language === 'ar';
  const [text, setText] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [text]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    if (val.startsWith('/')) {
      setShowCommands(true);
      setShowFiles(false);
    } else if (val.endsWith('@') || val.includes('@')) {
      const lastWord = val.split(/\s+/).pop() || '';
      setShowFiles(lastWord.startsWith('@'));
      setShowCommands(false);
    } else {
      setShowCommands(false);
      setShowFiles(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      setShowCommands(false);
      setShowFiles(false);
    }
  };

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
    setShowCommands(false);
    setShowFiles(false);
  };

  const insertCommand = (cmd: string) => {
    setText(`${cmd} `);
    setShowCommands(false);
    textareaRef.current?.focus();
  };

  const insertFile = (file: string) => {
    const words = text.split(/\s+/);
    words.pop(); // remove partial @
    words.push(`@${file} `);
    setText(words.join(' '));
    setShowFiles(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="relative border-t border-[#2a2a2a] bg-[#141414] p-4 select-none">
      {/* Autocomplete Dropdown for /Slash Commands */}
      {showCommands && (
        <div className="absolute bottom-full left-4 mb-2 w-80 rounded-lg border border-[#333333] bg-[#1a1a1a] shadow-2xl overflow-hidden z-20">
          <div className="border-b border-[#2a2a2a] px-3 py-1.5 font-mono text-[10px] text-gray-500 uppercase">
            {isRtl ? 'أوامر سريعة' : 'Slash Commands'}
          </div>
          <div className="max-h-48 overflow-y-auto">
            {COMMON_COMMANDS.map((c) => (
              <button
                key={c.name}
                onClick={() => insertCommand(c.name)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#252525] text-xs transition-colors"
              >
                <span className="font-mono text-emerald-400 font-medium">{c.name}</span>
                <span className="text-[11px] text-gray-400">{c.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Autocomplete Dropdown for @Mentions */}
      {showFiles && (
        <div className="absolute bottom-full left-4 mb-2 w-80 rounded-lg border border-[#333333] bg-[#1a1a1a] shadow-2xl overflow-hidden z-20">
          <div className="border-b border-[#2a2a2a] px-3 py-1.5 font-mono text-[10px] text-gray-500 uppercase">
            {isRtl ? 'ملفات مساحة العمل' : 'Workspace Files'}
          </div>
          <div className="max-h-48 overflow-y-auto">
            {COMMON_FILES.map((f) => (
              <button
                key={f}
                onClick={() => insertFile(f)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#252525] text-xs transition-colors font-mono text-gray-300"
              >
                <AtSign size={12} className="text-blue-400" />
                <span>{f}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Input Container */}
      <div className="flex flex-col rounded-xl border border-[#2e2e2e] bg-[#1a1a1a] focus-within:border-gray-500 transition-colors">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            isRtl
              ? 'اطرح سؤالاً أو اكتب أمراً للمشروع (استخدم / للأوامر أو @ لربط الملفات)...'
              : 'Ask a question or instruct the agent (use / for commands, @ to attach files)...'
          }
          rows={1}
          className="w-full resize-none bg-transparent px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none max-h-40"
        />

        {/* Input Footer Toolbar */}
        <div className="flex items-center justify-between border-t border-[#252525] px-3 py-1.5 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <button
              onClick={() => insertCommand('/')}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-gray-400 hover:bg-[#282828] hover:text-gray-200 transition-colors font-mono text-[11px]"
              title="View slash commands"
            >
              <Slash size={11} />
              <span>commands</span>
            </button>
            <button
              onClick={() => insertFile('')}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-gray-400 hover:bg-[#282828] hover:text-gray-200 transition-colors font-mono text-[11px]"
              title="Mention file"
            >
              <AtSign size={11} />
              <span>files</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-gray-500">
              {capability === 'READ_ONLY_INSPECTION'
                ? 'Read-Only Mode'
                : 'Mutation Granted'}
            </span>
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || disabled}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-black hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
              title="Send prompt (Enter)"
            >
              <ArrowUp size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
