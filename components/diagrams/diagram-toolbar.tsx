'use client';

import { useState } from 'react';

interface DiagramToolbarProps {
  name: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
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
  onExport,
  isSaved,
  canUndo,
  canRedo,
}: DiagramToolbarProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);

  const submitName = () => {
    if (editName.trim()) onNameChange(editName.trim());
    setEditing(false);
  };

  return (
    <div className="h-12 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-4 shrink-0">
      {/* Left — name + save status */}
      <div className="flex items-center gap-4">
        {editing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={submitName}
            onKeyDown={(e) => e.key === 'Enter' && submitName()}
            autoFocus
            className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-600"
          />
        ) : (
          <button
            onClick={() => { setEditName(name); setEditing(true); }}
            className="text-white text-sm font-medium hover:text-indigo-400 transition-colors"
          >
            {name}
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isSaved ? 'bg-green-400' : 'bg-yellow-400'}`} />
          <span className="text-gray-500 text-xs">{isSaved ? 'Saved' : 'Unsaved'}</span>
        </div>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-1">
        {/* Undo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-2 text-gray-400 hover:text-white disabled:opacity-30 transition-colors rounded hover:bg-gray-800"
          title="Undo"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6.69 3L3 13"/></svg>
        </button>
        {/* Redo */}
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-2 text-gray-400 hover:text-white disabled:opacity-30 transition-colors rounded hover:bg-gray-800"
          title="Redo"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016.69 3L21 13"/></svg>
        </button>

        <div className="w-px h-5 bg-gray-700 mx-2" />

        {/* Save */}
        <button
          onClick={onSave}
          className="px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors"
        >
          Save
        </button>

        {/* Export */}
        <button
          onClick={onExport}
          className="px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Export
        </button>
      </div>
    </div>
  );
}
