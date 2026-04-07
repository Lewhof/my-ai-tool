'use client';

import { useState, useRef, useEffect } from 'react';

interface DiagramToolbarProps {
  name: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportJSON: () => void;
  onExportPNG: () => void;
  onExportSVG: () => void;
  onAutoLayout: () => void;
  onAIGenerate: () => void;
  onTemplates: () => void;
  onShare: () => void;
  isSaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export default function DiagramToolbar({
  name,
  onNameChange,
  onSave,
  onUndo,
  onRedo,
  onExportJSON,
  onExportPNG,
  onExportSVG,
  onAutoLayout,
  onAIGenerate,
  onTemplates,
  onShare,
  isSaved,
  canUndo,
  canRedo,
}: DiagramToolbarProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as HTMLElement)) setExportOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const submitName = () => {
    if (editName.trim()) onNameChange(editName.trim());
    setEditing(false);
  };

  const iconBtn = 'p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors rounded hover:bg-card';
  const textBtn = 'px-3 py-1.5 text-xs font-medium text-foreground hover:text-foreground border border-border rounded-lg hover:bg-card transition-colors flex items-center gap-1.5';

  return (
    <div className="h-12 bg-background border-b border-border flex items-center justify-between px-4 shrink-0">
      {/* Left — name + save status */}
      <div className="flex items-center gap-4">
        {editing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={submitName}
            onKeyDown={(e) => e.key === 'Enter' && submitName()}
            autoFocus
            className="bg-card text-foreground border border-border rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <button
            onClick={() => { setEditName(name); setEditing(true); }}
            className="text-foreground text-sm font-medium hover:text-primary transition-colors"
          >
            {name}
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isSaved ? 'bg-green-400' : 'bg-yellow-400'}`} />
          <span className="text-muted-foreground text-xs">{isSaved ? 'Saved' : 'Unsaved'}</span>
        </div>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-1">
        {/* AI Generate */}
        <button onClick={onAIGenerate} className={iconBtn} title="AI Generate">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a4 4 0 014 4c0 1.95-2 3-2 8h-4c0-5-2-6.05-2-8a4 4 0 014-4z"/><path d="M10 14h4"/><path d="M10 18h4"/><path d="M12 22v-2"/></svg>
        </button>

        {/* Templates */}
        <button onClick={onTemplates} className={iconBtn} title="Templates">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </button>

        <div className="w-px h-5 bg-secondary mx-1" />

        {/* Undo */}
        <button onClick={onUndo} disabled={!canUndo} className={iconBtn} title="Undo (Ctrl+Z)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6.69 3L3 13"/></svg>
        </button>
        {/* Redo */}
        <button onClick={onRedo} disabled={!canRedo} className={iconBtn} title="Redo (Ctrl+Shift+Z)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016.69 3L21 13"/></svg>
        </button>

        <div className="w-px h-5 bg-secondary mx-1" />

        {/* Auto Layout */}
        <button onClick={onAutoLayout} className={iconBtn} title="Auto Layout">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M6 9v3h12V9"/><path d="M12 12v3"/></svg>
        </button>

        <div className="w-px h-5 bg-secondary mx-1" />

        {/* Save */}
        <button onClick={onSave} className={textBtn}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>
          Save
        </button>

        {/* Export dropdown */}
        <div className="relative" ref={exportRef}>
          <button onClick={() => setExportOpen(!exportOpen)} className={textBtn}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Export
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-card border border-border rounded-lg shadow-xl z-50 py-1">
              <button onClick={() => { onExportPNG(); setExportOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-secondary hover:text-foreground">PNG Image</button>
              <button onClick={() => { onExportSVG(); setExportOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-secondary hover:text-foreground">SVG Vector</button>
              <button onClick={() => { onExportJSON(); setExportOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-secondary hover:text-foreground">JSON Data</button>
            </div>
          )}
        </div>

        {/* Share */}
        <button onClick={onShare} className={textBtn}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
        </button>
      </div>
    </div>
  );
}
