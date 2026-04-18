'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, RefreshCw, Mail, Building, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Contact {
  id: string;
  name: string;
  email: string;
  company: string | null;
  tags: string[];
  source: string;
  last_interaction: string | null;
  notes: string | null;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');

  // Add form
  const [nName, setNName] = useState('');
  const [nEmail, setNEmail] = useState('');
  const [nCompany, setNCompany] = useState('');
  const [nTags, setNTags] = useState('');

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/contacts');
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts ?? []);
      }
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const addContact = async () => {
    if (!nEmail.trim()) { toast.error('Email required'); return; }
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nName.trim() || undefined,
        email: nEmail.trim(),
        company: nCompany.trim() || null,
        tags: nTags.split(',').map(t => t.trim()).filter(Boolean),
      }),
    });
    if (res.ok) {
      toast.success('Contact added');
      setNName(''); setNEmail(''); setNCompany(''); setNTags('');
      setShowAdd(false);
      fetchContacts();
    } else {
      const err = await res.json().catch(() => ({ error: 'Failed' }));
      toast.error(err.error || 'Failed');
    }
  };

  const bumpInteraction = async (id: string) => {
    const res = await fetch('/api/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, bump_interaction: true }),
    });
    if (res.ok) {
      toast.success('Marked as contacted');
      fetchContacts();
    }
  };

  const deleteContact = async (id: string) => {
    const res = await fetch(`/api/contacts?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Removed');
      fetchContacts();
    }
  };

  const filtered = search.trim()
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        (c.company ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : contacts;

  const daysSince = (iso: string | null) => {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-primary" />
          <h1 className="text-foreground text-xl font-bold">Contacts</h1>
          <span className="text-muted-foreground text-sm">{contacts.length}</span>
        </div>
        <div className="flex-1 min-w-[200px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground"
          />
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 bg-primary text-foreground px-3 py-1.5 rounded text-sm font-medium"
        >
          <Plus size={14} />
          Add contact
        </button>
      </div>

      {showAdd && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-foreground font-semibold text-sm">New contact</h3>
            <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Name" className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground" />
            <input value={nEmail} onChange={(e) => setNEmail(e.target.value)} placeholder="email@example.com" className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground" />
            <input value={nCompany} onChange={(e) => setNCompany(e.target.value)} placeholder="Company" className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground" />
            <input value={nTags} onChange={(e) => setNTags(e.target.value)} placeholder="Tags (comma-separated)" className="bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground" />
          </div>
          <button onClick={addContact} className="bg-primary text-foreground px-4 py-1.5 rounded text-sm font-medium">Save</button>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <Users size={28} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-muted-foreground text-sm">
            {search ? 'No matches.' : 'No contacts yet. Add one to start getting re-engagement nudges when 30+ days pass without contact.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const days = daysSince(c.last_interaction);
            const dormant = days !== null && days >= 30;
            return (
              <div key={c.id} className={cn('bg-card border rounded-lg p-3 flex items-center gap-3', dormant ? 'border-yellow-500/40' : 'border-border')}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-foreground font-medium text-sm">{c.name}</p>
                    {c.company && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Building size={10} />{c.company}
                      </span>
                    )}
                    {c.tags?.map(t => (
                      <span key={t} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-secondary rounded border border-border text-muted-foreground">
                        <Tag size={9} />{t}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Mail size={10} />{c.email}</span>
                    {days !== null && (
                      <span className={cn(dormant && 'text-yellow-400')}>
                        {days === 0 ? 'Contacted today' : days === 1 ? 'Yesterday' : `${days} days ago`}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => bumpInteraction(c.id)}
                  className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center gap-1"
                  title="Mark as contacted today"
                >
                  <RefreshCw size={11} />
                  Bump
                </button>
                <button
                  onClick={() => deleteContact(c.id)}
                  className="text-muted-foreground hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
