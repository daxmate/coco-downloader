'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Loader2, Music, Check, ChevronDown, Eye, EyeOff, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type AiRecommendItem = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  reason?: string;
};

interface AiRecommendModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: { title: string; artist?: string }[];
  searchHistory: string[];
  playHistory: { title: string; artist?: string }[];
  onSearch: (query: string) => void;
}

const PROVIDERS = [
  { label: 'DeepSeek', value: 'deepseek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { label: 'OpenAI', value: 'openai', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'Groq', value: 'groq', baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { label: '自定义', value: 'custom', baseURL: '', model: '' },
];

type AiConfig = {
  provider: string;
  baseURL: string;
  model: string;
  apiKeys: Record<string, string>;
};

function loadConfig(): AiConfig | null {
  try {
    const raw = localStorage.getItem('coco-ai-config');
    if (!raw) return null;
    const config = JSON.parse(raw);
    if (config.apiKey && !config.apiKeys) {
      config.apiKeys = { [config.provider]: config.apiKey };
      delete config.apiKey;
    }
    return config;
  } catch { return null; }
}

function saveConfig(config: AiConfig) {
  localStorage.setItem('coco-ai-config', JSON.stringify(config));
}

export function AiRecommendModal({
  isOpen, onClose, playlist, searchHistory, playHistory, onSearch
}: AiRecommendModalProps) {
  const [step, setStep] = useState<'config' | 'loading' | 'result'>('config');
  const [results, setResults] = useState<AiRecommendItem[]>([]);
  const [error, setError] = useState('');

  // 配置
  const [selectedProvider, setSelectedProvider] = useState(PROVIDERS[0]);
  const [apiKey, setApiKey] = useState('');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState(false);
  const [customBaseURL, setCustomBaseURL] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const config = loadConfig();
    if (config) {
      const provider = PROVIDERS.find(p => p.value === config.provider) || PROVIDERS[0];
      setSelectedProvider(provider);
      setApiKeys(config.apiKeys || {});
      setApiKey(config.apiKeys?.[config.provider] || '');
      setCustomBaseURL(config.baseURL);
      setCustomModel(config.model);

      // 先尝试加载本地已有推荐结果
      const savedResults = localStorage.getItem('coco-ai-results');
      if (savedResults) {
        try {
          const parsed = JSON.parse(savedResults);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setResults(parsed);
            setStep('result');
            return;
          }
        } catch {}
      }

      // 没有本地结果，调用 API
      fetchRecommendations(config, config.apiKeys?.[config.provider] || '');
    } else {
      setStep('config');
    }
  }, [isOpen]);

  const selectProvider = (p: typeof PROVIDERS[0]) => {
    const updated = { ...apiKeys, [selectedProvider.value]: apiKey };
    setApiKeys(updated);
    setSelectedProvider(p);
    setProviderMenuOpen(false);
    setApiKey(updated[p.value] || '');
  };

  const testConnection = async () => {
    if (!apiKey.trim()) { setTestResult('fail'); return; }
    setTesting(true);
    setTestResult(null);
    const baseURL = selectedProvider.value === 'custom' ? customBaseURL : selectedProvider.baseURL;
    const model = selectedProvider.value === 'custom' ? customModel : selectedProvider.model;
    try {
      const res = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      });
      if (res.ok) {
        const mergedKeys = { ...apiKeys, [selectedProvider.value]: apiKey.trim() };
        setApiKeys(mergedKeys);
        const config: AiConfig = {
          provider: selectedProvider.value,
          baseURL: selectedProvider.value === 'custom' ? customBaseURL : selectedProvider.baseURL,
          model: selectedProvider.value === 'custom' ? customModel : selectedProvider.model,
          apiKeys: mergedKeys,
        };
        saveConfig(config);
      }
      setTestResult(res.ok ? 'success' : 'fail');
    } catch {
      setTestResult('fail');
    } finally {
      setTesting(false);
    }
  };

  const startRecommend = () => {
    if (!apiKey.trim()) return;
    const mergedKeys = { ...apiKeys, [selectedProvider.value]: apiKey.trim() };
    setApiKeys(mergedKeys);
    const config: AiConfig = {
      provider: selectedProvider.value,
      baseURL: selectedProvider.value === 'custom' ? customBaseURL : selectedProvider.baseURL,
      model: selectedProvider.value === 'custom' ? customModel : selectedProvider.model,
      apiKeys: mergedKeys,
    };
    saveConfig(config);
    fetchRecommendations(config, apiKey.trim());
  };

  const clearConfig = () => {
    localStorage.removeItem('coco-ai-config');
    localStorage.removeItem('coco-ai-results');
    setApiKey('');
    setApiKeys({});
    setCustomBaseURL('');
    setCustomModel('');
    setSelectedProvider(PROVIDERS[0]);
    setStep('config');
    setResults([]);
  };

  const fetchRecommendations = async (config: AiConfig, currentApiKey: string) => {
    setStep('loading');
    setError('');

    const playlistInfo = playlist.slice(0, 20).map(s =>
      `${s.title} - ${s.artist || '未知歌手'}`
    ).join('\n');
    const searchInfo = searchHistory.slice(0, 20).join('、');
    const playInfo = playHistory.slice(0, 20).map(s =>
      `${s.title} - ${s.artist || '未知歌手'}`
    ).join('\n');

    const prompt = [
      '你是一个音乐推荐助手。根据用户的听歌记录，推荐 50 首歌。',
      '结果必须是 **纯 JSON 数组**，不要其他文字，格式如下：',
      '[{"title": "歌名", "artist": "歌手", "album": "专辑(可选)", "reason": "推荐理由(10字内)"},...]',
      '',
      playlistInfo ? `该用户收藏了以下歌曲：\n${playlistInfo}` : '',
      searchInfo ? `搜索过的关键词：${searchInfo}` : '',
      playInfo ? `播放过的歌曲：\n${playInfo}` : '',
      '如果没有足够信息，推荐一些经典热门的华语歌曲。',
      '不要返回重复的歌曲。',
    ].filter(Boolean).join('\n');

    try {
      const res = await fetch(`${config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentApiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `请求失败 (${res.status})`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch?.[1] || jsonMatch?.[0] || text;

      let items = JSON.parse(jsonStr.trim());
      if (!Array.isArray(items)) throw new Error('返回格式不对');

      const aiItems: AiRecommendItem[] = items.map((item: any, i: number) => ({
        id: `ai-${Date.now()}-${i}`,
        title: item.title || item.name || '未知歌曲',
        artist: item.artist || item.singer || '未知歌手',
        album: item.album || '',
        reason: item.reason || '',
      }));

      setResults(aiItems);
      localStorage.setItem('coco-ai-results', JSON.stringify(aiItems));
      setStep('result');
    } catch (err: any) {
      setError(err.message || '推荐失败，请检查配置');
      setStep('config');
    }
  };

  const reRecommend = () => {
    localStorage.removeItem('coco-ai-results');
    setStep('loading');
    const config = loadConfig();
    if (config) fetchRecommendations(config, config.apiKeys?.[config.provider] || '');
  };

  const handleSearchItem = (item: AiRecommendItem) => {
    const query = `${item.artist} ${item.title}`;
    onSearch(query);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-[#1b1b1c]/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 0.95 }} exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 z-[90] w-full max-w-2xl max-h-[80vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(0,0,0,0.3)] dark:bg-[#242526]"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-[#005faa] dark:text-[#a3c9ff]" />
                <h2 className="text-2xl font-bold text-[#1b1b1c] dark:text-[#f3f0ef]">AI 荐歌</h2>
              </div>
              <button onClick={onClose} className="cursor-pointer rounded-full p-1.5 text-[#404752] hover:bg-[#e5e2e1] dark:text-[#c6c6c7] dark:hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 设置页 */}
            {step === 'config' && (
              <div className="space-y-4">
                <p className="text-sm text-[#404752] dark:text-[#c6c6c7]">
                  配置 AI 服务商和 API Key，根据你的听歌记录为你推荐歌曲。
                </p>

                {/* 模型选择 */}
                <div className="relative">
                  <label className="mb-1 block text-xs font-medium text-[#404752]/70 dark:text-[#c6c6c7]/70">模型</label>
                  <button
                    onClick={() => setProviderMenuOpen(!providerMenuOpen)}
                    className="flex w-full items-center justify-between rounded-xl border border-[#c0c7d4]/30 bg-[#f6f3f2] px-4 py-3 text-sm text-[#1b1b1c] outline-none dark:bg-[#303030] dark:text-[#f3f0ef] cursor-pointer"
                  >
                    <span>{selectedProvider.label}</span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", providerMenuOpen && "rotate-180")} />
                  </button>
                  {providerMenuOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-xl border border-[#c0c7d4]/30 bg-white py-1 shadow-lg dark:bg-[#303030]">
                      {PROVIDERS.map(p => (
                        <button
                          key={p.value}
                          onClick={() => selectProvider(p)}
                          className={cn(
                            "flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors cursor-pointer",
                            selectedProvider.value === p.value
                              ? "bg-[#d3e3ff] font-medium text-[#005faa] dark:bg-[#003f6d] dark:text-[#a3c9ff]"
                              : "hover:bg-[#f0eded] text-[#1b1b1c] dark:hover:bg-white/10 dark:text-[#f3f0ef]"
                          )}
                        >
                          <span>{p.label}</span>
                          {selectedProvider.value === p.value && <Check className="h-4 w-4" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 自定义 baseURL */}
                {selectedProvider.value === 'custom' && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#404752]/70">Base URL</label>
                      <input
                        type="text"
                        value={customBaseURL}
                        onChange={e => setCustomBaseURL(e.target.value)}
                        placeholder="https://your-api.com/v1"
                        className="w-full rounded-xl border border-[#c0c7d4]/30 bg-[#f6f3f2] px-4 py-3 text-sm text-[#1b1b1c] outline-none focus:border-[#005faa] dark:bg-[#303030] dark:text-[#f3f0ef]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#404752]/70">模型名称</label>
                      <input
                        type="text"
                        value={customModel}
                        onChange={e => setCustomModel(e.target.value)}
                        placeholder="gpt-4, claude-3 等"
                        className="w-full rounded-xl border border-[#c0c7d4]/30 bg-[#f6f3f2] px-4 py-3 text-sm text-[#1b1b1c] outline-none focus:border-[#005faa] dark:bg-[#303030] dark:text-[#f3f0ef]"
                      />
                    </div>
                  </>
                )}

                {/* API Key */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#404752]/70 dark:text-[#c6c6c7]/70">API Key</label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder={`输入 ${selectedProvider.label} API Key...`}
                      className="w-full rounded-xl border border-[#c0c7d4]/30 bg-[#f6f3f2] px-4 py-3 pr-10 text-sm text-[#1b1b1c] outline-none focus:border-[#005faa] dark:bg-[#303030] dark:text-[#f3f0ef]"
                      onKeyDown={e => e.key === 'Enter' && startRecommend()}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#404752]/50 hover:text-[#404752] cursor-pointer"
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <div className="flex gap-3">
                  <button
                    onClick={testConnection}
                    disabled={testing}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#c0c7d4]/30 py-3 text-sm font-medium text-[#404752] hover:bg-[#f0eded] disabled:opacity-50 cursor-pointer dark:text-[#c6c6c7] dark:hover:bg-white/10"
                  >
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    测试连接
                    {testResult === 'success' && <Check className="h-4 w-4 text-green-500" />}
                    {testResult === 'fail' && <X className="h-4 w-4 text-red-500" />}
                  </button>
                  <button
                    onClick={startRecommend}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#005faa] py-3 text-sm font-medium text-white hover:bg-[#0078d4] cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4" />
                    开始推荐
                  </button>
                </div>
              </div>
            )}

            {/* 加载中 */}
            {step === 'loading' && (
              <div className="flex flex-col items-center justify-center py-12 gap-4 text-[#404752] dark:text-[#c6c6c7]">
                <Loader2 className="h-8 w-8 animate-spin text-[#005faa]" />
                <p>正在分析你的听歌偏好...</p>
              </div>
            )}

            {/* 结果页 - 点击任意结果跳转到搜索 */}
            {step === 'result' && (
              <div className="space-y-2">
                <p className="text-xs text-[#404752]/60 dark:text-[#c6c6c7]/60">
                  点击任意结果，将用「歌手 歌曲名」搜索
                </p>

                <div className="space-y-2 max-h-[58vh] overflow-y-auto pr-1">
                  {results.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => handleSearchItem(item)}
                      className="flex w-full items-center gap-3 rounded-xl border border-black/5 bg-white p-3 shadow-sm hover:shadow-md hover:bg-[#f0eded] transition-all text-left cursor-pointer dark:border-white/10 dark:bg-[#303030] dark:hover:bg-[#3a3b3c]"
                    >
                      <span className="w-6 text-center text-xs font-bold text-[#404752]/50 dark:text-[#c6c6c7]/50">{i + 1}</span>
                      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[#f0eded] flex items-center justify-center dark:bg-[#242526]">
                        <Music className="h-5 w-5 text-[#404752]/40" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium text-[#1b1b1c] dark:text-[#f3f0ef]">{item.title}</h3>
                        <p className="truncate text-xs text-[#404752]/80 dark:text-[#c6c6c7]/80">
                          {item.artist}
                          {item.reason && <span className="ml-2 text-[#005faa]/70 dark:text-[#a3c9ff]/70">· {item.reason}</span>}
                        </p>
                      </div>
                      <div className="flex-shrink-0 rounded-full bg-[#005faa]/10 p-2 text-[#005faa] dark:text-[#a3c9ff]">
                        <Search className="h-4 w-4" />
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex justify-between pt-2 text-xs text-[#404752]/60 dark:text-[#c6c6c7]/60">
                  <p>基于 {playlist.length} 首收藏 · {searchHistory.length} 次搜索 · {playHistory.length} 次播放</p>
                  <div className="flex gap-3">
                    <button onClick={reRecommend} className="underline hover:text-[#005faa] cursor-pointer">
                      重新推荐
                    </button>
                    <span className="text-[#404752]/30 dark:text-[#c6c6c7]/30">·</span>
                    <button onClick={() => setStep('config')} className="underline hover:text-[#005faa] cursor-pointer">
                      AI 设置
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
