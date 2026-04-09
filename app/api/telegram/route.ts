import { after } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { sendTelegramMessage } from '@/lib/telegram';
import { supabaseAdmin } from '@/lib/supabase-server';
import { extractArticle, isBookUrl } from '@/lib/extract';
import { anthropic, anthropic as heliconeAnthropic, MODELS, pickModel } from '@/lib/anthropic';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_OWNER = process.env.GITHUB_OWNER!;
const GITHUB_REPO = process.env.GITHUB_REPO!;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const PRIMARY_USER_ID = process.env.CLERK_USER_ID!; // Lew's Clerk user ID for bot-captured content
const ALLOWED_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // Only this chat ID can use capture

// Extract URLs from a message
const URL_REGEX = /https?:\/\/[^\s<>"]+/gi;
function extractUrls(text: string): string[] {
  return [...(text.matchAll(URL_REGEX) || [])].map(m => m[0]);
}

// Handle a URL clip from Telegram
async function handleUrlClip(chatId: number, urls: string[], userIdForClip: string): Promise<boolean> {
  if (urls.length === 0) return false;

  // Only allow the configured chat ID to capture (prevents strangers from writing to your DB)
  if (ALLOWED_CHAT_ID && String(chatId) !== String(ALLOWED_CHAT_ID)) {
    return false;
  }

  await sendTelegramMessage(chatId, `Clipping ${urls.length} URL${urls.length > 1 ? 's' : ''}...`);

  const results: string[] = [];
  for (const url of urls.slice(0, 5)) {
    try {
      // Extract content
      const extracted = await extractArticle(url);

      // Classify (simple heuristic: book URL = book, otherwise AI classify)
      let destination: 'kb' | 'book' | 'highlight' | 'task' | 'whiteboard' | 'note' = 'kb';
      let aiTitle = extracted.title || url;
      let aiTags: string[] = ['telegram', 'clipped'];
      let summary = extracted.excerpt || '';

      if (isBookUrl(url)) {
        destination = 'book';
      } else if (extracted.content) {
        try {
          const classifyRes = await heliconeAnthropic.messages.create({
            model: MODELS.fast,
            max_tokens: 250,
            messages: [{
              role: 'user',
              content: `Classify this for a personal knowledge system.

URL: ${extracted.canonical_url}
Site: ${extracted.site}
Title: ${extracted.title}

Content:
${extracted.content.slice(0, 2000)}

Destinations:
- "kb" — long-form reference/article
- "highlight" — a quotable short passage
- "task" — contains an action the user must do
- "whiteboard" — a feature idea, bug, or product concept for the user's own app/business
- "note" — a quick personal thought

Return ONLY valid JSON:
{"route": "...", "title": "80 char max", "tags": ["3-5 tags"], "summary": "one sentence"}`,
            }],
          });
          const ct = classifyRes.content[0].type === 'text' ? classifyRes.content[0].text : '';
          const match = ct.match(/\{[\s\S]*\}/);
          if (match) {
            const c = JSON.parse(match[0]);
            if (['kb', 'highlight', 'task', 'whiteboard', 'note'].includes(c.route)) destination = c.route;
            if (c.title) aiTitle = c.title;
            if (Array.isArray(c.tags)) aiTags = [...new Set([...aiTags, ...c.tags])].slice(0, 8);
            if (c.summary) summary = c.summary;
          }
        } catch { /* fall through to kb */ }
      }

      // Insert into the right table
      switch (destination) {
        case 'kb': {
          await supabaseAdmin.from('knowledge_base').insert({
            user_id: userIdForClip,
            title: aiTitle.slice(0, 200),
            content: `${extracted.content.slice(0, 20000)}\n\n---\nSource: ${extracted.canonical_url}`,
            category: 'Reference',
            tags: aiTags,
          });
          results.push(`📚 KB: ${aiTitle.slice(0, 60)}`);
          break;
        }
        case 'book': {
          // Defer full book summary to the /api/clip flow which the user can trigger manually
          await supabaseAdmin.from('knowledge_base').insert({
            user_id: userIdForClip,
            title: aiTitle.slice(0, 200),
            content: `Book page captured. Open Mind Library and use the "AI Summarize" button to generate the full summary.\n\nSource: ${extracted.canonical_url}`,
            category: 'Reference',
            tags: ['book-to-summarize', 'telegram', 'clipped'],
          });
          results.push(`📖 Book (pending summary): ${aiTitle.slice(0, 60)}`);
          break;
        }
        case 'highlight': {
          await supabaseAdmin.from('highlights').insert({
            user_id: userIdForClip,
            content: extracted.excerpt || extracted.content.slice(0, 2000),
            source_type: 'web',
            source_title: aiTitle.slice(0, 200),
            tags: aiTags,
          });
          results.push(`💬 Highlight: ${aiTitle.slice(0, 60)}`);
          break;
        }
        case 'task': {
          await supabaseAdmin.from('todos').insert({
            user_id: userIdForClip,
            title: aiTitle.slice(0, 200),
            description: `${summary}\n\nSource: ${extracted.canonical_url}`,
            status: 'todo',
            priority: 'medium',
            bucket: 'Clipped',
            tags: aiTags,
          });
          results.push(`✅ Task: ${aiTitle.slice(0, 60)}`);
          break;
        }
        case 'whiteboard': {
          await supabaseAdmin.from('whiteboard').insert({
            user_id: userIdForClip,
            title: aiTitle.slice(0, 200),
            description: `${summary}\n\nSource: ${extracted.canonical_url}`,
            status: 'idea',
            priority: 99,
            tags: aiTags,
          });
          results.push(`🧠 Whiteboard: ${aiTitle.slice(0, 60)}`);
          break;
        }
        case 'note': {
          await supabaseAdmin.from('notes_v2').insert({
            user_id: userIdForClip,
            title: aiTitle.slice(0, 200),
            content: `${extracted.content.slice(0, 5000)}\n\n---\nSource: ${extracted.canonical_url}`,
            images: [],
          });
          results.push(`📝 Note: ${aiTitle.slice(0, 60)}`);
          break;
        }
      }
    } catch (err) {
      results.push(`❌ Failed: ${url.slice(0, 60)} — ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  await sendTelegramMessage(chatId, `*Clipped:*\n${results.join('\n')}`);
  return true;
}

const SYSTEM_PROMPT =
  'You are an expert Next.js developer. When asked to make changes, respond with the COMPLETE updated file content wrapped in XML tags: <file path="app/page.tsx">complete file content here</file>. Only include files that need to be changed. Do not include bash commands or EOF markers.';

async function getGitHubFile(path: string): Promise<{ content: string; sha: string } | null> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return { content: Buffer.from(data.content, 'base64').toString('utf-8'), sha: data.sha };
}

async function writeGitHubFile(path: string, content: string): Promise<boolean> {
  const existing = await getGitHubFile(path);
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Agent: update ${path}`,
        content: Buffer.from(content).toString('base64'),
        sha: existing?.sha,
      }),
    }
  );
  return res.ok;
}

async function processMessage(chatId: number, userText: string, imageBase64?: string) {
  const file = await getGitHubFile('app/page.tsx');
  const filesContext = file ? `<file path="app/page.tsx">${file.content}</file>` : '';

  const userContent: Anthropic.MessageParam['content'] = [];
  if (imageBase64) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
    });
  }
  userContent.push({ type: 'text', text: `Current files:\n${filesContext}\n\nRequest: ${userText}` });

  const response = await anthropic.messages.create({
    model: pickModel('code-gen'),
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
  const fileMatches = [...responseText.matchAll(/<file path="([^"]+)">([\s\S]*?)<\/file>/g)];

  if (fileMatches.length === 0) {
    await sendTelegramMessage(chatId, responseText);
    return;
  }

  let updated = 0;
  for (const [, path, content] of fileMatches) {
    if (await writeGitHubFile(path, content.trim())) updated++;
  }
  await sendTelegramMessage(chatId, `Done! Updated ${updated} file(s). Deploying now...`);
}

export async function POST(req: Request) {
  const body = await req.json();
  const message = body?.message;

  if (!message || message.from?.is_bot) return Response.json({ ok: true });

  const chatId: number = message.chat.id;
  const userText: string = message.text || message.caption || '';

  if (!userText && !message.photo) return Response.json({ ok: true });
  if (userText.startsWith('/')) return Response.json({ ok: true });

  // ── CLIP: Detect URLs in the message and route through /api/clip ──
  // Only triggers if the message contains URL(s) AND is either:
  //   - mostly just URL(s) (text length - URL chars < 50)
  //   - explicitly prefixed with "clip" or "save"
  const urls = extractUrls(userText);
  if (urls.length > 0 && PRIMARY_USER_ID) {
    const nonUrlText = urls.reduce((t, u) => t.replace(u, '').trim(), userText).trim();
    const isMostlyUrls = nonUrlText.length < 50;
    const explicitClip = /^\s*(clip|save|bookmark)\b/i.test(nonUrlText);

    if (isMostlyUrls || explicitClip) {
      after(async () => {
        try {
          await handleUrlClip(chatId, urls, PRIMARY_USER_ID);
        } catch (err) {
          console.error('Clip failed:', err);
          await sendTelegramMessage(chatId, `Clip failed: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      });
      return Response.json({ ok: true });
    }
  }

  await sendTelegramMessage(chatId, 'On it...');

  let imageBase64: string | undefined;
  if (message.photo) {
    const largest = message.photo[message.photo.length - 1];
    const fileRes = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${largest.file_id}`
    );
    const { result } = await fileRes.json();
    const imgBuffer = await fetch(
      `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${result.file_path}`
    ).then((r) => r.arrayBuffer());
    imageBase64 = Buffer.from(imgBuffer).toString('base64');
  }

  after(async () => {
    try {
      await processMessage(chatId, userText, imageBase64);
    } catch (err: any) {
      console.error(err);
      await sendTelegramMessage(chatId, `Error: ${err?.message ?? String(err)}`);
    }
  });
  return Response.json({ ok: true });
}
