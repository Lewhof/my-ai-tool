import { auth } from '@clerk/nextjs/server';
import { saveMemory, recallMemory, listMemories, deleteMemory, type MemorySource } from '@/lib/cerebro/memory';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const query = url.searchParams.get('q');
  const limit = Number(url.searchParams.get('limit') ?? '50');

  try {
    if (query) {
      const matches = await recallMemory(userId, query, { matchCount: limit });
      return Response.json({ matches });
    }
    const memories = await listMemories(userId, limit);
    return Response.json({ memories });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const content = (body.content as string)?.trim();
  if (!content) return Response.json({ error: 'content required' }, { status: 400 });
  if (content.length > 4000) return Response.json({ error: 'content too long (max 4000 chars)' }, { status: 400 });

  const source = (body.source as MemorySource) ?? 'manual';
  const importance = typeof body.importance === 'number' ? body.importance : 5;

  try {
    const memory = await saveMemory(userId, content, {
      source,
      sourceId: body.sourceId,
      importance,
      decayAt: body.decayAt ?? null,
    });
    return Response.json(memory);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  try {
    await deleteMemory(userId, id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
