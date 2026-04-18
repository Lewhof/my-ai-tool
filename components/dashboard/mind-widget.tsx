'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { Brain, Flame, Loader2, ChevronRight } from 'lucide-react';

interface DailyContent {
  week_theme: string;
  morning_content: string;
  morning_completed_at?: string;
}

export default function MindWidget() {
  const { data: daily, isLoading: loading } = useSWR<DailyContent>('/api/practice/daily');

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 size={14} className="animate-spin" />
          Loading Mind Library...
        </div>
      </div>
    );
  }

  if (!daily) return null;

  // Pull first sentence of morning content as the preview
  const preview = daily.morning_content?.split('\n').find(l => l.trim())?.slice(0, 180) || '';

  return (
    <Link href="/mind" className="block bg-card border border-border rounded-lg overflow-hidden hover:border-border/60 transition-colors group">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2" style={{ background: 'var(--color-surface-2)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-brand)' }}>
          <Brain size={13} className="text-white" />
        </div>
        <h3 className="text-foreground font-semibold text-sm">Mind Library</h3>
        {daily.week_theme && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-orange-400">
            <Flame size={9} />
            {daily.week_theme}
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-foreground/80 text-[12px] leading-relaxed line-clamp-3">
          {preview}
        </p>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <span className="text-[11px] text-muted-foreground">
            {daily.morning_completed_at ? 'Reflection saved' : 'Read today\u2019s reflection'}
          </span>
          <ChevronRight size={12} className="text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </div>
    </Link>
  );
}
