'use client';

import { useState, useEffect, useCallback, use } from 'react';
import dynamic from 'next/dynamic';

const DiagramCanvas = dynamic(() => import('@/components/diagrams/diagram-canvas'), { ssr: false });

export default function DiagramViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [diagram, setDiagram] = useState<{ name: string; nodes: []; edges: [] } | null>(null);

  useEffect(() => {
    fetch(`/api/diagrams/${id}`)
      .then((r) => r.json())
      .then(setDiagram);
  }, [id]);

  const handleSave = useCallback(
    async (nodes: unknown[], edges: unknown[]) => {
      await fetch(`/api/diagrams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges }),
      });
    },
    [id]
  );

  if (!diagram) return <div className="p-6 text-gray-400">Loading diagram...</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-3">
        <h3 className="text-white font-semibold">{diagram.name}</h3>
      </div>
      <div className="flex-1 min-h-0">
        <DiagramCanvas
          initialNodes={diagram.nodes ?? []}
          initialEdges={diagram.edges ?? []}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
