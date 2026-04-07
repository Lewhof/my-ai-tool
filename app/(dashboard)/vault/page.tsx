'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn, formatRelativeDate } from '@/lib/utils';
import {
  Key, Code, CreditCard, Landmark, Fingerprint, FileLock,
  Wifi, Server, Shield, Search, Eye, EyeOff, Copy, Trash2,
  Hash, BadgeCheck, Car, Repeat, TrendingUp, FileText, Home,
  Building, DoorOpen, Plug,
} from 'lucide-react';
import type { CategoryDef } from '@/lib/vault-categories';

interface VaultEntry {
  id: string;
  name: string;
  service: string;
  category: string;
  masked_value: string;
  maskedFields?: Record<string, string>;
  fields?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

const CATEGORY_ICONS: Record<string, typeof Key> = {
  login: Key,
  api_key: Code,
  pin: Hash,
  membership: BadgeCheck,
  vehicle: Car,
  subscription: Repeat,
  bank_card: CreditCard,
  bank_account: Landmark,
  investment: TrendingUp,
  insurance: Shield,
  tax: FileText,
  property_bond: Home,
  property_levy: Building,
  property_access: DoorOpen,
  property_utility: Plug,
  identity: Fingerprint,
  secure_note: FileLock,
  wifi: Wifi,
  server: Server,
};

export default function VaultPage() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addCategory, setAddCategory] = useState('');
  const [newName, setNewName] = useState('');
  const [newFields, setNewFields] = useState<Record<string, string>>({});
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [revealedFields, setRevealedFields] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    const res = await fetch('/api/vault');
    const data = await res.json();
    setEntries(data.entries ?? []);
    setCategories(data.categories ?? []);
    if (!addCategory && data.categories?.length) setAddCategory(data.categories[0].key);
  }, [addCategory]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const addEntry = async () => {
    if (!newName.trim()) return;
    await fetch('/api/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, category: addCategory, fields: newFields }),
    });
    setNewName('');
    setNewFields({});
    setShowAdd(false);
    fetchEntries();
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    await fetch(`/api/vault/${id}`, { method: 'DELETE' });
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (revealedId === id) setRevealedId(null);
  };

  const revealEntry = async (id: string) => {
    if (revealedId === id) {
      setRevealedId(null);
      setRevealedFields({});
      return;
    }
    const res = await fetch(`/api/vault/${id}`);
    const data = await res.json();
    setRevealedId(id);
    setRevealedFields(data.fields ?? {});
  };

  const copyField = async (value: string, fieldKey: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(fieldKey);
    setTimeout(() => setCopied(null), 2000);
  };

  const selectedCatDef = categories.find((c) => c.key === addCategory);

  // Get unique categories from entries
  const usedCategories = [...new Set(entries.map((e) => e.category))];

  const filtered = entries.filter((e) => {
    const matchesCat = activeCategory === 'All' || e.category === activeCategory;
    const matchesSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.service.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Group by category
  const grouped = filtered.reduce<Record<string, VaultEntry[]>>((acc, e) => {
    const cat = categories.find((c) => c.key === e.category);
    const label = cat?.label || e.category;
    if (!acc[label]) acc[label] = [];
    acc[label].push(e);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Vault</h2>
          <p className="text-gray-500 text-sm mt-1">Securely store passwords, keys, cards, and secrets</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-accent-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-700 transition-colors"
        >
          {showAdd ? 'Cancel' : '+ Add Entry'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entries..."
          className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600 placeholder-gray-500"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveCategory('All')}
          className={cn(
            'px-4 py-2 rounded-full text-sm font-medium border transition-colors',
            activeCategory === 'All'
              ? 'bg-white text-gray-900 border-white'
              : 'text-gray-400 border-gray-600 hover:border-gray-400'
          )}
        >
          All ({entries.length})
        </button>
        {categories.filter((c) => usedCategories.includes(c.key)).map((cat) => {
          const count = entries.filter((e) => e.category === cat.key).length;
          const Icon = CATEGORY_ICONS[cat.key] || Key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                'px-3 py-2 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5',
                activeCategory === cat.key
                  ? 'bg-white text-gray-900 border-white'
                  : 'text-gray-400 border-gray-600 hover:border-gray-400'
              )}
            >
              <Icon size={14} />
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-300 text-sm block mb-1">Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Entry name"
                className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600"
              />
            </div>
            <div>
              <label className="text-gray-300 text-sm block mb-1">Category</label>
              <select
                value={addCategory}
                onChange={(e) => { setAddCategory(e.target.value); setNewFields({}); }}
                className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dynamic fields */}
          {selectedCatDef && (
            <div className="space-y-3 border-t border-gray-700 pt-4">
              {selectedCatDef.fields.map((field) => (
                <div key={field.key}>
                  <label className="text-gray-300 text-sm block mb-1">{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={newFields[field.key] || ''}
                      onChange={(e) => setNewFields({ ...newFields, [field.key]: e.target.value })}
                      rows={3}
                      placeholder={field.placeholder}
                      className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-600 resize-none"
                    />
                  ) : (
                    <input
                      type={field.type === 'password' || field.type === 'pin' ? 'password' : 'text'}
                      value={newFields[field.key] || ''}
                      onChange={(e) => setNewFields({ ...newFields, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-600 font-mono"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={addEntry}
            disabled={!newName.trim()}
            className="bg-accent-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-accent-700 transition-colors disabled:opacity-50"
          >
            Save Entry
          </button>
        </div>
      )}

      {/* Entries */}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
          <p className="text-gray-500">
            {search || activeCategory !== 'All' ? 'No entries match your filter.' : 'No entries yet. Click "+ Add Entry" to get started.'}
          </p>
        </div>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([categoryLabel, catEntries]) => (
            <div key={categoryLabel} className="space-y-2">
              <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-widest">{categoryLabel}</h3>
              <div className="bg-gray-800 border border-gray-700 rounded-lg divide-y divide-gray-700">
                {catEntries.map((entry) => {
                  const Icon = CATEGORY_ICONS[entry.category] || Key;
                  const catDef = categories.find((c) => c.key === entry.category);
                  const isRevealed = revealedId === entry.id;

                  return (
                    <div key={entry.id} className="px-5 py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <Icon size={18} className="text-gray-500 mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-white font-medium text-sm">{entry.name}</p>
                            <p className="text-gray-500 text-xs mt-0.5">{entry.masked_value}</p>

                            {/* Revealed fields */}
                            {isRevealed && catDef && (
                              <div className="mt-3 space-y-2 bg-gray-900 rounded-lg p-3">
                                {catDef.fields.map((field) => {
                                  const val = revealedFields[field.key];
                                  if (!val) return null;
                                  return (
                                    <div key={field.key} className="flex items-center justify-between">
                                      <div>
                                        <p className="text-gray-500 text-xs">{field.label}</p>
                                        <p className="text-white text-sm font-mono">{val}</p>
                                      </div>
                                      <button
                                        onClick={() => copyField(val, `${entry.id}-${field.key}`)}
                                        className="text-gray-500 hover:text-white transition-colors"
                                        title="Copy"
                                      >
                                        {copied === `${entry.id}-${field.key}` ? (
                                          <span className="text-green-400 text-xs">Copied</span>
                                        ) : (
                                          <Copy size={14} />
                                        )}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 ml-3 shrink-0">
                          <button
                            onClick={() => revealEntry(entry.id)}
                            className="text-gray-500 hover:text-white p-1.5 rounded hover:bg-gray-700 transition-colors"
                            title={isRevealed ? 'Hide' : 'Reveal'}
                          >
                            {isRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                          <button
                            onClick={() => deleteEntry(entry.id)}
                            className="text-gray-500 hover:text-red-400 p-1.5 rounded hover:bg-gray-700 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-600 text-xs mt-2">{formatRelativeDate(entry.created_at)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
      )}
    </div>
  );
}
