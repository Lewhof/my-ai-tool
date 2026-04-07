'use client';

import { useState, useEffect } from 'react';
import { Activity, RefreshCw, Loader2 } from 'lucide-react';

interface HealthData {
  status: string;
  totalLatency: number;
  services: Record<string, { status: string; latency: number; error?: string }>;
  timestamp: string;
}

export default function HealthWidget() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health');
      if (res.ok) setHealth(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchHealth(); }, []);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden h-full flex flex-col">
      <div className="widget-handle px-5 py-3 border-b border-border flex items-center justify-between cursor-move">
        <div className="flex items-center gap-2">
          <Activity size={16} className={health?.status === 'healthy' ? 'text-green-400' : 'text-yellow-400'} />
          <h3 className="text-foreground font-semibold text-sm">System Health</h3>
        </div>
        <button onClick={fetchHealth} disabled={loading} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary transition-colors">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {!health ? (
          <p className="text-muted-foreground text-sm">Checking...</p>
        ) : (
          <div className="space-y-1.5">
            {Object.entries(health.services).map(([name, svc]) => (
              <div key={name} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${svc.status === 'ok' ? 'bg-green-400' : svc.status === 'not_configured' ? 'bg-muted-foreground' : 'bg-red-400'}`} />
                  <span className="text-foreground text-xs capitalize">{name}</span>
                </div>
                <span className="text-muted-foreground text-xs">{svc.latency}ms</span>
              </div>
            ))}
            <div className="border-t border-border pt-1.5 mt-1.5 flex justify-between">
              <span className="text-muted-foreground text-xs">{health.status === 'healthy' ? 'All systems go' : 'Issues detected'}</span>
              <span className="text-muted-foreground text-xs">{health.totalLatency}ms total</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
