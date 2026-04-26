'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SurfaceTab {
  id: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  count?: number;
}

interface Props {
  title: string;
  subtitle?: string;
  brandIcon?: ReactNode;
  rightSlot?: ReactNode;
  hero?: ReactNode;
  tabs?: SurfaceTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  containerClassName?: string;
  children: ReactNode;
}

// Page-level chrome that sits below the dashboard layout's sidebar + header.
// Provides the LH-Fitness language for any surface inside (dashboard)/*:
// glassmorphic sticky page header, optional brand badge, optional sub-tabs,
// optional hero slot, consistent max-width + responsive padding.
export default function DashboardSurface({
  title,
  subtitle,
  brandIcon,
  rightSlot,
  hero,
  tabs,
  activeTab,
  onTabChange,
  containerClassName,
  children,
}: Props) {
  return (
    <div className="flex flex-col">
      <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {brandIcon && (
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-[0_0_14px_var(--brand-glow)] shrink-0">
                <span className="text-primary-foreground [&>svg]:w-3.5 [&>svg]:h-3.5">{brandIcon}</span>
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-bold tracking-tight text-foreground text-lg sm:text-xl truncate">{title}</h1>
              {subtitle && <p className="text-muted-foreground text-xs sm:text-sm truncate">{subtitle}</p>}
            </div>
          </div>
          {rightSlot && <div className="shrink-0">{rightSlot}</div>}
        </div>

        {tabs && tabs.length > 0 && (
          <nav className="max-w-6xl mx-auto px-4 sm:px-6 -mt-1 pb-2 flex items-center gap-1 overflow-x-auto scrollbar-hidden">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange?.(tab.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors shrink-0',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                >
                  {Icon && <Icon size={14} />}
                  {tab.label}
                  {typeof tab.count === 'number' && (
                    <span className={cn(
                      'text-[10px] tabular-nums px-1.5 rounded-full',
                      active ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'
                    )}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        )}
      </header>

      <main className="flex-1">
        <div className={cn('max-w-6xl mx-auto px-4 sm:px-6 pt-6', containerClassName)}>
          {hero && <div className="mb-8">{hero}</div>}
          {children}
        </div>
      </main>
    </div>
  );
}
