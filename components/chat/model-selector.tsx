'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Zap, Brain, Rocket, Search, ChevronDown } from 'lucide-react';

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  icon: typeof Zap;
  color: string;
  costLabel: string;
}

const MODELS: ModelOption[] = [
  { id: 'claude-haiku', name: 'Claude Haiku', description: 'Fast & cheap', icon: Zap, color: 'text-green-400', costLabel: '~$0.001' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', description: 'Smart & capable', icon: Brain, color: 'text-blue-400', costLabel: '~$0.01' },
  { id: 'groq-llama', name: 'Groq LLaMA 3', description: 'Instant responses', icon: Rocket, color: 'text-orange-400', costLabel: 'Free' },
  { id: 'perplexity', name: 'Perplexity', description: 'Web search built-in', icon: Search, color: 'text-cyan-400', costLabel: '~$0.005' },
];

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  compact?: boolean;
}

export default function ModelSelector({ value, onChange, compact }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = MODELS.find((m) => m.id === value) ?? MODELS[0];
  const Icon = selected.icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 rounded-lg border transition-colors',
          compact
            ? 'px-2 py-1 text-xs border-gray-700 hover:border-gray-600'
            : 'px-3 py-1.5 text-sm border-gray-700 hover:border-gray-600'
        )}
      >
        <Icon size={compact ? 12 : 14} className={selected.color} />
        <span className="text-white font-medium">{compact ? selected.name.split(' ').pop() : selected.name}</span>
        <ChevronDown size={12} className={cn('text-gray-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1">
          {MODELS.map((model) => {
            const MIcon = model.icon;
            const isActive = model.id === value;
            return (
              <button
                key={model.id}
                onClick={() => { onChange(model.id); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  isActive ? 'bg-gray-700' : 'hover:bg-gray-700/50'
                )}
              >
                <MIcon size={16} className={model.color} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-white text-sm font-medium">{model.name}</span>
                    <span className="text-gray-500 text-xs">{model.costLabel}</span>
                  </div>
                  <p className="text-gray-500 text-xs">{model.description}</p>
                </div>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-accent-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
