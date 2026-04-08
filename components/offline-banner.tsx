'use client';

import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { processSyncQueue } from '@/lib/offline-store';
import { toast } from 'sonner';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = async () => {
      setOffline(false);
      // Process sync queue when back online
      setSyncing(true);
      try {
        const { processed } = await processSyncQueue();
        if (processed > 0) {
          toast(`Synced ${processed} offline change${processed > 1 ? 's' : ''}`);
        }
      } catch { /* skip */ }
      finally { setSyncing(false); }
    };
    const handleOffline = () => setOffline(true);

    // Listen for SW sync messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_QUEUE') {
        handleOnline();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    navigator.serviceWorker?.addEventListener('message', handleMessage);

    // Check initial state
    if (!navigator.onLine) setOffline(true);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, []);

  if (!offline && !syncing) return null;

  return (
    <div className="fixed top-14 left-0 right-0 z-30 flex items-center justify-center py-1.5 px-4"
      style={{ background: offline ? 'oklch(0.62 0.22 25)' : 'var(--color-brand)' }}>
      <div className="flex items-center gap-2 text-white text-[12px] font-medium">
        {offline ? (
          <>
            <WifiOff size={13} />
            <span>You are offline — viewing cached data</span>
          </>
        ) : (
          <>
            <RefreshCw size={13} className="animate-spin" />
            <span>Syncing offline changes...</span>
          </>
        )}
      </div>
    </div>
  );
}
