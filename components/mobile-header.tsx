'use client';

import { useState, useEffect } from 'react';
import { UserButton } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import { Bell, Search } from 'lucide-react';
import { toast } from 'sonner';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/agent': 'Cerebro',
  '/chat': 'Chat',
  '/todos': 'Tasks',
  '/email': 'Email',
  '/calendar': 'Calendar',
  '/focus': 'Focus',
  '/notes': 'Notes',
  '/documents': 'Documents',
  '/diagrams': 'Diagrams',
  '/images': 'Image Lab',
  '/workflows': 'Workflows',
  '/whiteboard': 'Whiteboard',
  '/social': 'Social Hub',
  '/credits': 'AI Credits',
  '/kb': 'Knowledge Base',
  '/vault': 'Vault',
  '/settings': 'Settings',
  '/agents': 'Agents',
};

export default function MobileHeader() {
  const pathname = usePathname();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const title =
    pageTitles[pathname] ??
    Object.entries(pageTitles).find(([k]) => k !== '/' && pathname.startsWith(k))?.[1] ??
    'Lewhof AI';

  const timeStr = now?.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <header
      className="sticky top-0 z-20 border-b border-border lg:hidden safe-top"
      style={{ background: 'var(--color-sidebar)' }}
    >
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center cerebro-pulse"
            style={{ background: 'var(--color-brand)' }}
          >
            <span className="text-white text-xs font-bold font-mono">L</span>
          </div>
          <p className="text-[15px] font-semibold text-foreground">{title}</p>
          {now && (
            <span className="text-[11px] font-mono text-muted-foreground ml-1">{timeStr}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          >
            <Search size={16} />
          </button>
          <button
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors relative"
            onClick={() => toast('Notifications — coming soon')}
          >
            <Bell size={16} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full status-dot-orange" />
          </button>
          <UserButton />
        </div>
      </div>
    </header>
  );
}
