'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Play, Download, Heart, Loader2, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MusicItem } from '@/types/music';
import Image from 'next/image';

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

export function AiRecommendModal({
  isOpen, onClose, playlist, searchHistory, playHistory,
  onPlay, onAddToPlaylist, onDownload
}: AiRecommendModalProps) {
  const [apiKey, setApiKey] = useState('');
  // 保存配置还是显示结果
  const [step, setStep] = useState<'config' | 'loading' | 'result'>('config');
  const [results, setResults] = useState<(MusicItem & { reason?: string })[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const saved = localStorage.getItem('coco-ai-key');
    if (saved) {
      setStep('result');
      setApiKey(saved);
      fetchRecommendations(saved);
    } else {
      setStep('config');
    }
  }, [isOpen]);

  const saveKey = () => {
    if (!apiKey.trim()) return;
    localStorage.setItem('coco-ai-key', apiKey.trim());
    setStep('loading');
    fetchRecommendations(apiKey.trim());
  };

  const clearKey = () => {
    localStorage.removeItem('coco-ai-key');
    setApiKey('');
    setStep('config');
    setResults([]);
  };

  const fetchRecommendations = async (key: string) => {
    setStep('loading');
    setError('');

    // 构建上下文信息
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
      '[{"title": "歌名", "artist": "歌手", "album": "专辑(可选)", "reason": "推荐理由(10字内)"}]',
      '',
      playlistInfo ? `该用户收藏了以下歌曲：\n${playlistInfo}` : '',
      searchInfo ? `搜索过的关键词：${searchInfo}` : '',
      playInfo ? `播放过的歌曲：\n${playInfo}` : '',
      '如果没有足够信息，推荐一些经典热门的华语歌曲。',
      '不要返回以下已有的歌：' + playlist.map(s => s.title).join('、'),
    ].filter(Boolean).join('\n');

    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `API 请求失败 (${res.status})`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      // 尝试从 markdown 代码块中提取 JSON
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch?.[1] || jsonMatch?.[0] || text;

      let items = JSON.parse(jsonStr.trim());
      if (!Array.isArray(items)) throw new Error('返回格式不对');
      
      // 转为 MusicItem 格式
      const musicItems = items.map((item: any, i: number) => ({
        id: `ai-${Date.now()}-${i}`,
        title: item.title || item.name || '未知歌曲',
        artist: item.artist || item.singer || '未知歌手',
        album: item.album || '',
        cover: '',
        reason: item.reason || item.reason || '',
        provider: 'ai',
      }));

      setResults(musicItems);
      setStep('result');
    } catch (err: any) {
      setError(err.message || '推荐失败，请检查 API Key');
      setStep('config');
    }
  };

  const startPlayAll = () => {
    if (results.length === 0) return;
    // 逐个播放
    onPlay(results[0]);
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
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
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

            {/* 配置页 */}
            {step === 'config' && (
              <div className="space-y-4">
                <p className="text-sm text-[#404752] dark:text-[#c6c6c7]">
                  需要 DeepSeek API Key 才能使用 AI 荐歌功能。
                </p>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="输入 DeepSeek API Key..."
                  className="w-full rounded-xl border border-[#c0c7d4]/30 bg-[#f6f3f2] px-4 py-3 text-sm text-[#1b1b1c] outline-none focus:border-[#005faa] dark:bg-[#303030] dark:text-[#f3f0ef]"
                  onKeyDown={e => e.key === 'Enter' && saveKey()}
                />
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  onClick={saveKey}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#005faa] py-3 text-sm font-medium text-white hover:bg-[#0078d4] cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  开始推荐
                </button>
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
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#005faa]/10 py-3 text-sm font-medium text-[#005faa] hover:bg-[#005faa]/20 dark:text-[#a3c9ff] cursor-pointer"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    全部播放 ({results.length} 首)
                  </button>
                )}

                <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {results.map((item, i) => (
                    <div key={item.id} className="group flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#303030]">
                      <span className="w-6 text-center text-xs font-bold text-[#404752]/50 dark:text-[#c6c6c7]/50">{i + 1}</span>
                      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[#f0eded] flex items-center justify-center dark:bg-[#242526]">
                        <Music className="h-5 w-5 text-[#404752]/40" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium">{item.title}</h3>
                        <p className="truncate text-xs text-[#404752]/80 dark:text-[#c6c6c7]/80">
                          {item.artist}
                          {item.reason && <span className="ml-2 text-[#005faa]/70 dark:text-[#a3c9ff]/70">· {item.reason}</span>}
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => onAddToPlaylist(item)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#404752] hover:text-rose-500 hover:bg-rose-50 dark:text-[#c6c6c7] dark:hover:text-rose-300" title="添加到歌单">
                          <Heart className="h-4 w-4" />
                        </button>
                        <button onClick={() => onPlay(item)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#404752] hover:text-[#005faa] hover:bg-[#005faa]/10 dark:text-[#c6c6c7]" title="播放">
                          <Play className="h-4 w-4 fill-current" />
                        </button>
                        <button onClick={() => onDownload(item)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#005faa] text-white hover:bg-[#0078d4]" title="下载">
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between pt-2 text-xs text-[#404752]/60 dark:text-[#c6c6c7]/60">
                  <p>基于 {playlist.length} 首收藏 · {searchHistory.length} 次搜索 · {playHistory.length} 次播放</p>
                  <button onClick={clearKey} className="underline hover:text-[#005faa]">
                    更换 API Key
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
