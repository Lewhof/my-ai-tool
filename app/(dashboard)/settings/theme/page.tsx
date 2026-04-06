'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface ThemeColors {
  primary: string;
  primaryLight: string;
  accent: string;
  accentHover: string;
  surface: string;
  surfaceLight: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
}

interface Preset {
  name: string;
  dot1: string;
  dot2: string;
  colors: ThemeColors;
}

const PRESETS: Preset[] = [
  {
    name: 'Signal Orange',
    dot1: '#ea580c',
    dot2: '#0d1b2a',
    colors: {
      primary: '#0d1b2a',
      primaryLight: '#122236',
      accent: '#ea580c',
      accentHover: '#c44a0a',
      surface: '#122236',
      surfaceLight: '#1b2b3d',
      border: '#1b2b3d',
      textPrimary: '#f1f5f9',
      textSecondary: '#64748b',
    },
  },
  {
    name: 'Precision Red',
    dot1: '#dc2626',
    dot2: '#0f0f1a',
    colors: {
      primary: '#0f0f1a',
      primaryLight: '#1a1a2e',
      accent: '#dc2626',
      accentHover: '#b91c1c',
      surface: '#1a1a2e',
      surfaceLight: '#252540',
      border: '#252540',
      textPrimary: '#f1f5f9',
      textSecondary: '#64748b',
    },
  },
  {
    name: 'Electric Blue',
    dot1: '#3b82f6',
    dot2: '#0a0f1a',
    colors: {
      primary: '#0a0f1a',
      primaryLight: '#111827',
      accent: '#3b82f6',
      accentHover: '#2563eb',
      surface: '#111827',
      surfaceLight: '#1e293b',
      border: '#1e293b',
      textPrimary: '#f1f5f9',
      textSecondary: '#64748b',
    },
  },
  {
    name: 'Volt Green',
    dot1: '#22c55e',
    dot2: '#0a1a0f',
    colors: {
      primary: '#0a1a0f',
      primaryLight: '#0f2918',
      accent: '#22c55e',
      accentHover: '#16a34a',
      surface: '#0f2918',
      surfaceLight: '#1a3d25',
      border: '#1a3d25',
      textPrimary: '#f1f5f9',
      textSecondary: '#64748b',
    },
  },
  {
    name: 'Titanium Gold',
    dot1: '#eab308',
    dot2: '#1a1506',
    colors: {
      primary: '#1a1506',
      primaryLight: '#25200c',
      accent: '#eab308',
      accentHover: '#ca9a06',
      surface: '#25200c',
      surfaceLight: '#332d14',
      border: '#332d14',
      textPrimary: '#f1f5f9',
      textSecondary: '#64748b',
    },
  },
  {
    name: 'Night Ride',
    dot1: '#6366f1',
    dot2: '#0c0c14',
    colors: {
      primary: '#0c0c14',
      primaryLight: '#151921',
      accent: '#6366f1',
      accentHover: '#4f46e5',
      surface: '#151921',
      surfaceLight: '#1e2330',
      border: '#1e2330',
      textPrimary: '#f1f5f9',
      textSecondary: '#64748b',
    },
  },
];

interface ColorRowProps {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorRow({ label, description, value, onChange }: ColorRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-700/50 last:border-0">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg border border-gray-700"
          style={{ backgroundColor: value }}
        />
        <div>
          <p className="text-white text-sm font-medium">{label}</p>
          <p className="text-gray-500 text-xs">{description}</p>
        </div>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-accent-600"
      />
    </div>
  );
}

export default function ThemePage() {
  const [colors, setColors] = useState<ThemeColors>(PRESETS[0].colors);
  const [activePreset, setActivePreset] = useState('Signal Orange');
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load saved theme
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data?.theme_colors) {
          try {
            const parsed = typeof data.theme_colors === 'string'
              ? JSON.parse(data.theme_colors)
              : data.theme_colors;
            setColors(parsed);
            // Find matching preset
            const match = PRESETS.find((p) => p.colors.accent === parsed.accent);
            if (match) setActivePreset(match.name);
            else setActivePreset('');
          } catch { /* use default */ }
        }
      });
  }, []);

  // Apply preview
  useEffect(() => {
    if (!preview) return;
    const root = document.documentElement;
    root.style.setProperty('--color-gray-900', colors.primary);
    root.style.setProperty('--color-gray-800', colors.surface);
    root.style.setProperty('--color-gray-700', colors.border);
    root.style.setProperty('--color-gray-950', colors.primary);
    root.style.setProperty('--color-accent-600', colors.accent);
    root.style.setProperty('--color-accent-700', colors.accentHover);
    root.style.setProperty('--color-accent-500', colors.accent);
    root.style.setProperty('--color-accent-400', colors.accent);
    return () => {
      // Reset on unmount if not saved
      root.style.removeProperty('--color-gray-900');
      root.style.removeProperty('--color-gray-800');
      root.style.removeProperty('--color-gray-700');
      root.style.removeProperty('--color-gray-950');
      root.style.removeProperty('--color-accent-600');
      root.style.removeProperty('--color-accent-700');
      root.style.removeProperty('--color-accent-500');
      root.style.removeProperty('--color-accent-400');
    };
  }, [preview, colors]);

  const applyPreset = (preset: Preset) => {
    setColors(preset.colors);
    setActivePreset(preset.name);
  };

  const updateColor = (key: keyof ThemeColors, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
    setActivePreset('');
  };

  const saveTheme = async () => {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme_colors: colors }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Theme & Colours</h2>
          <p className="text-gray-500 text-sm mt-1">Customise the colour scheme. Changes go live instantly on save.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPreview(!preview)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
              preview
                ? 'bg-accent-600 text-white border-accent-600'
                : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-600'
            )}
          >
            {preview ? 'Preview On' : 'Preview Off'}
          </button>
          <button
            onClick={saveTheme}
            className="bg-accent-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-accent-700 transition-colors"
          >
            {saved ? 'Saved!' : 'Save & Apply'}
          </button>
        </div>
      </div>

      {/* Quick Presets */}
      <div>
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest mb-3">Quick Presets</p>
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                activePreset === preset.name
                  ? 'bg-gray-800 border-accent-600 text-white'
                  : 'bg-transparent border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
              )}
            >
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.dot1 }} />
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.dot2 }} />
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Primary */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded" style={{ backgroundColor: colors.primary }} />
            <div>
              <p className="text-white font-semibold text-sm">Primary <span className="text-gray-500 font-normal">Nav · Header · Backgrounds</span></p>
              <p className="text-gray-500 text-xs">Used for the sidebar, header, and page backgrounds</p>
            </div>
          </div>
        </div>
        <div className="px-5">
          <ColorRow label="Night Ride (nav / bg)" description="Dark background for nav & main areas" value={colors.primary} onChange={(v) => updateColor('primary', v)} />
          <ColorRow label="Surface" description="Cards, panels, elevated surfaces" value={colors.surface} onChange={(v) => updateColor('surface', v)} />
          <ColorRow label="Surface Light" description="Hover states, secondary surfaces" value={colors.surfaceLight} onChange={(v) => updateColor('surfaceLight', v)} />
          <ColorRow label="Border" description="Dividers, card borders" value={colors.border} onChange={(v) => updateColor('border', v)} />
        </div>
      </div>

      {/* Accent */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded" style={{ backgroundColor: colors.accent }} />
            <div>
              <p className="text-white font-semibold text-sm">Accent <span className="text-gray-500 font-normal">CTA · Buttons · Active states</span></p>
              <p className="text-gray-500 text-xs">The pop colour — used for buttons, active nav links, badges</p>
            </div>
          </div>
        </div>
        <div className="px-5">
          <ColorRow label="Accent colour" description="Buttons, active states, badges" value={colors.accent} onChange={(v) => updateColor('accent', v)} />
          <ColorRow label="Accent hover" description="Hover state for buttons" value={colors.accentHover} onChange={(v) => updateColor('accentHover', v)} />
        </div>
      </div>

      {/* Text */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded border border-gray-700" style={{ backgroundColor: colors.textPrimary }} />
            <div>
              <p className="text-white font-semibold text-sm">Text <span className="text-gray-500 font-normal">Headings · Body · Muted</span></p>
              <p className="text-gray-500 text-xs">Typography colours across the app</p>
            </div>
          </div>
        </div>
        <div className="px-5">
          <ColorRow label="Primary text" description="Headings, body text" value={colors.textPrimary} onChange={(v) => updateColor('textPrimary', v)} />
          <ColorRow label="Secondary text" description="Descriptions, labels, muted text" value={colors.textSecondary} onChange={(v) => updateColor('textSecondary', v)} />
        </div>
      </div>
    </div>
  );
}
