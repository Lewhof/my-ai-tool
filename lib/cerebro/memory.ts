import { supabaseAdmin } from '@/lib/supabase-server';

export type MemorySource = 'chat' | 'rule' | 'note' | 'briefing' | 'manual' | 'reflection';

export interface Memory {
  id: string;
  content: string;
  source_kind: MemorySource;
  source_id: string | null;
  importance: number;
  similarity?: number;
  created_at: string;
}

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMS = 1536;
const EMBED_TIMEOUT_MS = 8_000;
const MAX_CONTENT_CHARS = 4000;

// Generate an embedding for a chunk of text. Single-vendor (OpenAI) keeps
// the dimension contract stable — switching providers requires a full
// re-embed of the table.
export async function embed(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set — required for cerebro_memory embeddings');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
    const data = await res.json();
    const vec = data.data?.[0]?.embedding as number[] | undefined;
    if (!vec || vec.length !== EMBED_DIMS) throw new Error(`Bad embedding shape: ${vec?.length}`);
    return vec;
  } finally {
    clearTimeout(timer);
  }
}

export async function saveMemory(
  userId: string,
  content: string,
  opts: {
    source: MemorySource;
    sourceId?: string;
    importance?: number;
    decayAt?: string | null;
  } = { source: 'manual' }
): Promise<Memory> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Empty memory content');
  if (trimmed.length > MAX_CONTENT_CHARS) {
    throw new Error(`Memory content exceeds ${MAX_CONTENT_CHARS} chars — truncate before saving`);
  }
  const vec = await embed(trimmed);
  const { data, error } = await supabaseAdmin
    .from('cerebro_memory')
    .insert({
      user_id: userId,
      content: trimmed,
      source_kind: opts.source,
      source_id: opts.sourceId ?? null,
      importance: opts.importance ?? 5,
      decay_at: opts.decayAt ?? null,
      embedding: vec as unknown as string,
    })
    .select('id, content, source_kind, source_id, importance, created_at')
    .single();
  if (error) throw new Error(`Memory save failed: ${error.message}`);
  return data as Memory;
}

export async function recallMemory(
  userId: string,
  query: string,
  opts: { matchCount?: number; minSim?: number } = {}
): Promise<Memory[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const vec = await embed(trimmed);
  const { data, error } = await supabaseAdmin.rpc('match_cerebro_memory', {
    p_user_id: userId,
    p_query: vec as unknown as string,
    p_match_count: opts.matchCount ?? 8,
    p_min_sim: opts.minSim ?? 0.55,
  });
  if (error) throw new Error(`Memory recall failed: ${error.message}`);
  return (data ?? []) as Memory[];
}

export async function listMemories(userId: string, limit = 50): Promise<Memory[]> {
  const { data, error } = await supabaseAdmin
    .from('cerebro_memory')
    .select('id, content, source_kind, source_id, importance, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`List memories failed: ${error.message}`);
  return (data ?? []) as Memory[];
}

export async function deleteMemory(userId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('cerebro_memory')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(`Delete memory failed: ${error.message}`);
}
