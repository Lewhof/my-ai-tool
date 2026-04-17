'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn, formatRelativeDate } from '@/lib/utils';
import {
  Key, Code, CreditCard, Landmark, Fingerprint, FileLock,
  Wifi, Server, Shield, Search, Eye, EyeOff, Copy, Trash2,
  Hash, BadgeCheck, Car, Repeat, TrendingUp, FileText, Home,
  Building, DoorOpen, Plug, Camera, Loader2, Lock, LockOpen,
} from 'lucide-react';
import { toast } from 'sonner';
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
  const [locked, setLocked] = useState(true);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [settingUp, setSettingUp] = useState(false);

  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addCategory, setAddCategory] = useState('');
  const [newName, setNewName] = useState('');
  const [newFields, setNewFields] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [revealedFields, setRevealedFields] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  // Check vault lock status
  useEffect(() => {
    fetch('/api/vault/auth')
      .then(r => r.json())
      .then(d => {
        setHasPin(d.hasPin);
        if (!d.hasPin) setLocked(false); // No PIN = no lock
      })
      .catch(() => setLocked(false));
  }, []);

  const verifyPin = async () => {
    setPinError('');
    const res = await fetch('/api/vault/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', pin: pinInput }),
    });
    if (res.ok) {
      setLocked(false);
      setPinInput('');
    } else {
      setPinError('Incorrect PIN');
      setPinInput('');
    }
  };

  const setupPin = async () => {
    if (pinInput.length < 4) { setPinError('PIN must be at least 4 digits'); return; }
    const res = await fetch('/api/vault/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setup', pin: pinInput }),
    });
    if (res.ok) {
      setHasPin(true);
      setSettingUp(false);
      setPinInput('');
      toast('Vault PIN set');
    }
  };

  const fetchEntries = useCallback(async () => {
    const res = await fetch('/api/vault');
    const data = await res.json();
    setEntries(data.entries ?? []);
    setCategories(data.categories ?? []);
    if (!addCategory && data.categories?.length) setAddCategory(data.categories[0].key);
  }, [addCategory]);

  useEffect(() => { if (!locked) fetchEntries(); }, [fetchEntries, locked]);

  // Lock screen
  if (hasPin === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={18} className="animate-spin text-primary" />
      </div>
    );
  }

  if (locked && hasPin) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="w-full max-w-xs text-center space-y-4 animate-fade-up">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'var(--color-brand-dim)' }}>
            <Lock size={28} style={{ color: 'var(--color-brand)' }} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Vault Locked</h2>
            <p className="text-[13px] text-muted-foreground mt-1">Enter your PIN to access credentials</p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && verifyPin()}
            placeholder="Enter PIN"
            autoFocus
            className="w-full text-center text-2xl font-mono tracking-[0.5em] py-3 rounded-xl border border-border text-foreground placeholder-muted-foreground outline-none focus:border-white/20"
            style={{ background: 'var(--color-surface-2)' }}
          />
          {pinError && <p className="text-destructive text-[12px]">{pinError}</p>}
          <button
            onClick={verifyPin}
            disabled={pinInput.length < 4}
            className="w-full py-2.5 rounded-xl text-[13px] font-medium text-white btn-brand disabled:opacity-50"
            style={{ background: 'var(--color-brand)' }}
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  if (settingUp) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="w-full max-w-xs text-center space-y-4 animate-fade-up">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'var(--color-brand-dim)' }}>
            <Shield size={28} style={{ color: 'var(--color-brand)' }} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Set Vault PIN</h2>
            <p className="text-[13px] text-muted-foreground mt-1">Choose a 4-8 digit PIN to protect your vault</p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && setupPin()}
            placeholder="New PIN"
            autoFocus
            className="w-full text-center text-2xl font-mono tracking-[0.5em] py-3 rounded-xl border border-border text-foreground placeholder-muted-foreground outline-none focus:border-white/20"
            style={{ background: 'var(--color-surface-2)' }}
          />
          {pinError && <p className="text-destructive text-[12px]">{pinError}</p>}
          <div className="flex gap-2">
            <button onClick={() => setSettingUp(false)} className="flex-1 py-2.5 rounded-xl text-[13px] font-medium text-muted-foreground border border-border hover:text-foreground transition-colors">Cancel</button>
            <button onClick={setupPin} disabled={pinInput.length < 4} className="flex-1 py-2.5 rounded-xl text-[13px] font-medium text-white btn-brand disabled:opacity-50" style={{ background: 'var(--color-brand)' }}>Set PIN</button>
          </div>
        </div>
      </div>
    );
  }

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (addCategory) formData.append('category', addCategory);

      const res = await fetch('/api/vault/scan', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok || data.error) {
        alert(data.error || 'Scan failed. Try again.');
        return;
      }

      // Auto-fill fields from scan result
      if (data.suggested_category && !addCategory) {
        setAddCategory(data.suggested_category);
      }
      if (data.name) setNewName(data.name);

      // Fill fields — handle both flat and nested formats
      const fields = data.fields || data;
      const newFieldsObj: Record<string, string> = {};
      for (const [key, val] of Object.entries(fields)) {
        if (typeof val === 'string' && key !== 'suggested_category' && key !== 'name') {
          newFieldsObj[key] = val;
        }
      }
      if (Object.keys(newFieldsObj).length > 0) {
        setNewFields((prev) => ({ ...prev, ...newFieldsObj }));
      }

      setShowAdd(true);
    } catch {
      alert('Could not extract data from image. Try a clearer photo.');
    } finally {
      setScanning(false);
      e.target.value = '';
    }
  };

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
          <h2 className="text-2xl font-bold text-foreground">Vault</h2>
          <p className="text-muted-foreground text-sm mt-1">Securely store passwords, keys, cards, and secrets</p>
        </div>
        <div className="flex gap-2">
          {/* Lock / Setup button */}
          {hasPin ? (
            <button
              onClick={() => setLocked(true)}
              className="text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg text-sm border border-border hover:border-white/15 transition-colors flex items-center gap-1.5"
              title="Lock vault"
            >
              <Lock size={14} /> Lock
            </button>
          ) : (
            <button
              onClick={() => setSettingUp(true)}
              className="text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg text-sm border border-border hover:border-white/15 transition-colors flex items-center gap-1.5"
              title="Set up vault PIN"
            >
              <Shield size={14} /> Set PIN
            </button>
          )}
          <input ref={scanInputRef} type="file" accept="image/*" capture="environment" onChange={handleScan} className="hidden" />
          <button
            onClick={() => scanInputRef.current?.click()}
            disabled={scanning}
            className="text-muted-foreground hover:text-primary px-3 py-2 rounded-lg text-sm border border-border hover:border-primary/50 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            title="Scan photo to auto-fill"
          >
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            Scan
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="bg-primary text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add Entry'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entries..."
          className="w-full bg-card text-foreground border border-border rounded-lg pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveCategory('All')}
          className={cn(
            'px-4 py-2 rounded-full text-sm font-medium border transition-colors',
            activeCategory === 'All'
              ? 'bg-white text-background border-white'
              : 'text-muted-foreground border-border hover:border-white/15'
          )}
        >
          All ({entries.length})
        </button>
        {categories.map((cat) => {
          const count = entries.filter((e) => e.category === cat.key).length;
          if (count === 0 && activeCategory !== cat.key) return null;
          const Icon = CATEGORY_ICONS[cat.key] || Key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                'px-3 py-2 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5',
                activeCategory === cat.key
                  ? 'bg-white text-background border-white'
                  : 'text-muted-foreground border-border hover:border-white/15'
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
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-foreground text-sm block mb-1">Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Entry name"
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-foreground text-sm block mb-1">Category</label>
              <select
                value={addCategory}
                onChange={(e) => { setAddCategory(e.target.value); setNewFields({}); }}
                className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dynamic fields */}
          {selectedCatDef && (
            <div className="space-y-3 border-t border-border pt-4">
              {selectedCatDef.fields.map((field) => (
                <div key={field.key}>
                  <label className="text-foreground text-sm block mb-1">{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={newFields[field.key] || ''}
                      onChange={(e) => setNewFields({ ...newFields, [field.key]: e.target.value })}
                      rows={3}
                      placeholder={field.placeholder}
                      className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    />
                  ) : (
                    <input
                      type={field.type === 'password' || field.type === 'pin' ? 'password' : 'text'}
                      value={newFields[field.key] || ''}
                      onChange={(e) => setNewFields({ ...newFields, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                      className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={addEntry}
            disabled={!newName.trim()}
            className="bg-primary text-foreground px-6 py-2 rounded-lg font-medium hover:bg-primary transition-colors disabled:opacity-50"
          >
            Save Entry
          </button>
        </div>
      )}

      {/* Entries */}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">
            {search || activeCategory !== 'All' ? 'No entries match your filter.' : 'No entries yet. Click "+ Add Entry" to get started.'}
          </p>
        </div>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([categoryLabel, catEntries]) => (
            <div key={categoryLabel} className="space-y-2">
              <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-widest">{categoryLabel}</h3>
              <div className="bg-card border border-border rounded-lg divide-y divide-border">
                {catEntries.map((entry) => {
                  const Icon = CATEGORY_ICONS[entry.category] || Key;
                  const catDef = categories.find((c) => c.key === entry.category);
                  const isRevealed = revealedId === entry.id;

                  return (
                    <div key={entry.id} className="px-5 py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <Icon size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground font-medium text-sm">{entry.name}</p>
                            <p className="text-muted-foreground text-xs mt-0.5">{entry.masked_value}</p>

                            {/* Revealed fields */}
                            {isRevealed && catDef && (
                              <div className="mt-3 space-y-2 bg-background rounded-lg p-3">
                                {catDef.fields.map((field) => {
                                  const val = revealedFields[field.key];
                                  if (!val) return null;
                                  return (
                                    <div key={field.key} className="flex items-center justify-between">
                                      <div>
                                        <p className="text-muted-foreground text-xs">{field.label}</p>
                                        <p className="text-foreground text-sm font-mono">{val}</p>
                                      </div>
                                      <button
                                        onClick={() => copyField(val, `${entry.id}-${field.key}`)}
                                        className="text-muted-foreground hover:text-foreground transition-colors"
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
                            className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-secondary transition-colors"
                            title={isRevealed ? 'Hide' : 'Reveal'}
                          >
                            {isRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                          <button
                            onClick={() => deleteEntry(entry.id)}
                            className="text-muted-foreground hover:text-red-400 p-1.5 rounded hover:bg-secondary transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <p className="text-muted-foreground/60 text-xs mt-2">{formatRelativeDate(entry.created_at)}</p>
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
