'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface NodeTypeConfig {
  type: string;
  label: string;
  color: string;
  borderStyle: 'solid' | 'dashed';
  icon: React.ReactNode;
}

const nodeTypes: NodeTypeConfig[] = [
  {
    type: 'rectangle',
    label: 'Rectangle',
    color: '#6b7280',
    borderStyle: 'solid',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  },
  {
    type: 'start',
    label: 'Start',
    color: '#22c55e',
    borderStyle: 'solid',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>,
  },
  {
    type: 'end',
    label: 'End',
    color: '#ef4444',
    borderStyle: 'solid',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>,
  },
  {
    type: 'decision',
    label: 'Decision',
    color: '#eab308',
    borderStyle: 'solid',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l10 10-10 10L2 12z"/></svg>,
  },
  {
    type: 'process',
    label: 'Process',
    color: '#a855f7',
    borderStyle: 'solid',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>,
  },
  {
    type: 'database',
    label: 'Database',
    color: '#3b82f6',
    borderStyle: 'solid',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>,
  },
  {
    type: 'cloud',
    label: 'Cloud',
    color: '#06b6d4',
    borderStyle: 'solid',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>,
  },
  {
    type: 'actor',
    label: 'Actor',
    color: '#f59e0b',
    borderStyle: 'solid',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  },
  {
    type: 'note',
    label: 'Note',
    color: '#f97316',
    borderStyle: 'dashed',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>,
  },
  {
    type: 'group',
    label: 'Group',
    color: '#6b7280',
    borderStyle: 'dashed',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  },
];

interface NodePanelProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export default function NodePanel({ collapsed, onToggle }: NodePanelProps) {
  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow-type', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  if (collapsed) {
    return (
      <div className="w-10 border-r border-gray-700 bg-gray-800/50 flex flex-col items-center pt-3 shrink-0">
        <button
          onClick={onToggle}
          className="bg-gray-700 border border-gray-600 rounded-lg p-2 text-gray-400 hover:text-white transition-colors"
          title="Show node types"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-52 border-r border-gray-700 bg-gray-800/50 flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Node Types</span>
        <button onClick={onToggle} className="text-gray-500 hover:text-white transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {nodeTypes.map((nt) => (
          <div
            key={nt.type}
            draggable
            onDragStart={(e) => onDragStart(e, nt.type, nt.label)}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-grab active:cursor-grabbing transition-colors hover:bg-gray-700/50',
              nt.borderStyle === 'dashed' ? 'border-2 border-dashed' : 'border-2 border-solid'
            )}
            style={{ borderColor: nt.color, color: nt.color }}
          >
            {nt.icon}
            <span className="text-sm font-medium text-white">{nt.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
