'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatRelativeDate } from '@/lib/utils';
import { Folder, Pencil, Check, X, Sparkles } from 'lucide-react';
import type { Document } from '@/lib/types';

interface FolderOption {
  id: string;
  name: string;
}

interface DocumentCardProps {
  doc: Document & { display_name?: string | null };
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  folder?: string;
  onMoveToFolder?: (folderId: string) => void;
  folderOptions?: FolderOption[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileIcon(type: string): string {
  if (type === 'application/pdf') return '\u{1F4D1}';
  if (type.startsWith('image/')) return '\u{1F5BC}';
  if (type.includes('word')) return '\u{1F4DD}';
  if (type.includes('sheet') || type.includes('csv')) return '\u{1F4CA}';
  return '\u{1F4C4}';
}

export default function DocumentCard({ doc, onDelete, onRename, folder, onMoveToFolder, folderOptions }: DocumentCardProps) {
  const [showMove, setShowMove] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(doc.name);

  const handleRename = () => {
    if (editName.trim() && editName !== doc.name) {
      onRename(doc.id, editName.trim());
    }
    setIsRenaming(false);
  };

  const displayName = doc.display_name || doc.name;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors group relative">
      {/* AI suggested name badge */}
      {doc.display_name && doc.display_name !== doc.name && (
        <div className="flex items-center gap-1 mb-2 text-accent-400">
          <Sparkles size={11} />
          <span className="text-xs truncate">{doc.display_name}</span>
        </div>
      )}

      {isRenaming ? (
        <div className="mb-2">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setIsRenaming(false); }}
            autoFocus
            className="w-full bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-accent-600"
          />
          <div className="flex gap-1 mt-1">
            <button onClick={handleRename} className="text-green-400 p-0.5"><Check size={14} /></button>
            <button onClick={() => { setIsRenaming(false); setEditName(doc.name); }} className="text-gray-500 p-0.5"><X size={14} /></button>
          </div>
        </div>
      ) : (
        <Link href={`/documents/${doc.id}`} className="block">
          <div className="text-3xl mb-3">{fileIcon(doc.file_type)}</div>
          <p className="text-white font-medium truncate mb-1 text-sm">{displayName}</p>
          {doc.display_name && doc.display_name !== doc.name && (
            <p className="text-gray-600 text-xs truncate mb-1">{doc.name}</p>
          )}
          <div className="flex items-center justify-between text-gray-500 text-xs">
            <span>{formatFileSize(doc.file_size)}</span>
            <span>{formatRelativeDate(doc.created_at)}</span>
          </div>
          {folder && (
            <div className="flex items-center gap-1 mt-2 text-gray-500 text-xs">
              <Folder size={12} />
              <span>{folder}</span>
            </div>
          )}
        </Link>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => { setEditName(doc.name); setIsRenaming(true); }}
          className="text-gray-500 hover:text-accent-400 text-xs transition-colors flex items-center gap-1"
        >
          <Pencil size={11} />
          Rename
        </button>
        {folderOptions && onMoveToFolder && (
          <div className="relative">
            <button
              onClick={() => setShowMove(!showMove)}
              className="text-gray-500 hover:text-accent-400 text-xs transition-colors"
            >
              Move
            </button>
            {showMove && (
              <div className="absolute bottom-6 left-0 bg-gray-900 border border-gray-700 rounded-lg py-1 z-10 min-w-[140px] shadow-lg">
                {folderOptions.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => { onMoveToFolder(f.id); setShowMove(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-800 transition-colors text-gray-300"
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => onDelete(doc.id)}
          className="text-gray-500 hover:text-red-400 text-xs transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
