'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Bot, CheckSquare, FileText, Menu, X,
  MessageSquare, Calendar, Mail, StickyNote, GitFork, Zap,
  ClipboardList, BookOpen, KeyRound, Settings, CreditCard,
  Globe, Focus, Image as ImageIcon,
} from 'lucide-react';

const TABS = [
  { name: 'Home', href: '/', icon: LayoutDashboard },
  { name: 'Cerebro', href: '/agent', icon: Bot },
  { name: 'Tasks', href: '/todos', icon: CheckSquare },
  { name: 'Docs', href: '/documents', icon: FileText },
  { name: 'More', href: '#more', icon: Menu },
];

const MORE_ITEMS = [
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Email', href: '/email', icon: Mail },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Notes', href: '/notes', icon: StickyNote },
  { name: 'Focus', href: '/focus', icon: Focus },
  { name: 'Diagrams', href: '/diagrams', icon: GitFork },
  { name: 'Image Lab', href: '/images', icon: ImageIcon },
  { name: 'Workflows', href: '/workflows', icon: Zap },
  { name: 'Whiteboard', href: '/whiteboard', icon: ClipboardList },
  { name: 'Social', href: '/social', icon: Globe },
  { name: 'AI Credits', href: '/credits', icon: CreditCard },
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
      {/* More drawer */}
      {showMore && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setShowMore(false)} />
          <div className="fixed bottom-16 left-0 right-0 bg-gray-900 border-t border-gray-700 rounded-t-2xl z-50 lg:hidden max-h-[70vh] overflow-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 sticky top-0 bg-gray-900">
              <h3 className="text-white font-semibold text-sm">All Features</h3>
              <button onClick={() => setShowMore(false)} className="text-gray-500 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1 p-3">
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-3 rounded-xl transition-colors',
                      active ? 'bg-accent-600/15 text-accent-400' : 'text-gray-400 hover:bg-gray-800'
                    )}
                  >
                    <Icon size={20} />
                    <span className="text-[10px] font-medium">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 z-30 lg:hidden safe-bottom">
        <div className="flex items-center justify-around h-16">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isMoreTab = tab.href === '#more';
            const active = isMoreTab ? showMore : isActive(tab.href);

            if (isMoreTab) {
              return (
                <button
                  key={tab.name}
                  onClick={() => setShowMore(!showMore)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-1 px-3 transition-colors',
                    active ? 'text-accent-400' : 'text-gray-500'
                  )}
                >
                  <Icon size={22} />
                  <span className="text-[10px] font-medium">{tab.name}</span>
                </button>
              );
            }

            return (
              <Link
                key={tab.name}
                href={tab.href}
                onClick={() => setShowMore(false)}
                className={cn(
                  'flex flex-col items-center gap-1 py-1 px-3 transition-colors',
                  active ? 'text-accent-400' : 'text-gray-500'
                )}
              >
                <Icon size={22} />
                <span className="text-[10px] font-medium">{tab.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
