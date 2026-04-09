'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { User, Link2, Bot, FileText, Palette, Shield, Zap, BarChart3 } from 'lucide-react';

const SECTIONS = [
  { id: '/settings', label: 'General', icon: User },
  { id: '/settings/connections', label: 'Connections', icon: Link2 },
  { id: '/settings/capture', label: 'Capture', icon: Zap },
  { id: '/settings/ai', label: 'AI & Models', icon: Bot },
  { id: '/settings/analytics', label: 'Website Analytics', icon: BarChart3 },
  { id: '/settings/documents', label: 'Documents', icon: FileText },
  { id: '/settings/theme', label: 'Appearance', icon: Palette },
  { id: '/settings/privacy', label: 'Privacy', icon: Shield },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/settings') return pathname === '/settings';
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <div className="w-48 border-r border-border flex-col shrink-0 hidden sm:flex overflow-y-auto" style={{ background: 'var(--color-surface-1)' }}>
        <div className="py-3">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = isActive(s.id);
            return (
              <Link
                key={s.id}
                href={s.id}
                className={cn(
                  'w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors',
                  active ? '' : 'text-muted-foreground hover:text-foreground hover:bg-surface-2'
                )}
                style={active ? { background: 'var(--color-brand-dim)', color: 'var(--color-brand)' } : {}}
              >
                <Icon size={14} />
                <span>{s.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="sm:hidden flex overflow-x-auto border-b border-border shrink-0 absolute top-14 left-0 right-0 z-10" style={{ background: 'var(--color-surface-1)' }}>
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            href={s.id}
            className={cn(
              'px-4 py-2.5 text-[12px] font-medium whitespace-nowrap border-b-2 transition-colors shrink-0',
              isActive(s.id) ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
            )}
            style={isActive(s.id) ? { borderColor: 'var(--color-brand)', color: 'var(--color-brand)' } : {}}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
