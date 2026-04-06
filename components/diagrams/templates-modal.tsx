'use client';

import { diagramTemplates, type DiagramTemplate } from '@/lib/diagrams/templates';

interface TemplatesModalProps {
  onSelect: (template: DiagramTemplate) => void;
  onClose: () => void;
}

export default function TemplatesModal({ onSelect, onClose }: TemplatesModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-white font-semibold">Diagram Templates</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-4 grid gap-3 max-h-[60vh] overflow-auto">
          {diagramTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="text-left p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-accent-500 transition-colors group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-white font-medium text-sm group-hover:text-accent-400 transition-colors">{t.name}</span>
                <span className="text-gray-500 text-xs">{t.nodes.length} nodes</span>
              </div>
              <p className="text-gray-400 text-xs">{t.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
