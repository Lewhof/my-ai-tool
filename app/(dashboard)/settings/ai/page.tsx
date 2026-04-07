'use client';

import { useState, useEffect } from 'react';
import { Zap, Brain, Rocket, Search, Save } from 'lucide-react';

interface AISettings {
  default_model: string;
  groq_key: string;
  perplexity_key: string;
}

const MODELS = [
  { id: 'claude-haiku', name: 'Claude Haiku', description: 'Fast & cheap — best for everyday use', icon: Zap, color: 'text-green-400', cost: '~$0.001/msg' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', description: 'Smart & capable — complex tasks', icon: Brain, color: 'text-blue-400', cost: '~$0.01/msg' },
  { id: 'groq-llama', name: 'Groq LLaMA 3', description: 'Instant responses — requires API key', icon: Rocket, color: 'text-orange-400', cost: 'Free tier' },
  { id: 'perplexity', name: 'Perplexity', description: 'Web search built-in — requires API key', icon: Search, color: 'text-cyan-400', cost: '~$0.005/msg' },
];

export default function AISettingsPage() {
  const [defaultModel, setDefaultModel] = useState('claude-haiku');
  const [groqKey, setGroqKey] = useState('');
  const [perplexityKey, setPerplexityKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data?.default_model) setDefaultModel(data.default_model === 'smart' ? 'claude-sonnet' : data.default_model === 'fast' ? 'claude-haiku' : data.default_model);
      });
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_model: defaultModel }),
    });

    // Save API keys to vault if provided
    if (groqKey.trim()) {
      await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'GROQ_API_KEY', category: 'api_key', fields: { value: groqKey, service: 'Groq' } }),
      });
    }
    if (perplexityKey.trim()) {
      await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'PERPLEXITY_API_KEY', category: 'api_key', fields: { value: perplexityKey, service: 'Perplexity' } }),
      });
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">AI & Models</h2>
        <p className="text-muted-foreground text-sm mt-1">Configure AI providers and default chat model</p>
      </div>

      {/* Default Model */}
      <section className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-foreground font-semibold text-sm">Default Chat Model</h3>
          <p className="text-muted-foreground text-xs mt-0.5">Used when creating new chat threads</p>
        </div>
        <div className="p-5 space-y-2">
          {MODELS.map((model) => {
            const Icon = model.icon;
            const isSelected = defaultModel === model.id;
            return (
              <button
                key={model.id}
                onClick={() => setDefaultModel(model.id)}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg border transition-colors text-left ${
                  isSelected ? 'border-primary bg-primary/10' : 'border-border hover:border-border'
                }`}
              >
                <Icon size={20} className={model.color} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-foreground text-sm font-medium">{model.name}</p>
                    <span className="text-muted-foreground text-xs">{model.cost}</span>
                  </div>
                  <p className="text-muted-foreground text-xs">{model.description}</p>
                </div>
                {isSelected && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* API Keys */}
      <section className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-foreground font-semibold text-sm">Provider API Keys</h3>
          <p className="text-muted-foreground text-xs mt-0.5">Required for Groq and Perplexity. Claude uses your existing Anthropic key.</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-foreground text-sm block mb-1">Anthropic API Key</label>
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-xs">Configured via environment</span>
              <a href="/vault" className="text-primary text-xs hover:underline">View in Vault</a>
            </div>
          </div>
          <div>
            <label className="text-foreground text-sm block mb-1">Helicone API Key</label>
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-xs">Configured via environment</span>
              <a href="/vault" className="text-primary text-xs hover:underline">View in Vault</a>
            </div>
          </div>
          <div>
            <label className="text-foreground text-sm block mb-1">
              Groq API Key
              <a href="https://console.groq.com/keys" target="_blank" className="text-primary text-xs ml-2 hover:underline">Get key</a>
            </label>
            <input
              type="password"
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              placeholder="gsk_..."
              className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-muted-foreground/60 text-xs mt-1">Free tier: 14,400 requests/day</p>
          </div>
          <div>
            <label className="text-foreground text-sm block mb-1">
              Perplexity API Key
              <a href="https://www.perplexity.ai/settings/api" target="_blank" className="text-primary text-xs ml-2 hover:underline">Get key</a>
            </label>
            <input
              type="password"
              value={perplexityKey}
              onChange={(e) => setPerplexityKey(e.target.value)}
              placeholder="pplx-..."
              className="w-full bg-secondary text-foreground border border-border rounded-lg px-4 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-muted-foreground/60 text-xs mt-1">Pay-per-use, includes web search</p>
          </div>
        </div>
      </section>

      {/* Save */}
      <button
        onClick={saveSettings}
        disabled={saving}
        className="bg-primary text-foreground px-6 py-2.5 rounded-lg font-medium hover:bg-primary transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        <Save size={16} />
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}
