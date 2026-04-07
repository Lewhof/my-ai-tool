import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  if (!q || q.length < 2) return Response.json({ results: [] });

  const pattern = `%${q}%`;

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

  return Response.json({ results });
}
