'use client';

import { useState, useEffect, useCallback } from 'react';
import UploadZone from '@/components/documents/upload-zone';
import DocumentCard from '@/components/documents/document-card';
import type { Document } from '@/lib/types';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);

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

  return (
    <div className="p-6 space-y-6">
      <UploadZone onUpload={fetchDocs} />
      {documents.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No documents yet. Upload one above.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {documents.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
