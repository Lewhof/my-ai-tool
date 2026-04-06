'use client';

import { useCallback, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY = 50;

export function useUndoRedo(
  getNodes: () => Node[],
  getEdges: () => Edge[],
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: Edge[]) => void
) {
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const skipRef = useRef(false);

  const takeSnapshot = useCallback(() => {
    if (skipRef.current) return;
    past.current = [
      ...past.current.slice(-MAX_HISTORY),
      { nodes: structuredClone(getNodes()), edges: structuredClone(getEdges()) },
    ];
    future.current = [];
  }, [getNodes, getEdges]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push({ nodes: structuredClone(getNodes()), edges: structuredClone(getEdges()) });
    skipRef.current = true;
    setNodes(prev.nodes);
    setEdges(prev.edges);
    skipRef.current = false;
  }, [getNodes, getEdges, setNodes, setEdges]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push({ nodes: structuredClone(getNodes()), edges: structuredClone(getEdges()) });
    skipRef.current = true;
    setNodes(next.nodes);
    setEdges(next.edges);
    skipRef.current = false;
  }, [getNodes, getEdges, setNodes, setEdges]);

  return {
    takeSnapshot,
    undo,
    redo,
    canUndo: () => past.current.length > 0,
    canRedo: () => future.current.length > 0,
  };
}
