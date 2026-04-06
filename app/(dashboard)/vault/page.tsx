'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatRelativeDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface VaultKey {
  id: string;
  name: string;
  service: string;
  category: string;
  masked_value: string;
  value?: string;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ['All', 'Password', 'API Key', 'Secure Note', 'Card', 'Other'];

const SERVICE_OPTIONS = [
  'Anthropic',
  'Clerk',
  'GitHub',
  'Helicone',
  'Supabase',
  'Telegram',
  'Vercel',
  'Other',
];

export default function VaultPage() {
  const [keys, setKeys] = useState<VaultKey[]>([]);
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newService, setNewService] = useState('Other');
  const [newCategory, setNewCategory] = useState('API Key');
  const [newValue, setNewValue] = useState('');
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [revealedValue, setRevealedValue] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    const res = await fetch('/api/vault');
    const data = await res.json();
    setKeys(data.keys ?? []);
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const addKey = async () => {
    if (!newName.trim() || !newValue.trim()) return;
    await fetch('/api/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, service: newService, category: newCategory, value: newValue }),
    });
    setNewName('');
    setNewService('Other');
    setNewCategory('API Key');
    setNewValue('');
    setShowAdd(false);
    fetchKeys();
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Delete this key?')) return;
    await fetch(`/api/vault/${id}`, { method: 'DELETE' });
    setKeys((prev) => prev.filter((k) => k.id !== id));
    if (revealedId === id) {
      setRevealedId(null);
      setRevealedValue('');
    }
  };

  const revealKey = async (id: string) => {
    if (revealedId === id) {
      setRevealedId(null);
      setRevealedValue('');
      return;
    }
    const res = await fetch(`/api/vault/${id}`);
    const data = await res.json();
    setRevealedId(id);
    setRevealedValue(data.value ?? '');
  };

  const copyKey = async (id: string) => {
    const res = await fetch(`/api/vault/${id}`);
    const data = await res.json();
    await navigator.clipboard.writeText(data.value ?? '');
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // Filter keys
  const filtered = keys.filter((key) => {
    const matchesTab = activeTab === 'All' || key.category === activeTab;
    const matchesSearch =
      !search ||
      key.name.toLowerCase().includes(search.toLowerCase()) ||
      key.service.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  // Group by service
  const grouped = filtered.reduce<Record<string, VaultKey[]>>((acc, key) => {
    const service = key.service || 'Other';
    if (!acc[service]) acc[service] = [];
    acc[service].push(key);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Vault</h2>
          <p className="text-gray-500 text-sm mt-1">Securely store passwords, API keys, and notes</p>
        </div>
        <div className="flex gap-2">
          {keys.length === 0 && (
            <button
              onClick={async () => {
                await fetch('/api/vault/seed', { method: 'POST' });
                fetchKeys();
              }}
              className="bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors border border-gray-600"
            >
              Seed Keys
            </button>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add Entry'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entries..."
          className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-600 placeholder-gray-500"
        />
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium border transition-colors',
              activeTab === cat
                ? 'bg-white text-gray-900 border-white'
                : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400 hover:text-gray-300'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Add Entry Form */}
      {showAdd && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-gray-300 text-sm block mb-1">Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. ANTHROPIC_API_KEY"
                className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div>
              <label className="text-gray-300 text-sm block mb-1">Service</label>
              <select
                value={newService}
                onChange={(e) => setNewService(e.target.value)}
                className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2"
              >
                {SERVICE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-gray-300 text-sm block mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2"
              >
                {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-gray-300 text-sm block mb-1">Value</label>
            <input
              type="password"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="sk-ant-api03-..."
              className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono"
            />
          </div>
          <button
            onClick={addKey}
            disabled={!newName.trim() || !newValue.trim()}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            Save Entry
          </button>
        </div>
      )}

      {/* Keys List */}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
          <p className="text-gray-500">
            {search || activeTab !== 'All'
              ? 'No entries match your filter.'
              : 'No entries stored yet. Click "+ Add Entry" to get started.'}
          </p>
        </div>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([service, serviceKeys]) => (
            <div key={service} className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{service}</h3>
              <div className="bg-gray-800 border border-gray-700 rounded-lg divide-y divide-gray-700">
                {serviceKeys.map((key) => (
                  <div key={key.id} className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-medium text-sm">{key.name}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
                            {key.category}
                          </span>
                        </div>
                        <p className="text-gray-500 text-xs font-mono mt-1">
                          {revealedId === key.id ? revealedValue : key.masked_value}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => revealKey(key.id)}
                          className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded border border-gray-600 hover:border-gray-500 transition-colors"
                        >
                          {revealedId === key.id ? 'Hide' : 'Reveal'}
                        </button>
                        <button
                          onClick={() => copyKey(key.id)}
                          className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded border border-gray-600 hover:border-gray-500 transition-colors"
                        >
                          {copied === key.id ? 'Copied!' : 'Copy'}
                        </button>
                        <button
                          onClick={() => deleteKey(key.id)}
                          className="text-gray-400 hover:text-red-400 text-xs px-2 py-1 rounded border border-gray-600 hover:border-red-600/50 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <p className="text-gray-600 text-xs mt-1">Added {formatRelativeDate(key.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          ))
      )}
    </div>
  );
}
