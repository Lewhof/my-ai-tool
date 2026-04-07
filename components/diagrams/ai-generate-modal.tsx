'use client';

import { useState } from 'react';

interface AIGenerateModalProps {
  onGenerate: (prompt: string) => void;
  onClose: () => void;
  loading?: boolean;
}

export default function AIGenerateModal({ onGenerate, onClose, loading }: AIGenerateModalProps) {
  const [prompt, setPrompt] = useState('');

  const examples = [
    'User authentication flow with OAuth',
    'Microservices architecture for e-commerce',
    'CI/CD pipeline from commit to production',
    'Database schema for a blog platform',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-background border border-border rounded-xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-foreground font-semibold flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a4 4 0 014 4c0 1.95-2 3-2 8h-4c0-5-2-6.05-2-8a4 4 0 014-4z"/><path d="M10 14h4"/><path d="M10 18h4"/><path d="M12 22v-2"/></svg>
            AI Diagram Generator
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-muted-foreground text-xs font-medium block mb-2">Describe your diagram</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., User authentication flow with signup, login, password reset, and session management"
              rows={4}
              className="w-full bg-card text-foreground border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
          <div>
            <span className="text-muted-foreground text-xs block mb-2">Examples:</span>
            <div className="flex flex-wrap gap-2">
              {examples.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="px-2.5 py-1 text-xs text-muted-foreground bg-card border border-border rounded-full hover:border-primary hover:text-foreground transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => prompt.trim() && onGenerate(prompt.trim())}
            disabled={!prompt.trim() || loading}
            className="w-full py-2.5 bg-primary hover:bg-primary disabled:opacity-50 text-foreground rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                Generating...
              </>
            ) : (
              'Generate Diagram'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
