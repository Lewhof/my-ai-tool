export interface ChatProvider {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  costLabel: string;
  requiresKey: string; // env var name
  createStream: (
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    systemPrompt?: string
  ) => Promise<{ stream: ReadableStream; getUsage: () => { inputTokens: number; outputTokens: number } }>;
}

export interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  costLabel: string;
}

export const PROVIDER_CONFIGS: ProviderConfig[] = [
  { id: 'claude-haiku', name: 'Claude Haiku', description: 'Fast & cheap', icon: 'zap', color: '#22c55e', costLabel: '~$0.001/msg' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', description: 'Smart & capable', icon: 'brain', color: '#3b82f6', costLabel: '~$0.01/msg' },
  { id: 'groq-llama', name: 'Groq LLaMA 3', description: 'Instant responses', icon: 'rocket', color: '#f97316', costLabel: 'Free tier' },
  { id: 'perplexity', name: 'Perplexity', description: 'Web search built-in', icon: 'search', color: '#06b6d4', costLabel: '~$0.005/msg' },
  { id: 'gemini', name: 'Gemini 2.0 Flash', description: 'Google AI — fast & free', icon: 'sparkles', color: '#4285f4', costLabel: 'Free tier' },
];
