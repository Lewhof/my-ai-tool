import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
baseURL: "https://anthropic.helicone.ai/v1",
  defaultHeaders: {
    "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
  },
});

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

async function getFileFromGitHub(path: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return Buffer.from(data.content, 'base64').toString('utf-8');
}

async function writeFileToGitHub(path: string, content: string) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const existing = await fetch(url, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } });
  let sha = undefined;
  if (existing.ok) { const data = await existing.json(); sha = data.sha; }
  const response = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Agent: update ${path}`, content: Buffer.from(content).toString('base64'), sha }),
  });
  return response.ok;
}

async function processMessage(chatId: number, userText: string, imageData?: { base64: string; mediaType: string }) {
  const existingFiles: Record<string, string> = {};
  for (const file of ['app/page.tsx', 'app/layout.tsx', 'app/globals.css']) {
    const content = await getFileFromGitHub(file);
    if (content) existingFiles[file] = content;
  }

  const systemPrompt = `You are an expert Next.js developer. You have access to the current codebase files and can modify them. When asked to make changes, respond with the COMPLETE updated file content wrapped in XML tags like this:
<file path="app/page.tsx">
complete file content here
</file>
Only include files that need to be changed. Do not include bash commands or EOF markers in your response.`;

  const userContent: Anthropic.MessageParam['content'] = [];
  if (imageData) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: imageData.mediaType as 'image/jpeg', data: imageData.base64 } });
  }
  userContent.push({ type: 'text', text: `Current files:\n${Object.entries(existingFiles).map(([k, v]) => `<file path="${k}">\n${v}\n</file>`).join('\n')}\n\nRequest: ${userText}` });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
  const fileMatches = responseText.matchAll(/<file path="([^"]+)">([\s\S]*?)<\/file>/g);
  let filesUpdated = 0;

  for (const match of fileMatches) {
    const [, filePath, fileContent] = match;
    const success = await writeFileToGitHub(filePath, fileContent.trim());
    if (success) filesUpdated++;
  }

  if (filesUpdated > 0) {
    await sendTelegramMessage(chatId, `✅ Done! Updated ${filesUpdated} file(s). Deploying now...`);
  } else {
    await sendTelegramMessage(chatId, `💬 ${responseText}`);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body?.message;

  if (!message || !message.from || message.from.is_bot) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  const userText = message.text || message.caption || '';

  if (!userText && !message.photo) return NextResponse.json({ ok: true });
  if (userText.startsWith('/')) return NextResponse.json({ ok: true });

  await sendTelegramMessage(chatId, '🤖 On it...');

  let imageData: { base64: string; mediaType: string } | undefined;
  if (message.photo) {
    const largest = message.photo[message.photo.length - 1];
    const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${largest.file_id}`);
    const fileData = await fileRes.json();
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileData.result.file_path}`;
    const imgRes = await fetch(fileUrl);
    const buffer = await imgRes.arrayBuffer();
    imageData = { base64: Buffer.from(buffer).toString('base64'), mediaType: 'image/jpeg' };
  }

  processMessage(chatId, userText, imageData).catch(console.error);

  return NextResponse.json({ ok: true });
}



