'use client';

import { UserButton } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/chat': 'Chat',
  '/todos': 'To-Do',
  '/diagrams': 'Diagrams',
  '/documents': 'Documents',
  '/workflows': 'Workflows',
  '/whiteboard': 'Whiteboard',
  '/kb': 'Knowledge Base',
  '/vault': 'Vault',
  '/settings': 'Settings',
};

interface HeaderProps {
  onMenuToggle?: () => void;
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const pathname = usePathname();
  const title =
    pageTitles[pathname] ??
    Object.entries(pageTitles).find(([k]) => k !== '/' && pathname.startsWith(k))?.[1] ??
    'Dashboard';

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 sm:px-6 shrink-0">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden text-gray-400 hover:text-white transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
        </button>
        <p className="text-white font-medium">{title}</p>
      </div>
      <UserButton />
    </header>
  );
}
