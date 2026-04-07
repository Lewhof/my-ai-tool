# Lewhof AI Dashboard — Master Roadmap v2

Combined scoping from Architect Advisory + Master Agent research + session work.

## Current State
- 25+ pages, 52+ API routes, 5 AI models, 10+ integrations
- Modules: Chat, Diagrams, Documents, Notes, Todos, Whiteboard, Workflows, Vault, KB, Images, Calendar, Social, Credits, Settings

---

## Phase 1: Intelligence Layer (NEXT)

| Feature | Priority | Status |
|---------|----------|--------|
| Master Agent page — single prompt, all tools | HIGH | Scoped |
| Chat inline actions (Create task, Add to whiteboard, Save as note) | HIGH | Not started |
| Dashboard AI Briefing widget (daily summary) | HIGH | Not started |
| Whiteboard AI auto-prioritization + staleness alerts | MEDIUM | Not started |
| Slash commands in chat (/task, /note, /whiteboard) | MEDIUM | Not started |
| Suggested prompts on empty chat | LOW | Not started |

## Phase 2: Microsoft Email + Scheduling

| Feature | Priority | Status |
|---------|----------|--------|
| Outlook email integration via Microsoft Graph | HIGH | Not started |
| AI inbox triage (important / can wait / FYI) | HIGH | Not started |
| Email summaries + link to whiteboard/tasks | MEDIUM | Not started |
| Email digest in daily briefing | MEDIUM | Not started |
| Calendar: focus time blocking | LOW | Not started |
| Calendar: meeting prep summaries | LOW | Not started |
| Recurring todos with calendar sync | MEDIUM | Not started |

## Phase 3: Daily Briefing Agent

| Feature | Priority | Status |
|---------|----------|--------|
| Autonomous daily agent (Vercel Cron + Haiku) | HIGH | Not started |
| Pulls: email, calendar, tasks, whiteboard, credits, weather | HIGH | Not started |
| Dashboard card + Telegram push delivery | MEDIUM | Not started |
| Inngest/Vercel Cron for scheduling | MEDIUM | Not started |

## Phase 4: Monetization

| Feature | Priority | Status |
|---------|----------|--------|
| Credit system (user_credits table) | HIGH | Not started |
| Stripe integration | HIGH | Not started |
| Free/Pro tier gating | HIGH | Not started |
| Usage tracking gate on AI calls | MEDIUM | Not started |

## Phase 5: Automation

| Feature | Priority | Status |
|---------|----------|--------|
| Custom user-defined agents (schedule + prompt + actions) | HIGH | Not started |
| Scheduled workflow execution (cron) | MEDIUM | Not started |
| Trigger-based actions (new doc -> auto-summarize) | MEDIUM | Not started |
| Conditional branching in workflows | LOW | Not started |

## Phase 6: Polish + Trust

| Feature | Priority | Status |
|---------|----------|--------|
| shadcn/ui component upgrade | HIGH | Not started |
| Focus Mode / Deep Work timer | MEDIUM | Not started |
| Productivity analytics (velocity, trends) | MEDIUM | Not started |
| Data export (JSON/CSV) | HIGH | Not started |
| AI privacy policy page | MEDIUM | Not started |
| Sentry error monitoring | LOW | Not started |
| Zustand state management | LOW | Not started |
| Supabase Realtime subscriptions | LOW | Not started |

---

## Architecture: Master Agent

Supervisor pattern — single Master Agent receives all prompts, routes to specialist sub-agents via tool use.

### Tools available to Master Agent

| # | Tool | What it does |
|---|------|-------------|
| 1 | search_web | Web search via Perplexity/Gemini |
| 2 | get_calendar | Fetch calendar events |
| 3 | create_todo | Create a task |
| 4 | create_whiteboard_item | Add to backlog |
| 5 | search_documents | Search uploaded docs |
| 6 | analyze_document | AI document analysis |
| 7 | generate_image | Nano Banana image gen |
| 8 | create_diagram | Generate diagram from prompt |
| 9 | get_vault | Retrieve a vault entry |
| 10 | save_note | Create/update a note |
| 11 | get_weather | Current weather |
| 12 | send_telegram | Send message via bot |
| 13 | get_credits | Check AI usage/costs |
| 14 | search_kb | Search knowledge base |
| 15 | create_calendar_event | Create calendar event |
| 16 | get_emails | Fetch emails (Phase 2) |

### Implementation approach
- v1: Claude Sonnet + Anthropic tool_use (function calling). No extra framework needed.
- v2: LangGraph for multi-agent orchestration with sub-agents if complexity warrants.

### Agent Hierarchy

```
Master Agent (Claude Sonnet — the MD)
├── Research Director
│   ├── Web Search (Perplexity/Gemini)
│   ├── Document Analysis (Claude Haiku)
│   └── KB Search (Supabase)
├── Operations Director
│   ├── Calendar Manager (Microsoft Graph)
│   ├── Email Manager (Microsoft Graph — Phase 2)
│   ├── Todo Manager (Supabase)
│   ├── Vault Access (Supabase + AES)
│   └── File Manager (Supabase Storage)
└── Creative Director
    ├── Image Generator (Gemini/Nano Banana)
    ├── Diagram Generator (Claude + ReactFlow)
    ├── Note Writer (Supabase)
    └── Workflow Runner (Multi-step AI chains)
```

---

## Key Principle

> The next move is not more features — it is making existing features smarter. The market shifted from "tools you use" to "tools that work for you."
