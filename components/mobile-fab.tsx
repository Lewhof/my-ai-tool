'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Plus, X, CheckSquare, MessageSquare, StickyNote, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTIONS = [
  { label: 'New Task', icon: CheckSquare, href: '/todos', color: 'oklch(0.55 0.18 160)' },
  { label: 'New Chat', icon: MessageSquare, href: '/chat', color: 'var(--color-brand)' },
  { label: 'New Note', icon: StickyNote, href: '/notes', color: 'oklch(0.65 0.16 290)' },
  { label: 'Upload Doc', icon: FileText, href: '/documents', color: 'oklch(0.60 0.20 255)' },
];

export default function MobileFAB() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Hide on Cerebro page (input bar serves the same purpose)
  if (pathname === '/agent') return null;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="lg:hidden fixed inset-0 bg-black/40 z-30" onClick={() => setOpen(false)} />
      )}

      {/* Action sheet */}
      {open && (
        <div className="lg:hidden fixed bottom-24 right-4 z-40 flex flex-col gap-2 items-end animate-fade-up">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => {
                  setOpen(false);
                  router.push(action.href);
                }}
                className="flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-2xl border border-border shadow-lg transition-all"
                style={{ background: 'var(--color-surface-1)' }}
              >
                <span className="text-[13px] font-medium text-foreground">{action.label}</span>
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `color-mix(in oklch, ${action.color} 20%, transparent)` }}
                >
                  <Icon size={16} style={{ color: action.color }} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'lg:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg transition-all duration-200',
          open ? 'rotate-45' : 'rotate-0'
        )}
        style={{
          background: 'var(--color-brand)',
          boxShadow: '0 0 20px var(--color-brand-glow)',
        }}
      >
        {open ? <X size={22} /> : <Plus size={22} />}
      </button>
    </>
  );
}
