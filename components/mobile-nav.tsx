'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Bot, CheckSquare, FileText, MoreHorizontal, X,
  MessageSquare, Calendar, CalendarDays, Mail, StickyNote, GitFork, Zap,
  ClipboardList, BookOpen, KeyRound, Settings, CreditCard,
  Globe, Focus, Image as ImageIcon, Wallet, Target, Brain, Activity, Sparkles,
  Dumbbell,
} from 'lucide-react';

const TABS = [
  { name: 'Home', href: '/', icon: LayoutDashboard },
  { name: 'Fitness', href: '/lhfitness', icon: Dumbbell },
  { name: 'Cerebro', href: '/cerebro', icon: Bot, isBrand: true },
  { name: 'Tasks', href: '/todos', icon: CheckSquare },
  { name: 'More', href: '#more', icon: MoreHorizontal },
];

const MORE_GRID = [
  { name: 'Today', href: '/today', icon: Sparkles },
  { name: 'Cerebro Brain', href: '/cerebro/brain', icon: Brain },
  { name: 'Planner', href: '/planner', icon: CalendarDays },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Docs', href: '/documents', icon: FileText },
  { name: 'Email', href: '/email', icon: Mail },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Notes', href: '/notes', icon: StickyNote },
  { name: 'Focus', href: '/focus', icon: Focus },
  { name: 'Diagrams', href: '/diagrams', icon: GitFork },
  { name: 'Image Lab', href: '/images', icon: ImageIcon },
  { name: 'Workflows', href: '/workflows', icon: Zap },
  { name: 'Whiteboard', href: '/whiteboard', icon: ClipboardList },
  { name: 'Wellness', href: '/wellness', icon: Activity },
  { name: 'Finance', href: '/finance', icon: Wallet },
  { name: 'Goals', href: '/goals', icon: Target },
  { name: 'Mind Library', href: '/mind', icon: Brain },
  { name: 'Social', href: '/social', icon: Globe },
  { name: 'AI & Stack', href: '/credits', icon: CreditCard },
  { name: 'Knowledge Base', href: '/kb', icon: BookOpen },
  { name: 'Vault', href: '/vault', icon: KeyRound },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* More overlay */}
      {showMore && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/60 z-40"
            onClick={() => setShowMore(false)}
          />
          <div
            className="lg:hidden fixed bottom-16 left-0 right-0 z-50 rounded-t-2xl border-t border-border overflow-hidden"
            style={{ background: 'var(--color-sidebar)' }}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">All Features</h3>
              <button onClick={() => setShowMore(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1 p-3 max-h-[55vh] overflow-y-auto">
              {MORE_GRID.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-3.5 rounded-xl transition-all duration-150',
                      active ? 'text-white' : 'text-muted-foreground hover:text-foreground hover:bg-surface-2'
                    )}
                    style={active ? { background: 'var(--color-brand-dim)', color: 'var(--color-brand)' } : {}}
                  >
                    <Icon size={20} strokeWidth={active ? 2 : 1.5} />
                    <span className="text-[10px] font-medium text-center leading-tight">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Bottom tab bar */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border safe-bottom"
        style={{ background: 'var(--color-sidebar)' }}
      >
        <div className="flex items-center justify-around h-16">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isMoreTab = tab.href === '#more';
            const active = isMoreTab ? showMore : isActive(tab.href);
            const isBrand = (tab as { isBrand?: boolean }).isBrand;

            if (isMoreTab) {
              return (
                <button
                  key={tab.name}
                  onClick={() => setShowMore(!showMore)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2 px-4 transition-colors min-w-0',
                    active ? 'text-foreground' : 'text-muted-foreground'
                  )}
                  style={active ? { color: 'var(--color-brand)' } : {}}
                >
                  <Icon size={22} strokeWidth={active ? 2 : 1.5} />
                  <span className="text-[10px] font-medium">{tab.name}</span>
                </button>
              );
            }

            if (isBrand) {
              return (
                <Link key={tab.name} href={tab.href} onClick={() => setShowMore(false)}>
                  <div className="flex flex-col items-center gap-1 py-1 px-2 transition-all">
                    <div
                      className={cn(
                        'w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200',
                        active ? 'scale-105' : 'scale-100'
                      )}
                      style={{
                        background: active ? 'var(--color-brand)' : 'var(--color-brand-dim)',
                        boxShadow: active ? '0 0 20px var(--color-brand-glow)' : 'none',
                      }}
                    >
                      <Icon size={22} strokeWidth={2} style={{ color: active ? 'white' : 'var(--color-brand)' }} />
                    </div>
                  </div>
                </Link>
              );
            }

            return (
              <Link
                key={tab.name}
                href={tab.href}
                onClick={() => setShowMore(false)}
                className={cn(
                  'flex flex-col items-center gap-1 py-2 px-4 transition-colors min-w-0',
                  active ? 'text-foreground' : 'text-muted-foreground'
                )}
                style={active ? { color: 'var(--color-brand)' } : {}}
              >
                <Icon size={22} strokeWidth={active ? 2 : 1.5} />
                <span className="text-[10px] font-medium">{tab.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
