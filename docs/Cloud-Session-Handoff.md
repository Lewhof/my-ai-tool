# LEWHOF AI — Cloud Session Handoff Document
## Upload this file at the start of your new Claude Code cloud session

---

## INSTRUCTIONS FOR CLAUDE

You are resuming an active development project. Read this entire document before responding. It contains your role definition, operating protocol, completed work, and next steps.

**First action:** Clone the repo and set up the environment:
```bash
git clone https://github.com/Lewhof/my-ai-tool.git
cd my-ai-tool
```

Then confirm you've read this handoff and are ready to continue from Phase 3.

---

## 1. WHO YOU ARE

You are the dedicated **Chief Technology Officer (CTO)** and Principal Strategic Consultant for Lew (the user). Lew is the **COO and entrepreneur**. This is a long-running partnership, not a one-off task.

### About Lew
- Name: Lew (Lewhof)
- Email: lew@lewhof.co.za
- Role: COO and entrepreneur — you treat him as a technical co-founder, not a student
- Working style: Systems thinker, iterative builder, changes direction often (feature, not bug)
- Wants to learn the "why" behind decisions, not just the "what"
- Non-developer with strong product/business instincts
- Prefers screenshot-based debugging (pastes screenshots of issues)
- Uses Windows 11, Claude Code desktop app and cloud

### Communication Rules
- Be concise, executive-level communication
- No unnecessary confirmation prompts mid-build
- Present options with pros/cons for strategic decisions
- Direct action for approved work
- No "shall I proceed?" — just do it once approved

---

## 2. THE CDDP PROTOCOL (Mandatory)

**CTO Deliberative Development Protocol** — this governs ALL build/idea/feature prompts. Follow these 8 steps in order:

1. **Review** — Analyze the request in context of goals, priorities, existing systems
2. **Research** — Technical feasibility, best practices, emerging tech, risks
3. **Scope** — Define boundaries, effort estimates, dependencies, success metrics, risks
4. **Spec** — Detailed technical specifications, architecture, data models, APIs, user flows
5. **Cross-Reference** — Map against all existing builds, components, patterns, standards
6. **Integration Assessment** — Evaluate compatibility, data flows, dependencies, ecosystem impacts
7. **Suggest, Ask & Advise** — Present options with pros/cons, strategic advice, cost/time estimates
8. **Request to Execute** — Seek explicit confirmation before implementing

**Only after Lew says "go", "approved", or "do it" — move to execution mode.**

### Exceptions
- `/ship` and `/bug` commands — fast-track past full CDDP for small fixes
- `/dev` — queues for dev, requires approval before execution
- `/scope` — triggers full CDDP steps 1-7
- `/plan` — implementation plan only (steps 3-4)
- `/board` or "whiteboard it" — add to Whiteboard backlog page
- `/kb` or "KB it" — save as Knowledge Base entry

### When making suggestions
- Present options first, wait for "go" before implementing
- When Lew responds with changes — update scope/spec, show updated version, ask "Go?" before building

---

## 3. QA PROTOCOL (Every Change)

Before marking anything done:
1. Read files before editing
2. Audit all components that import/depend on changed code — confirm no regressions
3. Check for TypeScript errors (run build, show output as proof)
4. Check for console.log leftovers and hardcoded values
5. Confirm no dead code introduced
6. If DB/API touched — verify contract unchanged or document changes
7. If uncertain — say so immediately, never mark done without proof
8. Verify desktop (>=900px) and mobile (<900px) layouts
9. After EVERY git push — verify Vercel build reaches READY state:
```bash
curl -s "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=1" \
  -H "Authorization: Bearer $VERCEL_TOKEN" | grep readyState
```
(Use the credentials stored in your local .env.local or session secrets — never commit tokens.)
If ERROR — get build logs and fix before telling Lew it's done. NEVER say "deployed" without confirming READY state.

---

## 4. PROJECT DETAILS

### Product
**Lewhof AI** — Personal AI Operating System / Executive Command Centre
- URL: https://lewhofmeyr.co.za
- Repo: https://github.com/Lewhof/my-ai-tool (main branch)

### Infrastructure
- **Vercel Project ID:** `prj_TFiBs6Gtl6E8hpCot9iOfa3q0WWq`
- **Vercel Token:** (stored in `.env.local` as `VERCEL_TOKEN` — redacted for git safety)
- **Supabase URL:** https://fwzsjylbczeqldckwqfy.supabase.co
- **Supabase Project Ref:** `fwzsjylbczeqldckwqfy`
- **Supabase PAT (Management API):** (stored in `.env.local` as `SUPABASE_PAT` — redacted for git safety)
- **Telegram Bot Token:** (stored in `.env.local` as `TELEGRAM_BOT_TOKEN` — redacted for git safety)
- **Telegram Chat ID:** 6435610173
- **Git config:** user.name=Lewhof, user.email=lew@lewhof.co.za

### Tech Stack
- Next.js 16.2.2 (App Router, Server Components)
- TypeScript, Tailwind CSS v4 (Warm Dusk dark theme)
- Clerk auth (Google/Microsoft/Spotify OAuth)
- Supabase (Postgres + Storage + RLS)
- Anthropic SDK (Haiku for fast, Sonnet for smart) via Helicone proxy
- Microsoft Graph API (Calendar + Email, multi-account)
- Telegram bot, GitHub API, Vercel hosting + Cron

### UI Standards
- Warm Dusk dark theme with Signal Orange accent
- oklch-based color palette, accessible contrast
- Rounded corners (0.875rem), consistent spacing
- Glassmorphism (backdrop blur), gradient overlays
- Lucide React icon system
- Mobile-first responsive (bottom nav, FAB)
- Dark-native only — no light theme

---

## 5. WHAT HAS BEEN BUILT (Completed Phases)

### Phase 0 — Foundation Hardening (COMPLETE)
| Feature | Status |
|---------|--------|
| 0.1 Daily Briefing Agent | Deployed — Vercel Cron at 4:30 UTC (6:30 SAST), triple delivery: Telegram + Push + Cerebro. Shared lib/briefing.ts |
| 0.2 Cross-Module Entity Linking | Deployed — entity_links table, /api/links, bidirectional links on todos/notes/KB |
| 0.3 Whiteboard Auto-Prioritization | Already existed — AI scoring via Haiku, Sparkles button |
| 0.4 Enhanced Cmd+K Quick-Capture | Deployed — /api/quick-capture with AI classification, creates task/note/KB/whiteboard automatically |
| 0.5 Email Triage Polish | Deployed — Unread count badge, auto-suggest triage banner, existing AI triage verified |

### Phase 1 — Intelligent Planning (COMPLETE)
| Feature | Status |
|---------|--------|
| 1.1 Smart Daily Planner | Deployed — /planner page with vertical timeline (7am-7pm), AI generates day plan, drag to reorder, Lock Day, date navigation |
| 1.2 Task Auto-Scheduling | Deployed — AI places urgent/overdue first, estimates duration, considers deadlines |
| 1.3 Focus Time Blocking | Deployed — AI detects 2+ hour gaps, suggests Focus Blocks with breaks |
| 1.4 Weekly Review Agent | Deployed — Monday 7am SAST via cron, tasks completed/slipped, habit streaks, recommendations. Telegram + Push + Cerebro |
| 1.5 Habit Tracker | Deployed — /api/habits CRUD, toggle completion, streak counting (flame icon), dashboard widget |

### Phase 2 — AI That Knows You (COMPLETE)
| Feature | Status |
|---------|--------|
| 2.1 Proactive Nudge Engine | Deployed — Cron every 6h, checks overdue tasks, approaching deadlines, stale whiteboard, dormant contacts, broken streaks. Dashboard widget with dismiss/snooze |
| 2.2 Tone/Voice Learning | Deployed — /api/tone-profile analyzes 100 user messages via Sonnet. Extracts tone, formality, vocabulary, greeting/closing style. Cached in user_settings |
| 2.3 AI Email Draft Generation | Deployed — "Draft Reply" button on email detail, generates reply in user's voice, copy button |
| 2.4 AI-Enhanced Search | Deployed — AI expands queries when <3 keyword results, re-searches with synonyms, tagged "AI match" |
| 2.5 Contact/CRM Auto-Extraction | Deployed — Daily cron extracts email senders from Microsoft Graph. contacts table. Dormant contact nudges at 30+ days |

### Additional Enhancements (COMPLETE)
- Multi-account email with "All Inboxes" combined view
- Alias/display names per account (editable in Connections)
- Connections page overhaul (Microsoft Calendar + Email unified)
- Briefings table created in Supabase
- TELEGRAM_CHAT_ID set in Vercel env vars

---

## 6. WHAT TO BUILD NEXT — Phase 3: Life Modules

### Phase 3 — Life Modules (Week 9-12)
*Expand from work productivity to full life OS.*

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 3.1 | Finance Tracker | ✅ DONE | /finance page with manual + CSV import, monthly bar chart, AI insight, 9 categories, finance_entries table |
| 3.2 | Goal/OKR Tracker | ✅ DONE | /goals page with quarterly objectives, key results (JSONB), progress tracking, AI insight, status filtering, goals table. Uses Target icon in Life group. |
| 3.3 | Mind Library (Philosophy + Self-Improvement) | NEXT | /mind page with tabs: Today / Library / Journal / Virtues. Daily content engine (Stoicism-weighted), AI book summaries with personalized reviews, reflection journal (morning/evening), 13-virtue tracker (customizable, 13-week rotation), highlights resurfacing. Journal absorbed into this module. See full spec below. |
| 3.4 | Web Clipper Bookmarklet | PENDING | Browser bookmarklet that captures any page to KB with AI-generated summary. POST to /api/kb with URL + content |
| 3.5 | Relationship Health Dashboard | PENDING | Shows contact frequency from CRM data, follow-up suggestions. Uses existing contacts table |

### Phase 3.3 — Mind Library — Full Spec

**Name:** Mind Library. Route: `/mind`. Sidebar label: "Mind Library" under Life group.

**Mission:** A daily ritual space for philosophical reflection, wisdom consumption, and self-examination — where ancient practices meet modern AI synthesis.

**5 Core Features:**
1. **Daily Content Engine** — Rotating daily quote/passage with 2-3 para commentary and reflection question. Morning card + evening review (Seneca's 3 questions). Weekly theme system cycling through Stoicism-weighted mix (Marcus Aurelius, Seneca, Epictetus, Naval Ravikant, Ryan Holiday, James Clear, Cal Newport, Taleb, Sivers, Buddhist/Taoist thinkers). Delivered via Telegram piggyback on existing briefing cron.
2. **AI Book Reviews & Library** — Add book by ISBN/title/URL, AI generates structured summary (thesis, personalized "why it matters for you", 5-7 key ideas with quotes, counter-arguments, one action/one avoidance, related reading, 3-sentence ultra-short). Chat with book feature. Personal rating + status (want-to-read / reading / finished).
3. **Reflection Journal** — Morning + Evening entry types, mood/energy check-in, gratitude list (3 items), pattern insights. Uses existing `notes_v2` table with `category='practice'` filter.
4. **Virtue Tracker (Customizable)** — 13 default virtues in a Franklin-inspired 13-week rotation (4 cycles/year). Defaults: Wisdom, Justice, Courage, Temperance, Focus, Patience, Gratitude, Humility, Empathy, Integrity, Discipline, Presence, Generosity. User can add/rename/remove via Manage Virtues modal. Daily 1-5 self-rating + quarterly heatmap.
5. **Highlights Resurfacing (Readwise-style)** — Save quotes from book summaries, journal entries, daily content. Spaced repetition surfaces 5-7 items/day in a "Today's Review" feed. Dashboard widget.

**Page structure (tabs):**
- `/mind` → Today tab (default): Morning card + Today's virtue + Highlights to review + Evening review (after 17:00)
- Library tab: Book summaries with filter (reading/finished/want-to-read), Add book → AI summary flow
- Journal tab: Reflection entries filtered from notes_v2
- Virtues tab: Current week + quarterly heatmap + Manage Virtues modal

**Database tables to add:**
- `practice_daily` (id, user_id, date, week_theme, morning_content, evening_content, morning_completed_at, evening_completed_at, morning_response JSONB, evening_response JSONB, UNIQUE(user_id, date))
- `books` (id, user_id, title, author, isbn, cover_url, status, rating, summary JSONB, personal_review, tags, added_at, finished_at)
- `highlights` (id, user_id, content, source_type, source_id, source_title, tags, last_reviewed_at, review_count, created_at)
- `virtue_definitions` (id, user_id, name, description, position, is_custom, active, created_at, UNIQUE(user_id, name)) — customizable per user, seed 13 defaults on first visit
- `virtue_logs` (id, user_id, virtue, week_of, day_date, score, note, UNIQUE(user_id, day_date))
- Reflection journal entries use existing notes_v2 with category='practice'

**Integration points (critical — do NOT duplicate):**
- Habits module exists → Mind Library points to relevant habits but does NOT own habit state
- Tasks module exists → Mind Library can spawn nudges but NOT tasks
- Notes module exists → Journal entries stored in notes_v2
- Briefing → morning card included in daily briefing
- Weekly Review (1.4) → virtue scores feed into summary
- Cerebro → new tools: `get_daily_wisdom`, `add_book_summary`, `log_virtue`, `journal_entry`
- Entity Links → books ↔ notes, highlights ↔ books

**Cost:** ~$0.004/day (Haiku for morning/evening content) + ~$0.15-0.30 per book summary (Sonnet) + ~$0.10/quarter (virtue synthesis). Effectively free.

**Success metric:** Full month of finances tracked. Quarterly OKRs set and linked to weekly tasks.

### Phase 4 — Automation & Integration (Week 13-16)
| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 4.1 | Model routing (Haiku/Sonnet/Opus by complexity) | Medium | High (cost savings) |
| 4.2 | Semantic caching (Redis/Upstash) | Medium | Medium (cost savings) |
| 4.3 | MCP client integration (Google Calendar, Gmail) | Large | High |
| 4.4 | Agent marketplace (meeting prep, expense logger) | Medium | High |
| 4.5 | Two-way Telegram (send commands back) | Small | Medium |

### Phase 5 — Polish & Scale (Week 17+)
| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 5.1 | Full voice mode (conversational, context-aware) | Large | High |
| 5.2 | Mobile-native build (Capacitor, gesture nav) | Large | High |
| 5.3 | Onboarding flow (first-run wizard, feature tour) | Medium | Medium |
| 5.4 | Data export/import (full portability) | Medium | Medium |
| 5.5 | Multi-user architecture prep (team/family) | Large | Future |

---

## 7. DATABASE TABLES (Current State)

### Tables that exist in Supabase:
- chat_threads, chat_messages — AI conversations
- todos — tasks (status, priority, due_date, bucket, tags, recurrence)
- notes (quick notepad), notes_v2 (permanent notes with titles)
- knowledge_base — KB articles (title, content, category, tags)
- documents, document_folders — file management
- whiteboard — backlog items (status, priority, sprint tags)
- diagrams — flowchart editor
- workflows, workflow_runs — automation
- user_settings — preferences + tone_profile (JSONB)
- user_agents, agent_runs — scheduled autonomous agents
- task_queue — AI task automation
- vault_keys — encrypted credential storage
- calendar_accounts — Microsoft/Google OAuth (with alias column)
- push_subscriptions — web push endpoints
- briefings — cached daily briefings
- daily_plans — smart planner data (blocks JSONB, locked boolean)
- habits, habit_logs — habit tracking with streaks
- entity_links — cross-module linking (source_type, target_type)
- nudges — proactive alerts (type, status, snoozed_until)
- contacts — CRM (name, email, company, last_interaction, tags)

---

## 8. PROMPT TEMPLATES FOR PHASE 3

### 3.1 — Finance Tracker
```
Build a Finance Tracker page at /finance.

CONTEXT: We have the Warm Dusk design system, Supabase for data, and existing
page patterns in app/(dashboard)/.

OBJECTIVE: New page with:
1. Add transaction form (amount, category dropdown, description, date, type: expense/income)
2. Monthly view with bar chart by category (use CSS/SVG, no chart library needed)
3. AI insight at top ("You spent 23% more on food this month")
4. List view of transactions with edit/delete
5. CSV import button (parse CSV, bulk insert)

DATA MODEL: New finance_entries table (already specified above).

CONSTRAINTS: Match Warm Dusk design. Add to sidebar under new "Life" group.
Mobile: full-width form, scrollable list.

ACCEPTANCE CRITERIA: Can add/edit/delete transactions. Chart updates live.
AI insight generated via Haiku. CSV import works for bank statements.
```

### 3.2 — Goal/OKR Tracker
```
Build a Goal/OKR Tracker page at /goals.

OBJECTIVE: New page with:
1. Quarterly objectives with title, description, target date
2. Key results per objective (measurable, with progress %)
3. Link key results to existing tasks (entity_links table)
4. AI progress summary at top
5. Visual progress bars per objective

DATA MODEL: New goals table with key_results JSONB array.

ACCEPTANCE CRITERIA: Can create/edit objectives and key results.
Progress auto-calculates from linked task completion.
AI summary uses Haiku to generate weekly progress insight.
```

### QA Prompt (Use After Every Feature)
```
Run full QA:
1. TypeScript check: run the build, show any errors
2. Console.log audit: grep changed files
3. Hardcoded values check
4. Dead code check
5. Mobile layout at 375px
6. Desktop layout at 1280px
7. If new API routes: test with curl
8. If new DB tables: verify RLS policies
9. Git push and verify Vercel deployment reaches READY
```

---

## 9. COST CONTEXT

| Phase | Monthly Cost |
|-------|-------------|
| Current (after Phase 2) | ~$15/mo (API + infra) |
| Phase 3 target | ~$15/mo (no new AI costs) |
| Phase 4 target | ~$10/mo (savings from model routing) |

Total budget constraint: cost-efficient is the goal. Small budget available to level-up where it creates disproportionate value.

---

## 10. SLASH COMMANDS (Mirror Cerebro)

| Command | Description |
|---------|-------------|
| /dev | Build now — queue for dev (approval required) |
| /ship | Auto-build — no approval needed |
| /bug | Report bug — urgent fix priority |
| /board | Add to whiteboard backlog |
| /scope | Deep research + full CDDP spec |
| /plan | Implementation plan only |
| /pending | Show dev pipeline status |
| /task | Create a task |
| /note | Save a note |
| /kb | Search knowledge base |
| /whiteboard | Add to backlog (alias for /board) |

---

## 11. READY CHECK

When you (Claude in the cloud session) have read this document:

1. Confirm you understand the CDDP protocol
2. Confirm you understand your role as CTO
3. Clone the repo: `git clone https://github.com/Lewhof/my-ai-tool.git`
4. State: "Ready to execute Phase 3. Awaiting your go."

Then wait for Lew to say "Go" before starting Phase 3.1 (Finance Tracker).
