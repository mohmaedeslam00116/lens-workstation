import React, { useState, useEffect } from 'react';
import { X, Key, Check, Eye, EyeOff, RefreshCw, Server, AlertCircle } from 'lucide-react';
import type { Language } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

interface ProviderOption {
  id: string;
  name: string;
  description: string;
  defaultBaseUrl?: string;
  defaultModel: string;
  placeholderKey: string;
  popularModels: string[];
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'kilo',
    name: 'Kilo Gateway',
    description: 'Unified AI Gateway with 500+ models & OpenAI-compatible endpoint',
    defaultBaseUrl: 'https://api.kilo.ai/api/gateway/v1',
    defaultModel: 'anthropic/claude-3-7-sonnet',
    placeholderKey: 'sk-kilo-...',
    popularModels: [
      'anthropic/claude-3-7-sonnet',
      'anthropic/claude-sonnet-4.6',
      'deepseek/deepseek-chat',
      'openai/gpt-4o',
      'meta-llama/llama-3.3-70b-instruct',
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'OpenCode Zen gateway & custom proxy router',
    defaultBaseUrl: 'https://api.opencode.ai/v1',
    defaultModel: 'opencode/zen-coder',
    placeholderKey: 'opencode-...',
    popularModels: ['opencode/zen-coder', 'opencode/claude-3-7-sonnet', 'opencode/qwen-2.5-72b'],
  },
  {
    id: 'cline',
    name: 'Cline / OpenRouter',
    description: 'OpenRouter routing with native XML tool fallback',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-3-7-sonnet',
    placeholderKey: 'sk-or-v1-...',
    popularModels: [
      'anthropic/claude-3-7-sonnet',
      'anthropic/claude-3.5-haiku',
      'deepseek/deepseek-r1',
      'openai/o3-mini',
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Direct Google AI Studio API with extended thinking',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    placeholderKey: 'AIzaSy...',
    popularModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'],
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    description: 'Direct Anthropic Messages API with Prompt Caching',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet',
    placeholderKey: 'sk-ant-api03-...',
    popularModels: ['claude-3-5-sonnet', 'claude-3-5-haiku'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Direct OpenAI API (GPT-4o, o1, o3)',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    placeholderKey: 'sk-proj-...',
    popularModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'o1'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'Direct DeepSeek API with reasoning thoughts',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    placeholderKey: 'sk-...',
    popularModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'ollama',
    name: 'Local Ollama',
    description: 'Private local offline inference on localhost:11434',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5-coder',
    placeholderKey: 'ollama (no key needed)',
    popularModels: ['qwen2.5-coder', 'deepseek-r1:14b', 'llama3.3:8b'],
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, language }) => {
  const isRtl = language === 'ar';

  const [selectedProviderId, setSelectedProviderId] = useState('kilo');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fetchingModels, setFetchingModels] = useState(false);
  const [kiloModels, setKiloModels] = useState<string[]>([]);
  const [configuredKeys, setConfiguredKeys] = useState<Record<string, { apiKey: string; model?: string }>>({});

  const activeProviderDef = PROVIDERS.find((p) => p.id === selectedProviderId) || PROVIDERS[0];

  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/settings/credentials')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.credentials) {
          setConfiguredKeys(data.credentials);
          if (data.activeProvider) {
            setSelectedProviderId(data.activeProvider);
          }
        }
      })
      .catch(() => {
        // Offline / disconnected fallback
      });
  }, [isOpen]);

  useEffect(() => {
    const existing = configuredKeys[selectedProviderId];
    if (existing) {
      setApiKey(existing.apiKey || '');
      setModel(existing.model || activeProviderDef.defaultModel);
    } else {
      setApiKey('');
      setModel(activeProviderDef.defaultModel);
    }
    setBaseUrl(activeProviderDef.defaultBaseUrl || '');
    setSaveSuccess(false);
    setErrorMsg('');
  }, [selectedProviderId, configuredKeys, activeProviderDef]);

  const handleFetchKiloModels = async () => {
    setFetchingModels(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/providers/kilo/models');
      if (res.ok) {
        const json = await res.json();
        if (json.models && Array.isArray(json.models)) {
          const ids = json.models.map((m: { id: string }) => m.id);
          setKiloModels(ids);
        }
      } else {
        setErrorMsg(isRtl ? 'تعذر جلب النماذج، تأكد من إدخال مفتاح Kilo أولاً' : 'Could not fetch models. Save your Kilo key first.');
      }
    } catch {
      setErrorMsg(isRtl ? 'فشل الاتصال بالمحرك' : 'Failed to connect to engine');
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setErrorMsg('');

    try {
      const res = await fetch('/api/settings/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProviderId,
          apiKey,
          model,
          baseUrl,
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setConfiguredKeys((prev) => ({
          ...prev,
          [selectedProviderId]: {
            apiKey: apiKey.startsWith('sk-') || apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : apiKey,
            model,
          },
        }));
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || (isRtl ? 'حدث خطأ أثناء الحفظ' : 'Failed to save credentials'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-4">
      <div className="flex h-[520px] w-full max-w-[720px] flex-col rounded-lg border border-[#2a2a2a] bg-[#141414] shadow-2xl text-xs text-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-[#2a2a2a] bg-[#191919] px-4">
          <div className="flex items-center gap-2">
            <Key size={15} className="text-gray-300" />
            <h2 className="text-sm font-semibold tracking-wide text-gray-100 font-sans">
              {isRtl ? 'إعدادات النماذج وبوابات الذكاء الاصطناعي' : 'Model Providers & Gateway Settings'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-[#222222] hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Column: Provider List */}
          <div className="w-[220px] border-r border-[#2a2a2a] bg-[#111111] p-2 overflow-y-auto">
            <div className="px-2 py-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              {isRtl ? 'المزودات والبوابات' : 'Providers & Gateways'}
            </div>
            <div className="mt-1 space-y-1">
              {PROVIDERS.map((prov) => {
                const isSelected = prov.id === selectedProviderId;
                const isConfigured = Boolean(configuredKeys[prov.id]?.apiKey);
                return (
                  <button
                    key={prov.id}
                    onClick={() => setSelectedProviderId(prov.id)}
                    className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-left font-mono text-xs transition-colors ${
                      isSelected
                        ? 'bg-[#222222] text-white border border-[#333333]'
                        : 'text-gray-400 hover:bg-[#191919] hover:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Server size={12} className={isSelected ? 'text-white' : 'text-gray-500'} />
                      <span className="truncate">{prov.name}</span>
                    </div>
                    {isConfigured && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Configured" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Configuration Form */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-[#141414]">
            <div>
              <h3 className="text-sm font-semibold text-white font-sans">{activeProviderDef.name}</h3>
              <p className="text-gray-400 text-[11px] mt-0.5">{activeProviderDef.description}</p>
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-gray-300 font-mono text-[11px]">
                {isRtl ? 'مفتاح الـ API المشفر (DPAPI)' : 'API Key (Encrypted via Windows DPAPI)'}
              </label>
              <div className="relative flex items-center">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={activeProviderDef.placeholderKey}
                  className="w-full rounded border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 font-mono text-xs text-gray-200 focus:border-gray-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 text-gray-400 hover:text-gray-200 p-1"
                >
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            {/* Model Name */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-gray-300 font-mono text-[11px]">
                  {isRtl ? 'اسم النموذج' : 'Model Identifier'}
                </label>
                {selectedProviderId === 'kilo' && (
                  <button
                    type="button"
                    onClick={handleFetchKiloModels}
                    disabled={fetchingModels}
                    className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200"
                  >
                    <RefreshCw size={10} className={fetchingModels ? 'animate-spin' : ''} />
                    <span>{isRtl ? 'تحديث قائمة النماذج' : 'Fetch Models'}</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={activeProviderDef.defaultModel}
                className="w-full rounded border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 font-mono text-xs text-gray-200 focus:border-gray-500 focus:outline-none"
              />

              {/* Popular Models Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(kiloModels.length > 0 ? kiloModels.slice(0, 8) : activeProviderDef.popularModels).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModel(m)}
                    className="rounded bg-[#1a1a1a] px-2 py-0.5 font-mono text-[10px] text-gray-400 hover:bg-[#252525] hover:text-gray-200 border border-[#282828]"
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Base URL */}
            <div className="space-y-1.5">
              <label className="text-gray-300 font-mono text-[11px]">
                {isRtl ? 'رابط البوابة (Base URL)' : 'Gateway Base URL'}
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={activeProviderDef.defaultBaseUrl || 'https://...'}
                className="w-full rounded border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 font-mono text-xs text-gray-200 focus:border-gray-500 focus:outline-none"
              />
            </div>

            {/* Alerts */}
            {saveSuccess && (
              <div className="flex items-center gap-2 rounded bg-[#16291e] border border-emerald-800/40 p-2 text-emerald-300 font-mono text-[11px]">
                <Check size={13} />
                <span>{isRtl ? 'تم حفظ وتفعيل الإعدادات بنجاح!' : 'Credentials saved and activated successfully!'}</span>
              </div>
            )}

            {errorMsg && (
              <div className="flex items-center gap-2 rounded bg-[#2e1515] border border-red-800/40 p-2 text-red-300 font-mono text-[11px]">
                <AlertCircle size={13} />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex h-12 items-center justify-between border-t border-[#2a2a2a] bg-[#191919] px-4">
          <span className="font-mono text-[10px] text-gray-500">
            {isRtl ? 'تخزين مشفر محلياً بنسبة 100%' : 'Encrypted with Windows DPAPI at rest'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded border border-[#2a2a2a] bg-[#141414] px-3 py-1 text-gray-300 hover:bg-[#202020] transition-colors"
            >
              {isRtl ? 'إغلاق' : 'Close'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded bg-white px-3 py-1 font-semibold text-black hover:bg-gray-200 transition-colors"
            >
              {saving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
              <span>{isRtl ? 'حفظ وتفعيل' : 'Save & Activate'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
