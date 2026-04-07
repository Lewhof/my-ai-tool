'use client';

import { UserButton } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/agent': 'Cerebro',
  '/chat': 'Chat',
  '/todos': 'To-Do',
  '/email': 'Email',
  '/calendar': 'Calendar',
  '/focus': 'Focus',
  '/notes': 'Notes',
  '/documents': 'Documents',
  '/diagrams': 'Diagrams',
  '/images': 'Image Lab',
  '/workflows': 'Workflows',
  '/whiteboard': 'Whiteboard',
  '/social': 'Social',
  '/credits': 'AI Credits',
  '/kb': 'Knowledge Base',
  '/vault': 'Vault',
  '/settings': 'Settings',
  '/agents': 'Agents',
};

export default function MobileHeader() {
  const pathname = usePathname();
  const title =
    pageTitles[pathname] ??
    Object.entries(pageTitles).find(([k]) => k !== '/' && pathname.startsWith(k))?.[1] ??
    'Lewhof AI';

  return (
    <header className="sticky top-0 z-20 bg-gray-900 border-b border-gray-800 lg:hidden safe-top">
      <div className="flex items-center justify-between px-4 h-12">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-accent-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">L</span>
          </div>
          <p className="text-white text-sm font-semibold">{title}</p>
        </div>
        <UserButton />
      </div>
    </header>
  );
}
