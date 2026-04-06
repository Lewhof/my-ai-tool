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

async function getLatestVercelDeployment() {
  const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT}&limit=1`, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.deployments?.[0] || null;
}

async function getVercelBuildLogs(deploymentId: string): Promise<string> {
  const res = await fetch(`https://api.vercel.com/v2/deployments/${deploymentId}/events`, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) return 'Could not fetch logs';
  const events = await res.json();
  return events
    .filter((e: any) => e.type === 'stderr' || e.type === 'stdout')
    .map((e: any) => e.payload?.text || '')
    .join('\n')
    .slice(-3000);
}

async function waitForDeployment(chatId: number): Promise<'ready' | 'error'> {
  await sendTelegramMessage(chatId, '⏳ Waiting for Vercel deployment...');
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const deployment = await getLatestVercelDeployment();
    if (!deployment) continue;
    if (deployment.state === 'READY') return 'ready';
    if (deployment.state === 'ERROR') return 'error';
  }
  return 'error';
}

async function buildAndFix(chatId: number, userText: string, existingFiles: Record<string, string>, attempt = 1): Promise<void> {
  if (attempt > 3) {
    await sendTelegramMessage(chatId, '❌ Failed after 3 attempts. Please check manually.');
    return;
  }

  const fileContext = Object.entries(existingFiles)
    .map(([path, content]) => `FILE: ${path}\n\`\`\`\n${content.slice(0, 500)}\n\`\`\``)
    .join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: `You are a coding agent for a Next.js app. 
Current codebase context:
${fileContext}

Rules:
- Respond with one file at a time in this format:
FILE: path/to/file.tsx
\`\`\`tsx
<complete file content>
\`\`\`
- Write complete working code only
- Never import from files that don't exist
- Always include globals.css with tailwind directives if touching layout.tsx`,
    messages: [{ role: 'user', content: userText }],
  });

  const reply = response.content[0].type === 'text' ? response.content[0].text : '';
  const fileMatch = reply.match(/FILE: (.+)\n```(?:tsx|ts|js|jsx|css)?\n([\s\S]+?)\n```/);

  if (!fileMatch) {
    await sendTelegramMessage(chatId, reply.slice(0, 4000));
    return;
  }

  const filePath = fileMatch[1].trim();
  const fileContent = fileMatch[2].trim();
  await sendTelegramMessage(chatId, `📝 Writing \`${filePath}\` (attempt ${attempt})...`);
  await writeFileToGitHub(filePath, fileContent, `Agent attempt ${attempt}: ${userText}`);

  const result = await waitForDeployment(chatId);

  if (result === 'ready') {
    await sendTelegramMessage(chatId, `✅ Deployed successfully!\n\nLive at: lewhofmeyr.co.za`);
    return;
  }

  await sendTelegramMessage(chatId, '🔍 Deploy failed — reading error logs...');
  const deployment = await getLatestVercelDeployment();
  const logs = deployment ? await getVercelBuildLogs(deployment.uid) : 'No logs available';
  await sendTelegramMessage(chatId, `⚠️ Error found:\n\`\`\`\n${logs.slice(0, 500)}\n\`\`\``);

  await buildAndFix(chatId, `Fix this build error:\n${logs}\n\nOriginal task: ${userText}`, existingFiles, attempt + 1);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body?.message;
  if (!message || !message.text || message.from?.is_bot) return NextResponse.json({ ok: true });
  if (message.text.startsWith('/')) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const userText = message.text;

  await sendTelegramMessage(chatId, '🤖 Reading codebase...');

  const existingFiles: Record<string, string> = {};
  const filesToRead = ['app/page.tsx', 'app/layout.tsx', 'app/globals.css', 'middleware.ts'];
  for (const file of filesToRead) {
    const content = await getFileFromGitHub(file);
    if (content) existingFiles[file] = content;
  }

  await buildAndFix(chatId, userText, existingFiles);
  return NextResponse.json({ ok: true });
}
