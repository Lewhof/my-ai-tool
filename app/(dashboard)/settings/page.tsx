'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [defaultModel, setDefaultModel] = useState('fast');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.default_model) setDefaultModel(data.default_model);
      });
  }, []);

  const save = async (updates: Record<string, unknown>) => {
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    toast('Settings saved');
  };

  const handleClearChats = async () => {
    if (!confirm('Delete all chat threads and messages? This cannot be undone.')) return;
    await fetch('/api/chat/threads', { method: 'DELETE' }).catch(() => {});
    toast('Chats cleared');
  };

  return (
    <div className="p-4 lg:p-6 max-w-2xl space-y-6 animate-fade-up">
      {/* AI Preferences */}
      <section>
        <h3 className="text-[16px] font-bold text-foreground mb-4">AI Preferences</h3>
        <div className="rounded-2xl border border-border overflow-hidden" style={{ background: 'var(--color-surface-1)' }}>
          <div className="p-5">
            <label className="text-[13px] text-muted-foreground block mb-2">Default Model</label>
            <select
              value={defaultModel}
              onChange={(e) => {
                setDefaultModel(e.target.value);
                save({ default_model: e.target.value });
              }}
              className="w-full rounded-xl px-4 py-2.5 text-[13px] text-foreground outline-none border border-border focus:border-white/20 transition-colors"
              style={{ background: 'var(--color-surface-2)' }}
            >
              <option value="fast">Haiku (fast, cheap)</option>
              <option value="smart">Sonnet (smart, more expensive)</option>
            </select>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Haiku: ~$0.001/response. Sonnet: ~$0.01/response.
            </p>
          </div>
        </div>
      </section>

      {/* Data Export */}
      <section>
        <h3 className="text-[16px] font-bold text-foreground mb-4">Data Export</h3>
        <div className="rounded-2xl border border-border overflow-hidden" style={{ background: 'var(--color-surface-1)' }}>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-[13px] font-medium text-foreground">Export All Data (JSON)</p>
                <p className="text-[11px] text-muted-foreground">Download chats, todos, whiteboard, notes, documents, KB, vault</p>
              </div>
              <a
                href="/api/export?format=json"
                className="px-4 py-2 rounded-lg text-[12px] font-medium border border-border hover:bg-surface-2 transition-colors"
                style={{ color: 'var(--color-brand)' }}
              >
                Download JSON
              </a>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-[13px] font-medium text-foreground">Export All Data (CSV)</p>
                <p className="text-[11px] text-muted-foreground">Spreadsheet-friendly format</p>
              </div>
              <a
                href="/api/export?format=csv"
                className="px-4 py-2 rounded-lg text-[12px] font-medium border border-border hover:bg-surface-2 transition-colors"
                style={{ color: 'var(--color-brand)' }}
              >
                Download CSV
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Data Management */}
      <section>
        <h3 className="text-[16px] font-bold text-foreground mb-4">Data Management</h3>
        <div className="rounded-2xl border border-border overflow-hidden" style={{ background: 'var(--color-surface-1)' }}>
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-[13px] font-medium text-foreground">Clear All Chats</p>
              <p className="text-[11px] text-muted-foreground">Delete all conversation threads and messages</p>
            </div>
            <button
              onClick={handleClearChats}
              className="px-4 py-2 rounded-lg text-[12px] font-medium text-destructive border border-border hover:bg-surface-2 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      {/* About */}
      <section>
        <h3 className="text-[16px] font-bold text-foreground mb-4">About</h3>
        <div className="rounded-2xl border border-border overflow-hidden" style={{ background: 'var(--color-surface-1)' }}>
          <div className="p-5 space-y-2 text-[13px] text-muted-foreground">
            <p>Lewhof AI Dashboard v0.1.0</p>
            <p>Built with Next.js, Supabase, Claude AI</p>
            <div className="flex gap-4 pt-2">
              <a href="https://fwzsjylbczeqldckwqfy.supabase.co" target="_blank" className="hover:text-foreground transition-colors" style={{ color: 'var(--color-brand)' }}>Supabase</a>
              <a href="https://dashboard.clerk.com" target="_blank" className="hover:text-foreground transition-colors" style={{ color: 'var(--color-brand)' }}>Clerk</a>
              <a href="https://helicone.ai" target="_blank" className="hover:text-foreground transition-colors" style={{ color: 'var(--color-brand)' }}>Helicone</a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
