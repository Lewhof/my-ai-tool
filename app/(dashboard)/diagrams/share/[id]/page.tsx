'use client';

import { useState, useEffect, use } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Node, Edge } from '@xyflow/react';

const DiagramCanvas = dynamic(() => import('@/components/diagrams/diagram-canvas'), { ssr: false });

export default function SharedDiagramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [diagram, setDiagram] = useState<{ name: string; nodes: Node[]; edges: Edge[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setError('Missing share token'); return; }
    fetch(`/api/diagrams/${id}/share?token=${token}`)
      .then((r) => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then(setDiagram)
      .catch(() => setError('Diagram not found or link expired'));
  }, [id, token]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!diagram) {
    return <div className="p-6 text-muted-foreground">Loading shared diagram...</div>;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="h-12 bg-background border-b border-border flex items-center px-4 shrink-0">
        <span className="text-foreground text-sm font-medium">{diagram.name}</span>
        <span className="ml-3 text-muted-foreground text-xs px-2 py-0.5 bg-card rounded">View Only</span>
      </div>
      <div className="flex-1 min-h-0">
        <DiagramCanvas
          initialNodes={diagram.nodes ?? []}
          initialEdges={diagram.edges ?? []}
          readOnly
        />
      </div>
    </div>
  );
}
