// AI Stack diagram — matching the user's architecture screenshot
// Green border = already built, dashed gray border = not yet built

const LAYER_Y = { frontend: 0, orchestration: 160, aiModels: 320, data: 480, infra: 640 };
const COL_X = { left: 0, center: 280, right: 560, cost: 840 };

const layerLabelStyle = {
  fontSize: 13,
  color: '#9ca3af',
  fontWeight: 600,
  letterSpacing: '0.05em',
};

export const aiStackNodes = [
  // Layer labels
  { id: 'label-frontend', type: 'default', position: { x: -120, y: LAYER_Y.frontend + 20 }, data: { label: 'Frontend' }, style: { background: 'transparent', border: 'none', ...layerLabelStyle, width: 100 } },
  { id: 'label-orchestration', type: 'default', position: { x: -120, y: LAYER_Y.orchestration + 20 }, data: { label: 'Orchestration' }, style: { background: 'transparent', border: 'none', ...layerLabelStyle, width: 100 } },
  { id: 'label-ai', type: 'default', position: { x: -120, y: LAYER_Y.aiModels + 20 }, data: { label: 'AI Models' }, style: { background: 'transparent', border: 'none', ...layerLabelStyle, width: 100 } },
  { id: 'label-data', type: 'default', position: { x: -120, y: LAYER_Y.data + 20 }, data: { label: 'Data' }, style: { background: 'transparent', border: 'none', ...layerLabelStyle, width: 100 } },
  { id: 'label-infra', type: 'default', position: { x: -120, y: LAYER_Y.infra + 20 }, data: { label: 'Infra' }, style: { background: 'transparent', border: 'none', ...layerLabelStyle, width: 100 } },

  // ── Frontend ──
  { id: 'nextjs', position: { x: COL_X.left, y: LAYER_Y.frontend }, data: { label: 'Next.js\nReact + SSR' }, style: { background: '#3b3080', border: '2px solid #22c55e', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'shadcn', position: { x: COL_X.center, y: LAYER_Y.frontend }, data: { label: 'shadcn/ui\nFree component lib' }, style: { background: '#3b3080', border: '2px dashed #6b7280', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'clerk', position: { x: COL_X.right, y: LAYER_Y.frontend }, data: { label: 'Clerk\nAuth (free tier)' }, style: { background: 'transparent', border: '2px solid #22c55e', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'cost-frontend', position: { x: COL_X.cost, y: LAYER_Y.frontend + 10 }, data: { label: '~$0/mo\nMVP start' }, style: { background: 'transparent', border: 'none', color: '#9ca3af', width: 100, fontSize: 13, fontWeight: 500, textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },

  // ── Orchestration ──
  { id: 'langchain', position: { x: COL_X.left, y: LAYER_Y.orchestration }, data: { label: 'LangChain / LangGraph\nAgent orchestration' }, style: { background: '#1a5c2a', border: '2px dashed #6b7280', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'vercel-ai', position: { x: COL_X.center, y: LAYER_Y.orchestration }, data: { label: 'Vercel AI SDK\nStreaming + tool use' }, style: { background: '#1a5c2a', border: '2px dashed #6b7280', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'bullmq', position: { x: COL_X.right, y: LAYER_Y.orchestration }, data: { label: 'BullMQ / Inngest\nJob queue (free tier)' }, style: { background: 'transparent', border: '2px dashed #6b7280', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'cost-orch', position: { x: COL_X.cost, y: LAYER_Y.orchestration + 10 }, data: { label: '~$0/mo\nfree tiers' }, style: { background: 'transparent', border: 'none', color: '#9ca3af', width: 100, fontSize: 13, fontWeight: 500, textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },

  // ── AI Models ──
  { id: 'haiku', position: { x: COL_X.left, y: LAYER_Y.aiModels }, data: { label: 'Claude Haiku\nFast + cheap routing' }, style: { background: '#7c4a1a', border: '2px solid #22c55e', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'gpt4o', position: { x: COL_X.center, y: LAYER_Y.aiModels }, data: { label: 'GPT-4o mini\nCheap fallback model' }, style: { background: '#7c4a1a', border: '2px dashed #6b7280', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'router', position: { x: COL_X.right, y: LAYER_Y.aiModels }, data: { label: 'Model router\nRoute by complexity' }, style: { background: 'transparent', border: '2px dashed #6b7280', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'cost-ai', position: { x: COL_X.cost, y: LAYER_Y.aiModels + 10 }, data: { label: 'Pay-per-use\nonly AI cost' }, style: { background: 'transparent', border: 'none', color: '#9ca3af', width: 100, fontSize: 13, fontWeight: 500, textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },

  // ── Data ──
  { id: 'supabase', position: { x: COL_X.left, y: LAYER_Y.data }, data: { label: 'Supabase\nPostgres + free tier' }, style: { background: '#1a4a7c', border: '2px solid #22c55e', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'pgvector', position: { x: COL_X.center, y: LAYER_Y.data }, data: { label: 'pgvector\nVector search (built-in)' }, style: { background: '#1a4a7c', border: '2px dashed #6b7280', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'redis', position: { x: COL_X.right, y: LAYER_Y.data }, data: { label: 'Redis / Upstash\nSession cache + memory' }, style: { background: 'transparent', border: '2px dashed #6b7280', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'cost-data', position: { x: COL_X.cost, y: LAYER_Y.data + 10 }, data: { label: '~$0/mo\nfree tier' }, style: { background: 'transparent', border: 'none', color: '#9ca3af', width: 100, fontSize: 13, fontWeight: 500, textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },

  // ── Infra ──
  { id: 'vercel', position: { x: COL_X.left, y: LAYER_Y.infra }, data: { label: 'Vercel\nHosting (Pro)' }, style: { background: '#1a5c2a', border: '2px solid #22c55e', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'langsmith', position: { x: COL_X.center, y: LAYER_Y.infra }, data: { label: 'LangSmith\nObservability + traces' }, style: { background: '#1a5c2a', border: '2px dashed #6b7280', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'helicone', position: { x: COL_X.right, y: LAYER_Y.infra }, data: { label: 'Helicone\nCost tracking' }, style: { background: 'transparent', border: '2px solid #22c55e', color: 'white', width: 220, height: 70, fontSize: 14, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },
  { id: 'cost-infra', position: { x: COL_X.cost, y: LAYER_Y.infra + 10 }, data: { label: '~$20/mo\nVercel Pro' }, style: { background: 'transparent', border: 'none', color: '#9ca3af', width: 100, fontSize: 13, fontWeight: 500, textAlign: 'center' as const, whiteSpace: 'pre-wrap' as const } },

  // Legend
  { id: 'legend-built', position: { x: 0, y: 800 }, data: { label: '\u2713 Built' }, style: { background: 'transparent', border: '2px solid #22c55e', color: '#22c55e', width: 100, height: 36, fontSize: 12, fontWeight: 600, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
  { id: 'legend-planned', position: { x: 120, y: 800 }, data: { label: '\u25CB Planned' }, style: { background: 'transparent', border: '2px dashed #6b7280', color: '#9ca3af', width: 100, height: 36, fontSize: 12, fontWeight: 600, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
];

export const aiStackEdges = [
  // Vertical connections between layers
  { id: 'e-nextjs-langchain', source: 'nextjs', target: 'langchain', style: { stroke: '#4b5563' }, animated: true },
  { id: 'e-nextjs-vercelai', source: 'nextjs', target: 'vercel-ai', style: { stroke: '#4b5563' }, animated: true },
  { id: 'e-langchain-haiku', source: 'langchain', target: 'haiku', style: { stroke: '#4b5563' } },
  { id: 'e-vercelai-haiku', source: 'vercel-ai', target: 'haiku', style: { stroke: '#4b5563' } },
  { id: 'e-router-gpt4o', source: 'router', target: 'gpt4o', style: { stroke: '#4b5563' } },
  { id: 'e-router-haiku', source: 'router', target: 'haiku', style: { stroke: '#4b5563' } },
  { id: 'e-haiku-supabase', source: 'haiku', target: 'supabase', style: { stroke: '#4b5563' } },
  { id: 'e-supabase-pgvector', source: 'supabase', target: 'pgvector', style: { stroke: '#4b5563' } },
  { id: 'e-supabase-vercel', source: 'supabase', target: 'vercel', style: { stroke: '#4b5563' } },
  { id: 'e-helicone-haiku', source: 'helicone', target: 'haiku', style: { stroke: '#4b5563' } },
];
