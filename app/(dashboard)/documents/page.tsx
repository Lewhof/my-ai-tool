'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn, formatRelativeDate } from '@/lib/utils';
import { Folder, FolderOpen, Upload } from 'lucide-react';
import UploadZone from '@/components/documents/upload-zone';
import DocumentCard from '@/components/documents/document-card';
import type { Document } from '@/lib/types';

const DEFAULT_FOLDERS = ['Legal', 'Finance', 'Personal', 'Business', 'Contracts', 'Reports', 'Other'];

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<(Document & { folder: string })[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    const res = await fetch('/api/documents');
    const data = await res.json();
    setDocuments(data.documents ?? []);
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleDelete = async (id: string) => {
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const moveToFolder = async (id: string, folder: string) => {
    await fetch(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
    fetchDocs();
  };

  // Get folder counts
  const folderCounts = DEFAULT_FOLDERS.reduce<Record<string, number>>((acc, f) => {
    acc[f] = documents.filter((d) => d.folder === f).length;
    return acc;
  }, {});

  const filtered = activeFolder
    ? documents.filter((d) => d.folder === activeFolder)
    : documents;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Documents</h2>
        <p className="text-gray-500 text-sm mt-1">Upload files — AI suggests where they belong</p>
      </div>

      {/* Upload Zone */}
      <UploadZone onUpload={fetchDocs} />

      {/* Folders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest">Folders</p>
          {activeFolder && (
            <button
              onClick={() => setActiveFolder(null)}
              className="text-accent-400 text-xs hover:underline"
            >
              Show all
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {DEFAULT_FOLDERS.map((folder) => {
            const count = folderCounts[folder] || 0;
            const isActive = activeFolder === folder;
            return (
              <button
                key={folder}
                onClick={() => setActiveFolder(isActive ? null : folder)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors',
                  isActive
                    ? 'bg-gray-800 border-accent-600/50 text-white'
                    : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
                )}
              >
                {isActive ? (
                  <FolderOpen size={18} className="text-accent-500 shrink-0" />
                ) : (
                  <Folder size={18} className="text-gray-500 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{folder}</p>
                  {count > 0 && <p className="text-gray-500 text-xs">{count} file{count !== 1 ? 's' : ''}</p>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Documents */}
      <div>
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest mb-3">
          {activeFolder ? `${activeFolder} (${filtered.length})` : `All Documents (${documents.length})`}
        </p>
        {filtered.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
            <p className="text-gray-500">
              {activeFolder ? `No files in ${activeFolder}.` : 'No documents yet. Upload one above.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onDelete={handleDelete}
                folder={doc.folder}
                onMoveToFolder={(folder) => moveToFolder(doc.id, folder)}
                folders={DEFAULT_FOLDERS}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
