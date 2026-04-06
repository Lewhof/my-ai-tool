'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import dynamic from 'next/dynamic';
import DiagramToolbar from '@/components/diagrams/diagram-toolbar';
import NodePanel from '@/components/diagrams/node-panel';
import type { Node, Edge } from '@xyflow/react';

const DiagramCanvas = dynamic(() => import('@/components/diagrams/diagram-canvas'), { ssr: false });

export default function DiagramViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [diagram, setDiagram] = useState<{ name: string; nodes: Node[]; edges: Edge[] } | null>(null);
  const [isSaved, setIsSaved] = useState(true);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);

  useEffect(() => {
    fetch(`/api/diagrams/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setDiagram(data);
        nodesRef.current = data.nodes ?? [];
        edgesRef.current = data.edges ?? [];
      });
  }, [id]);

  const handleSave = useCallback(async () => {
    await fetch(`/api/diagrams/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes: nodesRef.current, edges: edgesRef.current }),
    });
    setIsSaved(true);
  }, [id]);

  const handleNameChange = useCallback(async (name: string) => {
    await fetch(`/api/diagrams/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setDiagram((prev) => prev ? { ...prev, name } : prev);
  }, [id]);

  const handleExport = useCallback(() => {
    const data = JSON.stringify({ nodes: nodesRef.current, edges: edgesRef.current }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${diagram?.name || 'diagram'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [diagram]);

  if (!diagram) return <div className="p-6 text-gray-400">Loading diagram...</div>;

  return (
    <div className="h-full flex flex-col min-h-0">
      <DiagramToolbar
        name={diagram.name}
        onNameChange={handleNameChange}
        onSave={handleSave}
        onUndo={() => {}}
        onRedo={() => {}}
        onExport={handleExport}
        isSaved={isSaved}
        canUndo={false}
        canRedo={false}
      />
      <div className="flex-1 flex min-h-0">
        <NodePanel collapsed={panelCollapsed} onToggle={() => setPanelCollapsed(!panelCollapsed)} />
        <div className="flex-1 min-w-0 min-h-0">
          <DiagramCanvas
            initialNodes={diagram.nodes ?? []}
            initialEdges={diagram.edges ?? []}
            onNodesUpdate={(nodes) => { nodesRef.current = nodes; setIsSaved(false); }}
            onEdgesUpdate={(edges) => { edgesRef.current = edges; setIsSaved(false); }}
          />
        </div>
      </div>
    </div>
  );
}
