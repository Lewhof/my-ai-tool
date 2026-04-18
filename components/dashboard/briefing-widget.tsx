'use client';

import useSWR from 'swr';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, RefreshCw, AlertTriangle, CheckSquare, ClipboardList, Loader2, Calendar } from 'lucide-react';

interface BriefingData {
  briefing: string;
  stats: {
    activeTasks: number;
    overdue: number;
    dueToday: number;
    whiteboardItems: number;
    staleItems: number;
    calendarEvents: number;
    unreadEmails: number;
  };
}

export default function BriefingWidget() {
  const { data, isLoading, error, mutate } = useSWR<BriefingData>('/api/dashboard/briefing');
  const loading = isLoading;
  const fetchBriefing = () => mutate();

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden h-full flex flex-col">
      <div className="widget-handle px-5 py-3 border-b border-border flex items-center justify-between cursor-move">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <h3 className="text-foreground font-semibold text-sm">AI Daily Briefing</h3>
        </div>
        <button onClick={fetchBriefing} disabled={loading} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary transition-colors">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && !data ? (
          <div className="flex items-center justify-center p-6 gap-2">
            <Loader2 size={16} className="animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">Generating briefing...</p>
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm p-5">{error instanceof Error ? error.message : 'Error loading briefing'}</p>
        ) : data ? (
          <>
            {/* Quick stats */}
            <div className="flex gap-3 px-5 py-3 border-b border-border">
              <div className="flex items-center gap-1.5 text-xs">
                <CheckSquare size={12} className="text-blue-400" />
                <span className="text-muted-foreground">{data.stats.activeTasks} tasks</span>
              </div>
              {data.stats.overdue > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <AlertTriangle size={12} className="text-red-400" />
                  <span className="text-red-400">{data.stats.overdue} overdue</span>
                </div>
              )}
              {data.stats.dueToday > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <CheckSquare size={12} className="text-yellow-400" />
                  <span className="text-yellow-400">{data.stats.dueToday} due today</span>
                </div>
              )}
              {data.stats.calendarEvents > 0 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Calendar size={12} className="text-primary" />
                  <span className="text-muted-foreground">{data.stats.calendarEvents} events</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs">
                <ClipboardList size={12} className="text-primary" />
                <span className="text-muted-foreground">{data.stats.whiteboardItems} backlog</span>
              </div>
            </div>

            {/* AI Briefing */}
            <div className="px-5 py-4 prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.briefing}</ReactMarkdown>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
