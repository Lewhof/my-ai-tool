'use client';

import { memo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';

const baseHandle = { width: 8, height: 8, border: '2px solid #1a1a24' };
const hs = (color: string) => ({ ...baseHandle, background: color });

// Helper: get the node's accent color (custom or default)
function c(data: Record<string, any>, fallback: string): string {
  return String(data.color ?? fallback);
}

// ── Rectangle ──
export const RectangleNode = memo(({ data, selected }: NodeProps) => {
  const color = c(data, '#6b7280');
  return (
    <div
      className="px-5 py-3 rounded-lg border-2 bg-card text-foreground text-sm font-medium min-w-[80px] min-h-[40px] text-center w-full h-full flex items-center justify-center"
      style={{ borderColor: selected ? '#6366f1' : color }}
    >
      <NodeResizer isVisible={selected} minWidth={80} minHeight={40} lineStyle={{ borderColor: '#6366f1' }} handleStyle={{ background: '#6366f1', width: 8, height: 8 }} />
      <Handle type="target" position={Position.Top} style={hs(color)} />
      <Handle type="target" position={Position.Left} style={hs(color)} />
      <span className="whitespace-pre-wrap">{String(data.label || 'Rectangle')}</span>
      <Handle type="source" position={Position.Bottom} style={hs(color)} />
      <Handle type="source" position={Position.Right} style={hs(color)} id="right" />
    </div>
  );
});
RectangleNode.displayName = 'RectangleNode';

// ── Start ──
export const StartNode = memo(({ data, selected }: NodeProps) => {
  const color = c(data, '#22c55e');
  return (
    <div
      className="px-5 py-3 rounded-full border-2 bg-card text-sm font-semibold min-w-[100px] text-center"
      style={{ borderColor: selected ? color : `${color}cc`, color }}
    >
      <span>{String(data.label || 'Start')}</span>
      <Handle type="source" position={Position.Bottom} style={hs(color)} />
      <Handle type="source" position={Position.Right} style={hs(color)} id="right" />
    </div>
  );
});
StartNode.displayName = 'StartNode';

// ── End ──
export const EndNode = memo(({ data, selected }: NodeProps) => {
  const color = c(data, '#ef4444');
  return (
    <div
      className="px-5 py-3 rounded-full border-2 bg-card text-sm font-semibold min-w-[100px] text-center"
      style={{ borderColor: selected ? color : `${color}cc`, color }}
    >
      <Handle type="target" position={Position.Top} style={hs(color)} />
      <Handle type="target" position={Position.Left} style={hs(color)} />
      <span>{String(data.label || 'End')}</span>
    </div>
  );
});
EndNode.displayName = 'EndNode';

// ── Decision (Diamond) ──
export const DecisionNode = memo(({ data, selected }: NodeProps) => {
  const color = c(data, '#eab308');
  return (
    <div className="relative" style={{ width: 140, height: 80 }}>
      <Handle type="target" position={Position.Top} style={{ ...hs(color), top: -4 }} />
      <Handle type="target" position={Position.Left} style={{ ...hs(color), left: -4 }} />
      <div
        className="absolute inset-0 flex items-center justify-center border-2 bg-card text-sm font-semibold"
        style={{ transform: 'rotate(45deg)', borderRadius: 4, borderColor: selected ? color : `${color}cc`, color }}
      >
        <span style={{ transform: 'rotate(-45deg)' }}>{String(data.label || 'Decision')}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ ...hs(color), bottom: -4 }} />
      <Handle type="source" position={Position.Right} style={{ ...hs(color), right: -4 }} id="right" />
    </div>
  );
});
DecisionNode.displayName = 'DecisionNode';

// ── Process ──
export const ProcessNode = memo(({ data, selected }: NodeProps) => {
  const color = c(data, '#a855f7');
  return (
    <div
      className="px-5 py-3 rounded-lg border-2 bg-card text-sm font-medium min-w-[120px] text-center"
      style={{ borderColor: selected ? color : `${color}cc`, color }}
    >
      <Handle type="target" position={Position.Top} style={hs(color)} />
      <Handle type="target" position={Position.Left} style={hs(color)} />
      <div className="flex items-center justify-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        <span>{String(data.label || 'Process')}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={hs(color)} />
      <Handle type="source" position={Position.Right} style={hs(color)} id="right" />
    </div>
  );
});
ProcessNode.displayName = 'ProcessNode';

// ── Database ──
export const DatabaseNode = memo(({ data, selected }: NodeProps) => {
  const color = c(data, '#3b82f6');
  return (
    <div
      className="px-5 py-3 rounded-lg border-2 bg-card text-sm font-medium min-w-[120px] text-center"
      style={{ borderColor: selected ? color : `${color}cc`, color }}
    >
      <Handle type="target" position={Position.Top} style={hs(color)} />
      <Handle type="target" position={Position.Left} style={hs(color)} />
      <div className="flex items-center justify-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>
        <span>{String(data.label || 'Database')}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={hs(color)} />
      <Handle type="source" position={Position.Right} style={hs(color)} id="right" />
    </div>
  );
});
DatabaseNode.displayName = 'DatabaseNode';

// ── Cloud ──
export const CloudNode = memo(({ data, selected }: NodeProps) => {
  const color = c(data, '#06b6d4');
  return (
    <div
      className="px-6 py-3 rounded-2xl border-2 bg-card text-sm font-medium min-w-[120px] text-center"
      style={{ borderColor: selected ? color : `${color}cc`, color }}
    >
      <Handle type="target" position={Position.Top} style={hs(color)} />
      <Handle type="target" position={Position.Left} style={hs(color)} />
      <div className="flex items-center justify-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>
        <span>{String(data.label || 'Cloud')}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={hs(color)} />
      <Handle type="source" position={Position.Right} style={hs(color)} id="right" />
    </div>
  );
});
CloudNode.displayName = 'CloudNode';

// ── Actor ──
export const ActorNode = memo(({ data, selected }: NodeProps) => {
  const color = c(data, '#f59e0b');
  return (
    <div
      className="px-5 py-3 rounded-lg border-2 bg-card text-sm font-medium min-w-[100px] text-center"
      style={{ borderColor: selected ? color : `${color}cc`, color }}
    >
      <Handle type="target" position={Position.Top} style={hs(color)} />
      <Handle type="target" position={Position.Left} style={hs(color)} />
      <div className="flex items-center justify-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>{String(data.label || 'Actor')}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={hs(color)} />
      <Handle type="source" position={Position.Right} style={hs(color)} id="right" />
    </div>
  );
});
ActorNode.displayName = 'ActorNode';

// ── Note ──
export const NoteNode = memo(({ data, selected }: NodeProps) => {
  const color = c(data, '#f97316');
  return (
    <div
      className="px-5 py-3 rounded border-2 border-dashed bg-card/50 text-sm min-w-[120px]"
      style={{ borderColor: selected ? color : `${color}80`, color: `${color}cc` }}
    >
      <div className="flex items-start gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
        <span>{String(data.label || 'Note')}</span>
      </div>
    </div>
  );
});
NoteNode.displayName = 'NoteNode';

// ── Group ──
export const GroupNode = memo(({ data, selected }: NodeProps) => {
  const color = c(data, '#6b7280');
  return (
    <div
      className="px-6 py-4 rounded-lg border-2 border-dashed bg-card/30 text-sm font-medium min-w-[200px] min-h-[100px]"
      style={{ borderColor: selected ? color : `${color}80`, color }}
    >
      <div className="flex items-center gap-2 mb-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        <span>{String(data.label || 'Group')}</span>
      </div>
    </div>
  );
});
GroupNode.displayName = 'GroupNode';

export const customNodeTypes = {
  rectangle: RectangleNode,
  start: StartNode,
  end: EndNode,
  decision: DecisionNode,
  process: ProcessNode,
  database: DatabaseNode,
  cloud: CloudNode,
  actor: ActorNode,
  note: NoteNode,
  group: GroupNode,
};
