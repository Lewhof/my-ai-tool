'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  CheckSquare,
  MessageSquare,
  GitFork,
  FileText,
  Zap,
  ClipboardList,
  BookOpen,
  KeyRound,
  Settings,
} from 'lucide-react';

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'To-Do', href: '/todos', icon: CheckSquare },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Diagrams', href: '/diagrams', icon: GitFork },
  { name: 'Documents', href: '/documents', icon: FileText },
  { name: 'Workflows', href: '/workflows', icon: Zap },
  { name: 'Whiteboard', href: '/whiteboard', icon: ClipboardList },
  { name: 'Knowledge Base', href: '/kb', icon: BookOpen },
  { name: 'Vault', href: '/vault', icon: KeyRound },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'bg-gray-900 border-r border-gray-800 flex flex-col z-50',
          'hidden lg:flex lg:w-56 lg:relative',
          mobileOpen && 'fixed inset-y-0 left-0 w-56 flex lg:hidden'
        )}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white tracking-tight">Lewhof AI</h1>
          <button
            onClick={onClose}
            className="lg:hidden text-gray-500 hover:text-white transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-auto">
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                )}
              >
                <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                <span className={cn('font-medium', isActive && 'text-indigo-300')}>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
