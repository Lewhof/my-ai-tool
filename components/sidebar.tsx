'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', href: '/', icon: '\u{1F4CA}' },
  { name: 'To-Do', href: '/todos', icon: '\u{2705}' },
  { name: 'Chat', href: '/chat', icon: '\u{1F4AC}' },
  { name: 'Diagrams', href: '/diagrams', icon: '\u{1F5D3}' },
  { name: 'Documents', href: '/documents', icon: '\u{1F4C4}' },
  { name: 'Workflows', href: '/workflows', icon: '\u{26A1}' },
  { name: 'Whiteboard', href: '/whiteboard', icon: '\u{1F4CB}' },
  { name: 'Vault', href: '/vault', icon: '\u{1F512}' },
  { name: 'Settings', href: '/settings', icon: '\u{2699}\u{FE0F}' },
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
          'bg-gray-800 border-r border-gray-700 flex flex-col z-50',
          // Desktop: static sidebar
          'hidden lg:flex lg:w-64 lg:relative',
          // Mobile: slide-in drawer
          mobileOpen && 'fixed inset-y-0 left-0 w-64 flex lg:hidden'
        )}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-white">Lewhof AI</h1>
          <button
            onClick={onClose}
            className="lg:hidden text-gray-400 hover:text-white transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-auto">
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                )}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
