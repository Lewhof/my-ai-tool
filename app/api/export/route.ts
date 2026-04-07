import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get('format') || 'json';

  // Fetch all user data
  const [threads, messages, todos, whiteboard, notes, documents, kb, vault, agents] = await Promise.all([
    supabaseAdmin.from('chat_threads').select('*').eq('user_id', userId),
    supabaseAdmin.from('chat_messages').select('*').in('thread_id',
      (await supabaseAdmin.from('chat_threads').select('id').eq('user_id', userId)).data?.map((t) => t.id) ?? []
    ),
    supabaseAdmin.from('todos').select('*').eq('user_id', userId),
    supabaseAdmin.from('whiteboard').select('*').eq('user_id', userId),
    supabaseAdmin.from('notes_v2').select('*').eq('user_id', userId),
    supabaseAdmin.from('documents').select('id, name, display_name, file_type, file_size, folder, folder_id, created_at').eq('user_id', userId),
    supabaseAdmin.from('knowledge_base').select('*').eq('user_id', userId),
    supabaseAdmin.from('vault_keys').select('id, name, service, category, masked_value, created_at').eq('user_id', userId),
    supabaseAdmin.from('user_agents').select('*').eq('user_id', userId),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    user_id: userId,
    chat_threads: threads.data ?? [],
    chat_messages: messages.data ?? [],
    todos: todos.data ?? [],
    whiteboard: whiteboard.data ?? [],
    notes: notes.data ?? [],
    documents: documents.data ?? [],
    knowledge_base: kb.data ?? [],
    vault: vault.data ?? [],
    agents: agents.data ?? [],
  };

  if (format === 'csv') {
    // Create CSV for the main tables
    const tables = ['todos', 'whiteboard', 'notes', 'documents', 'knowledge_base'];
    let csv = '';

    for (const table of tables) {
      const rows = exportData[table as keyof typeof exportData] as Array<Record<string, unknown>>;
      if (!Array.isArray(rows) || rows.length === 0) continue;

      csv += `\n--- ${table.toUpperCase()} ---\n`;
      const headers = Object.keys(rows[0]);
      csv += headers.join(',') + '\n';
      for (const row of rows) {
        csv += headers.map((h) => {
          const val = row[h];
          const str = typeof val === 'string' ? val : JSON.stringify(val ?? '');
          return `"${str.replace(/"/g, '""')}"`;
        }).join(',') + '\n';
      }
    }

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="lewhof-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  }

  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="lewhof-export-${new Date().toISOString().split('T')[0]}.json"`,
    },
  });
}
