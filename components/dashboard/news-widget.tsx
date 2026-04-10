'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Newspaper, ExternalLink, RefreshCw, Loader2, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewsArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  description: string;
}

function timeAgo(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch {
    return '';
  }
}

export default function NewsWidget() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNews = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch('/api/news?limit=5');
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles ?? []);
      }
    } catch { /* silent */ }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetchNews(); }, []);

  return (
    <div
      className="rounded-2xl border border-border overflow-hidden animate-fade-up animate-fade-up-delay-3"
      style={{ background: 'var(--color-surface-1)' }}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Newspaper size={15} style={{ color: 'oklch(0.65 0.18 40)' }} />
          <h3 className="text-[13px] font-semibold text-foreground">Top News</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchNews(true)}
            disabled={refreshing}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Refresh news"
          >
            {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </button>
          <Link
            href="/mind?tab=news"
            className="text-[11px] font-medium transition-colors"
            style={{ color: 'var(--color-brand)' }}
          >
            View all
          </Link>
        </div>
      </div>

      <div className="divide-y divide-border">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : articles.length === 0 ? (
          <p className="text-[13px] text-muted-foreground p-5">No news available</p>
        ) : (
          articles.map((article) => (
            <a
              key={article.id}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 px-5 py-3 hover:bg-[var(--color-surface-2)] transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-foreground font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                  {article.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {article.source && (
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {article.source}
                    </span>
                  )}
                  {article.publishedAt && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                      <Clock size={8} />
                      {timeAgo(article.publishedAt)}
                    </span>
                  )}
                </div>
              </div>
              <ExternalLink size={12} className="text-muted-foreground/40 group-hover:text-primary shrink-0 mt-1 transition-colors" />
            </a>
          ))
        )}
      </div>
    </div>
  );
}
