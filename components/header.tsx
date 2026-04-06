'use client';

import { UserButton } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/chat': 'Chat',
  '/todos': 'To-Do',
  '/calendar': 'Calendar',
  '/diagrams': 'Diagrams',
  '/documents': 'Documents',
  '/workflows': 'Workflows',
  '/whiteboard': 'Whiteboard',
  '/credits': 'AI Credits',
  '/kb': 'Knowledge Base',
  '/vault': 'Vault',
  '/settings': 'General',
  '/settings/theme': 'Theme & Colours',
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
    <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden text-gray-500 hover:text-white transition-colors"
        >
          <Menu size={20} />
        </button>
        <p className="text-white text-sm font-medium">{title}</p>
      </div>
      <UserButton />
    </header>
  );
}
