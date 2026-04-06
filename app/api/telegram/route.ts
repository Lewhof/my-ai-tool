import { after } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_OWNER = process.env.GITHUB_OWNER!;
const GITHUB_REPO = process.env.GITHUB_REPO!;

const SYSTEM_PROMPT =
  'You are an expert Next.js developer. When asked to make changes, respond with the COMPLETE updated file content wrapped in XML tags: <file path="app/page.tsx">complete file content here</file>. Only include files that need to be changed. Do not include bash commands or EOF markers.';

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

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
    model: 'claude-sonnet-4-6',
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
