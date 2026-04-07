'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import dynamic from 'next/dynamic';
import DiagramToolbar from '@/components/diagrams/diagram-toolbar';
import NodePanel from '@/components/diagrams/node-panel';
import TemplatesModal from '@/components/diagrams/templates-modal';
import AIGenerateModal from '@/components/diagrams/ai-generate-modal';
import type { Node, Edge } from '@xyflow/react';
import type { DiagramTemplate } from '@/lib/diagrams/templates';
import { getLayoutedElements } from '@/lib/diagrams/auto-layout';
import { toPng, toSvg } from 'html-to-image';

const DiagramCanvas = dynamic(() => import('@/components/diagrams/diagram-canvas'), { ssr: false });

export default function DiagramViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [diagram, setDiagram] = useState<{ name: string; nodes: Node[]; edges: Edge[] } | null>(null);
  const [isSaved, setIsSaved] = useState(true);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiLoading, setAILoading] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/diagrams/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setDiagram(data);
        nodesRef.current = data.nodes ?? [];
        edgesRef.current = data.edges ?? [];
      });
  }, [id]);

  // Poll undo/redo state from canvas ref
  useEffect(() => {
    const interval = setInterval(() => {
      const el = canvasRef.current?.querySelector('[tabindex]') as any;
      if (el?.__canUndo) {
        setCanUndo(el.__canUndo());
        setCanRedo(el.__canRedo());
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

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

  const handleUndo = useCallback(() => {
    const el = canvasRef.current?.querySelector('[tabindex]') as any;
    el?.__undo?.();
  }, []);

  const handleRedo = useCallback(() => {
    const el = canvasRef.current?.querySelector('[tabindex]') as any;
    el?.__redo?.();
  }, []);

  const handleExportJSON = useCallback(() => {
    const data = JSON.stringify({ nodes: nodesRef.current, edges: edgesRef.current }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${diagram?.name || 'diagram'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [diagram]);

  const getFlowElement = () =>
    canvasRef.current?.querySelector('.react-flow') as HTMLElement | null;

  const handleExportPNG = useCallback(async () => {
    const el = getFlowElement();
    if (!el) return;
    try {
      const dataUrl = await toPng(el, {
        backgroundColor: '#0a0a0f',
        quality: 1,
        pixelRatio: 2,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${diagram?.name || 'diagram'}.png`;
      a.click();
    } catch (e) {
      alert('PNG export failed. Please try again.');
    }
  }, [diagram]);

  const handleExportSVG = useCallback(async () => {
    const el = getFlowElement();
    if (!el) return;
    try {
      const dataUrl = await toSvg(el, { backgroundColor: '#0a0a0f' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${diagram?.name || 'diagram'}.svg`;
      a.click();
    } catch (e) {
      alert('SVG export failed. Please try again.');
    }
  }, [diagram]);

  const handleAutoLayout = useCallback(() => {
    const { nodes: layouted, edges } = getLayoutedElements(nodesRef.current, edgesRef.current);
    setDiagram((prev) => prev ? { ...prev, nodes: layouted, edges } : prev);
    nodesRef.current = layouted;
    setIsSaved(false);
  }, []);

  const handleTemplateSelect = useCallback((template: DiagramTemplate) => {
    setDiagram((prev) => prev ? { ...prev, nodes: template.nodes, edges: template.edges } : prev);
    nodesRef.current = template.nodes;
    edgesRef.current = template.edges;
    setShowTemplates(false);
    setIsSaved(false);
  }, []);

  const handleAIGenerate = useCallback(async (prompt: string) => {
    setAILoading(true);
    try {
      const res = await fetch('/api/diagrams/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.nodes && data.edges) {
        setDiagram((prev) => prev ? { ...prev, nodes: data.nodes, edges: data.edges } : prev);
        nodesRef.current = data.nodes;
        edgesRef.current = data.edges;
        setShowAI(false);
        setIsSaved(false);
      }
    } catch (e) {
      alert('AI generation failed. Please try again.');
    } finally {
      setAILoading(false);
    }
  }, []);

  const handleShare = useCallback(async () => {
    try {
      const res = await fetch(`/api/diagrams/${id}/share`, { method: 'POST' });
      const data = await res.json();
      if (data.share_token) {
        const url = `${window.location.origin}/diagrams/share/${id}?token=${data.share_token}`;
        await navigator.clipboard.writeText(url);
        alert('Share link copied to clipboard!');
      } else if (data.sql) {
        alert(`Share requires a DB migration. Run this SQL in Supabase:\n\n${data.sql}`);
      }
    } catch (e) {
      alert('Share failed. Please try again.');
    }
  }, [id]);

  if (!diagram) return <div className="p-6 text-muted-foreground">Loading diagram...</div>;

  return (
    <div className="h-full flex flex-col min-h-0">
      <DiagramToolbar
        name={diagram.name}
        onNameChange={handleNameChange}
        onSave={handleSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExportJSON={handleExportJSON}
        onExportPNG={handleExportPNG}
        onExportSVG={handleExportSVG}
        onAutoLayout={handleAutoLayout}
        onAIGenerate={() => setShowAI(true)}
        onTemplates={() => setShowTemplates(true)}
        onShare={handleShare}
        isSaved={isSaved}
        canUndo={canUndo}
        canRedo={canRedo}
      />
      <div className="flex-1 flex min-h-0" ref={canvasRef}>
        <NodePanel collapsed={panelCollapsed} onToggle={() => setPanelCollapsed(!panelCollapsed)} />
        <div className="flex-1 min-w-0 min-h-0">
          <DiagramCanvas
            key={`${diagram.nodes.length}-${diagram.edges.length}`}
            initialNodes={diagram.nodes ?? []}
            initialEdges={diagram.edges ?? []}
            onNodesUpdate={(nodes) => { nodesRef.current = nodes; setIsSaved(false); }}
            onEdgesUpdate={(edges) => { edgesRef.current = edges; setIsSaved(false); }}
          />
        </div>
      </div>

      {showTemplates && (
        <TemplatesModal onSelect={handleTemplateSelect} onClose={() => setShowTemplates(false)} />
      )}
      {showAI && (
        <AIGenerateModal onGenerate={handleAIGenerate} onClose={() => setShowAI(false)} loading={aiLoading} />
      )}
    </div>
  );
}
