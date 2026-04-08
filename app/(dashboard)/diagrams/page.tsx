'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatRelativeDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Sparkles, Loader2, Upload, Image as ImageIcon, X } from 'lucide-react';
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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageSelect = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageSelect(file);
        return;
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) handleImageSelect(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const generateDiagram = async () => {
    if (!generatePrompt.trim() && !imageFile) return;
    setGenerating(true);
    try {
      let genRes: Response;

      if (imageFile) {
        // Send image + prompt via FormData
        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('prompt', generatePrompt || 'Convert this image into a diagram');
        genRes = await fetch('/api/diagrams/generate', { method: 'POST', body: formData });
      } else {
        genRes = await fetch('/api/diagrams/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: generatePrompt }),
        });
      }

      if (!genRes.ok) {
        const errData = await genRes.json().catch(() => ({}));
        throw new Error(errData.error || `Generation failed (${genRes.status})`);
      }
      const { nodes, edges } = await genRes.json();

      const name = (generatePrompt || 'Image diagram').slice(0, 50);
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate diagram. Try again.');
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
          <div onPaste={handlePaste} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
            <textarea
              value={generatePrompt}
              onChange={(e) => setGeneratePrompt(e.target.value)}
              placeholder="Describe your diagram — or paste/upload an image of a whiteboard, sketch, or existing diagram"
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-[13px] text-foreground placeholder-muted-foreground outline-none border border-border focus:border-white/20 resize-none"
              style={{ background: 'var(--color-surface-2)' }}
            />
          </div>

          {/* Image preview */}
          {imagePreview && (
            <div className="relative inline-block animate-fade-up">
              <img src={imagePreview} alt="Upload" className="max-h-40 rounded-xl border border-border" />
              <button
                onClick={clearImage}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-white flex items-center justify-center"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Image upload + examples row */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground border border-border rounded-full hover:border-white/15 hover:text-foreground transition-colors"
            >
              <Upload size={11} /> Upload image
            </button>
            <span className="text-[10px] text-muted-foreground/40">or paste (Ctrl+V)</span>
            <span className="text-[10px] text-muted-foreground/40 mx-1">|</span>
            {['Org chart for a tech startup', 'CI/CD pipeline', 'E-commerce checkout flow'].map(ex => (
              <button key={ex} onClick={() => setGeneratePrompt(ex)}
                className="px-2.5 py-1 text-[11px] text-muted-foreground border border-border rounded-full hover:border-white/15 hover:text-foreground transition-colors">
                {ex}
              </button>
            ))}
          </div>

          <button
            onClick={generateDiagram}
            disabled={(!generatePrompt.trim() && !imageFile) || generating}
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
