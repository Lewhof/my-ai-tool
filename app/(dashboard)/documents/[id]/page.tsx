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
    return <div className="p-6 text-muted-foreground">Loading document...</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Document viewer */}
      <div className="flex-1 border-b lg:border-b-0 lg:border-r border-border p-4">
        <h3 className="text-foreground font-medium mb-1 truncate">{doc.display_name || doc.name}</h3>
        {doc.display_name && doc.display_name !== doc.name && (
          <p className="text-muted-foreground/60 text-xs mb-3 truncate">{doc.name}</p>
        )}
        {doc.signed_url ? (
          doc.file_type === 'application/pdf' ? (
            <iframe
              src={doc.signed_url}
              className="w-full h-[calc(100%-2rem)] rounded border border-border"
            />
          ) : (
            <img
              src={doc.signed_url}
              alt={doc.name}
              className="max-w-full max-h-[calc(100%-2rem)] rounded object-contain"
            />
          )
        ) : (
          <p className="text-muted-foreground">Could not load document preview.</p>
        )}
      </div>

      {/* Right panel — Chat + Analyze */}
      <div className="w-full lg:w-96 flex flex-col min-h-[300px] lg:min-h-0">
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('chat')}
            className={`text-sm px-3 py-1 rounded transition-colors ${activeTab === 'chat' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Chat
          </button>
          <button
            onClick={analyzeDoc}
            disabled={analyzing}
            className={`text-sm px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${activeTab === 'analyze' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'} disabled:opacity-50`}
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
                  <Loader2 size={18} className="animate-spin text-primary" />
                  <p className="text-muted-foreground text-sm">Analyzing document...</p>
                </div>
              ) : analysis ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Sparkles size={24} className="mx-auto text-muted-foreground/60 mb-2" />
                  <p className="text-muted-foreground text-sm">Click Analyze to get an AI summary</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
