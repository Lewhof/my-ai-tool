import { NextRequest, NextResponse } from 'next/server';
const client = new Anthropic({
  baseURL: "https://anthropic.helicone.ai",
  defaultHeaders: {
    "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
  },
});
export async function POST(req: NextRequest) {
  const { message } = await req.json();
  const response = await client.messages.create({ model: 'claude-haiku-4-5', max_tokens: 1024, messages: [{ role: 'user', content: message }] });
  const reply = response.content[0].type === 'text' ? response.content[0].text : '';
  return NextResponse.json({ reply });
}
