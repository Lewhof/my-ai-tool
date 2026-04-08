import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  if (!q || q.length < 2) return Response.json({ results: [] });

  const pattern = `%${q}%`;

  // Keyword search across all modules
  const [chats, todos, docs, notes, kb, whiteboard, vault] = await Promise.all([
    supabaseAdmin.from('chat_threads').select('id, title, updated_at').eq('user_id', userId).ilike('title', pattern).limit(5),
    supabaseAdmin.from('todos').select('id, title, status, priority').eq('user_id', userId).ilike('title', pattern).limit(5),
    supabaseAdmin.from('documents').select('id, name, file_type, created_at').eq('user_id', userId).or(`name.ilike.${pattern},display_name.ilike.${pattern}`).limit(5),
    supabaseAdmin.from('notes_v2').select('id, title, updated_at').eq('user_id', userId).ilike('title', pattern).limit(5),
    supabaseAdmin.from('knowledge_base').select('id, title, category').eq('user_id', userId).or(`title.ilike.${pattern},content.ilike.${pattern}`).limit(5),
    supabaseAdmin.from('whiteboard').select('id, title, status, priority').eq('user_id', userId).ilike('title', pattern).limit(5),
    supabaseAdmin.from('vault_keys').select('id, name, category').eq('user_id', userId).or(`name.ilike.${pattern},service.ilike.${pattern}`).limit(5),
  ]);

  const results = [
    ...(chats.data ?? []).map(r => ({ type: 'chat', id: r.id, title: r.title, href: `/chat/${r.id}`, meta: r.updated_at })),
    ...(todos.data ?? []).map(r => ({ type: 'task', id: r.id, title: r.title, href: '/todos', meta: r.status })),
    ...(docs.data ?? []).map(r => ({ type: 'document', id: r.id, title: r.name, href: `/documents/${r.id}`, meta: r.file_type })),
    ...(notes.data ?? []).map(r => ({ type: 'note', id: r.id, title: r.title, href: '/notes', meta: r.updated_at })),
    ...(kb.data ?? []).map(r => ({ type: 'kb', id: r.id, title: r.title, href: '/kb', meta: r.category })),
    ...(whiteboard.data ?? []).map(r => ({ type: 'whiteboard', id: r.id, title: r.title, href: '/whiteboard', meta: r.status })),
    ...(vault.data ?? []).map(r => ({ type: 'vault', id: r.id, title: r.name, href: '/vault', meta: r.category })),
  ];

  // AI-enhanced fallback: if keyword search returns < 3 results, expand query with AI
  if (results.length < 3 && q.length >= 4) {
    try {
      const expanded = await expandSearchQuery(q);
      if (expanded && expanded !== q) {
        const expandedPattern = `%${expanded}%`;
        const [exNotes, exKb, exTodos] = await Promise.all([
          supabaseAdmin.from('notes_v2').select('id, title, updated_at').eq('user_id', userId).or(`title.ilike.${expandedPattern},content.ilike.${expandedPattern}`).limit(3),
          supabaseAdmin.from('knowledge_base').select('id, title, category').eq('user_id', userId).or(`title.ilike.${expandedPattern},content.ilike.${expandedPattern}`).limit(3),
          supabaseAdmin.from('todos').select('id, title, status').eq('user_id', userId).or(`title.ilike.${expandedPattern},description.ilike.${expandedPattern}`).limit(3),
        ]);

        const existingIds = new Set(results.map(r => r.id));
        const aiResults = [
          ...(exNotes.data ?? []).filter(r => !existingIds.has(r.id)).map(r => ({ type: 'note', id: r.id, title: r.title, href: '/notes', meta: 'AI match' })),
          ...(exKb.data ?? []).filter(r => !existingIds.has(r.id)).map(r => ({ type: 'kb', id: r.id, title: r.title, href: '/kb', meta: 'AI match' })),
          ...(exTodos.data ?? []).filter(r => !existingIds.has(r.id)).map(r => ({ type: 'task', id: r.id, title: r.title, href: '/todos', meta: 'AI match' })),
        ];

        results.push(...aiResults);
      }
    } catch { /* skip AI enhancement on error */ }
  }

  return Response.json({ results });
}

/**
 * Use AI to expand a search query with synonyms/related terms.
 */
async function expandSearchQuery(query: string): Promise<string | null> {
  try {
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Given the search query "${query}", provide ONE alternative search term (a synonym or related keyword) that might find relevant results in a personal knowledge base. Return ONLY the single keyword or short phrase, nothing else.`,
      }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : null;
    return text && text.length < 50 ? text : null;
  } catch {
    return null;
  }
}
