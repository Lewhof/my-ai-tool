'use client';

import { useState, useEffect, use } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatContainer from '@/components/chat/chat-container';
import { Sparkles, Loader2 } from 'lucide-react';

interface DocData {
  id: string;
  name: string;
  display_name: string | null;
  file_type: string;
  signed_url: string | null;
}

export default function DocumentViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [doc, setDoc] = useState<DocData | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'analyze'>('chat');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then((r) => r.json())
      .then(setDoc);
  }, [id]);

  const analyzeDoc = async () => {
    setAnalyzing(true);
    setAnalysis(null);
    setActiveTab('analyze');
    try {
      const res = await fetch(`/api/documents/${id}/analyze`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data.analysis);
      } else {
        setAnalysis('Analysis failed. Please try again.');
      }
    } catch {
      setAnalysis('Network error. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (!doc) {
    return <div className="p-6 text-gray-400">Loading document...</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Document viewer */}
      <div className="flex-1 border-b lg:border-b-0 lg:border-r border-gray-700 p-4">
        <h3 className="text-white font-medium mb-1 truncate">{doc.display_name || doc.name}</h3>
        {doc.display_name && doc.display_name !== doc.name && (
          <p className="text-gray-600 text-xs mb-3 truncate">{doc.name}</p>
        )}
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

      {/* Right panel — Chat + Analyze */}
      <div className="w-full lg:w-96 flex flex-col min-h-[300px] lg:min-h-0">
        <div className="px-4 py-2 border-b border-gray-700 flex items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('chat')}
            className={`text-sm px-3 py-1 rounded transition-colors ${activeTab === 'chat' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}
          >
            Chat
          </button>
          <button
            onClick={analyzeDoc}
            disabled={analyzing}
            className={`text-sm px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${activeTab === 'analyze' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'} disabled:opacity-50`}
          >
            {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Analyze
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {activeTab === 'chat' ? (
            <ChatContainer apiEndpoint={`/api/documents/${id}/chat`} />
          ) : (
            <div className="p-4">
              {analyzing ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 size={18} className="animate-spin text-accent-400" />
                  <p className="text-gray-400 text-sm">Analyzing document...</p>
                </div>
              ) : analysis ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Sparkles size={24} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">Click Analyze to get an AI summary</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
