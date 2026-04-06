'use client';

import { useEffect } from 'react';

function applyTheme(colors: Record<string, string>) {
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

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // 1. Apply cached theme instantly (no flash)
    const cached = localStorage.getItem('theme_colors');
    if (cached) {
      try {
        applyTheme(JSON.parse(cached));
      } catch { /* ignore */ }
    }

    // 2. Fetch from API to get latest (may fail if not authed yet)
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
        applyTheme(colors);
        localStorage.setItem('theme_colors', JSON.stringify(colors));
      })
      .catch(() => { /* use cached or defaults */ });
  }, []);

  return <>{children}</>;
}
