'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', href: '/', icon: '\u{1F4CA}' },
  { name: 'Chat', href: '/chat', icon: '\u{1F4AC}' },
  { name: 'Documents', href: '/documents', icon: '\u{1F4C4}' },
  { name: 'Workflows', href: '/workflows', icon: '\u{26A1}' },
  { name: 'Settings', href: '/settings', icon: '\u{2699}\u{FE0F}' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
      <div className="h-14 flex items-center justify-center border-b border-gray-700">
        <h1 className="text-xl font-bold text-white">Lewhof AI</h1>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
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
  );
}
