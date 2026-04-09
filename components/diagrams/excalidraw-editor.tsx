'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import { Save, Sparkles, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import '@excalidraw/excalidraw/index.css';

// Excalidraw ships ESM with browser-only deps — must be dynamically imported.
const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  { ssr: false, loading: () => <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Loading Excalidraw…</div> },
);

type Scene = {
  elements: readonly unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

interface ExcalidrawEditorProps {
  id: string;
  initialName: string;
  initialScene: Scene;
}

export default function ExcalidrawEditor({ id, initialName, initialScene }: ExcalidrawEditorProps) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const nameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialData: ExcalidrawInitialDataState = {
    elements: (initialScene?.elements as never) ?? [],
    appState: {
      ...(initialScene?.appState as object),
      theme: 'dark',
      viewBackgroundColor: '#1e1e2e',
    },
    files: (initialScene?.files as never) ?? {},
    scrollToContent: true,
  };

  const saveScene = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const files = api.getFiles();

    // Strip transient UI state that shouldn't persist.
    const cleanedAppState = { ...appState };
    delete (cleanedAppState as Record<string, unknown>).collaborators;

    setSaving(true);
    try {
      const res = await fetch(`/api/diagrams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          excalidraw_scene: {
            elements,
            appState: cleanedAppState,
            files,
          },
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSavedAt(Date.now());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [id]);

  // Autosave 2s after the last change
  const changeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChange = useCallback(() => {
    if (changeTimer.current) clearTimeout(changeTimer.current);
    changeTimer.current = setTimeout(() => { saveScene(); }, 2000);
  }, [saveScene]);

  useEffect(() => () => { if (changeTimer.current) clearTimeout(changeTimer.current); }, []);

  const handleNameChange = (val: string) => {
    setName(val);
    if (nameDebounce.current) clearTimeout(nameDebounce.current);
    nameDebounce.current = setTimeout(async () => {
      await fetch(`/api/diagrams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: val }),
      });
    }, 800);
  };

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/diagrams/generate-excalidraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Generation failed (${res.status})`);
      }
      const { elements } = await res.json();
      const api = apiRef.current;
      if (api && Array.isArray(elements)) {
        api.updateScene({ elements });
        api.scrollToContent(undefined, { fitToViewport: true, animate: true });
        setAiOpen(false);
        setAiPrompt('');
        toast.success('Diagram generated');
        // Autosave triggers via onChange
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  const savedLabel = saving
    ? 'Saving…'
    : savedAt
      ? `Saved ${new Date(savedAt).toLocaleTimeString()}`
      : 'Autosave on';

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link href="/diagrams" className="text-muted-foreground hover:text-foreground shrink-0">
            <ArrowLeft size={16} />
          </Link>
          <input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="bg-transparent text-foreground text-sm font-medium outline-none border-b border-transparent focus:border-border min-w-0 flex-1 max-w-xs"
          />
          <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-purple-500/20 text-purple-400 border-purple-500/30 shrink-0">
            EXCALIDRAW
          </span>
          <span className="text-xs text-muted-foreground shrink-0">{savedLabel}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAiOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-white/15 transition-colors"
          >
            <Sparkles size={12} /> Generate with AI
          </button>
          <button
            onClick={saveScene}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-background hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        <Excalidraw
          initialData={initialData}
          excalidrawAPI={(api) => { apiRef.current = api; }}
          onChange={onChange}
          theme="dark"
        />
      </div>

      {/* AI Generate Modal */}
      {aiOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !aiLoading && setAiOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl p-6 max-w-lg w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-foreground font-semibold flex items-center gap-2">
                <Sparkles size={16} className="text-primary" /> Generate Excalidraw Scene
              </h3>
              <p className="text-muted-foreground text-xs mt-1">
                Describe what you want. The scene will replace the current canvas contents.
              </p>
            </div>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. Architecture diagram: Next.js frontend → API → Supabase → Anthropic via Helicone"
              rows={4}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground text-sm focus:outline-none focus:border-primary resize-none"
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5">
              {[
                'CI/CD pipeline with GitHub Actions',
                'User auth flow with Clerk',
                'Database schema for a blog',
              ].map(ex => (
                <button
                  key={ex}
                  onClick={() => setAiPrompt(ex)}
                  className="px-2.5 py-1 text-[11px] text-muted-foreground border border-border rounded-full hover:border-white/15 hover:text-foreground transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={generateWithAI}
                disabled={aiLoading || !aiPrompt.trim()}
                className="flex-1 bg-primary text-background font-medium text-sm px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {aiLoading ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : 'Generate'}
              </button>
              <button
                onClick={() => setAiOpen(false)}
                disabled={aiLoading}
                className="text-muted-foreground hover:text-foreground text-xs px-3 py-2 border border-border rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
