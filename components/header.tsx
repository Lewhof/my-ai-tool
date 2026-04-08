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
  '/agents': 'Agents',
  '/diagrams': 'Diagrams',
  '/images': 'Image Lab',
  '/notes': 'Notes',
  '/documents': 'Documents',
  '/workflows': 'Workflows',
  '/whiteboard': 'Whiteboard',
  '/social': 'Social Hub',
  '/credits': 'AI Credits',
  '/kb': 'Knowledge Base',
  '/vault': 'Vault',
  '/settings': 'Settings',
  '/settings/connections': 'Connections',
  '/settings/ai': 'AI & Models',
  '/settings/documents': 'Documents',
  '/settings/theme': 'Theme & Colours',
  '/settings/privacy': 'Privacy',
  '/focus': 'Focus Mode',
};

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function Header() {
  const pathname = usePathname();
  const now = useClock();
  const title =
    pageTitles[pathname] ??
    Object.entries(pageTitles).find(([k]) => k !== '/' && pathname.startsWith(k))?.[1] ??
    'Dashboard';

  const timeStr = now?.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = now?.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <header
      className="h-14 border-b border-border hidden lg:flex items-center justify-between px-4 shrink-0"
      style={{ background: 'var(--color-sidebar)' }}
    >
      <h1 className="text-[15px] font-semibold text-foreground">{title}</h1>
      <div className="flex items-center gap-3">
        {/* Clock */}
        {now && (
          <div className="flex items-center gap-2 mr-1">
            <span className="text-[13px] font-mono font-medium text-foreground">{timeStr}</span>
            <span className="text-[11px] text-muted-foreground">{dateStr}</span>
          </div>
        )}
        <div className="w-px h-5 bg-border" />
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
    </header>
  );
}
