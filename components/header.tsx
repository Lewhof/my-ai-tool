'use client';

import { UserButton } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/chat': 'Chat',
  '/documents': 'Documents',
  '/workflows': 'Workflows',
  '/whiteboard': 'Whiteboard',
  '/vault': 'Vault',
  '/settings': 'Settings',
};

export default function Header() {
  const pathname = usePathname();
  const title =
    pageTitles[pathname] ??
    Object.entries(pageTitles).find(([k]) => k !== '/' && pathname.startsWith(k))?.[1] ??
    'Dashboard';

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
      <p className="text-white font-medium">{title}</p>
      <UserButton />
    </header>
  );
}
