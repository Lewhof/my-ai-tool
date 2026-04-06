'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
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
import { useUndoRedo } from './use-undo-redo';
import NodeStylePanel from './node-style-panel';

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
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const { takeSnapshot, undo, redo, canUndo, canRedo } = useUndoRedo(
    () => nodesRef.current,
    () => edgesRef.current,
    (n) => setNodes(n),
    (e) => setEdges(e)
  );

  // Expose undo/redo/canUndo/canRedo to parent via custom event
  useEffect(() => {
    const el = reactFlowWrapper.current;
    if (!el) return;
    (el as any).__undo = undo;
    (el as any).__redo = redo;
    (el as any).__canUndo = canUndo;
    (el as any).__canRedo = canRedo;
  }, [undo, redo, canUndo, canRedo]);

  const onConnect = useCallback(
    (params: Connection) => {
      takeSnapshot();
      setEdges((eds) => addEdge({ ...params, style: { stroke: '#4b5563' }, animated: false }, eds));
    },
    [setEdges, takeSnapshot]
  );

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

      takeSnapshot();
      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes, takeSnapshot]
  );

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (readOnly) return;
      const newLabel = prompt('Edit label:', String(node.data.label ?? ''));
      if (newLabel !== null) {
        takeSnapshot();
        setNodes((nds) =>
          nds.map((n) =>
            n.id === node.id ? { ...n, data: { ...n.data, label: newLabel } } : n
          )
        );
      }
    },
    [setNodes, readOnly, takeSnapshot]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (readOnly) return;
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        takeSnapshot();
        setNodes((nds) => nds.filter((n) => !n.selected));
        setEdges((eds) => eds.filter((e) => !e.selected));
        setSelectedNode(null);
      }
    },
    [setNodes, setEdges, readOnly, undo, redo, takeSnapshot]
  );

  // Snapshot before drag moves
  const onNodeDragStart = useCallback(() => {
    takeSnapshot();
  }, [takeSnapshot]);

  const handleNodeStyleChange = useCallback(
    (nodeId: string, data: Record<string, any>) => {
      takeSnapshot();
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
        )
      );
      setSelectedNode((prev) =>
        prev && prev.id === nodeId ? { ...prev, data: { ...prev.data, ...data } } : prev
      );
    },
    [setNodes, takeSnapshot]
  );

  if (onNodesUpdate) onNodesUpdate(nodes);
  if (onEdgesUpdate) onEdgesUpdate(edges);

  return (
    <div className="flex h-full w-full">
      <div ref={reactFlowWrapper} className="flex-1 h-full" onKeyDown={onKeyDown} tabIndex={0}>
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
          onNodeClick={readOnly ? undefined : onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDragStart={readOnly ? undefined : onNodeDragStart}
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
      {selectedNode && !readOnly && (
        <NodeStylePanel
          node={selectedNode}
          onChange={handleNodeStyleChange}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
