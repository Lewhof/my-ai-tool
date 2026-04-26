'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
}

// Gradient hero pattern from app/lhfitness/today.tsx — primary tint + blurred
// circle overlay on a card-toned base. The single most-recognised LH-Fitness motif.
export function HeroGradient({ eyebrow, title, subtitle, children, className }: Props) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8',
        className
      )}
    >
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
      <div className="relative">
        {eyebrow && <p className="text-muted-foreground text-sm">{eyebrow}</p>}
        <h2 className="text-3xl sm:text-4xl font-bold mt-1 text-foreground tracking-tight">{title}</h2>
        {subtitle && <p className="text-muted-foreground text-sm mt-2 max-w-lg">{subtitle}</p>}
        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  );
}
