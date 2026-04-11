'use client';

import { useEffect } from 'react';
import { ACCENT_OPTIONS, FONT_OPTIONS, BACKGROUND_OPTIONS } from '@/contexts/DesignThemeContext';

function applyLegacyTheme(colors: Record<string, string>) {
  const root = document.documentElement;
  if (colors.primary) {
    root.style.setProperty('--color-gray-950', colors.primary);
    root.style.setProperty('--color-gray-900', colors.primary);
  }
  if (colors.primaryLight) root.style.setProperty('--color-gray-800', colors.primaryLight);
  if (colors.surface) root.style.setProperty('--color-gray-800', colors.surface);
  if (colors.surfaceLight) root.style.setProperty('--color-gray-700', colors.surfaceLight);
  if (colors.border) root.style.setProperty('--color-gray-700', colors.border);
  if (colors.accent) {
    root.style.setProperty('--color-accent-600', colors.accent);
    root.style.setProperty('--color-accent-500', colors.accent);
    root.style.setProperty('--color-accent-400', colors.accent);
  }
  if (colors.accentHover) root.style.setProperty('--color-accent-700', colors.accentHover);
}

function applyDesignAccent(id: string) {
  const option = ACCENT_OPTIONS.find(o => o.id === id) || ACCENT_OPTIONS[0];
  const root = document.documentElement;
  root.style.setProperty('--brand', option.oklch);
  root.style.setProperty('--brand-dim', option.oklch.replace(')', ' / 0.15)'));
  root.style.setProperty('--brand-glow', option.glow);
  root.style.setProperty('--primary', option.oklch);
  root.style.setProperty('--ring', option.oklch.replace(')', ' / 0.5)'));
  root.style.setProperty('--sidebar-primary', option.oklch);
}

function applyDesignFont(id: string) {
  const option = FONT_OPTIONS.find(o => o.id === id) || FONT_OPTIONS[0];
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
}

function applyDesignBackground(id: string) {
  const option = BACKGROUND_OPTIONS.find(o => o.id === id) || BACKGROUND_OPTIONS[0];
  const { hue: h, chroma: c, base: l } = option;
  const root = document.documentElement;
  const oklch = (light: number, chr: number) => `oklch(${light.toFixed(3)} ${chr.toFixed(3)} ${h})`;

  root.style.setProperty('--background', oklch(l, c));
  root.style.setProperty('--foreground', oklch(0.94, Math.min(c, 0.010)));
  root.style.setProperty('--card', oklch(l + 0.04, c + 0.002));
  root.style.setProperty('--card-foreground', oklch(0.94, Math.min(c, 0.010)));
  root.style.setProperty('--popover', oklch(l + 0.07, c + 0.003));
  root.style.setProperty('--popover-foreground', oklch(0.94, Math.min(c, 0.010)));
  root.style.setProperty('--surface-1', oklch(l + 0.04, c + 0.002));
  root.style.setProperty('--surface-2', oklch(l + 0.09, c + 0.004));
  root.style.setProperty('--surface-3', oklch(l + 0.14, c + 0.006));
  root.style.setProperty('--secondary', oklch(l + 0.09, c + 0.004));
  root.style.setProperty('--secondary-foreground', oklch(0.78, Math.min(c, 0.010)));
  root.style.setProperty('--muted', oklch(l + 0.09, c + 0.004));
  root.style.setProperty('--muted-foreground', oklch(0.62, Math.min(c, 0.012)));
  root.style.setProperty('--accent', oklch(l + 0.09, c + 0.004));
  root.style.setProperty('--accent-foreground', oklch(0.94, Math.min(c, 0.010)));
  root.style.setProperty('--border', oklch(l + 0.14, c + 0.005));
  root.style.setProperty('--input', oklch(l + 0.14, c + 0.005));
  root.style.setProperty('--sidebar', oklch(Math.max(l - 0.02, 0.03), c));
  root.style.setProperty('--sidebar-background', oklch(Math.max(l - 0.02, 0.03), c));
  root.style.setProperty('--sidebar-foreground', oklch(0.94, Math.min(c, 0.010)));
  root.style.setProperty('--sidebar-border', oklch(l + 0.10, c + 0.004));
  root.style.setProperty('--sidebar-accent', oklch(l + 0.09, c + 0.004));
  root.style.setProperty('--sidebar-accent-foreground', oklch(0.94, Math.min(c, 0.010)));
  root.style.setProperty('--color-background', `var(--background)`);
  root.style.setProperty('--color-surface-1', `var(--surface-1)`);
  root.style.setProperty('--color-surface-2', `var(--surface-2)`);
  root.style.setProperty('--color-surface-3', `var(--surface-3)`);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // 1. Apply design system theme from localStorage (instant, no flash)
    const savedAccent = localStorage.getItem('design-accent');
    const savedFont = localStorage.getItem('design-font');
    const savedBg = localStorage.getItem('design-background');
    if (savedAccent) applyDesignAccent(savedAccent);
    if (savedFont) applyDesignFont(savedFont);
    if (savedBg && savedBg !== 'warm-dusk') applyDesignBackground(savedBg);

    // 2. Apply legacy theme colors if present
    const cached = localStorage.getItem('theme_colors');
    if (cached) {
      try {
        applyLegacyTheme(JSON.parse(cached));
      } catch { /* ignore */ }
    }

    // 3. Fetch latest settings from API
    fetch('/api/settings')
      .then((r) => {
        if (!r.ok) throw new Error('not authed');
        return r.json();
      })
      .then((data) => {
        if (!data?.theme_colors) return;
        const colors = typeof data.theme_colors === 'string'
          ? JSON.parse(data.theme_colors)
          : data.theme_colors;
        // Apply server-side settings for accent/font/background
        if (colors.accent && !savedAccent) applyDesignAccent(colors.accent);
        if (colors.font && !savedFont) applyDesignFont(colors.font);
        if (colors.background && !savedBg) applyDesignBackground(colors.background);
        applyLegacyTheme(colors);
        localStorage.setItem('theme_colors', JSON.stringify(colors));
      })
      .catch(() => { /* use cached or defaults */ });

    // 4. Register service worker for PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* silent */ });
    }
  }, []);

  return <>{children}</>;
}
