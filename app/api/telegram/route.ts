import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT = process.env.VERCEL_PROJECT_ID;

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

async function getLatestVercelDeployment() {
  const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT}&limit=1`, { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.deployments?.[0] || null;
}

async function getVercelBuildLogs(deploymentId: string): Promise<string> {
  const res = await fetch(`https://api.vercel.com/v2/deployments/${deploymentId}/events`, { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } });
  if (!res.ok) return 'Could not fetch logs';
  const events = await res.json();
  return events.filter((e: any) => e.type === 'stderr' || e.type === 'stdout').map((e: any) => e.payload?.text || '').join('\n').slice(-3000);
}

async function waitForDeployment(chatId: number): Promise<'ready' | 'error'> {
  await sendTelegramMessage(chatId, '⏳ Waiting for deployment...');
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const deployment = await getLatestVercelDeployment();
    if (!deployment) continue;
    if (deployment.state === 'READY') return 'ready';
    if (deployment.state === 'ERROR') return 'error';
  }
  return 'error';
}

async function buildAndFix(chatId: number, userText: string, imageData: {base64: string; mediaType: string} | null, existingFiles: Record<string, string>, attempt = 1): Promise<void> {
  if (attempt > 3) { await sendTelegramMessage(chatId, '❌ Failed after 3 attempts.'); return; }

  const fileContext = Object.entries(existingFiles).map(([path, content]) => `FILE: ${path}\n\`\`\`\n${content.slice(0, 600)}\n\`\`\``).join('\n\n');

  const userContent: any[] = [];
  if (imageData) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: imageData.mediaType, data: imageData.base64 } });
    userContent.push({ type: 'text', text: `Screenshot provided above. ${userText}` });
  } else {
    userContent.push({ type: 'text', text: userText });
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: `You are a coding agent for a Next.js 16 app with Tailwind v4.
Current codebase:
${fileContext}

CRITICAL RULES:
- globals.css must only contain: @import "tailwindcss";
- Never use @tailwind directives
- Respond with ONE file at a time:
FILE: path/to/file.tsx
\`\`\`tsx
<complete file content>
\`\`\`
- If given a screenshot, replicate or improve that exact UI
- Use Tailwind classes for all styling
- Never import from files that don't exist`,
    messages: [{ role: 'user', content: userContent }],
  });

  const reply = response.content[0].type === 'text' ? response.content[0].text : '';
  const fileMatch = reply.match(/FILE: (.+)\n```(?:tsx|ts|js|jsx|css)?\n([\s\S]+?)\n```/);

  if (!fileMatch) { await sendTelegramMessage(chatId, reply.slice(0, 4000)); return; }

  const filePath = fileMatch[1].trim();
  const fileContent = fileMatch[2].trim();
  await sendTelegramMessage(chatId, `📝 Writing \`${filePath}\` (attempt ${attempt})...`);
  await writeFileToGitHub(filePath, fileContent, `Agent attempt ${attempt}: ${userText.slice(0, 60)}`);

  const result = await waitForDeployment(chatId);
  if (result === 'ready') { await sendTelegramMessage(chatId, `✅ Deployed!\n\nLive at: lewhofmeyr.co.za`); return; }

  await sendTelegramMessage(chatId, '🔍 Deploy failed — reading logs...');
  const deployment = await getLatestVercelDeployment();
  const logs = deployment ? await getVercelBuildLogs(deployment.uid) : 'No logs';
  await sendTelegramMessage(chatId, `⚠️ Error:\n\`\`\`\n${logs.slice(0, 500)}\n\`\`\``);
  await buildAndFix(chatId, `Fix this error:\n${logs}\n\nOriginal task: ${userText}`, null, existingFiles, attempt + 1);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body?.message;
  if (!message || message.from?.is_bot) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const userText = message.text || message.caption || 'Build this UI from the screenshot';
  if (userText.startsWith('/')) return NextResponse.json({ ok: true });

  await sendTelegramMessage(chatId, '🤖 Reading codebase...');

  const existingFiles: Record<string, string> = {};
  for (const file of ['app/page.tsx', 'app/layout.tsx', 'app/globals.css', 'middleware.ts']) {
    const content = await getFileFromGitHub(file);
    if (content) existingFiles[file] = content;
  }

  let imageData: {base64: string; mediaType: string} | null = null;
  if (message.photo) {
    const largest = message.photo[message.photo.length - 1];
    await sendTelegramMessage(chatId, '🖼️ Processing screenshot...');
    const fileUrl = await getTelegramFileUrl(largest.file_id);
    if (fileUrl) imageData = await downloadImageAsBase64(fileUrl);
  }

  await buildAndFix(chatId, userText, imageData, existingFiles);
  return NextResponse.json({ ok: true });
}
