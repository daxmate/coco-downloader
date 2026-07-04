'use client';

import Link from "next/link";
import Image from "next/image";
import { Download, Github, Sun, Moon, Heart, ListMusic, Sparkles } from "lucide-react";
import { useState, MouseEvent } from "react";
import { useTheme } from "next-themes";
import DeveloperPanel from "./DeveloperPanel";
import { DonationModal } from "./DonationModal";

export function Navbar() {
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const currentTheme = resolvedTheme ?? theme ?? "light";

  const toggleTheme = (event: MouseEvent<HTMLButtonElement>) => {
    const isDark = currentTheme === 'dark';
    const newTheme = isDark ? 'light' : 'dark';

    // Check if View Transitions API is supported
    if (!document.startViewTransition) {
      setTheme(newTheme);
      return;
    }

    const x = event.clientX;
    const y = event.clientY;
    const endRadius = Math.hypot(
      Math.max(x, innerWidth - x),
      Math.max(y, innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
      setTheme(newTheme);
    });

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];

      document.documentElement.animate(
        {
          clipPath: clipPath,
        },
        {
          duration: 500,
          easing: "ease-in",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });
  };

  return (
    <>
      <nav className="h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-sky-100 dark:border-slate-800 z-50 px-4 md:px-8 flex items-center justify-between transition-colors duration-300">
        <Link href="/" className="group flex items-center gap-3">
          <Image src="/images/coco-downloader.svg" alt="CoCo Downloader" width={40} height={40} className="h-10 w-10 transition-transform group-hover:scale-105" />
          <span className="hidden text-xl font-bold tracking-normal text-[#005faa] dark:text-[#a3c9ff] sm:inline">
            CoCo Downloader
          </span>
        </Link>
        
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/markcxx/coco-downloader/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-transparent px-3 py-2 text-sm font-medium text-[#1b1b1c] transition-all duration-300 hover:bg-[#005faa] hover:text-white dark:text-[#f3f0ef] dark:hover:bg-[#a3c9ff] dark:hover:text-[#001c39]"
            title="下载客户端"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">下载客户端</span>
          </a>

          <button
            onClick={() => window.dispatchEvent(new Event('toggle-playlist'))}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-transparent px-3 py-2 text-sm font-medium text-[#1b1b1c] transition-all duration-300 hover:bg-[#005faa] hover:text-white dark:text-[#f3f0ef] dark:hover:bg-[#a3c9ff] dark:hover:text-[#001c39]"
            title="我的歌单"
          >
            <ListMusic className="h-4 w-4" />
            <span className="hidden sm:inline">我的歌单</span>
          </button>

          <button
            onClick={() => window.dispatchEvent(new Event('toggle-ai'))}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-transparent px-3 py-2 text-sm font-medium text-[#1b1b1c] transition-all duration-300 hover:bg-gradient-to-r hover:from-[#005faa] hover:to-[#0078d4] hover:text-white active:scale-95 dark:text-[#f3f0ef] dark:hover:from-[#a3c9ff] dark:hover:to-[#80b5e5] dark:hover:text-[#001c39]"
            title="AI 荐歌"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">AI 荐歌</span>
          </button>

          <button
            onClick={() => setShowDonation(true)}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-full transition-all duration-300 cursor-pointer"
            title="支持作者"
          >
            <Heart className="w-5 h-5" />
          </button>
          
          <a 
            href="https://github.com/markcxx/coco-downloader" 
            target="_blank" 
            rel="noopener noreferrer"
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all duration-300 cursor-pointer"
          >
            <Github className="w-5 h-5" />
          </a>

          <button
            onClick={toggleTheme}
            className="cursor-pointer rounded-full p-2 text-slate-500 transition-all duration-300 hover:bg-sky-50 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300"
            aria-label="Toggle theme"
          >
            {currentTheme === 'dark' ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>
        </div>
      </nav>

      <DeveloperPanel open={showDevPanel} onClose={() => setShowDevPanel(false)} />
      <DonationModal isOpen={showDonation} onClose={() => setShowDonation(false)} />
    </>
  );
}
