'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn, formatRelativeDate } from '@/lib/utils';
import { Folder, FolderOpen, FolderPlus, Plus, ChevronRight, ChevronDown, Sparkles, Clipboard, Trash2 } from 'lucide-react';
import UploadZone from '@/components/documents/upload-zone';
import DocumentCard from '@/components/documents/document-card';
import type { Document } from '@/lib/types';

interface DocFolder {
  id: string;
  name: string;
  parent_id: string | null;
  color: string;
  doc_count: number;
}

interface DocWithFolder extends Document {
  folder: string;
  folder_id: string | null;
  upload_comment: string | null;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocWithFolder[]>([]);
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [uploadComment, setUploadComment] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewDocId, setReviewDocId] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<{ suggested_folder_id?: string | null; suggested_folder_name: string; confidence: string; reason: string } | null>(null);

  const fetchDocs = useCallback(async () => {
    const res = await fetch('/api/documents');
    const data = await res.json();
    setDocuments(data.documents ?? []);
    setFolders(data.folders ?? []);
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleRename = async (id: string, name: string) => {
    await fetch(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    fetchDocs();
  };

  const moveToFolder = async (id: string, folderId: string | null) => {
    await fetch(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: folderId }),
    });
    fetchDocs();
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    await fetch('/api/documents/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName, parent_id: newFolderParent }),
    });
    setNewFolderName('');
    setShowNewFolder(false);
    setNewFolderParent(null);
    fetchDocs();
  };

  const deleteFolder = async (id: string) => {
    if (!confirm('Delete this folder? Documents will be moved to unfiled.')) return;
    await fetch('/api/documents/folders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (activeFolder === id) setActiveFolder(null);
    fetchDocs();
  };

  const reviewDocument = async (docId: string) => {
    setReviewingId(docId);
    setReviewDocId(docId);
    setReviewResult(null);
    try {
      const res = await fetch(`/api/documents/${docId}/review`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.text().catch(() => 'Review failed');
        setReviewResult({ suggested_folder_name: 'Error', confidence: 'low', reason: `API error: ${err}` });
        return;
      }
      const data = await res.json();
      setReviewResult(data);
    } catch (err) {
      setReviewResult({ suggested_folder_name: 'Error', confidence: 'low', reason: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setReviewingId(null);
    }
  };

  const acceptReview = async () => {
    if (!reviewResult || !reviewDocId) return;

    let folderId = reviewResult.suggested_folder_id;

    // If no folder ID, create the suggested folder
    if (!folderId && reviewResult.suggested_folder_name) {
      const res = await fetch('/api/documents/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: reviewResult.suggested_folder_name }),
      });
      const data = await res.json();
      folderId = data.id;
    }

    if (folderId) {
      await moveToFolder(reviewDocId, folderId);
    }

    setReviewResult(null);
    setReviewDocId(null);
  };

  const refileToFolder = async (folderId: string) => {
    if (!reviewDocId) return;
    await moveToFolder(reviewDocId, folderId);
    setReviewResult(null);
    setReviewDocId(null);
  };

  // Handle paste for screenshots
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        const name = `screenshot-${Date.now()}.png`;
        const renamedFile = new File([file], name, { type: file.type });
        const formData = new FormData();
        formData.append('file', renamedFile);
        if (uploadComment) formData.append('comment', uploadComment);
        if (activeFolder && activeFolder !== 'unfiled') formData.append('folder_id', activeFolder);
        await fetch('/api/documents', { method: 'POST', body: formData });
        fetchDocs();
        return;
      }
    }
  };

  // Build folder tree
  const rootFolders = folders.filter((f) => !f.parent_id);
  const getChildren = (parentId: string) => folders.filter((f) => f.parent_id === parentId);

  const toggleExpand = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const handleFolderDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolder(folderId);
  };

  const handleFolderDrop = async (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    setDragOverFolder(null);
    const docId = e.dataTransfer.getData('application/document-id');
    if (docId) {
      await moveToFolder(docId, folderId);
    }
  };

  const FolderItem = ({ folder, depth = 0 }: { folder: DocFolder; depth?: number }) => {
    const children = getChildren(folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isActive = activeFolder === folder.id;
    const isDragOver = dragOverFolder === folder.id;
    const docCount = documents.filter((d) => d.folder_id === folder.id).length;

    return (
      <>
        <div
          onDragOver={(e) => handleFolderDragOver(e, folder.id)}
          onDragLeave={() => setDragOverFolder(null)}
          onDrop={(e) => handleFolderDrop(e, folder.id)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors group',
            isDragOver ? 'bg-primary/20 border border-primary border-dashed' : '',
            isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-card'
          )}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => setActiveFolder(isActive ? null : folder.id)}
        >
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); toggleExpand(folder.id); }} className="text-muted-foreground">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : <span className="w-3.5" />}
          {isActive ? <FolderOpen size={16} style={{ color: folder.color }} /> : <Folder size={16} style={{ color: folder.color }} />}
          <span className="text-sm font-medium flex-1 truncate">{folder.name}</span>
          {docCount > 0 && <span className="text-xs text-muted-foreground">{docCount}</span>}
          <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
            <button onClick={(e) => { e.stopPropagation(); setNewFolderParent(folder.id); setShowNewFolder(true); }} className="text-muted-foreground hover:text-foreground" title="Add sub-folder">
              <FolderPlus size={13} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }} className="text-muted-foreground hover:text-red-400" title="Delete folder">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
        {hasChildren && isExpanded && children.map((child) => (
          <FolderItem key={child.id} folder={child} depth={depth + 1} />
        ))}
      </>
    );
  };

  const filtered = activeFolder
    ? documents.filter((d) => d.folder_id === activeFolder)
    : documents;

  return (
    <div className="flex h-full min-h-0" onPaste={handlePaste}>
      {/* Folder sidebar */}
      <div className="w-56 border-r border-border flex flex-col shrink-0 hidden md:flex">
        <div className="px-3 py-3 border-b border-border flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Folders</p>
          <button onClick={() => { setShowNewFolder(true); setNewFolderParent(null); }} className="text-muted-foreground hover:text-foreground transition-colors" title="New folder">
            <FolderPlus size={16} />
          </button>
        </div>

        {/* New folder form */}
        {showNewFolder && (
          <div className="px-3 py-2 border-b border-border space-y-2">
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createFolder()}
              className="w-full bg-secondary text-foreground border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {newFolderParent && (
              <p className="text-muted-foreground text-xs">Sub-folder of: {folders.find((f) => f.id === newFolderParent)?.name}</p>
            )}
            <div className="flex gap-1">
              <button onClick={createFolder} className="bg-primary text-foreground px-2 py-1 rounded text-xs hover:bg-primary">Create</button>
              <button onClick={() => { setShowNewFolder(false); setNewFolderParent(null); }} className="text-muted-foreground px-2 py-1 rounded text-xs hover:text-foreground">Cancel</button>
            </div>
          </div>
        )}

        {/* All files button */}
        <button
          onClick={() => setActiveFolder(null)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 mx-2 mt-2 rounded-lg transition-colors text-sm',
            !activeFolder ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-card'
          )}
        >
          <Folder size={16} />
          <span className="font-medium">All Files</span>
          <span className="text-xs text-muted-foreground ml-auto">{documents.length}</span>
        </button>

        {/* Folder tree */}
        <div className="flex-1 overflow-auto px-2 py-1 space-y-0.5">
          {rootFolders.map((folder) => (
            <FolderItem key={folder.id} folder={folder} />
          ))}
        </div>

        {/* Unfiled */}
        <button
          onClick={() => setActiveFolder('unfiled')}
          className={cn(
            'flex items-center gap-2 px-3 py-2 mx-2 mb-2 rounded-lg transition-colors text-sm',
            activeFolder === 'unfiled' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-card'
          )}
        >
          <Folder size={16} className="text-muted-foreground/60" />
          <span className="font-medium">Unfiled</span>
          <span className="text-xs text-muted-foreground ml-auto">{documents.filter((d) => !d.folder_id).length}</span>
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6 space-y-6 min-w-0">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Documents</h2>
          <p className="text-muted-foreground text-sm mt-1">Upload files or paste screenshots — AI suggests where they belong</p>
        </div>

        {/* Upload zone with comment */}
        <div className="space-y-2">
          <UploadZone onUpload={fetchDocs} comment={uploadComment} folderId={activeFolder && activeFolder !== 'unfiled' ? activeFolder : undefined} />
          <div className="flex gap-2">
            <input
              value={uploadComment}
              onChange={(e) => setUploadComment(e.target.value)}
              placeholder="Add context for AI filing (optional)"
              className="flex-1 bg-card text-foreground border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder-muted-foreground/40"
            />
            <div className="flex items-center gap-1.5 text-muted-foreground/60 text-xs px-2">
              <Clipboard size={12} />
              <span>Ctrl+V to paste screenshots</span>
            </div>
          </div>
        </div>

        {/* AI Review result */}
        {reviewResult && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-primary" />
                  <p className="text-foreground text-sm font-medium">AI suggests: {reviewResult.suggested_folder_name}</p>
                  <span className={cn('text-xs px-2 py-0.5 rounded', reviewResult.confidence === 'high' ? 'bg-green-500/20 text-green-400' : reviewResult.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-muted text-muted-foreground')}>{reviewResult.confidence}</span>
                </div>
                <p className="text-muted-foreground text-xs mt-1">{reviewResult.reason}</p>
              </div>
              <button onClick={() => { setReviewResult(null); setReviewDocId(null); }} className="text-muted-foreground hover:text-foreground text-xs shrink-0">Dismiss</button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={acceptReview}
                className="bg-primary text-foreground px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-primary transition-colors"
              >
                Accept — move to {reviewResult.suggested_folder_name}
              </button>
              <span className="text-muted-foreground/60 text-xs">or move to:</span>
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => refileToFolder(f.id)}
                  className="text-muted-foreground hover:text-foreground text-xs px-2.5 py-1 border border-border rounded-lg hover:border-white/15 transition-colors"
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Documents grid */}
        <div>
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-widest mb-3">
            {activeFolder === 'unfiled' ? 'Unfiled' : activeFolder ? folders.find((f) => f.id === activeFolder)?.name : 'All Documents'} ({filtered.length === documents.length ? documents.length : `${filtered.length} of ${documents.length}`})
          </p>
          {(activeFolder === 'unfiled' ? documents.filter((d) => !d.folder_id) : filtered).length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <p className="text-muted-foreground">{activeFolder ? 'No files in this folder.' : 'No documents yet.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {(activeFolder === 'unfiled' ? documents.filter((d) => !d.folder_id) : filtered).map((doc) => (
                <div key={doc.id} className="relative group">
                  <DocumentCard
                    doc={doc}
                    onDelete={() => handleDelete(doc.id)}
                    onRename={handleRename}
                    folder={folders.find((f) => f.id === doc.folder_id)?.name || doc.folder}
                    onMoveToFolder={(folderId) => moveToFolder(doc.id, folderId)}
                    folderOptions={folders.map((f) => ({ id: f.id, name: f.name }))}
                  />
                  {/* AI Review button */}
                  <button
                    onClick={() => reviewDocument(doc.id)}
                    disabled={reviewingId === doc.id}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-background/80 text-primary p-1.5 rounded-lg hover:bg-background transition-all disabled:animate-pulse"
                    title="AI Review — suggest filing"
                  >
                    <Sparkles size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
