import { auth } from '@clerk/nextjs/server';
import { anthropic, MODELS } from '@/lib/anthropic';

const SYSTEM = `You are a diagram generator. Given a description, output a JSON object with "nodes" and "edges" arrays for a React Flow diagram.

Node types: rectangle, start, end, decision, process, database, cloud, actor, note, group.

Node format: { "id": "unique-id", "type": "node-type", "position": { "x": number, "y": number }, "data": { "label": "text" } }
Edge format: { "id": "unique-id", "source": "node-id", "target": "node-id" }

Position nodes in a clean top-to-bottom or left-to-right layout with ~100-150px spacing.
Use appropriate node types (start for entry points, end for terminations, decision for conditionals, database for storage, cloud for external services, actor for users, process for operations).
Create meaningful connections between related nodes.
Aim for 5-15 nodes depending on complexity.

Return ONLY valid JSON, no markdown or explanation.`;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { prompt } = await req.json();
  if (!prompt?.trim()) return Response.json({ error: 'Prompt required' }, { status: 400 });

  try {
    const msg = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const json = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(json);

    return Response.json(parsed);
  } catch (e: any) {
    return Response.json({ error: e.message || 'Generation failed' }, { status: 500 });
  }
}
