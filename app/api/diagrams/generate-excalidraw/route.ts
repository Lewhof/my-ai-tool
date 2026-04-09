import { auth } from '@clerk/nextjs/server';
import { anthropic, MODELS } from '@/lib/anthropic';

// Generate an Excalidraw scene from a natural-language prompt.
// Uses tool-use so the model outputs structured JSON instead of free-text
// that we'd have to parse — same pattern as the cron task executor.
const SYSTEM = `You are an Excalidraw diagram generator. Produce clean, readable architecture/flow/sequence diagrams using Excalidraw's element format.

RULES:
- Output 5–20 elements depending on complexity.
- Use labeled shapes (rectangle/ellipse/diamond with a "label" field) — never separate text elements for shape labels.
- Use arrows with startBinding/endBinding to connect shapes by elementId.
- Dark theme — background is #1e1e2e. Use bright/light colors for shapes and #e5e5e5 for standalone text.
- Layout with at least 40px gaps, shapes minimum 140x70, fontSize 16 for labels, 20 for titles.
- Assign every element a unique short "id" string (e.g. "box1", "arrow1").
- Required fields per element: type, id, x, y, width, height.
- Arrows need points [[0,0],[dx,dy]] relative to the arrow's x,y.
- Use backgroundColor and strokeColor for visual hierarchy.

DARK THEME PALETTE (on #1e1e2e background):
- Primary node: backgroundColor "#1e3a5f", strokeColor "#4a9eed"
- Success: backgroundColor "#1a4d2e", strokeColor "#22c55e"
- Processing: backgroundColor "#2d1b69", strokeColor "#8b5cf6"
- Warning: backgroundColor "#5c3d1a", strokeColor "#f59e0b"
- Error: backgroundColor "#5c1a1a", strokeColor "#ef4444"
- Storage: backgroundColor "#1a4d4d", strokeColor "#06b6d4"
- Labels: white/light text automatically rendered by Excalidraw on dark fills.

Use roundness { type: 3 } for rounded rectangles.`;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { prompt } = await req.json();
  if (!prompt?.trim()) {
    return Response.json({ error: 'Prompt required' }, { status: 400 });
  }

  try {
    const response = await anthropic.messages.create({
      model: MODELS.smart,
      max_tokens: 8000,
      system: SYSTEM,
      tools: [{
        name: 'create_excalidraw_scene',
        description: 'Emit an Excalidraw scene as an array of elements.',
        input_schema: {
          type: 'object' as const,
          properties: {
            elements: {
              type: 'array',
              description: 'Array of Excalidraw elements (rectangle, ellipse, diamond, arrow, text).',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['rectangle', 'ellipse', 'diamond', 'arrow', 'text'] },
                  id: { type: 'string' },
                  x: { type: 'number' },
                  y: { type: 'number' },
                  width: { type: 'number' },
                  height: { type: 'number' },
                  backgroundColor: { type: 'string' },
                  strokeColor: { type: 'string' },
                  fillStyle: { type: 'string' },
                  strokeWidth: { type: 'number' },
                  roundness: {
                    type: 'object',
                    properties: { type: { type: 'number' } },
                  },
                  label: {
                    type: 'object',
                    properties: {
                      text: { type: 'string' },
                      fontSize: { type: 'number' },
                    },
                  },
                  text: { type: 'string' },
                  fontSize: { type: 'number' },
                  points: {
                    type: 'array',
                    items: { type: 'array', items: { type: 'number' } },
                  },
                  endArrowhead: { type: 'string' },
                  startBinding: {
                    type: 'object',
                    properties: {
                      elementId: { type: 'string' },
                      fixedPoint: { type: 'array', items: { type: 'number' } },
                    },
                  },
                  endBinding: {
                    type: 'object',
                    properties: {
                      elementId: { type: 'string' },
                      fixedPoint: { type: 'array', items: { type: 'number' } },
                    },
                  },
                },
                required: ['type', 'id', 'x', 'y', 'width', 'height'],
              },
            },
          },
          required: ['elements'],
        },
      }],
      tool_choice: { type: 'tool', name: 'create_excalidraw_scene' },
      messages: [{ role: 'user', content: prompt }],
    });

    if (response.stop_reason === 'max_tokens') {
      return Response.json({ error: 'Response truncated — try a smaller prompt.' }, { status: 500 });
    }

    const toolUse = response.content.find(b => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      return Response.json({ error: 'Model did not return a scene.' }, { status: 500 });
    }

    const raw = (toolUse.input as { elements?: unknown[] }).elements ?? [];

    // Normalize into full Excalidraw element shape.
    // Excalidraw needs seed/version/updated/etc on each element — use a
    // minimal spread and let Excalidraw fill in defaults.
    type RawElement = {
      type: string;
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      label?: { text: string; fontSize?: number };
      [key: string]: unknown;
    };
    const rawElements = raw as RawElement[];

    const now = Date.now();
    const elements = rawElements.flatMap((el) => {
      const base = {
        ...el,
        seed: Math.floor(Math.random() * 2 ** 31),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2 ** 31),
        updated: now,
        isDeleted: false,
        angle: 0,
        opacity: 100,
        strokeStyle: 'solid',
        roughness: 1,
        groupIds: [],
        frameId: null,
        boundElements: null,
        link: null,
        locked: false,
      };

      // Labeled shape: Excalidraw expects a bound text element, not a
      // `label` field on the shape. We split them here.
      if (el.label && el.type !== 'arrow' && el.type !== 'text') {
        const textId = `${el.id}-label`;
        const labelText = el.label.text;
        const fontSize = el.label.fontSize ?? 16;
        const shapeWithBinding = {
          ...base,
          boundElements: [{ id: textId, type: 'text' }],
        };
        // Remove the label helper field from the shape record
        delete (shapeWithBinding as Record<string, unknown>).label;

        const text = {
          type: 'text',
          id: textId,
          x: el.x + 10,
          y: el.y + el.height / 2 - fontSize / 2,
          width: el.width - 20,
          height: fontSize * 1.2,
          text: labelText,
          fontSize,
          fontFamily: 1,
          textAlign: 'center',
          verticalAlign: 'middle',
          containerId: el.id,
          originalText: labelText,
          lineHeight: 1.25,
          seed: Math.floor(Math.random() * 2 ** 31),
          version: 1,
          versionNonce: Math.floor(Math.random() * 2 ** 31),
          updated: now,
          isDeleted: false,
          angle: 0,
          opacity: 100,
          strokeColor: '#e5e5e5',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeStyle: 'solid',
          strokeWidth: 1,
          roughness: 1,
          groupIds: [],
          frameId: null,
          boundElements: null,
          link: null,
          locked: false,
        };
        return [shapeWithBinding, text];
      }

      // Standalone text element
      if (el.type === 'text') {
        return [{
          ...base,
          fontFamily: 1,
          textAlign: 'left',
          verticalAlign: 'top',
          originalText: (el as { text?: string }).text ?? '',
          lineHeight: 1.25,
        }];
      }

      return [base];
    });

    return Response.json({ elements });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Generation failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
