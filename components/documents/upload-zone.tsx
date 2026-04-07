'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';

interface UploadZoneProps {
  onUpload: () => void;
  comment?: string;
  folderId?: string;
}

export default function UploadZone({ onUpload, comment, folderId }: UploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const onDrop = useCallback(
    async (files: File[]) => {
      setError('');
      setUploading(true);
      try {
        for (const file of files) {
          const formData = new FormData();
          formData.append('file', file);
          if (comment) formData.append('comment', comment);
          if (folderId) formData.append('folder_id', folderId);
          const res = await fetch('/api/documents', { method: 'POST', body: formData });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Upload failed');
          }
        }
        onUpload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [onUpload, comment, folderId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
    },
    maxSize: 10 * 1024 * 1024,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-white/15'
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <p className="text-muted-foreground">Uploading...</p>
        ) : isDragActive ? (
          <p className="text-primary">Drop files here</p>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload size={20} className="text-muted-foreground" />
            <p className="text-foreground text-sm">Drop files here or click to browse</p>
            <p className="text-muted-foreground text-xs">PDF, Word, Excel, images — any format</p>
          </div>
        )}
      </div>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}
