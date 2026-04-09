'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import {
  LayoutDashboard, Bot, CheckSquare, FileText,
  Calendar, CalendarDays, Mail, KeyRound, Settings, MessageSquare,
  Zap, BookOpen, Image as ImageIcon, Focus, StickyNote, GitFork,
  ClipboardList, CreditCard, ChevronLeft, ChevronRight, Globe,
  Wallet, Target, Brain,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SIDEBAR_GROUPS = [
  {
    label: 'Home',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Cerebro', href: '/agent', icon: Bot, isBrand: true },
      { name: 'Social', href: '/social', icon: Globe },
    ],
  },
  {
    label: 'Productivity',
    items: [
      { name: 'Planner', href: '/planner', icon: CalendarDays },
      { name: 'Tasks', href: '/todos', icon: CheckSquare },
      { name: 'Calendar', href: '/calendar', icon: Calendar },
      { name: 'Email', href: '/email', icon: Mail },
      { name: 'Chat', href: '/chat', icon: MessageSquare },
      { name: 'Notes', href: '/notes', icon: StickyNote },
      { name: 'Documents', href: '/documents', icon: FileText },
      { name: 'Focus', href: '/focus', icon: Focus },
    ],
  },
  {
    label: 'Life',
    items: [
      { name: 'Finance', href: '/finance', icon: Wallet },
      { name: 'Goals', href: '/goals', icon: Target },
      { name: 'Mind Library', href: '/mind', icon: Brain },
    ],
  },
  {
    label: 'Build',
    items: [
      { name: 'Diagrams', href: '/diagrams', icon: GitFork },
      { name: 'Image Lab', href: '/images', icon: ImageIcon },
      { name: 'Workflows', href: '/workflows', icon: Zap },
      { name: 'Whiteboard', href: '/whiteboard', icon: ClipboardList },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'Vault', href: '/vault', icon: KeyRound },
      { name: 'Knowledge Base', href: '/kb', icon: BookOpen },
      { name: 'AI Credits', href: '/credits', icon: CreditCard },
      { name: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col border-r border-border transition-all duration-300 ease-in-out shrink-0',
        collapsed ? 'w-16' : 'w-60'
      )}
      style={{ background: 'var(--color-sidebar)' }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 cerebro-pulse"
              style={{ background: 'var(--color-brand)' }}
            >
              <span className="text-white text-xs font-bold font-mono">L</span>
            </div>
            <span className="text-sm font-semibold text-foreground truncate" style={{ fontFamily: 'var(--font-display)' }}>
              Lewhof AI
            </span>
          </div>
        )}
        {collapsed && (
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto cerebro-pulse"
            style={{ background: 'var(--color-brand)' }}
          >
            <span className="text-white text-xs font-bold font-mono">L</span>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center justify-center h-8 mt-2 mx-2 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                      collapsed ? 'justify-center' : '',
                      active
                        ? 'text-white'
                        : 'text-muted-foreground hover:text-foreground hover:bg-surface-2'
                    )}
                    style={active ? {
                      background: (item as { isBrand?: boolean }).isBrand
                        ? 'var(--color-brand)'
                        : 'var(--color-brand-dim)',
                      color: (item as { isBrand?: boolean }).isBrand ? 'white' : 'var(--color-brand)',
                    } : {}}
                    title={collapsed ? item.name : undefined}
                  >
                    <Icon size={16} strokeWidth={active ? 2 : 1.5} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      {!collapsed && (
        <div className="border-t border-border p-3 shrink-0">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <UserButton />
          </div>
        </div>
      )}
    </aside>
  );
}
