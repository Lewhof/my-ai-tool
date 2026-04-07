'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Lock, Unlock, RotateCcw } from 'lucide-react';
import SpotifyWidget from '@/components/social/spotify-widget';
import type { Layout } from 'react-grid-layout';

const ResponsiveGridLayout = dynamic(
  () => import('react-grid-layout').then((mod) => mod.WidthProvider(mod.Responsive)),
  { ssr: false }
);

const DEFAULT_LAYOUTS: Record<string, Layout[]> = {
  lg: [
    { i: 'spotify', x: 0, y: 0, w: 4, h: 8 },
  ],
  md: [
    { i: 'spotify', x: 0, y: 0, w: 5, h: 8 },
  ],
  sm: [
    { i: 'spotify', x: 0, y: 0, w: 6, h: 8 },
  ],
};

export default function SocialPage() {
  const [locked, setLocked] = useState(true);
  const [layouts, setLayouts] = useState<Record<string, Layout[]>>(DEFAULT_LAYOUTS);

  useEffect(() => {
    const saved = localStorage.getItem('social_layouts');
    if (saved) {
      try { setLayouts(JSON.parse(saved)); } catch { /* use default */ }
    }
  }, []);

  const onLayoutChange = useCallback((_: Layout[], allLayouts: Record<string, Layout[]>) => {
    setLayouts(allLayouts);
    localStorage.setItem('social_layouts', JSON.stringify(allLayouts));
  }, []);

  const resetLayout = () => {
    setLayouts(DEFAULT_LAYOUTS);
    localStorage.removeItem('social_layouts');
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Social</h2>
          <p className="text-muted-foreground text-sm mt-1">Your connected social and media widgets</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetLayout} className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-card transition-colors" title="Reset layout">
            <RotateCcw size={15} />
          </button>
          <button
            onClick={() => setLocked(!locked)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${locked ? 'text-muted-foreground border-border hover:border-border' : 'text-primary border-primary/50 bg-primary/10'}`}
          >
            {locked ? <Lock size={12} /> : <Unlock size={12} />}
            {locked ? 'Locked' : 'Editing'}
          </button>
        </div>
      </div>

      <ResponsiveGridLayout
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 768, sm: 0 }}
        cols={{ lg: 12, md: 10, sm: 6 }}
        rowHeight={40}
        isDraggable={!locked}
        isResizable={!locked}
        onLayoutChange={onLayoutChange}
        draggableHandle=".widget-handle"
        containerPadding={[0, 0]}
        margin={[12, 12]}
      >
        <div key="spotify">
          <SpotifyWidget />
        </div>
      </ResponsiveGridLayout>
    </div>
  );
}
