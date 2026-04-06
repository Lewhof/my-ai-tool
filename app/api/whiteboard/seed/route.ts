import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const seedItems = [
    {
      user_id: userId,
      title: 'Upgrade web chat to support code editing',
      description: 'Wire the app\'s Chat page to work like the Telegram bot — user sends instructions via web chat, Claude reads files from GitHub, generates changes, writes them back, and triggers a deploy. Essentially Claude Code in the browser.\n\nScope:\n- Add a "Dev Mode" toggle to the chat UI\n- In dev mode, use Sonnet instead of Haiku\n- Read current app files from GitHub as context\n- Parse Claude\'s response for file changes (XML tags like Telegram bot)\n- Write changes back to GitHub via API\n- Show deploy status in chat\n- Keep normal chat mode for general questions',
      status: 'idea',
      priority: 1,
      tags: ['feature', 'chat', 'agent'],
    },
  ];

  const { error } = await supabaseAdmin.from('whiteboard').insert(seedItems);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ added: seedItems.length });
}
