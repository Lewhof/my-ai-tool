import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const VALID_TYPES = ['todo', 'note', 'kb', 'whiteboard', 'document'];

// GET: Fetch all links for an entity (both directions)
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get('entity_type');
  const entityId = searchParams.get('entity_id');

  if (!entityType || !entityId) {
    return Response.json({ error: 'entity_type and entity_id required' }, { status: 400 });
  }

  // Get links where this entity is either source or target
  const [asSource, asTarget] = await Promise.all([
    supabaseAdmin
      .from('entity_links')
      .select('*')
      .eq('user_id', userId)
      .eq('source_type', entityType)
      .eq('source_id', entityId),
    supabaseAdmin
      .from('entity_links')
      .select('*')
      .eq('user_id', userId)
      .eq('target_type', entityType)
      .eq('target_id', entityId),
  ]);

  const links = [
    ...(asSource.data ?? []).map(l => ({
      id: l.id,
      linked_type: l.target_type,
      linked_id: l.target_id,
      direction: 'outgoing' as const,
      created_at: l.created_at,
    })),
    ...(asTarget.data ?? []).map(l => ({
      id: l.id,
      linked_type: l.source_type,
      linked_id: l.source_id,
      direction: 'incoming' as const,
      created_at: l.created_at,
    })),
  ];

  // Resolve linked entity titles
  const resolved = await Promise.all(
    links.map(async (link) => {
      const title = await resolveTitle(userId, link.linked_type, link.linked_id);
      return { ...link, title };
    })
  );

  return Response.json({ links: resolved });
}

// POST: Create a link between two entities
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { source_type, source_id, target_type, target_id } = await req.json();

  if (!VALID_TYPES.includes(source_type) || !VALID_TYPES.includes(target_type)) {
    return Response.json({ error: 'Invalid entity type' }, { status: 400 });
  }
  if (!source_id || !target_id) {
    return Response.json({ error: 'source_id and target_id required' }, { status: 400 });
  }
  if (source_id === target_id && source_type === target_type) {
    return Response.json({ error: 'Cannot link entity to itself' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('entity_links')
    .insert({ user_id: userId, source_type, source_id, target_type, target_id })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'Link already exists' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ link: data });
}

// DELETE: Remove a link
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  await supabaseAdmin
    .from('entity_links')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  return Response.json({ ok: true });
}

// Resolve a linked entity's title from its table
async function resolveTitle(userId: string, type: string, id: string): Promise<string> {
  const tableMap: Record<string, { table: string; field: string }> = {
    todo: { table: 'todos', field: 'title' },
    note: { table: 'notes_v2', field: 'title' },
    kb: { table: 'knowledge_base', field: 'title' },
    whiteboard: { table: 'whiteboard', field: 'title' },
    document: { table: 'documents', field: 'name' },
  };

  const config = tableMap[type];
  if (!config) return 'Unknown';

  const { data } = await supabaseAdmin
    .from(config.table)
    .select(config.field)
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  return (data as Record<string, string> | null)?.[config.field] ?? 'Deleted item';
}
