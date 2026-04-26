'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, AlertTriangle, CheckCircle2, Loader2, Terminal, FileEdit, Globe, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type StreamEvent =
  | { type: 'ready'; sessionId: string; cwd: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_request'; id: string; tool: string; input: unknown; requires_approval: boolean }
  | { type: 'tool_result'; id: string; output: unknown; ok: boolean }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; text: string }
  | { type: 'done'; exit_code: number; summary: string }
  | { type: 'error'; message: string };

interface ToolEntry {
  id: string;
  tool: string;
  input: unknown;
  status: 'pending_approval' | 'running' | 'ok' | 'error' | 'denied';
  output?: unknown;
}

interface BuildPanelProps {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string;
  initialRepoUrl?: string;
}

const TOOL_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Bash: Terminal,
  Edit: FileEdit,
  Write: FileEdit,
  WebFetch: Globe,
  WebSearch: Search,
  Read: FileEdit,
  Grep: Search,
  Glob: Search,
};

export default function BuildPanel({ open, onClose, initialPrompt = '', initialRepoUrl = '' }: BuildPanelProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [repoUrl, setRepoUrl] = useState(initialRepoUrl);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'running' | 'done' | 'error' | 'unconfigured'>('idle');
  const [text, setText] = useState('');
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Mirror status into a ref so WS event handlers (which capture closures
  // at registration time) read the current value, not the value at register.
  const statusRef = useRef<typeof status>('idle');
  statusRef.current = status;

  const reset = useCallback(() => {
    setText('');
    setTools([]);
    setLogs([]);
    setStatus('idle');
    sessionIdRef.current = null;
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }
  }, []);

  useEffect(() => () => { reset(); }, [reset]);

  const start = async () => {
    if (!prompt.trim()) {
      toast.error('Prompt is required');
      return;
    }
    reset();
    setStatus('connecting');

    try {
      // Step 1: ask Next.js to mint a session at the bridge.
      const res = await fetch('/api/cerebro/build/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoUrl.trim() || undefined }),
      });
      if (res.status === 503) {
        setStatus('unconfigured');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Bridge unavailable (${res.status})`);
      }
      const { session_id, ws_url, bearer } = await res.json() as { session_id: string; ws_url: string; bearer: string };
      sessionIdRef.current = session_id;

      // Step 2: open the WebSocket. Bearer rides in Sec-WebSocket-Protocol
      // (encoded with dots since colons are forbidden in WS subprotocol
      // values) so the credential never lands in nginx/CDN access logs the
      // way a `?token=` query string would.
      const protoBearer = `bearer.${bearer.replace(/:/g, '.')}`;
      const ws = new WebSocket(ws_url, [protoBearer]);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('running');
        ws.send(JSON.stringify({ type: 'spawn', prompt: prompt.trim() }));
      };

      ws.onmessage = (event) => {
        let parsed: StreamEvent | null = null;
        try { parsed = JSON.parse(event.data) as StreamEvent; } catch { return; }
        if (!parsed) return;

        switch (parsed.type) {
          case 'text_delta':
            setText(t => t + parsed.text);
            break;
          case 'tool_request':
            setTools(ts => [...ts, {
              id: parsed.id,
              tool: parsed.tool,
              input: parsed.input,
              status: parsed.requires_approval ? 'pending_approval' : 'running',
            }]);
            break;
          case 'tool_result':
            setTools(ts => ts.map(t =>
              t.id === parsed.id
                ? { ...t, status: parsed.ok ? 'ok' : 'error', output: parsed.output }
                : t
            ));
            break;
          case 'log':
            setLogs(l => [...l, `[${parsed.level}] ${parsed.text}`]);
            break;
          case 'done':
            setStatus('done');
            toast.success('Build session completed');
            break;
          case 'error':
            setStatus('error');
            toast.error(parsed.message);
            break;
        }
      };

      ws.onerror = () => {
        setStatus('error');
        toast.error('Connection error');
      };

      ws.onclose = () => {
        // Use the ref so we read the *current* status, not the stale value
        // captured when this handler was registered.
        if (statusRef.current === 'running') setStatus('done');
        wsRef.current = null;
      };
    } catch (err) {
      setStatus('error');
      toast.error(err instanceof Error ? err.message : 'Failed to start');
    }
  };

  const sendApproval = (id: string, approve: boolean) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: approve ? 'tool_approve' : 'tool_deny', id }));
    setTools(ts => ts.map(t => t.id === id ? { ...t, status: approve ? 'running' : 'denied' } : t));
  };

  const cancel = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cancel' }));
    }
    reset();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[440px] bg-background border-l border-border shadow-2xl flex flex-col">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-[0_0_14px_var(--brand-glow)]">
            <Terminal size={14} className="text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-foreground font-bold text-sm">Build session</h2>
            <p className="text-muted-foreground text-[11px]">
              {status === 'idle' && 'Cerebro → Claude Code'}
              {status === 'unconfigured' && 'Bridge not configured'}
              {status === 'connecting' && 'Connecting…'}
              {status === 'running' && 'Live'}
              {status === 'done' && 'Completed'}
              {status === 'error' && 'Errored'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {status === 'running' && (
            <button onClick={cancel} className="text-muted-foreground hover:text-red-400 p-1.5 rounded hover:bg-secondary" title="Cancel session">
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-secondary">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {status === 'unconfigured' && (
          <div className="bg-card border border-border rounded-xl p-6 text-center">
            <Terminal size={28} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-foreground font-semibold">Bridge not configured</p>
            <p className="text-muted-foreground text-sm mt-1.5 max-w-sm mx-auto">
              Set <code className="text-foreground bg-secondary px-1 rounded text-xs">CLAUDE_CODE_BRIDGE_URL</code> and
              <code className="text-foreground bg-secondary px-1 rounded text-xs ml-1">CLAUDE_CODE_BRIDGE_SECRET</code> in
              the Vercel project, then deploy. Setup steps live in <code className="text-foreground bg-secondary px-1 rounded text-xs">services/claude-code-bridge/README.md</code>.
            </p>
            <button
              onClick={() => setStatus('idle')}
              className="mt-4 text-xs text-muted-foreground hover:text-foreground underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {status === 'idle' && (
          <>
            <label className="block">
              <span className="text-muted-foreground text-xs">Repo URL (optional — leave blank for empty workspace)</span>
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo.git"
                className="mt-1 w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
              />
            </label>
            <label className="block">
              <span className="text-muted-foreground text-xs">Prompt</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                placeholder="Describe the change. Claude Code will plan, run tools, and report back. Destructive actions need your approval."
                className="mt-1 w-full bg-card border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary/50"
              />
            </label>
            <button
              onClick={start}
              disabled={!prompt.trim()}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-lg font-medium text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              <Play size={14} fill="currentColor" /> Start session
            </button>
          </>
        )}

        {status !== 'idle' && (
          <>
            {/* Tool stream */}
            {tools.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-muted-foreground text-[11px] uppercase tracking-wide">Tools</h3>
                {tools.map(t => <ToolCard key={t.id} entry={t} onApprove={() => sendApproval(t.id, true)} onDeny={() => sendApproval(t.id, false)} />)}
              </div>
            )}

            {/* Streamed assistant text */}
            {text && (
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-muted-foreground text-[11px] uppercase tracking-wide mb-2">Assistant</h3>
                <pre className="whitespace-pre-wrap font-mono text-xs text-foreground/90 leading-relaxed">{text}</pre>
              </div>
            )}

            {/* Logs */}
            {logs.length > 0 && (
              <details className="bg-card border border-border rounded-xl p-3">
                <summary className="text-muted-foreground text-[11px] uppercase tracking-wide cursor-pointer">
                  Logs ({logs.length})
                </summary>
                <pre className="mt-2 text-[10px] text-muted-foreground font-mono whitespace-pre-wrap">{logs.join('\n')}</pre>
              </details>
            )}

            {(status === 'done' || status === 'error') && (
              <button
                onClick={reset}
                className="w-full flex items-center justify-center gap-2 border border-border text-muted-foreground hover:text-foreground py-2 rounded-lg text-sm hover:bg-secondary transition-colors"
              >
                Start another session
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ToolCard({ entry, onApprove, onDeny }: { entry: ToolEntry; onApprove: () => void; onDeny: () => void }) {
  const Icon = TOOL_ICONS[entry.tool] ?? Terminal;
  const inputStr = entry.input ? JSON.stringify(entry.input, null, 2) : '';

  const [statusIcon, statusColor] = (() => {
    switch (entry.status) {
      case 'pending_approval': return [<AlertTriangle key="i" size={12} />, 'text-yellow-400'] as const;
      case 'running': return [<Loader2 key="i" size={12} className="animate-spin" />, 'text-blue-400'] as const;
      case 'ok': return [<CheckCircle2 key="i" size={12} />, 'text-emerald-400'] as const;
      case 'error': return [<X key="i" size={12} />, 'text-red-400'] as const;
      case 'denied': return [<X key="i" size={12} />, 'text-muted-foreground'] as const;
    }
  })();

  return (
    <div className={cn(
      'border rounded-xl p-3',
      entry.status === 'pending_approval' ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-border bg-card',
    )}>
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-primary shrink-0" />
        <span className="font-mono text-xs text-foreground font-semibold">{entry.tool}</span>
        <span className={cn('ml-auto flex items-center gap-1', statusColor)}>{statusIcon}</span>
      </div>
      {inputStr && (
        <details className="mt-2">
          <summary className="text-muted-foreground text-[10px] cursor-pointer hover:text-foreground">input</summary>
          <pre className="mt-1 text-[10px] text-muted-foreground/80 font-mono whitespace-pre-wrap break-all">{inputStr}</pre>
        </details>
      )}
      {entry.status === 'pending_approval' && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={onApprove}
            className="flex-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-500/30 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={onDeny}
            className="flex-1 bg-secondary border border-border text-muted-foreground py-1.5 rounded-lg text-xs font-medium hover:text-foreground transition-colors"
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
}
