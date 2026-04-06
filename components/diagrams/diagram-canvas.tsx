'use client';

import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface DiagramCanvasProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  onSave?: (nodes: Node[], edges: Edge[]) => void;
}

export default function DiagramCanvas({ initialNodes, initialEdges, onSave }: DiagramCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const handleSave = useCallback(() => {
    if (onSave) onSave(nodes, edges);
  }, [nodes, edges, onSave]);

  return (
    <div className="h-full w-full relative">
      {onSave && (
        <button
          onClick={handleSave}
          className="absolute top-3 right-3 z-10 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Save
        </button>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        style={{ background: '#0a0a0f' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1a1a24" gap={20} size={1} />
        <Controls
          style={{ background: '#1a1a24', border: '1px solid #2d2d3d', borderRadius: 8 }}
        />
        <MiniMap
          style={{ background: '#13131a', border: '1px solid #2d2d3d', borderRadius: 8 }}
          nodeColor="#4f46e5"
          maskColor="rgba(0,0,0,0.7)"
        />
      </ReactFlow>
    </div>
  );
}
