'use client';

import { useState, useEffect, useCallback } from 'react';
import { Folder, FolderPlus, Trash2, Palette } from 'lucide-react';

interface DocFolder {
  id: string;
  name: string;
  parent_id: string | null;
  color: string;
}

const PRESET_COLORS = ['#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

export default function DocumentSettingsPage() {
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [newName, setNewName] = useState('');
  const [newParent, setNewParent] = useState<string | null>(null);
  const [newColor, setNewColor] = useState('#64748b');
  const [showAdd, setShowAdd] = useState(false);

  const fetchFolders = useCallback(async () => {
    const res = await fetch('/api/documents/folders');
    const data = await res.json();
    setFolders(data.folders ?? []);
  }, []);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);

  const createFolder = async () => {
    if (!newName.trim()) return;
    await fetch('/api/documents/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, parent_id: newParent, color: newColor }),
    });
    setNewName('');
    setNewParent(null);
    setNewColor('#64748b');
    setShowAdd(false);
    fetchFolders();
  };

  const deleteFolder = async (id: string) => {
    if (!confirm('Delete this folder? Documents will be moved to unfiled.')) return;
    await fetch('/api/documents/folders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchFolders();
  };

  const rootFolders = folders.filter((f) => !f.parent_id);
  const getChildren = (parentId: string) => folders.filter((f) => f.parent_id === parentId);

  const getFolderPath = (folder: DocFolder): string => {
    if (!folder.parent_id) return folder.name;
    const parent = folders.find((f) => f.id === folder.parent_id);
    return parent ? `${getFolderPath(parent)} > ${folder.name}` : folder.name;
  };

  const FolderRow = ({ folder, depth = 0 }: { folder: DocFolder; depth?: number }) => {
    const children = getChildren(folder.id);
    return (
      <>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border hover:bg-secondary/30 transition-colors" style={{ paddingLeft: `${20 + depth * 24}px` }}>
          <div className="flex items-center gap-3">
            <Folder size={16} style={{ color: folder.color }} />
            <span className="text-foreground text-sm font-medium">{folder.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setNewParent(folder.id); setShowAdd(true); }}
              className="text-muted-foreground hover:text-foreground p-1 transition-colors"
              title="Add sub-folder"
            >
              <FolderPlus size={14} />
            </button>
            <button
              onClick={() => deleteFolder(folder.id)}
              className="text-muted-foreground hover:text-red-400 p-1 transition-colors"
              title="Delete folder"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {children.map((child) => (
          <FolderRow key={child.id} folder={child} depth={depth + 1} />
        ))}
      </>
    );
  };

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Documents</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage folder structure and filing settings</p>
      </div>

      {/* Folder Structure */}
      <section className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-foreground font-semibold text-sm">Folder Structure</h3>
            <p className="text-muted-foreground text-xs mt-0.5">{folders.length} folders configured</p>
          </div>
          <button
            onClick={() => { setShowAdd(!showAdd); setNewParent(null); }}
            className="bg-primary text-foreground px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary transition-colors flex items-center gap-1.5"
          >
            <FolderPlus size={14} />
            New Folder
          </button>
        </div>

        {/* Add folder form */}
        {showAdd && (
          <div className="px-5 py-4 border-b border-border space-y-3 bg-background/50">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-foreground text-xs block mb-1">Folder name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Contracts"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                  className="w-full bg-secondary text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-foreground text-xs block mb-1">
                  Parent folder {newParent ? `(${folders.find((f) => f.id === newParent)?.name})` : '(root)'}
                </label>
                <select
                  value={newParent ?? ''}
                  onChange={(e) => setNewParent(e.target.value || null)}
                  className="w-full bg-secondary text-foreground border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Root level</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{getFolderPath(f)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-foreground text-xs block mb-1">Color</label>
              <div className="flex gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-colors ${newColor === c ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={createFolder} disabled={!newName.trim()} className="bg-primary text-foreground px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-primary disabled:opacity-50">Create</button>
              <button onClick={() => { setShowAdd(false); setNewParent(null); }} className="text-muted-foreground px-4 py-1.5 rounded-lg text-sm hover:text-foreground">Cancel</button>
            </div>
          </div>
        )}

        {/* Folder tree */}
        {folders.length === 0 ? (
          <div className="p-8 text-center">
            <Folder size={24} className="mx-auto text-muted-foreground/60 mb-2" />
            <p className="text-muted-foreground text-sm">No folders created yet</p>
            <p className="text-muted-foreground/60 text-xs mt-1">AI will suggest default folders when you upload documents</p>
          </div>
        ) : (
          rootFolders.map((folder) => (
            <FolderRow key={folder.id} folder={folder} />
          ))
        )}
      </section>

      {/* AI Classification */}
      <section className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-foreground font-semibold text-sm">AI Auto-Classification</h3>
          <p className="text-muted-foreground text-xs mt-0.5">How AI files your uploads</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground text-sm">Auto-classify on upload</p>
              <p className="text-muted-foreground text-xs">AI reads document content and suggests a folder</p>
            </div>
            <span className="text-green-400 text-xs font-medium">Enabled</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground text-sm">Model used</p>
              <p className="text-muted-foreground text-xs">Claude Haiku — fast, ~$0.001 per classification</p>
            </div>
            <span className="text-muted-foreground text-xs">Haiku</span>
          </div>
        </div>
      </section>
    </div>
  );
}
