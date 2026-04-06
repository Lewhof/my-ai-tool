import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const SEED_ENTRIES = [
  {
    title: 'AI Tools for Corporate Identity & Design',
    category: 'AI Tools',
    tags: ['design', 'CI', 'branding'],
    content: `Reference table of AI tools for stunning corporate identity design.

| Tool | What it does | Cost |
|------|-------------|------|
| **Midjourney** | Best quality AI image generation — logos, icons, brand visuals | $10/mo |
| **Ideogram** | Excellent with text in images — logos with text, badges | Free tier |
| **Recraft** | Purpose-built for brand design — vector logos, icons, consistent style | Free tier |
| **Figma + AI plugins** | Layout, mockups, design system — Magician plugin for AI generation | Free tier |
| **v0.dev** | Vercel's AI — generates React UI components from prompts | Free tier |

### Recommendations
1. **Recraft** (free) — generate logo and icon set, outputs SVG vectors
2. **v0.dev** (free) — generate polished React UI components for the app
3. **Midjourney** ($10/mo) — only when you need hero images, illustrations, marketing visuals`,
  },
  {
    title: 'AI Stack Architecture — Current vs Planned',
    category: 'Architecture',
    tags: ['stack', 'infrastructure', 'planning'],
    content: `Overview of the full AI stack with build status.

### Frontend (~$0/mo MVP)
| Component | Status | Notes |
|-----------|--------|-------|
| Next.js (React + SSR) | ✅ Built | v16.2.2 |
| shadcn/ui (component lib) | ⬜ Planned | Free, would replace custom components |
| Clerk (Auth) | ✅ Built | Free tier, dev keys |

### Orchestration (~$0/mo free tiers)
| Component | Status | Notes |
|-----------|--------|-------|
| LangChain / LangGraph | ⬜ Planned | Agent orchestration |
| Vercel AI SDK | ⬜ Planned | Installed but unused |
| BullMQ / Inngest | ⬜ Planned | Job queue for background tasks |

### AI Models (pay-per-use)
| Component | Status | Notes |
|-----------|--------|-------|
| Claude Haiku | ✅ Built | Fast + cheap, default model |
| Claude Sonnet | ✅ Built | Used by Telegram bot |
| GPT-4o mini | ⬜ Planned | Cheap fallback |
| Model Router | ⬜ Planned | Route by complexity |

### Data (~$0/mo free tier)
| Component | Status | Notes |
|-----------|--------|-------|
| Supabase (Postgres) | ✅ Built | Free tier, 10 tables |
| pgvector | ⬜ Planned | Vector search, built into Supabase |
| Redis / Upstash | ⬜ Planned | Session cache + memory |

### Infra (~$20/mo)
| Component | Status | Notes |
|-----------|--------|-------|
| Vercel | ✅ Built | Pro plan |
| LangSmith | ⬜ Planned | Observability + traces |
| Helicone | ✅ Built | Cost tracking |`,
  },
  {
    title: 'App Modules — Current Status',
    category: 'Architecture',
    tags: ['modules', 'features', 'status'],
    content: `All modules currently built in the Lewhof AI Dashboard.

| Module | Status | Description |
|--------|--------|-------------|
| Dashboard | ✅ Live | Quick actions, credits widget, recent activity |
| To-Do | ✅ Live | Planner (Kanban) + table view, priorities, due dates |
| Chat | ✅ Live | Threaded Claude Haiku chat, streaming, history |
| Diagrams | ✅ Live | ReactFlow canvas, 10 node types, Claude sub-page |
| Documents | ✅ Live | Upload PDF/images, viewer, chat about docs |
| Workflows | ✅ Live | Prompt chains, step-by-step streaming, templates |
| Whiteboard | ✅ Live | Dev backlog, status workflow, table + card views |
| Knowledge Base | ✅ Live | Wiki with markdown, categories, search |
| Vault | ✅ Live | API key storage, categories, reveal/copy |
| Settings | ✅ Live | Model selector, data management |
| Telegram Bot | ✅ Live | Mobile companion, code editing via GitHub |`,
  },
];

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { data: existing } = await supabaseAdmin
    .from('knowledge_base')
    .select('title')
    .eq('user_id', userId);

  const existingTitles = new Set((existing ?? []).map((e) => e.title));
  const toInsert = SEED_ENTRIES
    .filter((e) => !existingTitles.has(e.title))
    .map((e) => ({ ...e, user_id: userId }));

  if (toInsert.length === 0) {
    return Response.json({ message: 'All entries exist', added: 0 });
  }

  const { error } = await supabaseAdmin.from('knowledge_base').insert(toInsert);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ added: toInsert.length });
}
