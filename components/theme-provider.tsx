'use client';

import { useEffect } from 'react';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Load saved theme from API
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (!data?.theme_colors) return;

        const colors = typeof data.theme_colors === 'string'
          ? JSON.parse(data.theme_colors)
          : data.theme_colors;

        const root = document.documentElement;
        if (colors.primary) {
          root.style.setProperty('--color-gray-950', colors.primary);
          root.style.setProperty('--color-gray-900', colors.primary);
        }
        if (colors.surface) root.style.setProperty('--color-gray-800', colors.surface);
        if (colors.surfaceLight) root.style.setProperty('--color-gray-700', colors.border || colors.surfaceLight);
        if (colors.border) root.style.setProperty('--color-gray-700', colors.border);
        if (colors.accent) {
          root.style.setProperty('--color-accent-600', colors.accent);
          root.style.setProperty('--color-accent-500', colors.accent);
          root.style.setProperty('--color-accent-400', colors.accent);
        }
        if (colors.accentHover) root.style.setProperty('--color-accent-700', colors.accentHover);
      })
      .catch(() => { /* use defaults from CSS */ });
  }, []);

  return <>{children}</>;
}
