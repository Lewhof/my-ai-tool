'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void } | { label: string; href: string };
  secondaryAction?: { label: string; onClick: () => void };
  className?: string;
}

// Standard empty state. Replace ad-hoc "no items" blocks across the dashboard.
export function EmptyState({ icon, title, description, action, secondaryAction, className }: Props) {
  return (
    <div className={cn('bg-card border border-border rounded-xl p-8 text-center', className)}>
      <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 text-muted-foreground/60 [&>svg]:w-6 [&>svg]:h-6">
        {icon}
      </div>
      <p className="text-foreground font-semibold">{title}</p>
      {description && <p className="text-muted-foreground text-sm mt-1 max-w-sm mx-auto">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {action && ('href' in action ? (
            <a
              href={action.href}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {action.label}
            </a>
          ) : (
            <button
              onClick={action.onClick}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {action.label}
            </button>
          ))}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-sm font-medium hover:text-foreground hover:bg-secondary transition-colors"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
