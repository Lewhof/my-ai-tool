'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatRelativeDate } from '@/lib/utils';
import { Folder } from 'lucide-react';
import type { Document } from '@/lib/types';

interface DocumentCardProps {
  doc: Document;
  onDelete: (id: string) => void;
  folder?: string;
  onMoveToFolder?: (folder: string) => void;
  folders?: string[];
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

export default function DocumentCard({ doc, onDelete, folder, onMoveToFolder, folders }: DocumentCardProps) {
  const [showMove, setShowMove] = useState(false);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors group relative">
      <Link href={`/documents/${doc.id}`} className="block">
        <div className="text-3xl mb-3">{fileIcon(doc.file_type)}</div>
        <p className="text-white font-medium truncate mb-1 text-sm">{doc.name}</p>
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

      {/* Actions */}
      <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {folders && onMoveToFolder && (
          <div className="relative">
            <button
              onClick={() => setShowMove(!showMove)}
              className="text-gray-500 hover:text-accent-400 text-xs transition-colors"
            >
              Move
            </button>
            {showMove && (
              <div className="absolute bottom-6 left-0 bg-gray-900 border border-gray-700 rounded-lg py-1 z-10 min-w-[120px] shadow-lg">
                {folders.map((f) => (
                  <button
                    key={f}
                    onClick={() => { onMoveToFolder(f); setShowMove(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-800 transition-colors ${f === folder ? 'text-accent-400' : 'text-gray-300'}`}
                  >
                    {f}
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
