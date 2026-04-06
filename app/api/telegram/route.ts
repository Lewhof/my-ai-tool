import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_OWNER = process.env.GITHUB_OWNER;

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

async function writeFileToGitHub(path: string, content: string, message: string) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const existing = await fetch(url, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'lewhof-agent' } });
  let sha = undefined;
  if (existing.ok) {
    const data = await existing.json();
    sha = data.sha;
  }
  const response = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'lewhof-agent' },
    body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), sha }),
  });
  return response.ok;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body?.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const userText = message.text;

  await sendTelegramMessage(chatId, '🤖 Agent thinking...');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: `You are a coding agent that builds and modifies a Next.js app. 
When asked to create or modify pages, respond with EXACTLY this format and nothing else:
FILE: app/page.tsx
\`\`\`
<full file contents here>
\`\`\`
Only output one file at a time. Write complete, working code.`,
    messages: [{ role: 'user', content: userText }],
  });

  const reply = response.content[0].type === 'text' ? response.content[0].text : '';

  const fileMatch = reply.match(/FILE: (.+)\n```(?:tsx|ts|js|jsx)?\n([\s\S]+?)\n```/);
  if (fileMatch) {
    const filePath = fileMatch[1].trim();
    const fileContent = fileMatch[2].trim();
    const success = await writeFileToGitHub(filePath, fileContent, `Agent: ${userText}`);
    if (success) {
      await sendTelegramMessage(chatId, `✅ Done! Updated \`${filePath}\`\n\nDeploying to lewhofmeyr.co.za... (1-2 min)`);
    } else {
      await sendTelegramMessage(chatId, '❌ Failed to write file. Check GitHub token.');
    }
  } else {
    await sendTelegramMessage(chatId, reply);
  }

  return NextResponse.json({ ok: true });
}
