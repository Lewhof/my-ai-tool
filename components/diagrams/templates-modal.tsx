'use client';

import { diagramTemplates, type DiagramTemplate } from '@/lib/diagrams/templates';

interface TemplatesModalProps {
  onSelect: (template: DiagramTemplate) => void;
  onClose: () => void;
}

export default function TemplatesModal({ onSelect, onClose }: TemplatesModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-background border border-border rounded-xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-foreground font-semibold">Diagram Templates</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-4 grid gap-3 max-h-[60vh] overflow-auto">
          {diagramTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="text-left p-4 bg-card rounded-lg border border-border hover:border-primary transition-colors group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-foreground font-medium text-sm group-hover:text-primary transition-colors">{t.name}</span>
                <span className="text-muted-foreground text-xs">{t.nodes.length} nodes</span>
              </div>
              <p className="text-muted-foreground text-xs">{t.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
