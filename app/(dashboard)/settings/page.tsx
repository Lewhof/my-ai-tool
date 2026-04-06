'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [defaultModel, setDefaultModel] = useState('fast');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.default_model) setDefaultModel(data.default_model);
      });
  }, []);

  const save = async (updates: Record<string, unknown>) => {
    setSaving(true);
    setSaved(false);
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearChats = async () => {
    if (!confirm('Delete all chat threads and messages? This cannot be undone.')) return;
    await fetch('/api/chat/threads', { method: 'DELETE' }).catch(() => {});
    alert('Chats cleared.');
  };

  return (
    <div className="p-6 max-w-2xl space-y-8">
      {/* AI Preferences */}
      <section>
        <h3 className="text-lg font-semibold text-white mb-4">AI Preferences</h3>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
          <div>
            <label className="text-gray-300 text-sm block mb-2">Default Model</label>
            <select
              value={defaultModel}
              onChange={(e) => {
                setDefaultModel(e.target.value);
                save({ default_model: e.target.value });
              }}
              className="bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="fast">Haiku (fast, cheap)</option>
              <option value="smart">Sonnet (smart, more expensive)</option>
            </select>
            <p className="text-gray-500 text-xs mt-1">
              Haiku: ~$0.001/response. Sonnet: ~$0.01/response.
            </p>
          </div>
        </div>
      </section>

      {/* Data Management */}
      <section>
        <h3 className="text-lg font-semibold text-white mb-4">Data Management</h3>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">Clear All Chats</p>
              <p className="text-gray-500 text-xs">Delete all conversation threads and messages</p>
            </div>
            <button
              onClick={handleClearChats}
              className="bg-red-600/20 text-red-400 border border-red-600/30 px-4 py-2 rounded-lg text-sm hover:bg-red-600/30 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      {/* About */}
      <section>
        <h3 className="text-lg font-semibold text-white mb-4">About</h3>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-2 text-sm text-gray-400">
          <p>Lewhof AI Dashboard v0.1.0</p>
          <p>Built with Next.js, Supabase, Claude AI</p>
          <div className="flex gap-4 pt-2">
            <a href="https://fwzsjylbczeqldckwqfy.supabase.co" target="_blank" className="text-indigo-400 hover:underline">Supabase</a>
            <a href="https://dashboard.clerk.com" target="_blank" className="text-indigo-400 hover:underline">Clerk</a>
            <a href="https://helicone.ai" target="_blank" className="text-indigo-400 hover:underline">Helicone</a>
          </div>
        </div>
      </section>

      {saving && <p className="text-gray-500 text-sm">Saving...</p>}
      {saved && <p className="text-green-400 text-sm">Saved!</p>}
    </div>
  );
}
