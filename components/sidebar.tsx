'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Bot,
  CheckSquare,
  MessageSquare,
  CalendarDays,
  StickyNote,
  Mail,
  CreditCard,
  GitFork,
  FileText,
  Zap,
  ClipboardList,
  BookOpen,
  KeyRound,
  Settings,
  Palette,
  Globe,
  Link2,
  Brain,
  FolderCog,
  Image as ImageIcon,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Home',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Cerebro', href: '/agent', icon: Bot },
    ],
  },
  {
    label: 'Productivity',
    items: [
      { name: 'To-Do', href: '/todos', icon: CheckSquare },
      { name: 'Calendar', href: '/calendar', icon: CalendarDays },
      { name: 'Chat', href: '/chat', icon: MessageSquare },
      { name: 'Email', href: '/email', icon: Mail },
      { name: 'Notes', href: '/notes', icon: StickyNote },
      { name: 'Documents', href: '/documents', icon: FileText },
    ],
  },
  {
    label: 'Build',
    items: [
      { name: 'Diagrams', href: '/diagrams', icon: GitFork },
      { name: 'Agents', href: '/agents', icon: Bot },
      { name: 'Image Lab', href: '/images', icon: ImageIcon },
      { name: 'Workflows', href: '/workflows', icon: Zap },
      { name: 'Whiteboard', href: '/whiteboard', icon: ClipboardList },
    ],
  },
  {
    label: 'Social',
    items: [
      { name: 'Social Hub', href: '/social', icon: Globe },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'AI Credits', href: '/credits', icon: CreditCard },
      { name: 'Knowledge Base', href: '/kb', icon: BookOpen },
      { name: 'Vault', href: '/vault', icon: KeyRound },
    ],
  },
  {
    label: 'Settings',
    items: [
      { name: 'General', href: '/settings', icon: Settings },
      { name: 'Connections', href: '/settings/connections', icon: Link2 },
      { name: 'AI & Models', href: '/settings/ai', icon: Brain },
      { name: 'Documents', href: '/settings/documents', icon: FolderCog },
      { name: 'Theme', href: '/settings/theme', icon: Palette },
    ],
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const getInitialExpanded = () => {
    const expanded: Record<string, boolean> = {};
    navGroups.forEach((group) => {
      const hasActive = group.items.some((item) =>
        item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
      );
      expanded[group.label] = hasActive || group.label === 'Home';
    });
    return expanded;
  };

  const [expanded, setExpanded] = useState<Record<string, boolean>>(getInitialExpanded);

  const toggleGroup = (label: string) => {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'bg-gray-900 border-r border-gray-700/40 flex-col z-50',
          mobileOpen
            ? 'flex fixed inset-y-0 left-0 w-56 lg:relative'
            : 'hidden lg:flex lg:w-56 lg:relative'
        )}
      >
        {/* Logo */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-700/40">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">L</span>
            </div>
            <h1 className="text-base font-bold text-slate-100 tracking-tight">Lewhof AI</h1>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-gray-500 hover:text-white transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 py-2 overflow-auto">
          {navGroups.map((group) => {
            const isExpanded = expanded[group.label] ?? true;
            return (
              <div key={group.label} className="mb-1">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    size={12}
                    className={cn(
                      'transition-transform duration-200',
                      !isExpanded && '-rotate-90'
                    )}
                  />
                </button>

                {isExpanded && (
                  <div className="mt-0.5 px-2 space-y-0.5">
                    {group.items.map((item) => {
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
                            'flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-all duration-150',
                            isActive
                              ? 'bg-accent-600/10 text-accent-500 border-l-2 border-accent-600 pl-[10px]'
                              : 'text-gray-400 hover:bg-gray-800/80 hover:text-gray-200'
                          )}
                        >
                          <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
                          <span className="font-medium">{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
