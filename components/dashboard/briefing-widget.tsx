'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, RefreshCw, AlertTriangle, CheckSquare, ClipboardList, Loader2 } from 'lucide-react';

interface BriefingData {
  briefing: string;
  stats: {
    activeTasks: number;
    overdue: number;
    dueToday: number;
    whiteboardItems: number;
    staleItems: number;
  };
}

export default function BriefingWidget() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBriefing = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/briefing');
      if (!res.ok) throw new Error('Failed to load');
      const d = await res.json();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBriefing(); }, []);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden h-full flex flex-col">
      <div className="widget-handle px-5 py-3 border-b border-gray-700 flex items-center justify-between cursor-move">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent-500" />
          <h3 className="text-white font-semibold text-sm">AI Daily Briefing</h3>
        </div>
        <button onClick={fetchBriefing} disabled={loading} className="text-gray-500 hover:text-white p-1 rounded hover:bg-gray-700 transition-colors">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && !data ? (
          <div className="flex items-center justify-center p-6 gap-2">
            <Loader2 size={16} className="animate-spin text-accent-400" />
            <p className="text-gray-500 text-sm">Generating briefing...</p>
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm p-5">{error}</p>
        ) : data ? (
          <>
            {/* Quick stats */}
            <div className="flex gap-3 px-5 py-3 border-b border-gray-700/50">
              <div className="flex items-center gap-1.5 text-xs">
                <CheckSquare size={12} className="text-blue-400" />
                <span className="text-gray-400">{data.stats.activeTasks} tasks</span>
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
              <div className="flex items-center gap-1.5 text-xs">
                <ClipboardList size={12} className="text-accent-400" />
                <span className="text-gray-400">{data.stats.whiteboardItems} backlog</span>
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
