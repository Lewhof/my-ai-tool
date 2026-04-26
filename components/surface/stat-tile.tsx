'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Color semantics extracted from app/lhfitness/today.tsx:
// flame=streak/energy, time=schedule, growth=progress, win=achievement, brand=primary action.
export type StatTone = 'flame' | 'time' | 'growth' | 'win' | 'brand' | 'neutral';

const TONE: Record<StatTone, { icon: string; ring: string; glow: string }> = {
  flame:   { icon: 'text-orange-400',  ring: 'border-orange-500/40',  glow: 'shadow-[0_0_20px_rgb(251_146_60_/_0.15)]' },
  time:    { icon: 'text-blue-400',    ring: 'border-blue-500/40',    glow: 'shadow-[0_0_20px_rgb(96_165_250_/_0.15)]' },
  growth:  { icon: 'text-emerald-400', ring: 'border-emerald-500/40', glow: 'shadow-[0_0_20px_rgb(52_211_153_/_0.15)]' },
  win:     { icon: 'text-yellow-400',  ring: 'border-yellow-500/40',  glow: 'shadow-[0_0_20px_rgb(250_204_21_/_0.15)]' },
  brand:   { icon: 'text-primary',     ring: 'border-primary/40',     glow: 'shadow-[0_0_20px_var(--brand-glow)]' },
  neutral: { icon: 'text-muted-foreground', ring: 'border-border',    glow: '' },
};

interface Props {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  tone?: StatTone;
  accent?: boolean;
  progress?: number;
  hint?: string;
  onClick?: () => void;
}

export function StatTile({ icon, label, value, unit, tone = 'neutral', accent, progress, hint, onClick }: Props) {
  const toneStyle = TONE[tone];
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={cn(
        'bg-card border rounded-xl p-4 relative overflow-hidden text-left w-full',
        accent ? `${toneStyle.ring} ${toneStyle.glow}` : 'border-border',
        onClick && 'hover:border-primary/40 transition-colors cursor-pointer'
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('shrink-0', toneStyle.icon)}>{icon}</span>
        <span className="text-muted-foreground text-xs uppercase tracking-wide truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <p className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums">{value}</p>
        {unit && <span className="text-muted-foreground text-xs">{unit}</span>}
      </div>
      {hint && <p className="text-muted-foreground text-[11px] mt-1 truncate">{hint}</p>}
      {progress !== undefined && (
        <div className="mt-2 h-1 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </Component>
  );
}
