'use client';

import { useState, useEffect } from 'react';
import { Check, Palette, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ACCENT_OPTIONS, FONT_OPTIONS } from '@/contexts/DesignThemeContext';

export default function ThemePage() {
  const [accent, setAccent] = useState('orange');
  const [font, setFont] = useState('figtree');

  useEffect(() => {
    setAccent(localStorage.getItem('design-accent') || 'orange');
    setFont(localStorage.getItem('design-font') || 'figtree');
  }, []);

  const applyAccent = (id: string) => {
    const option = ACCENT_OPTIONS.find(o => o.id === id) || ACCENT_OPTIONS[0];
    setAccent(id);
    localStorage.setItem('design-accent', id);
    const root = document.documentElement;
    root.style.setProperty('--brand', option.oklch);
    root.style.setProperty('--brand-dim', option.oklch.replace(')', ' / 0.15)'));
    root.style.setProperty('--brand-glow', option.glow);
    root.style.setProperty('--primary', option.oklch);
    root.style.setProperty('--ring', option.oklch.replace(')', ' / 0.5)'));
    root.style.setProperty('--sidebar-primary', option.oklch);
    toast(`Accent: ${option.label}`);
    fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme_colors: { accent: id } }),
    }).catch(() => {});
  };

  const applyFont = (id: string) => {
    const option = FONT_OPTIONS.find(o => o.id === id) || FONT_OPTIONS[0];
    setFont(id);
    localStorage.setItem('design-font', id);
    const root = document.documentElement;
    root.style.setProperty('--font-display', option.family);
    root.style.setProperty('--font-body', option.family);
    if (id !== 'figtree') {
      const linkId = `google-font-${id}`;
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${option.googleParam}&display=swap`;
        document.head.appendChild(link);
      }
    }
    toast(`Font: ${option.label}`);
    fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme_colors: { font: id } }),
    }).catch(() => {});
  };

  return (
    <div className="p-4 lg:p-6 max-w-2xl space-y-6 animate-fade-up">
      <div>
        <h2 className="text-xl font-bold text-foreground">Appearance</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">Customise accent colour and font. Changes apply instantly.</p>
      </div>

      {/* Accent Colour */}
      <div className="rounded-2xl border border-border overflow-hidden" style={{ background: 'var(--color-surface-1)' }}>
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
          <Palette size={15} style={{ color: 'var(--color-brand)' }} />
          <h3 className="text-[13px] font-semibold text-foreground">Accent Colour</h3>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-3 gap-3">
            {ACCENT_OPTIONS.map((option) => {
              const active = accent === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => applyAccent(option.id)}
                  className={cn(
                    'relative flex items-center gap-3 p-3 rounded-xl border transition-all duration-150',
                    active ? 'border-white/20' : 'border-border hover:border-white/10'
                  )}
                  style={active ? { background: 'var(--color-surface-2)' } : {}}
                >
                  <div
                    className="w-8 h-8 rounded-lg shrink-0"
                    style={{
                      background: option.hex,
                      boxShadow: active ? `0 0 12px ${option.hex}60` : 'none',
                    }}
                  />
                  <div className="text-left min-w-0">
                    <p className="text-[12px] font-medium text-foreground truncate">{option.label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{option.hex}</p>
                  </div>
                  {active && (
                    <Check size={14} className="absolute top-2 right-2 text-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Font */}
      <div className="rounded-2xl border border-border overflow-hidden" style={{ background: 'var(--color-surface-1)' }}>
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
          <Type size={15} style={{ color: 'var(--color-brand)' }} />
          <h3 className="text-[13px] font-semibold text-foreground">Font</h3>
        </div>
        <div className="divide-y divide-border">
          {FONT_OPTIONS.map((option) => {
            const active = font === option.id;
            return (
              <button
                key={option.id}
                onClick={() => applyFont(option.id)}
                className={cn(
                  'w-full flex items-center justify-between px-5 py-3.5 transition-colors text-left',
                  active ? '' : 'hover:bg-surface-2'
                )}
                style={active ? { background: 'var(--color-brand-dim)' } : {}}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{ borderColor: active ? 'var(--color-brand)' : 'var(--color-border)' }}
                  >
                    {active && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-brand)' }} />}
                  </div>
                  <span className="text-[14px] font-medium text-foreground" style={{ fontFamily: option.family }}>
                    {option.label}
                  </span>
                </div>
                <span className="text-[12px] text-muted-foreground" style={{ fontFamily: option.family }}>
                  The quick brown fox
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
