'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export const ACCENT_OPTIONS = [
  { id: 'orange',  label: 'Signal Orange', hex: '#E8541A', oklch: 'oklch(0.62 0.19 35)',  glow: 'oklch(0.62 0.19 35 / 0.35)' },
  { id: 'amber',   label: 'Amber Gold',    hex: '#F59E0B', oklch: 'oklch(0.75 0.18 75)',  glow: 'oklch(0.75 0.18 75 / 0.30)' },
  { id: 'coral',   label: 'Warm Coral',    hex: '#F97066', oklch: 'oklch(0.70 0.18 20)',  glow: 'oklch(0.70 0.18 20 / 0.30)' },
  { id: 'rose',    label: 'Dusty Rose',    hex: '#FB7185', oklch: 'oklch(0.70 0.17 5)',   glow: 'oklch(0.70 0.17 5 / 0.30)' },
  { id: 'violet',  label: 'Soft Violet',   hex: '#A78BFA', oklch: 'oklch(0.72 0.17 290)', glow: 'oklch(0.72 0.17 290 / 0.30)' },
  { id: 'blue',    label: 'Sky Blue',      hex: '#60A5FA', oklch: 'oklch(0.70 0.17 240)', glow: 'oklch(0.70 0.17 240 / 0.30)' },
  { id: 'teal',    label: 'Warm Teal',     hex: '#2DD4BF', oklch: 'oklch(0.75 0.15 185)', glow: 'oklch(0.75 0.15 185 / 0.30)' },
  { id: 'emerald', label: 'Emerald',       hex: '#34D399', oklch: 'oklch(0.75 0.17 160)', glow: 'oklch(0.75 0.17 160 / 0.30)' },
  { id: 'copper',  label: 'Copper',        hex: '#CD7F32', oklch: 'oklch(0.62 0.12 55)',  glow: 'oklch(0.62 0.12 55 / 0.30)' },
] as const;

export const BACKGROUND_OPTIONS = [
  { id: 'warm-dusk',   label: 'Warm Dusk',    hex: '#2A2520', hue: 55,  chroma: 0.010, base: 0.18 },
  { id: 'cool-slate',  label: 'Cool Slate',   hex: '#1E2228', hue: 240, chroma: 0.012, base: 0.18 },
  { id: 'deep-ocean',  label: 'Deep Ocean',   hex: '#1A2230', hue: 230, chroma: 0.018, base: 0.17 },
  { id: 'midnight',    label: 'Midnight',     hex: '#1A1A1E', hue: 280, chroma: 0.006, base: 0.16 },
  { id: 'volcanic',    label: 'Volcanic',     hex: '#2A1F1A', hue: 30,  chroma: 0.014, base: 0.18 },
  { id: 'forest',      label: 'Forest',       hex: '#1A2520', hue: 155, chroma: 0.012, base: 0.17 },
  { id: 'graphite',    label: 'Graphite',     hex: '#222222', hue: 0,   chroma: 0.000, base: 0.17 },
  { id: 'amoled',      label: 'AMOLED Black', hex: '#000000', hue: 0,   chroma: 0.000, base: 0.05 },
] as const;

export const FONT_OPTIONS = [
  { id: 'figtree',   label: 'Figtree',            family: "'Figtree', sans-serif",            googleParam: 'Figtree:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400' },
  { id: 'jakarta',   label: 'Plus Jakarta Sans',  family: "'Plus Jakarta Sans', sans-serif",  googleParam: 'Plus+Jakarta+Sans:wght@400;500;600;700' },
  { id: 'nunito',    label: 'Nunito',             family: "'Nunito', sans-serif",             googleParam: 'Nunito:wght@400;500;600;700' },
  { id: 'manrope',   label: 'Manrope',            family: "'Manrope', sans-serif",            googleParam: 'Manrope:wght@400;500;600;700' },
  { id: 'raleway',   label: 'Raleway',            family: "'Raleway', sans-serif",            googleParam: 'Raleway:wght@400;500;600;700' },
  { id: 'rubik',     label: 'Rubik',              family: "'Rubik', sans-serif",              googleParam: 'Rubik:wght@400;500;600;700' },
  { id: 'poppins',   label: 'Poppins',            family: "'Poppins', sans-serif",            googleParam: 'Poppins:wght@400;500;600;700' },
  { id: 'quicksand', label: 'Quicksand',          family: "'Quicksand', sans-serif",          googleParam: 'Quicksand:wght@400;500;600;700' },
] as const;

interface DesignThemeContextType {
  accent: string;
  font: string;
  background: string;
  setAccent: (id: string) => void;
  setFont: (id: string) => void;
  setBackground: (id: string) => void;
}

const DesignThemeContext = createContext<DesignThemeContextType>({
  accent: 'orange',
  font: 'figtree',
  background: 'warm-dusk',
  setAccent: () => {},
  setFont: () => {},
  setBackground: () => {},
});

function applyAccent(id: string) {
  const option = ACCENT_OPTIONS.find(o => o.id === id) || ACCENT_OPTIONS[0];
  const root = document.documentElement;
  root.style.setProperty('--brand', option.oklch);
  root.style.setProperty('--brand-dim', option.oklch.replace(')', ' / 0.15)'));
  root.style.setProperty('--brand-glow', option.glow);
  root.style.setProperty('--primary', option.oklch);
  root.style.setProperty('--ring', option.oklch.replace(')', ' / 0.5)'));
  root.style.setProperty('--sidebar-primary', option.oklch);
}

function applyFont(id: string) {
  const option = FONT_OPTIONS.find(o => o.id === id) || FONT_OPTIONS[0];
  const root = document.documentElement;
  root.style.setProperty('--font-display', option.family);
  root.style.setProperty('--font-body', option.family);

  // Load Google Font if not already loaded
  const linkId = `google-font-${id}`;
  if (!document.getElementById(linkId) && id !== 'figtree') {
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${option.googleParam}&display=swap`;
    document.head.appendChild(link);
  }
}

function applyBackground(id: string) {
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

  // Sidebar
  root.style.setProperty('--sidebar-background', oklch(l - 0.02, c));
  root.style.setProperty('--sidebar-foreground', oklch(0.94, Math.min(c, 0.010)));
  root.style.setProperty('--sidebar-border', oklch(l + 0.10, c + 0.004));
  root.style.setProperty('--sidebar-accent', oklch(l + 0.09, c + 0.004));
  root.style.setProperty('--sidebar-accent-foreground', oklch(0.94, Math.min(c, 0.010)));

  // Color aliases
  root.style.setProperty('--color-background', `var(--background)`);
  root.style.setProperty('--color-surface-1', `var(--surface-1)`);
  root.style.setProperty('--color-surface-2', `var(--surface-2)`);
  root.style.setProperty('--color-surface-3', `var(--surface-3)`);
}

export function DesignThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState('orange');
  const [font, setFontState] = useState('figtree');
  const [background, setBackgroundState] = useState('warm-dusk');

  useEffect(() => {
    const savedAccent = localStorage.getItem('design-accent') || 'orange';
    const savedFont = localStorage.getItem('design-font') || 'figtree';
    const savedBg = localStorage.getItem('design-background') || 'warm-dusk';
    setAccentState(savedAccent);
    setFontState(savedFont);
    setBackgroundState(savedBg);
    applyAccent(savedAccent);
    applyFont(savedFont);
    if (savedBg !== 'warm-dusk') applyBackground(savedBg);
  }, []);

  const setAccent = (id: string) => {
    setAccentState(id);
    localStorage.setItem('design-accent', id);
    applyAccent(id);
  };

  const setFont = (id: string) => {
    setFontState(id);
    localStorage.setItem('design-font', id);
    applyFont(id);
  };

  const setBackground = (id: string) => {
    setBackgroundState(id);
    localStorage.setItem('design-background', id);
    applyBackground(id);
  };

  return (
    <DesignThemeContext.Provider value={{ accent, font, background, setAccent, setFont, setBackground }}>
      {children}
    </DesignThemeContext.Provider>
  );
}

export function useDesignTheme() {
  return useContext(DesignThemeContext);
}
