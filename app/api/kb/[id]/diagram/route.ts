import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { anthropic, MODELS } from '@/lib/anthropic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;

  // Get KB entry
  const { data: entry } = await supabaseAdmin
    .from('knowledge_base')
    .select('title, content')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!entry) return new Response('Not found', { status: 404 });

  // Ask Claude to generate diagram nodes and edges
  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Analyze this knowledge base entry and generate a visual diagram as JSON.

Extract the key entities, concepts, and relationships. Create a node-edge diagram.

Rules:
- Each node needs: id (string), type ("rectangle"), position ({x, y}), data ({label: "short label"})
- Each edge needs: id (string), source (node id), target (node id)
- Arrange nodes in a clear layout (top-to-bottom or left-to-right)
- Use spacing of ~200px between nodes horizontally, ~120px vertically
- Keep labels concise (max 3-4 words)
- Maximum 15 nodes
- Connect related concepts with edges

Respond with ONLY valid JSON in this format:
{"nodes": [...], "edges": [...]}

Title: ${entry.title}
Content:
${entry.content.slice(0, 3000)}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse JSON from response
  let nodes = [];
  let edges = [];
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      nodes = parsed.nodes ?? [];
      edges = parsed.edges ?? [];

      // Add styling to nodes
      nodes = nodes.map((n: Record<string, unknown>) => ({
        ...n,
        type: n.type || 'rectangle',
        style: undefined, // Let custom node types handle styling
      }));
    }
  } catch {
    return Response.json({ error: 'Failed to parse diagram from AI response' }, { status: 500 });
  }

  // Save as a new diagram
  const { data: diagram, error } = await supabaseAdmin
    .from('diagrams')
    .insert({
      user_id: userId,
      name: `Diagram: ${entry.title}`,
      description: `Auto-generated from Knowledge Base entry: ${entry.title}`,
      nodes,
      edges,
    })
    .select('id')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ diagramId: diagram.id });
}
