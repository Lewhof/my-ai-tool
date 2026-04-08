'use client';

import { useState, useEffect, use } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { Sparkles, Loader2, FileText, List, MessageSquare, Send } from 'lucide-react';

interface DocData {
  id: string;
  name: string;
  display_name: string | null;
  file_type: string;
  signed_url: string | null;
}

type AIAction = 'summarise' | 'extract' | 'ask';

const AI_ACTIONS = [
  { key: 'summarise' as const, label: 'Summarise', icon: FileText },
  { key: 'extract' as const, label: 'Key Points', icon: List },
  { key: 'ask' as const, label: 'Ask', icon: MessageSquare },
];

export default function DocumentViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [doc, setDoc] = useState<DocData | null>(null);
  const [activeAction, setActiveAction] = useState<AIAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: string; content: string }>>([]);

  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then((r) => r.json())
      .then(setDoc);
  }, [id]);

  const runAction = async (action: AIAction, customPrompt?: string) => {
    setLoading(true);
    setActiveAction(action);
    if (action !== 'ask') setResult(null);

    try {
      const res = await fetch(`/api/documents/${id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, prompt: customPrompt }),
      });
      if (res.ok) {
        const data = await res.json();
        if (action === 'ask' && customPrompt) {
          setChatHistory(prev => [
            ...prev,
            { role: 'user', content: customPrompt },
            { role: 'assistant', content: data.analysis },
          ]);
          setQuestion('');
        } else {
          setResult(data.analysis);
        }
      } else {
        setResult('Failed. Please try again.');
      }
    } catch {
      setResult('Network error.');
    } finally {
      setLoading(false);
    }
  };

  const handleAsk = () => {
    if (!question.trim()) return;
    runAction('ask', question.trim());
  };

  if (!doc) {
    return (
      <div className="flex items-center justify-center h-64 gap-2">
        <Loader2 size={18} className="animate-spin text-primary" />
        <span className="text-muted-foreground text-sm">Loading document...</span>
      </div>
    );
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
            <iframe src={doc.signed_url} className="w-full h-[calc(100%-2rem)] rounded border border-border" />
          ) : doc.file_type?.startsWith('image/') ? (
            <img src={doc.signed_url} alt={doc.name} className="max-w-full max-h-[calc(100%-2rem)] rounded object-contain" />
          ) : (
            <div className="rounded-xl border border-border p-6 text-center" style={{ background: 'var(--color-surface-1)' }}>
              <FileText size={32} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-foreground text-sm font-medium">{doc.name}</p>
              <a href={doc.signed_url} target="_blank" className="text-[12px] mt-1 inline-block" style={{ color: 'var(--color-brand)' }}>
                Open file &rarr;
              </a>
            </div>
          )
        ) : (
          <p className="text-muted-foreground">Could not load preview.</p>
        )}
      </div>

      {/* AI Actions panel */}
      <div className="w-full lg:w-[400px] flex flex-col min-h-[300px] lg:min-h-0" style={{ background: 'var(--color-surface-1)' }}>
        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} style={{ color: 'var(--color-brand)' }} />
            <span className="text-[13px] font-semibold text-foreground">AI Actions</span>
          </div>
          <div className="flex gap-2">
            {AI_ACTIONS.map((action) => {
              const Icon = action.icon;
              const isActive = activeAction === action.key;
              return (
                <button
                  key={action.key}
                  onClick={() => action.key === 'ask' ? setActiveAction('ask') : runAction(action.key)}
                  disabled={loading}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all disabled:opacity-50',
                    isActive ? 'border-primary/50 text-foreground' : 'border-border text-muted-foreground hover:text-foreground hover:border-white/15'
                  )}
                  style={isActive ? { background: 'var(--color-brand-dim)' } : {}}
                >
                  <Icon size={13} />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && activeAction !== 'ask' && (
            <div className="flex items-center justify-center py-12 gap-2">
              <Loader2 size={18} className="animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">
                {activeAction === 'summarise' ? 'Summarising...' : 'Extracting...'}
              </p>
            </div>
          )}
          {result && activeAction !== 'ask' && (
            <div className="p-4 prose prose-invert prose-sm max-w-none animate-fade-up">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
            </div>
          )}
          {activeAction === 'ask' && (
            <div className="p-4 space-y-3">
              {chatHistory.length === 0 && !loading && (
                <div className="text-center py-8">
                  <MessageSquare size={24} className="mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-[13px] text-muted-foreground">Ask anything about this document</p>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} className={cn('animate-fade-up', msg.role === 'user' ? 'text-right' : '')}>
                  <div
                    className={cn('inline-block max-w-[90%] rounded-2xl px-4 py-2.5 text-[13px]',
                      msg.role === 'user' ? 'rounded-tr-sm text-white' : 'rounded-tl-sm border border-border'
                    )}
                    style={msg.role === 'user' ? { background: 'var(--color-brand)' } : { background: 'var(--color-surface-2)' }}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : <p>{msg.content}</p>}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 animate-fade-up">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  <span className="text-[12px] text-muted-foreground">Thinking...</span>
                </div>
              )}
            </div>
          )}
          {!activeAction && !loading && (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center px-6">
              <Sparkles size={28} className="text-muted-foreground/30 mb-3" />
              <p className="text-[14px] font-medium text-foreground mb-1">Document AI</p>
              <p className="text-[12px] text-muted-foreground">Summarise, extract key points, or ask questions.</p>
            </div>
          )}
        </div>

        {activeAction === 'ask' && (
          <div className="px-4 py-3 border-t border-border shrink-0">
            <div className="flex items-center gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                placeholder="Ask about this document..."
                className="flex-1 px-3 py-2 rounded-xl text-[13px] text-foreground placeholder-muted-foreground outline-none border border-border focus:border-white/20"
                style={{ background: 'var(--color-surface-2)' }}
              />
              <button
                onClick={handleAsk}
                disabled={!question.trim() || loading}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 disabled:opacity-30 btn-brand"
                style={{ background: 'var(--color-brand)' }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
