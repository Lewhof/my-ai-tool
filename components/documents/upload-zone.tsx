'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface UploadZoneProps {
  onUpload: () => void;
}

export default function UploadZone({ onUpload }: UploadZoneProps) {
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
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
    },
    maxSize: 10 * 1024 * 1024,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-gray-600 hover:border-gray-500'
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <p className="text-gray-400">Uploading...</p>
        ) : isDragActive ? (
          <p className="text-indigo-400">Drop files here</p>
        ) : (
          <div>
            <p className="text-gray-300 mb-1">Drag & drop files here, or click to select</p>
            <p className="text-gray-500 text-sm">PDF, PNG, JPG, WEBP up to 10MB</p>
          </div>
        )}
      </div>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}
