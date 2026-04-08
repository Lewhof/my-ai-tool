'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatRelativeDate } from '@/lib/utils';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Diagram {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export default function DiagramsPage() {
  const router = useRouter();
  const [diagrams, setDiagrams] = useState<Diagram[]>([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const fetchDiagrams = useCallback(async () => {
    const res = await fetch('/api/diagrams');
    const data = await res.json();
    setDiagrams(data.diagrams ?? []);
  }, []);

  useEffect(() => {
    fetchDiagrams();
  }, [fetchDiagrams]);

  const createDiagram = async () => {
    const res = await fetch('/api/diagrams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Untitled Diagram', nodes: [], edges: [] }),
    });
    const data = await res.json();
    if (data.id) router.push(`/diagrams/${data.id}`);
  };

  const generateDiagram = async () => {
    if (!generatePrompt.trim()) return;
    setGenerating(true);
    try {
      // Generate nodes/edges from AI
      const genRes = await fetch('/api/diagrams/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: generatePrompt }),
      });
      if (!genRes.ok) throw new Error('Generation failed');
      const { nodes, edges } = await genRes.json();

      // Save as new diagram
      const name = generatePrompt.slice(0, 50) + (generatePrompt.length > 50 ? '...' : '');
      const saveRes = await fetch('/api/diagrams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: generatePrompt, nodes, edges }),
      });
      const saved = await saveRes.json();
      if (saved.id) {
        toast('Diagram generated');
        router.push(`/diagrams/${saved.id}`);
      }
    } catch {
      toast.error('Could not generate diagram. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  const deleteDiagram = async (id: string) => {
    if (!confirm('Delete this diagram?')) return;
    await fetch(`/api/diagrams/${id}`, { method: 'DELETE' });
    setDiagrams((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Diagrams</h2>
          <p className="text-muted-foreground text-sm mt-1">Visual architecture and planning</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGenerate(!showGenerate)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-white/15 transition-colors"
          >
            <Sparkles size={14} />
            Generate with AI
          </button>
          <button
            onClick={createDiagram}
            className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary transition-colors"
          >
            + New Diagram
          </button>
        </div>
      </div>

      {/* AI Generate */}
      {showGenerate && (
        <div className="rounded-2xl border border-border p-5 space-y-3 animate-fade-up" style={{ background: 'var(--color-surface-1)' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={14} style={{ color: 'var(--color-brand)' }} />
            <span className="text-[13px] font-semibold text-foreground">AI Diagram Generator</span>
          </div>
          <textarea
            value={generatePrompt}
            onChange={(e) => setGeneratePrompt(e.target.value)}
            placeholder="Describe your diagram — e.g. 'User auth flow with OAuth, signup, login, password reset'"
            rows={3}
            className="w-full rounded-xl px-4 py-3 text-[13px] text-foreground placeholder-muted-foreground outline-none border border-border focus:border-white/20 resize-none"
            style={{ background: 'var(--color-surface-2)' }}
          />
          <div className="flex flex-wrap gap-2">
            {['Org chart for a tech startup', 'CI/CD pipeline', 'E-commerce checkout flow', 'Database schema for SaaS'].map(ex => (
              <button key={ex} onClick={() => setGeneratePrompt(ex)}
                className="px-2.5 py-1 text-[11px] text-muted-foreground border border-border rounded-full hover:border-white/15 hover:text-foreground transition-colors">
                {ex}
              </button>
            ))}
          </div>
          <button
            onClick={generateDiagram}
            disabled={!generatePrompt.trim() || generating}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-white btn-brand disabled:opacity-50 flex items-center gap-2"
            style={{ background: 'var(--color-brand)' }}
          >
            {generating ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : 'Generate Diagram'}
          </button>
        </div>
      )}

      {/* Claude sub-page link */}
      <Link
        href="/diagrams/claude"
        className="block bg-card border border-primary/30 rounded-lg p-5 hover:border-primary transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{'\u{1F916}'}</span>
          <div>
            <p className="text-foreground font-semibold">Claude Diagrams</p>
            <p className="text-muted-foreground text-sm">AI-generated architecture and stack diagrams</p>
          </div>
        </div>
      </Link>

      {/* User diagrams */}
      {diagrams.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No custom diagrams yet. Create one or explore Claude diagrams.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {diagrams.map((diagram) => (
            <div
              key={diagram.id}
              className="bg-card border border-border rounded-lg p-4 hover:border-border transition-colors group cursor-pointer"
              onClick={() => router.push(`/diagrams/${diagram.id}`)}
            >
              <p className="text-foreground font-medium mb-1">{diagram.name}</p>
              {diagram.description && (
                <p className="text-muted-foreground text-sm mb-2">{diagram.description}</p>
              )}
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span>{formatRelativeDate(diagram.updated_at)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteDiagram(diagram.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
