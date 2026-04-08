import { auth } from '@clerk/nextjs/server';
import { anthropic, MODELS } from '@/lib/anthropic';

const SYSTEM = `You are a diagram generator. Given a description (or an analysis of an image), output a JSON object with "nodes" and "edges" arrays for a React Flow diagram.

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

  const contentType = req.headers.get('content-type') || '';

  let prompt = '';
  let imageAnalysis = '';

  if (contentType.includes('multipart/form-data')) {
    // Handle image upload
    const formData = await req.formData();
    prompt = (formData.get('prompt') as string) || 'Convert this image into a diagram';
    const imageFile = formData.get('image') as File | null;

    if (imageFile) {
      // Use Gemini Vision to analyze the image
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return Response.json({ error: 'No Gemini API key configured' }, { status: 500 });

      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const base64 = buffer.toString('base64');
      const mimeType = imageFile.type || 'image/png';

      // Try Gemini Vision first, fall back to Claude Vision
      let visionError = '';
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: `Analyze this image in detail. Describe every element, connection, label, box, arrow, and relationship you see. If it's a whiteboard sketch, flowchart, org chart, architecture diagram, or any visual structure, describe it as precisely as possible so it can be recreated as a digital diagram. Additional context from user: ${prompt}` },
                  { inlineData: { mimeType, data: base64 } },
                ],
              }],
              generationConfig: { maxOutputTokens: 1500 },
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          imageAnalysis = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else {
          const errBody = await geminiRes.text();
          visionError = `Gemini ${geminiRes.status}: ${errBody.slice(0, 200)}`;
        }
      } catch (e) {
        visionError = `Gemini error: ${e instanceof Error ? e.message : 'unknown'}`;
      }

      // Fallback: use Claude Vision if Gemini fails
      if (!imageAnalysis) {
        try {
          const claudeRes = await anthropic.messages.create({
            model: MODELS.fast,
            max_tokens: 1500,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp', data: base64 } },
                { type: 'text', text: `Analyze this image in detail. Describe every element, connection, label, box, arrow, and relationship you see so it can be recreated as a digital diagram. User context: ${prompt}` },
              ],
            }],
          });
          imageAnalysis = claudeRes.content[0].type === 'text' ? claudeRes.content[0].text : '';
        } catch (e) {
          const claudeErr = e instanceof Error ? e.message : 'unknown';
          return Response.json({ error: `Vision failed. Gemini: ${visionError}. Claude: ${claudeErr}` }, { status: 500 });
        }
      }

      if (!imageAnalysis) {
        return Response.json({ error: `Could not analyze image. ${visionError}` }, { status: 500 });
      }
    }
  } else {
    const body = await req.json();
    prompt = body.prompt;
  }

  if (!prompt?.trim() && !imageAnalysis) {
    return Response.json({ error: 'Prompt or image required' }, { status: 400 });
  }

  try {
    const userMessage = imageAnalysis
      ? `Based on this image analysis, create a diagram:\n\n${imageAnalysis}\n\nUser's additional instructions: ${prompt}`
      : prompt;

    const msg = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const json = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(json);

    return Response.json(parsed);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : 'Generation failed';
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
