'use client';

import { useState, useEffect } from 'react';
import type { Node } from '@xyflow/react';

const COLORS = [
  '#6b7280', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#f59e0b',
];

interface NodeStylePanelProps {
  node: Node;
  onChange: (nodeId: string, data: Record<string, any>) => void;
  onClose: () => void;
}

export default function NodeStylePanel({ node, onChange, onClose }: NodeStylePanelProps) {
  const [label, setLabel] = useState(String(node.data.label ?? ''));

  useEffect(() => {
    setLabel(String(node.data.label ?? ''));
  }, [node.id, node.data.label]);

  const submitLabel = () => {
    if (label.trim() && label.trim() !== String(node.data.label ?? '')) {
      onChange(node.id, { label: label.trim() });
    }
  };

  return (
    <div className="w-56 border-l border-gray-700 bg-gray-800/80 flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Style</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Label */}
        <div>
          <label className="text-gray-500 text-xs font-medium block mb-1.5">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={submitLabel}
            onKeyDown={(e) => e.key === 'Enter' && submitLabel()}
            className="w-full bg-gray-900 text-white border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent-600"
          />
        </div>

        {/* Color */}
        <div>
          <label className="text-gray-500 text-xs font-medium block mb-1.5">Color</label>
          <div className="grid grid-cols-5 gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onChange(node.id, { color: c })}
                className="w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: node.data.color === c ? '#fff' : 'transparent',
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="text-gray-500 text-xs">Custom:</label>
            <input
              type="color"
              value={String(node.data.color ?? '#6b7280')}
              onChange={(e) => onChange(node.id, { color: e.target.value })}
              className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
            />
          </div>
        </div>

        {/* Node type info */}
        <div className="pt-2 border-t border-gray-700">
          <span className="text-gray-500 text-xs">Type: </span>
          <span className="text-gray-300 text-xs capitalize">{node.type}</span>
        </div>
      </div>
    </div>
  );
}
