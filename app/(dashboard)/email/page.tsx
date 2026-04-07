'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn, formatRelativeDate } from '@/lib/utils';
import {
  Mail, Inbox, Send, FileText, Archive, Sparkles, Loader2,
  Paperclip, AlertTriangle, Clock, Info, ExternalLink,
} from 'lucide-react';

interface Email {
  id: string;
  subject: string;
  from: { name: string; email: string };
  date: string;
  isRead: boolean;
  preview: string;
  importance: string;
  hasAttachments: boolean;
}

interface TriagedEmail {
  id: string;
  subject: string;
  from: string;
  category: string;
  summary: string;
  date: string;
}

interface EmailDetail {
  id: string;
  subject: string;
  from: { name: string; email: string };
  to: Array<{ name: string; email: string }>;
  date: string;
  body: string;
  bodyType: string;
  importance: string;
  hasAttachments: boolean;
}

const FOLDERS = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'drafts', label: 'Drafts', icon: FileText },
  { key: 'archive', label: 'Archive', icon: Archive },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string; icon: typeof AlertTriangle }> = {
  IMPORTANT: { bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-400', icon: AlertTriangle },
  CAN_WAIT: { bg: 'bg-yellow-500/10 border-yellow-500/30', text: 'text-yellow-400', icon: Clock },
  FYI: { bg: 'bg-muted/50 border-border', text: 'text-muted-foreground', icon: Info },
};

export default function EmailPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [folder, setFolder] = useState('inbox');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [emailDetail, setEmailDetail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [triaging, setTriaging] = useState(false);
  const [triaged, setTriaged] = useState<TriagedEmail[]>([]);
  const [triageSummary, setTriageSummary] = useState<string | null>(null);
  const [showTriage, setShowTriage] = useState(false);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/email?folder=${folder}`);
      const data = await res.json();
      setConnected(data.connected ?? false);
      setEmails(data.emails ?? []);
    } catch { setConnected(false); }
    finally { setLoading(false); }
  }, [folder]);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  const loadEmail = async (id: string) => {
    setSelectedId(id);
    setEmailDetail(null);
    const res = await fetch(`/api/email/${id}`);
    if (res.ok) setEmailDetail(await res.json());
  };

  const runTriage = async () => {
    setTriaging(true);
    setShowTriage(true);
    try {
      const res = await fetch('/api/email/triage', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setTriaged(data.triaged ?? []);
        setTriageSummary(data.summary);
      }
    } catch { /* silent */ }
    finally { setTriaging(false); }
  };

  if (connected === false) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <Mail size={48} className="text-muted-foreground/60" />
        <p className="text-muted-foreground text-lg">Connect your Microsoft account to view emails</p>
        <a href="/settings/connections" className="bg-primary text-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary transition-colors flex items-center gap-2">
          <ExternalLink size={16} />
          Connect in Settings
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Folder sidebar */}
      <div className="w-48 border-r border-border flex flex-col shrink-0 hidden md:flex">
        <div className="p-3 space-y-1">
          {FOLDERS.map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                onClick={() => { setFolder(f.key); setSelectedId(null); setShowTriage(false); }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  folder === f.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-card'
                )}
              >
                <Icon size={16} />
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-border">
          <button
            onClick={runTriage}
            disabled={triaging}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {triaging ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            AI Triage
          </button>
        </div>
      </div>

      {/* Email list or triage view */}
      <div className={cn(
        'flex flex-col border-r border-border shrink-0',
        selectedId ? 'hidden md:flex md:w-80' : 'w-full md:w-80'
      )}>
        {/* Mobile folder tabs */}
        <div className="md:hidden flex border-b border-border px-2 py-1.5 gap-1 overflow-x-auto shrink-0">
          {FOLDERS.map((f) => (
            <button key={f.key} onClick={() => { setFolder(f.key); setShowTriage(false); }}
              className={cn('text-xs px-3 py-1.5 rounded-lg shrink-0', folder === f.key ? 'bg-secondary text-foreground' : 'text-muted-foreground')}>
              {f.label}
            </button>
          ))}
          <button onClick={runTriage} disabled={triaging} className="text-xs px-3 py-1.5 rounded-lg text-primary shrink-0 flex items-center gap-1">
            <Sparkles size={12} /> Triage
          </button>
        </div>

        {/* Triage results */}
        {showTriage && triaged.length > 0 && (
          <div className="border-b border-border shrink-0 px-3 py-2 bg-primary/5">
            <p className="text-primary text-xs font-medium mb-1">{triageSummary}</p>
            <button onClick={() => setShowTriage(false)} className="text-muted-foreground text-xs hover:text-foreground">Show inbox</button>
          </div>
        )}

        {/* Email list */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center p-6"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
          ) : showTriage && triaged.length > 0 ? (
            // Triage view
            (['IMPORTANT', 'CAN_WAIT', 'FYI'] as const).map((cat) => {
              const catEmails = triaged.filter((e) => e.category === cat);
              if (catEmails.length === 0) return null;
              const catInfo = CATEGORY_COLORS[cat];
              const CatIcon = catInfo.icon;
              return (
                <div key={cat}>
                  <div className={cn('px-3 py-1.5 flex items-center gap-2', catInfo.bg, 'border-b border-border')}>
                    <CatIcon size={12} className={catInfo.text} />
                    <span className={cn('text-xs font-semibold uppercase tracking-wider', catInfo.text)}>{cat.replace('_', ' ')} ({catEmails.length})</span>
                  </div>
                  {catEmails.map((email) => (
                    <button key={email.id} onClick={() => loadEmail(email.id)} className={cn('w-full text-left px-4 py-3 border-b border-border hover:bg-card transition-colors', selectedId === email.id && 'bg-secondary')}>
                      <p className="text-foreground text-sm truncate">{email.subject}</p>
                      <p className="text-muted-foreground text-xs truncate">{email.from}</p>
                      <p className="text-muted-foreground/60 text-xs mt-0.5">{email.summary}</p>
                    </button>
                  ))}
                </div>
              );
            })
          ) : emails.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center p-6">No emails</p>
          ) : (
            emails.map((email) => (
              <button
                key={email.id}
                onClick={() => loadEmail(email.id)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-border hover:bg-card transition-colors',
                  selectedId === email.id && 'bg-secondary',
                  !email.isRead && 'border-l-2 border-l-primary'
                )}
              >
                <div className="flex items-center justify-between">
                  <p className={cn('text-sm truncate flex-1', email.isRead ? 'text-foreground' : 'text-foreground font-medium')}>{email.subject}</p>
                  {email.hasAttachments && <Paperclip size={12} className="text-muted-foreground shrink-0 ml-2" />}
                </div>
                <p className="text-muted-foreground text-xs truncate">{email.from.name || email.from.email}</p>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-muted-foreground/60 text-xs truncate flex-1">{email.preview?.slice(0, 60)}</p>
                  <span className="text-muted-foreground/60 text-xs shrink-0 ml-2">{formatRelativeDate(email.date)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Email detail */}
      <div className={cn('flex-1 flex flex-col min-w-0 min-h-0', !selectedId && 'hidden md:flex')}>
        {emailDetail ? (
          <>
            <div className="px-6 py-4 border-b border-border shrink-0">
              <button onClick={() => { setSelectedId(null); setEmailDetail(null); }} className="md:hidden text-muted-foreground hover:text-foreground text-sm mb-2">← Back</button>
              <h2 className="text-foreground text-lg font-semibold">{emailDetail.subject}</h2>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-muted-foreground text-sm">{emailDetail.from.name} &lt;{emailDetail.from.email}&gt;</p>
                <span className="text-muted-foreground/60 text-xs">{formatRelativeDate(emailDetail.date)}</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {emailDetail.bodyType === 'html' ? (
                <iframe
                  srcDoc={`<!DOCTYPE html><html><head><style>body{color:#e2e8f0;background:#0d1b2a;font-family:system-ui;font-size:14px;padding:0;margin:0}a{color:#ea580c}img{max-width:100%}</style></head><body>${emailDetail.body}</body></html>`}
                  className="w-full h-full border-0 min-h-[400px]"
                  sandbox="allow-same-origin"
                  title="Email content"
                />
              ) : (
                <pre className="text-foreground text-sm whitespace-pre-wrap font-sans">{emailDetail.body}</pre>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Mail size={32} className="mx-auto text-muted-foreground/60 mb-2" />
              <p className="text-muted-foreground text-sm">Select an email to read</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
