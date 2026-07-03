'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Play, Download, Heart, Loader2, Music, Check, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MusicItem } from '@/types/music';

interface AiRecommendModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: MusicItem[];
  searchHistory: string[];
  playHistory: MusicItem[];
  onPlay: (item: MusicItem) => void;
  onAddToPlaylist: (item: MusicItem) => void;
  onDownload: (item: MusicItem) => void;
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
  apiKey: string;
};

function loadConfig(): AiConfig | null {
  try {
    const raw = localStorage.getItem('coco-ai-config');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveConfig(config: AiConfig) {
  localStorage.setItem('coco-ai-config', JSON.stringify(config));
}

export function AiRecommendModal({
  isOpen, onClose, playlist, searchHistory, playHistory,
  onPlay, onAddToPlaylist, onDownload
}: AiRecommendModalProps) {
  const [step, setStep] = useState<'config' | 'loading' | 'result'>('config');
  const [results, setResults] = useState<(MusicItem & { reason?: string })[]>([]);
  const [error, setError] = useState('');

  // 配置
  const [selectedProvider, setSelectedProvider] = useState(PROVIDERS[0]);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [customBaseURL, setCustomBaseURL] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);

  // 按钮反馈（仅播放和下载需要短暂反馈）
  const [actionFeedback, setActionFeedback] = useState<{ [id: string]: 'playing' | 'downloading' }>({});

  useEffect(() => {
    if (!isOpen) return;
    const config = loadConfig();
    if (config) {
      const provider = PROVIDERS.find(p => p.value === config.provider) || PROVIDERS[0];
      setSelectedProvider(provider);
      setApiKey(config.apiKey);
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
      fetchRecommendations(config);
    } else {
      setStep('config');
    }
  }, [isOpen]);

  const selectProvider = (p: typeof PROVIDERS[0]) => {
    setSelectedProvider(p);
    setProviderMenuOpen(false);
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
      setTestResult(res.ok ? 'success' : 'fail');
    } catch {
      setTestResult('fail');
    } finally {
      setTesting(false);
    }
  };

  const startRecommend = () => {
    if (!apiKey.trim()) return;
    const config: AiConfig = {
      provider: selectedProvider.value,
      baseURL: selectedProvider.value === 'custom' ? customBaseURL : selectedProvider.baseURL,
      model: selectedProvider.value === 'custom' ? customModel : selectedProvider.model,
      apiKey: apiKey.trim(),
    };
    saveConfig(config);
    fetchRecommendations(config);
  };

  const clearConfig = () => {
    localStorage.removeItem('coco-ai-config');
    setApiKey('');
    setCustomBaseURL('');
    setCustomModel('');
    setSelectedProvider(PROVIDERS[0]);
    setStep('config');
    setResults([]);
  };

  const fetchRecommendations = async (config: AiConfig) => {
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
          'Authorization': `Bearer ${config.apiKey}`,
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

      const musicItems = items.map((item: any, i: number) => ({
        id: `ai-${Date.now()}-${i}`,
        title: item.title || item.name || '未知歌曲',
        artist: item.artist || item.singer || '未知歌手',
        album: item.album || '',
        cover: '',
        reason: item.reason || '',
        provider: 'ai',
      }));

      setResults(musicItems);
      localStorage.setItem('coco-ai-results', JSON.stringify(musicItems));
      setStep('result');
    } catch (err: any) {
      setError(err.message || '推荐失败，请检查配置');
      setStep('config');
    }
  };

  const handleAddToPlaylist = (item: MusicItem) => {
    onAddToPlaylist(item);
  };

  const handlePlay = (item: MusicItem) => {
    onPlay(item);
    setActionFeedback(prev => ({ ...prev, [item.id]: 'playing' }));
    setTimeout(() => setActionFeedback(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    }), 300);
  };

  const handleDownload = (item: MusicItem) => {
    setActionFeedback(prev => ({ ...prev, [item.id]: 'downloading' }));
    onDownload(item);
    setTimeout(() => setActionFeedback(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    }), 600);
  };

  const reRecommend = () => {
    localStorage.removeItem('coco-ai-results');
    setStep('loading');
    const config = loadConfig();
    if (config) fetchRecommendations(config);
  };

  const startPlayAll = () => {
    if (results.length > 0) onPlay(results[0]);
  };

  const isInPlaylist = (id: string) => playlist.some(p => p.id === id);

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
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#005faa] py-3 text-sm font-medium text-white hover:bg-[#0078d4] cursor-pointer"
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

            {/* 结果页 */}
            {step === 'result' && (
              <div className="space-y-3">
                {results.length > 0 && (
                  <button
                    onClick={startPlayAll}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#005faa]/10 py-3 text-sm font-medium text-[#005faa] hover:bg-[#005faa]/20 cursor-pointer dark:text-[#a3c9ff]"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    全部播放 ({results.length} 首)
                  </button>
                )}

                <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {results.map((item, i) => (
                    <div key={item.id} className="group flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3 shadow-sm hover:shadow-md transition-all dark:border-white/10 dark:bg-[#303030]">
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
                      {/* 操作按钮：hover 显示 */}
                      <div className="flex gap-1 opacity-0 transition-all duration-200 group-hover:opacity-100">
                        <button
                          onClick={() => handleAddToPlaylist(item)}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#404752] hover:text-rose-500 hover:bg-rose-50 dark:text-[#c6c6c7] dark:hover:text-rose-300 active:scale-90 transition-all"
                          title="添加到歌单"
                        >
                          {/* 添加到歌单 - 永久状态用 playlist 判断 */}
                          {isInPlaylist(item.id) ? (
                            <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
                          ) : (
                            <Heart className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handlePlay(item)}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#404752] hover:text-[#005faa] hover:bg-[#005faa]/10 dark:text-[#c6c6c7] active:scale-90 transition-all"
                          title="播放"
                        >
                        {/* 播放 - 短暂反馈 */}
                        {actionFeedback[item.id] === 'playing' ? (
                          <Check className="h-4 w-4 text-[#005faa]" />
                        ) : (
                          <Play className="h-4 w-4 fill-current" />
                        )}
                        </button>
                        <button
                          onClick={() => handleDownload(item)}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#005faa] text-white hover:bg-[#0078d4] active:scale-90 transition-all"
                          title="下载"
                        >
                        {/* 下载 - 短暂反馈 */}
                        {actionFeedback[item.id] === 'downloading' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between pt-2 text-xs text-[#404752]/60 dark:text-[#c6c6c7]/60">
                  <p>基于 {playlist.length} 首收藏 · {searchHistory.length} 次搜索 · {playHistory.length} 次播放</p>
                  <div className="flex gap-3">
                    <button onClick={reRecommend} className="underline hover:text-[#005faa] cursor-pointer">
                      重新推荐
                    </button>
                    <span className="text-[#404752]/30 dark:text-[#c6c6c7]/30">·</span>
                    <button onClick={clearConfig} className="underline hover:text-[#005faa] cursor-pointer">
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
