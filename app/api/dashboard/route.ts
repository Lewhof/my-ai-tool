import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const [threadsRes, docsRes, runsRes, todosRes] = await Promise.all([
    supabaseAdmin
      .from('chat_threads')
      .select('id, title, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('documents')
      .select('id, name, file_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('workflow_runs')
      .select('id, input, status, created_at, workflow_id')
      .order('created_at', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('todos')
      .select('id, title, status, priority, due_date')
      .eq('user_id', userId)
      .neq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  return Response.json({
    recentChats: threadsRes.data ?? [],
    recentDocs: docsRes.data ?? [],
    recentRuns: runsRes.data ?? [],
    pendingTodos: todosRes.data ?? [],
  });
}
