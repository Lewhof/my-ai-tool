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
  setAccent: (id: string) => void;
  setFont: (id: string) => void;
}

const DesignThemeContext = createContext<DesignThemeContextType>({
  accent: 'orange',
  font: 'figtree',
  setAccent: () => {},
  setFont: () => {},
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

export function DesignThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState('orange');
  const [font, setFontState] = useState('figtree');

  useEffect(() => {
    const savedAccent = localStorage.getItem('design-accent') || 'orange';
    const savedFont = localStorage.getItem('design-font') || 'figtree';
    setAccentState(savedAccent);
    setFontState(savedFont);
    applyAccent(savedAccent);
    applyFont(savedFont);
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

  return (
    <DesignThemeContext.Provider value={{ accent, font, setAccent, setFont }}>
      {children}
    </DesignThemeContext.Provider>
  );
}

export function useDesignTheme() {
  return useContext(DesignThemeContext);
}
