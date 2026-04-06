'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { customNodeTypes } from './node-types';

interface DiagramCanvasProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  onSave?: (nodes: Node[], edges: Edge[]) => void;
  onNodesUpdate?: (nodes: Node[]) => void;
  onEdgesUpdate?: (edges: Edge[]) => void;
  readOnly?: boolean;
}

export default function DiagramCanvas({
  initialNodes,
  initialEdges,
  onSave,
  onNodesUpdate,
  onEdgesUpdate,
  readOnly,
}: DiagramCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Track changes for undo hint
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, style: { stroke: '#4b5563' }, animated: false }, eds));
    },
    [setEdges]
  );

  // Drag & drop from panel
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow-type');
      const label = event.dataTransfer.getData('application/reactflow-label');

      if (!type || !reactFlowInstance || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes]
  );

  // Double-click to edit label
  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (readOnly) return;
      const newLabel = prompt('Edit label:', String(node.data.label ?? ''));
      if (newLabel !== null) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === node.id ? { ...n, data: { ...n.data, label: newLabel } } : n
          )
        );
      }
    },
    [setNodes, readOnly]
  );

  // Delete selected nodes/edges
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (readOnly) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        setNodes((nds) => nds.filter((n) => !n.selected));
        setEdges((eds) => eds.filter((e) => !e.selected));
      }
    },
    [setNodes, setEdges, readOnly]
  );

  // Export functions exposed via ref
  const getSaveData = useCallback(() => {
    return { nodes: nodesRef.current, edges: edgesRef.current };
  }, []);

  // Expose save data to parent
  if (onNodesUpdate) onNodesUpdate(nodes);
  if (onEdgesUpdate) onEdgesUpdate(edges);

  return (
    <div ref={reactFlowWrapper} className="h-full w-full" onKeyDown={onKeyDown} tabIndex={0}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        onInit={setReactFlowInstance}
        onDrop={readOnly ? undefined : onDrop}
        onDragOver={readOnly ? undefined : onDragOver}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={customNodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        style={{ background: '#0a0a0f' }}
        proOptions={{ hideAttribution: true }}
        snapToGrid
        snapGrid={[20, 20]}
        defaultEdgeOptions={{ style: { stroke: '#4b5563', strokeWidth: 2 }, animated: false }}
        connectionLineStyle={{ stroke: '#4f46e5', strokeWidth: 2 }}
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
