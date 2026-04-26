'use client';

import { type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  icon: ReactNode;
  label: string;
  sub?: string;
  onClick?: () => void;
  href?: string;
  showArrow?: boolean;
}

// Quick-action tile pattern from app/lhfitness/today.tsx. Keeps the
// "icon + label + sub" rhythm the rest of the dashboard should follow.
export function ActionTile({ icon, label, sub, onClick, href, showArrow }: Props) {
  const className = cn(
    'bg-card hover:bg-card/80 border border-border hover:border-primary/40',
    'rounded-xl p-4 text-left transition-all group block w-full'
  );
  const inner = (
    <>
      <div className="flex items-start justify-between mb-2">
        <div>{icon}</div>
        {showArrow && <ArrowRight size={14} className="text-muted-foreground/60 group-hover:text-primary transition-colors" />}
      </div>
      <p className="text-foreground font-bold text-sm">{label}</p>
      {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
    </>
  );

  if (href) return <a href={href} className={className}>{inner}</a>;
  return <button onClick={onClick} className={className}>{inner}</button>;
}
