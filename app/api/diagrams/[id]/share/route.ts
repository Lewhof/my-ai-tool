import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  // Check ownership
  const { data: diagram } = await supabaseAdmin
    .from('diagrams')
    .select('id, share_token')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!diagram) return new Response('Not found', { status: 404 });

  // Return existing token or generate new one
  if (diagram.share_token) {
    return Response.json({ share_token: diagram.share_token });
  }

  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const { error } = await supabaseAdmin
    .from('diagrams')
    .update({ share_token: token })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ share_token: token });
}

// Public GET — fetch diagram by share token (no auth)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) return new Response('Token required', { status: 400 });

  const { data } = await supabaseAdmin
    .from('diagrams')
    .select('name, nodes, edges')
    .eq('id', id)
    .eq('share_token', token)
    .single();

  if (!data) return new Response('Not found', { status: 404 });
  return Response.json(data);
}
