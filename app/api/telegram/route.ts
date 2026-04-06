cat > app/api/telegram/route.ts << 'EOF'
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  baseURL: "https://anthropic.helicone.ai",
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
  const res = await fetch(url, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'lewhof-agent' } });
  if (!res.ok) return null;
  const data = await res.json();
  return Buffer.from(data.content, 'base64').toString('utf-8');
}

async function writeFileToGitHub(path: string, content: string, message: string) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const existing = await fetch(url, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'lewhof-agent' } });
  let sha = undefined;
  if (existing.ok) { const data = await existing.json(); sha = data.sha; }
  const response = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'lewhof-agent' },
    body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), sha }),
  });
  return response.ok;
}

async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
  const data = await res.json();
  if (!data.ok) return null;
  return `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${data.result.file_path}`;
}

async function downloadImageAsBase64(url: string): Promise<{base64: string; mediaType: string} | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buffer = await res.arrayBuffer();
  return { base64: Buffer.from(buffer).toString('base64'), mediaType: res.headers.get('content-type') || 'image/jpeg' };
}

async function processMessage(chatId: number, userText: string, imageData: {base64: string; mediaType: string} | null, existingFiles: Record<string, string>) {
  const fileContext = Object.entries(existingFiles).map(([path, content]) => `FILE: ${path}\n\`\`\`\n${content.slice(0, 600)}\n\`\`\``).join('\n\n');

  const userContent: any[] = [];
  if (imageData) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: imageData.mediaType, data: imageData.base64 } });
    userContent.push({ type: 'text', text: `Screenshot provided. ${userText}` });
  } else {
    userContent.push({ type: 'text', text: userText });
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: `You are a coding agent for a Next.js 16 app with Tailwind v4.
Current codebase:
${fileContext}

RULES:
- globals.css must only contain: @import "tailwindcss";
- Respond with ONE file at a time:
FILE: path/to/file.tsx
\`\`\`tsx
<complete file content>
\`\`\`
- If given a screenshot, replicate that UI
- Use Tailwind classes for styling
- Never import from files that don't exist
- If asked a question, just answer it without writing files`,
    messages: [{ role: 'user', content: userContent }],
  });

  const reply = response.content[0].type === 'text' ? response.content[0].text : '';
  const fileMatch = reply.match(/FILE: (.+)\n```(?:tsx|ts|js|jsx|css)?\n([\s\S]+?)\n```/);

  if (!fileMatch) {
    await sendTelegramMessage(chatId, reply.slice(0, 4000));
    return;
  }

  const filePath = fileMatch[1].trim();
  const fileContent = fileMatch[2].trim();
  await sendTelegramMessage(chatId, `📝 Writing \`${filePath}\`...`);
  const success = await writeFileToGitHub(filePath, fileContent, `Agent: ${userText.slice(0, 60)}`);
  if (success) {
    await sendTelegramMessage(chatId, `✅ Done! \`${filePath}\` updated.\n\nVercel will deploy in ~1 min: lewhofmeyr.co.za`);
  } else {
    await sendTelegramMessage(chatId, '❌ Failed to write file.');
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

  const existingFiles: Record<string, string> = {};
  for (const file of ['app/page.tsx', 'app/layout.tsx', 'app/globals.css']) {
    const content = await getFileFromGitHub(file);
    if (content) existingFiles[file] = content;
  }

  let imageData: {base64: string; mediaType: string} | null = null;
  if (message.photo) {
    const largest = message.photo[message.photo.length - 1];
    const fileUrl = await getTelegramFileUrl(largest.file_id);
    if (fileUrl) imageData = await downloadImageAsBase64(fileUrl);
  }

  await processMessage(chatId, userText, imageData, existingFiles);
  return NextResponse.json({ ok: true });
}
EOF