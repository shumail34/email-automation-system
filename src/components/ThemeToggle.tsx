"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Laptop, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Theme = 'light' | 'dark' | 'system';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('outreachpro_theme') as Theme || 'system';
    setTheme(savedTheme);
  }, []);

  // Set active theme handler
  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('outreachpro_theme', newTheme);
    setIsOpen(false);

    const root = document.documentElement;
    if (newTheme === 'system') {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (systemPrefersDark) {
        root.classList.add('dark');
        root.classList.remove('light');
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
      }
    } else if (newTheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listen to system changes if theme is system
  useEffect(() => {
    if (theme !== 'system') return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const root = document.documentElement;
      if (e.matches) {
        root.classList.add('dark');
        root.classList.remove('light');
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Current active icon
  const getIcon = () => {
    switch (theme) {
      case 'light': return <Sun size={15} className="text-amber-500 animate-spin-slow" />;
      case 'dark': return <Moon size={15} className="text-emerald-400" />;
      case 'system': return <Laptop size={15} className="text-slate-400" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-text-muted hover:text-text-base transition-all text-xs font-semibold cursor-pointer shadow-sm hover:border-emerald-500/20"
      >
        <span className="flex items-center justify-center">{getIcon()}</span>
        <span className="capitalize">{theme}</span>
        <ChevronDown size={12} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-36 rounded-2xl bg-bg-card border border-border-base p-1.5 shadow-2xl z-[200] backdrop-blur-xl"
          >
            {[
              { id: 'light', label: 'Light', icon: <Sun size={14} className="text-amber-500" /> },
              { id: 'dark', label: 'Dark', icon: <Moon size={14} className="text-emerald-400" /> },
              { id: 'system', label: 'System', icon: <Laptop size={14} className="text-slate-400" /> },
            ].map((option) => (
              <button
                key={option.id}
                onClick={() => handleThemeChange(option.id as Theme)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                  theme === option.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-muted hover:text-text-base hover:bg-slate-200 dark:hover:bg-white/5'
                }`}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
