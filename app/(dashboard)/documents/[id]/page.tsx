'use client';

import { useState, useEffect, use } from 'react';
import ChatContainer from '@/components/chat/chat-container';

interface DocData {
  id: string;
  name: string;
  file_type: string;
  signed_url: string | null;
}

export default function DocumentViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [doc, setDoc] = useState<DocData | null>(null);

  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then((r) => r.json())
      .then(setDoc);
  }, [id]);

  if (!doc) {
    return <div className="p-6 text-gray-400">Loading document...</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Document viewer */}
      <div className="flex-1 border-b lg:border-b-0 lg:border-r border-gray-700 p-4">
        <h3 className="text-white font-medium mb-3 truncate">{doc.name}</h3>
        {doc.signed_url ? (
          doc.file_type === 'application/pdf' ? (
            <iframe
              src={doc.signed_url}
              className="w-full h-[calc(100%-2rem)] rounded border border-gray-700"
            />
          ) : (
            <img
              src={doc.signed_url}
              alt={doc.name}
              className="max-w-full max-h-[calc(100%-2rem)] rounded object-contain"
            />
          )
        ) : (
          <p className="text-gray-500">Could not load document preview.</p>
        )}
      </div>

      {/* Chat about document */}
      <div className="w-full lg:w-96 flex flex-col min-h-[300px] lg:min-h-0">
        <div className="px-4 py-3 border-b border-gray-700">
          <p className="text-white font-medium text-sm">Ask about this document</p>
        </div>
        <div className="flex-1">
          <ChatContainer apiEndpoint={`/api/documents/${id}/chat`} />
        </div>
      </div>
    </div>
  );
}
