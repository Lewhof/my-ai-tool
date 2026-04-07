'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatRelativeDate } from '@/lib/utils';

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
        <button
          onClick={createDiagram}
          className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary transition-colors"
        >
          + New Diagram
        </button>
      </div>

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
