'use client';

import Link from 'next/link';
import { formatRelativeDate } from '@/lib/utils';
import type { Document } from '@/lib/types';

interface DocumentCardProps {
  doc: Document;
  onDelete: (id: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileIcon(type: string): string {
  if (type === 'application/pdf') return '\u{1F4D1}';
  if (type.startsWith('image/')) return '\u{1F5BC}';
  return '\u{1F4C4}';
}

export default function DocumentCard({ doc, onDelete }: DocumentCardProps) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors group">
      <Link href={`/documents/${doc.id}`} className="block">
        <div className="text-3xl mb-3">{fileIcon(doc.file_type)}</div>
        <p className="text-white font-medium truncate mb-1">{doc.name}</p>
        <div className="flex items-center justify-between text-gray-500 text-sm">
          <span>{formatFileSize(doc.file_size)}</span>
          <span>{formatRelativeDate(doc.created_at)}</span>
        </div>
      </Link>
      <button
        onClick={() => onDelete(doc.id)}
        className="mt-2 text-gray-500 hover:text-red-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
      >
        Delete
      </button>
    </div>
  );
}
