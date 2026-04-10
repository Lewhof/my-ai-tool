import { supabaseAdmin } from '@/lib/supabase-server';
import { getMicrosoftToken } from '@/lib/microsoft-token';
import { recordToolMetric } from '@/lib/cerebro/evolution';

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  const start = Date.now();
  let success = true;
  let errorMsg: string | undefined;
  try {
    const result = await executeToolInner(toolName, input, userId);
    // Many tools return `Error: ...` strings rather than throwing — treat those
    // as failures for metrics purposes so the dashboard reflects reality.
    if (typeof result === 'string' && /^(error|tool error|unknown tool)/i.test(result.trim())) {
      success = false;
      errorMsg = result.slice(0, 300);
    }
    return result;
  } catch (err) {
    success = false;
    errorMsg = err instanceof Error ? err.message : 'unknown';
    return `Tool error: ${errorMsg}`;
  } finally {
    // Fire-and-forget metric — never blocks the request.
    void recordToolMetric(userId, toolName, Date.now() - start, success, errorMsg);
  }
}

async function executeToolInner(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  try {
    switch (toolName) {
      case 'get_calendar': {
        const days = (input.days_ahead as number) || 1;
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).toISOString();

        const { data: accounts } = await supabaseAdmin
          .from('calendar_accounts')
          .select('id, label, alias, provider')
          .eq('user_id', userId);

        if (!accounts?.length) return 'No calendar accounts connected. Go to Settings > Connections to add one.';

        const allEvents: Array<{ time: string; subject: string; label: string; startIso: string }> = [];
        for (const acc of accounts) {
          try {
            const token = await getMicrosoftToken(userId, acc.id);
            if (!token) continue;

            const res = await fetch(
              `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${start}&endDateTime=${end}&$orderby=start/dateTime&$top=20&$select=subject,start,end,location`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.ok) {
              const data = await res.json();
              const label = acc.alias || acc.label || 'Calendar';
              for (const e of data.value ?? []) {
                const startIso = e.start?.dateTime || '';
                allEvents.push({
                  time: startIso.slice(11, 16),
                  subject: e.subject,
                  label,
                  startIso,
                });
              }
            }
          } catch { /* skip failed account */ }
        }

        allEvents.sort((a, b) => a.startIso.localeCompare(b.startIso));
        return allEvents.length > 0
          ? `Calendar events:\n${allEvents.map(e => `${e.time} - ${e.subject} (${e.label})`).join('\n')}`
          : 'No events found for this period.';
      }

      case 'create_todo': {
        const { data, error } = await supabaseAdmin.from('todos').insert({
          user_id: userId,
          title: input.title as string,
          description: (input.description as string) || null,
          priority: (input.priority as string) || 'medium',
          due_date: (input.due_date as string) || null,
        }).select('id, title').single();

        if (error) return `Error creating task: ${error.message}`;
        return `Task created: "${data.title}" (ID: ${data.id})`;
      }

      case 'complete_todos': {
        const titles = (input.titles as string[]) ?? [];
        if (titles.length === 0) return 'Error: no titles provided.';

        // Fetch all active todos for this user
        const { data: allTodos, error: fetchErr } = await supabaseAdmin
          .from('todos')
          .select('id, title, status')
          .eq('user_id', userId)
          .neq('status', 'done');

        if (fetchErr) return `Error fetching tasks: ${fetchErr.message}`;
        if (!allTodos || allTodos.length === 0) return 'No active tasks to complete.';

        // Fuzzy match each requested title against active todos
        const matched: Array<{ id: string; title: string; matchedAs: string }> = [];
        const notFound: string[] = [];
        const usedIds = new Set<string>();

        for (const search of titles) {
          const needle = search.toLowerCase().trim();
          if (!needle) continue;

          // Score each todo: exact match > startsWith > contains > word match
          let best: { id: string; title: string; score: number } | null = null;
          for (const todo of allTodos) {
            if (usedIds.has(todo.id)) continue;
            const hay = (todo.title || '').toLowerCase();
            let score = 0;
            if (hay === needle) score = 100;
            else if (hay.startsWith(needle)) score = 80;
            else if (hay.includes(needle)) score = 60;
            else {
              // Word-level match — at least one significant word overlaps
              const needleWords: string[] = needle.split(/\s+/).filter((w: string) => w.length > 2);
              const hayWords: string[] = hay.split(/\s+/);
              const overlap = needleWords.filter((nw: string) => hayWords.some((hw: string) => hw.includes(nw) || nw.includes(hw))).length;
              if (overlap > 0) score = 30 + overlap * 10;
            }

            if (score > 0 && (!best || score > best.score)) {
              best = { id: todo.id, title: todo.title, score };
            }
          }

          if (best) {
            matched.push({ id: best.id, title: best.title, matchedAs: search });
            usedIds.add(best.id);
          } else {
            notFound.push(search);
          }
        }

        // Apply updates
        let completedCount = 0;
        const completed: string[] = [];
        for (const m of matched) {
          const { error: updErr } = await supabaseAdmin
            .from('todos')
            .update({ status: 'done', updated_at: new Date().toISOString() })
            .eq('id', m.id)
            .eq('user_id', userId);
          if (!updErr) {
            completedCount++;
            completed.push(m.title);
          }
        }

        let result = '';
        if (completedCount > 0) {
          result += `Completed ${completedCount} task${completedCount !== 1 ? 's' : ''}:\n${completed.map(t => `- ${t}`).join('\n')}`;
        } else {
          result += 'No tasks were marked complete.';
        }
        if (notFound.length > 0) {
          result += `\n\nCould not find matches for: ${notFound.join(', ')}`;
        }
        return result;
      }

      case 'update_todo': {
        const id = input.id as string | undefined;
        const titleMatch = input.title_match as string | undefined;

        // Find the todo
        let todoId = id;
        let todoTitle = '';
        if (!todoId && titleMatch) {
          const { data: candidates } = await supabaseAdmin
            .from('todos')
            .select('id, title')
            .eq('user_id', userId)
            .neq('status', 'done')
            .ilike('title', `%${titleMatch}%`)
            .limit(5);

          if (!candidates || candidates.length === 0) {
            return `No active task found matching "${titleMatch}".`;
          }
          if (candidates.length > 1) {
            return `Multiple tasks match "${titleMatch}": ${candidates.map(c => `"${c.title}"`).join(', ')}. Please be more specific.`;
          }
          todoId = candidates[0].id;
          todoTitle = candidates[0].title;
        }

        if (!todoId) return 'Error: must provide id or title_match';

        // Build update payload
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (input.title !== undefined) updates.title = input.title;
        if (input.description !== undefined) updates.description = input.description || null;
        if (input.priority !== undefined) updates.priority = input.priority;
        if (input.due_date !== undefined) updates.due_date = input.due_date || null;
        if (input.status !== undefined) updates.status = input.status;
        if (input.bucket !== undefined) updates.bucket = input.bucket;

        if (Object.keys(updates).length === 1) {
          return 'Error: no fields to update.';
        }

        const { data, error } = await supabaseAdmin
          .from('todos')
          .update(updates)
          .eq('id', todoId)
          .eq('user_id', userId)
          .select('title, status')
          .single();

        if (error) return `Error updating task: ${error.message}`;
        return `Updated task "${data?.title || todoTitle}" (status: ${data?.status || 'unchanged'}).`;
      }

      case 'delete_todo': {
        const id = input.id as string | undefined;
        const titleMatch = input.title_match as string | undefined;

        let todoId = id;
        let deletedTitle = '';
        if (!todoId && titleMatch) {
          const { data: candidates } = await supabaseAdmin
            .from('todos')
            .select('id, title')
            .eq('user_id', userId)
            .ilike('title', `%${titleMatch}%`)
            .limit(5);

          if (!candidates || candidates.length === 0) {
            return `No task found matching "${titleMatch}".`;
          }
          if (candidates.length > 1) {
            return `Multiple tasks match "${titleMatch}": ${candidates.map(c => `"${c.title}"`).join(', ')}. Please be more specific.`;
          }
          todoId = candidates[0].id;
          deletedTitle = candidates[0].title;
        }

        if (!todoId) return 'Error: must provide id or title_match';

        const { error } = await supabaseAdmin
          .from('todos')
          .delete()
          .eq('id', todoId)
          .eq('user_id', userId);

        if (error) return `Error deleting task: ${error.message}`;
        return `Deleted task "${deletedTitle || todoId}".`;
      }

      case 'get_daily_wisdom': {
        const { getDailyContent } = await import('@/lib/practice');
        const date = new Date().toISOString().split('T')[0];
        try {
          const content = await getDailyContent(userId, date);
          return `Today's Mind Library (Virtue: ${content.week_theme}):\n\n${content.morning_content}`;
        } catch (err) {
          return `Error fetching daily wisdom: ${err instanceof Error ? err.message : 'unknown'}`;
        }
      }

      case 'log_virtue': {
        const score = Number(input.score);
        const note = input.note as string | undefined;
        if (!score || score < 1 || score > 5) {
          return 'Error: score must be 1-5';
        }

        const { getCurrentVirtue, getWeekOf, ensureDefaultVirtues } = await import('@/lib/practice');
        await ensureDefaultVirtues(userId);

        const { data: defs } = await supabaseAdmin
          .from('virtue_definitions')
          .select('name, position')
          .eq('user_id', userId)
          .eq('active', true);

        const current = getCurrentVirtue(defs ?? [], new Date());
        if (!current) return 'No active virtues configured.';

        const today = new Date().toISOString().split('T')[0];
        const weekOf = getWeekOf(new Date());

        const { error } = await supabaseAdmin
          .from('virtue_logs')
          .upsert({
            user_id: userId,
            virtue: current.name,
            week_of: weekOf,
            day_date: today,
            score,
            note: note || null,
          }, { onConflict: 'user_id,day_date' });

        if (error) return `Error logging virtue: ${error.message}`;
        return `Logged ${current.name}: ${score}/5${note ? ` — ${note}` : ''}`;
      }

      case 'add_book': {
        const title = input.title as string | undefined;
        const author = input.author as string | undefined;
        const query = input.query as string | undefined;

        if (!title && !query) {
          return 'Error: provide title (with optional author) or a query string';
        }

        const { generateBookSummary, lookupBookMetadata, generatePersonalReview } = await import('@/lib/books');

        // Resolve metadata
        let resolvedTitle = title || '';
        let resolvedAuthor = author || '';
        let cover_url: string | undefined;
        let isbn: string | undefined;

        if (query && (!resolvedTitle || !resolvedAuthor)) {
          const md = await lookupBookMetadata(query);
          if (md) {
            resolvedTitle = resolvedTitle || md.title;
            resolvedAuthor = resolvedAuthor || md.author;
            cover_url = md.cover_url;
            isbn = md.isbn;
          } else {
            resolvedTitle = resolvedTitle || query;
          }
        }

        if (!resolvedTitle) return 'Error: could not resolve book title';

        // Pull user context for personalization
        let userContext = '';
        try {
          const [notesRes, goalsRes] = await Promise.all([
            supabaseAdmin.from('notes').select('content').eq('user_id', userId).limit(1).maybeSingle(),
            supabaseAdmin.from('goals').select('title').eq('user_id', userId).eq('status', 'active').limit(5),
          ]);
          const notepad = notesRes.data?.content?.slice(0, 400) || '';
          const goals = (goalsRes.data ?? []).map(g => g.title).join(', ');
          userContext = [notepad, goals ? `Active goals: ${goals}` : ''].filter(Boolean).join('\n\n');
        } catch { /* skip */ }

        // Generate summary
        let summary;
        try {
          summary = await generateBookSummary(resolvedTitle, resolvedAuthor || 'Unknown', userContext);
        } catch (err) {
          return `Failed to generate summary: ${err instanceof Error ? err.message : 'unknown'}`;
        }

        const personal_review = userContext
          ? await generatePersonalReview({ title: resolvedTitle, author: resolvedAuthor || 'Unknown', summary }, userContext)
          : '';

        const { data, error } = await supabaseAdmin
          .from('books')
          .insert({
            user_id: userId,
            title: resolvedTitle,
            author: resolvedAuthor || null,
            isbn: isbn || null,
            cover_url: cover_url || null,
            status: 'want-to-read',
            summary,
            personal_review: personal_review || null,
          })
          .select('id, title')
          .single();

        if (error) return `Error saving book: ${error.message}`;

        const ideaList = summary.key_ideas.slice(0, 3).map((k: { concept: string }) => `- ${k.concept}`).join('\n');
        return `Added "${data.title}" to Mind Library.\n\nThesis: ${summary.thesis}\n\nTop ideas:\n${ideaList}\n\nOpen /mind → Library for the full summary.`;
      }

      case 'save_highlight': {
        const content = input.content as string | undefined;
        const source_title = input.source_title as string | undefined;
        const tags = (input.tags as string[]) || [];

        if (!content?.trim()) return 'Error: content required';

        const { error } = await supabaseAdmin
          .from('highlights')
          .insert({
            user_id: userId,
            content: content.trim(),
            source_type: 'cerebro',
            source_title: source_title || null,
            tags,
          });

        if (error) return `Error saving highlight: ${error.message}`;
        return `Saved highlight${source_title ? ` from ${source_title}` : ''}.`;
      }

      case 'create_whiteboard_item': {
        const { data, error } = await supabaseAdmin.from('whiteboard').insert({
          user_id: userId,
          title: input.title as string,
          description: (input.description as string) || null,
          tags: (input.tags as string[]) || [],
        }).select('id, title').single();

        if (error) return `Error: ${error.message}`;
        return `Whiteboard item created: "${data.title}" (ID: ${data.id})`;
      }

      case 'search_documents': {
        const query = input.query as string;
        const { data } = await supabaseAdmin
          .from('documents')
          .select('id, name, display_name, file_type, folder')
          .eq('user_id', userId)
          .ilike('name', `%${query}%`)
          .limit(10);

        if (!data?.length) return `No documents found matching "${query}".`;
        return `Documents found:\n${data.map((d) => `- ${d.display_name || d.name} (${d.file_type}, folder: ${d.folder || 'unfiled'}, ID: ${d.id})`).join('\n')}`;
      }

      case 'analyze_document': {
        // Delegate to existing analyze endpoint logic
        const docId = input.document_id as string;
        const { data: doc } = await supabaseAdmin.from('documents').select('name, file_path, file_type').eq('id', docId).eq('user_id', userId).single();
        if (!doc) return 'Document not found.';
        return `Document "${doc.name}" found. To get a full analysis, open it in Documents and click the Analyze button. Type: ${doc.file_type}`;
      }

      case 'generate_image': {
        const imgPrompt = input.prompt as string;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return 'Gemini API key not configured.';

        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: imgPrompt }] }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
              }),
            }
          );

          if (!res.ok) return `Image generation failed (${res.status}). Try a different prompt.`;

          const data = await res.json();
          const parts = data.candidates?.[0]?.content?.parts ?? [];
          let imageData = '';
          let mimeType = '';
          let text = '';

          for (const part of parts) {
            if (part.text) text += part.text;
            if (part.inlineData) {
              imageData = part.inlineData.data;
              mimeType = part.inlineData.mimeType || 'image/png';
            }
          }

          if (imageData) {
            // Save to Supabase Storage
            const fileName = `${userId}/cerebro-${Date.now()}.png`;
            const buffer = Buffer.from(imageData, 'base64');
            await supabaseAdmin.storage.from('notes').upload(fileName, buffer, { contentType: mimeType });
            const { data: signed } = await supabaseAdmin.storage.from('notes').createSignedUrl(fileName, 31536000);
            const url = signed?.signedUrl;

            // Persist metadata so the image survives chat clears and shows in the gallery
            await supabaseAdmin.from('generated_images').insert({
              user_id: userId,
              prompt: imgPrompt,
              storage_path: fileName,
              provider: 'gemini',
              source: 'cerebro',
            });

            return `IMAGE_GENERATED:${url}\n\n${text || `Image generated for: "${imgPrompt}"`}`;
          }

          return text || 'Image generation completed but no image was returned. Try a more descriptive prompt.';
        } catch (err) {
          return `Image generation error: ${err instanceof Error ? err.message : 'unknown'}`;
        }
      }

      case 'save_note': {
        const noteId = input.note_id as string;
        if (noteId) {
          await supabaseAdmin.from('notes_v2').update({
            title: input.title as string,
            content: input.content as string,
          }).eq('id', noteId).eq('user_id', userId);
          return `Note updated: "${input.title}"`;
        } else {
          const { data, error } = await supabaseAdmin.from('notes_v2').insert({
            user_id: userId,
            title: input.title as string,
            content: input.content as string,
          }).select('id, title').single();
          if (error) return `Error: ${error.message}`;
          return `Note created: "${data.title}" (ID: ${data.id})`;
        }
      }

      case 'get_weather': {
        const lat = (input.lat as number) || -26.2041;
        const lon = (input.lon as number) || 28.0473;
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m`);
        if (!res.ok) return 'Could not fetch weather.';
        const data = await res.json();
        const c = data.current;
        return `Weather: ${c.temperature_2m}°C, wind ${c.wind_speed_10m} km/h, code ${c.weather_code}`;
      }

      case 'get_credits': {
        const heliconeKey = process.env.HELICONE_API_KEY;
        if (!heliconeKey) return 'Helicone not configured.';

        // Fetch enough history to cover both 30-day window and any
        // balance-set date (users may set balance earlier than 30d ago).
        const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
        const thirtyDaysAgoMs = Date.now() - 30 * 86400000;
        const res = await fetch('https://api.helicone.ai/v1/request/query', {
          method: 'POST',
          headers: { Authorization: `Bearer ${heliconeKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter: { request: { created_at: { gte: ninetyDaysAgo } } }, limit: 2000 }),
        });
        if (!res.ok) return 'Could not fetch credits data.';
        const data = await res.json();
        const requests: Array<{
          response_cost_usd?: number;
          request_created_at?: string;
          created_at?: string;
        }> = data.data ?? [];

        // 30-day usage summary
        const recent = requests.filter(r => {
          const ts = new Date(r.request_created_at ?? r.created_at ?? 0).getTime();
          return ts >= thirtyDaysAgoMs;
        });
        const totalCost = recent.reduce((sum, r) => sum + (r.response_cost_usd ?? 0), 0);

        // Anthropic balance (manual entry)
        const { data: billing } = await supabaseAdmin
          .from('billing_state')
          .select('starting_balance_usd, set_at, alert_threshold_usd')
          .eq('user_id', userId)
          .eq('provider', 'anthropic')
          .maybeSingle();

        let balanceLine = '\nAnthropic balance: not configured. User can set it on /credits page.';
        if (billing) {
          const setAt = new Date(billing.set_at).getTime();
          const spentSince = requests
            .filter(r => {
              const ts = new Date(r.request_created_at ?? r.created_at ?? 0).getTime();
              return ts >= setAt;
            })
            .reduce((sum, r) => sum + (r.response_cost_usd ?? 0), 0);
          const starting = Number(billing.starting_balance_usd);
          const threshold = Number(billing.alert_threshold_usd);
          const remaining = Math.max(0, starting - spentSince);
          const lowFlag = remaining < threshold ? ' ⚠ LOW' : '';
          balanceLine = `\nAnthropic balance: $${remaining.toFixed(4)} remaining${lowFlag} (started at $${starting.toFixed(2)} on ${new Date(billing.set_at).toLocaleDateString()}, spent $${spentSince.toFixed(4)} since).`;
        }

        return `AI Usage (30 days): ${recent.length} requests, $${totalCost.toFixed(4)} total cost.${balanceLine}`;
      }

      case 'search_kb': {
        const query = input.query as string;
        const { data } = await supabaseAdmin
          .from('knowledge_base')
          .select('id, title, category, content')
          .eq('user_id', userId)
          .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
          .limit(5);

        if (!data?.length) return `No KB entries found matching "${query}".`;
        return `KB entries found:\n${data.map((e) => `- ${e.title} (${e.category})\n  ${e.content.slice(0, 150)}...`).join('\n\n')}`;
      }

      case 'get_todos': {
        const status = input.status as string || 'all';
        let query = supabaseAdmin.from('todos').select('id, title, status, priority, due_date').eq('user_id', userId);
        if (status !== 'all') query = query.eq('status', status);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);

        if (!data?.length) return 'No tasks found.';
        return `Tasks:\n${data.map((t) => `- [${t.status}] ${t.title} (${t.priority}${t.due_date ? `, due ${t.due_date}` : ''})`).join('\n')}`;
      }

      case 'get_whiteboard': {
        const status = input.status as string || 'all';
        let query = supabaseAdmin.from('whiteboard').select('id, title, status, priority, tags').eq('user_id', userId);
        if (status !== 'all') query = query.eq('status', status);
        const { data } = await query.order('priority', { ascending: true }).limit(20);

        if (!data?.length) return 'No whiteboard items found.';
        return `Whiteboard:\n${data.map((i) => `- #${i.priority} [${i.status}] ${i.title} (${(i.tags as string[]).join(', ')})`).join('\n')}`;
      }

      case 'create_calendar_event': {
        return `Calendar event creation requested: "${input.subject}" on ${input.date} ${input.start_time}-${input.end_time}. Go to Calendar page to create events with your connected accounts.`;
      }

      case 'web_search': {
        const query = (input.query as string)?.trim();
        if (!query) return 'Error: query required for web search.';

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return 'No search API configured. Add GEMINI_API_KEY to environment.';

        // Cache layer: same normalized query within 1 hour returns instantly
        const { hashInput, getCached, setCached } = await import('@/lib/ai-cache');
        const cacheKey = hashInput(query);
        const cached = await getCached<{ text: string }>('search.expand', cacheKey);
        if (cached?.text) return cached.text;

        // Exponential backoff: 3 attempts with 1s, 3s, 8s
        const delays = [1000, 3000, 8000];
        let lastErr = '';

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: `Search the web and provide current, factual information about: ${query}\n\nBe concise. Include dates, numbers, and sources where possible.` }] }],
                  generationConfig: { maxOutputTokens: 600 },
                }),
              }
            );

            if (res.status === 429) {
              lastErr = '429';
              if (attempt < 2) {
                await new Promise(r => setTimeout(r, delays[attempt]));
                continue;
              }
              return 'Web search rate limit exceeded after 3 attempts. The Gemini free tier is capped at 10 requests/minute. Wait 60 seconds and try again, or upgrade your Gemini API plan.';
            }

            if (!res.ok) {
              lastErr = `HTTP ${res.status}`;
              return `Web search failed (${lastErr}). Try again in a moment.`;
            }

            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) return 'No results found.';

            // Cache the result for 1 hour (search results are semi-stable)
            await setCached('search.expand', cacheKey, { text }, 3600);
            return text;
          } catch (err) {
            lastErr = err instanceof Error ? err.message : 'network';
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, delays[attempt]));
              continue;
            }
          }
        }
        return `Web search failed after 3 attempts (${lastErr}).`;
      }

      case 'get_emails': {
        const folder = (input.folder as string) || 'inbox';
        const limit = (input.limit as number) || 10;

        // Fetch from ALL Microsoft accounts (personal + work)
        const { data: accounts } = await supabaseAdmin
          .from('calendar_accounts')
          .select('id, label, alias, email, provider')
          .eq('user_id', userId)
          .in('provider', ['microsoft', 'microsoft-work']);

        if (!accounts || accounts.length === 0) {
          return 'No Microsoft account connected. Go to Settings > Connections.';
        }

        const folderMap: Record<string, string> = { inbox: 'inbox', sent: 'sentitems', drafts: 'drafts' };
        const graphFolder = folderMap[folder] || 'inbox';
        const perAccountLimit = Math.max(5, Math.ceil(limit / accounts.length));

        type EmailEntry = { label: string; line: string; date: string; isRead: boolean };
        const allEmails: EmailEntry[] = [];

        for (const account of accounts) {
          try {
            const token = await getMicrosoftToken(userId, account.id);
            if (!token) continue;

            const res = await fetch(
              `https://graph.microsoft.com/v1.0/me/mailFolders/${graphFolder}/messages?$top=${perAccountLimit}&$orderby=receivedDateTime desc&$select=subject,from,receivedDateTime,isRead,bodyPreview`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) continue;
            const data = await res.json();
            const label = account.alias || account.label || 'Email';

            for (const e of (data.value ?? []) as Record<string, unknown>[]) {
              const from = (e.from as Record<string, Record<string, string>>)?.emailAddress;
              const unread = e.isRead ? '' : '[UNREAD] ';
              const line = `- ${unread}[${label}] ${e.subject} — from ${from?.name || from?.address || 'unknown'} (${(e.bodyPreview as string)?.slice(0, 80)})`;
              allEmails.push({ label, line, date: e.receivedDateTime as string, isRead: !!e.isRead });
            }
          } catch { /* skip failing account */ }
        }

        if (allEmails.length === 0) return 'No emails found across connected accounts.';

        // Sort by date desc, cap at requested limit
        allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const top = allEmails.slice(0, limit);
        const unreadCount = allEmails.filter(e => !e.isRead).length;

        return `Emails (${folder}, ${accounts.length} account${accounts.length > 1 ? 's' : ''}, ${unreadCount} unread):\n${top.map(e => e.line).join('\n')}`;
      }

      case 'triage_emails': {
        return 'Email triage requires the AI triage endpoint. Go to the Email page and click "AI Triage" for a categorized view of your unread emails.';
      }

      case 'push_to_claude_code': {
        const title = input.title as string;
        const description = (input.description as string) || '';

        // F1: Dedup — check if task with same title exists in last 24h
        const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
        const { data: existing } = await supabaseAdmin
          .from('task_queue')
          .select('id, title, status')
          .eq('user_id', userId)
          .ilike('title', title)
          .gte('created_at', oneDayAgo)
          .limit(1);

        if (existing?.length) {
          return `Task "${title}" already exists in the queue (status: ${existing[0].status}). No duplicate created.`;
        }

        const { data, error } = await supabaseAdmin.from('task_queue').insert({
          user_id: userId,
          title,
          description,
          status: 'queued',
        }).select('id').single();

        if (error) return `Error queuing task: ${error.message}`;

        // Also add to whiteboard
        await supabaseAdmin.from('whiteboard').insert({
          user_id: userId,
          title,
          description,
          status: 'in-progress',
          tags: ['claude-code', 'agent-pushed'],
        });

        return `Development task queued for Claude Code: "${title}" (ID: ${data.id}). It will be picked up in the next Claude Code session.`;
      }

      case 'save_learned_rule': {
        const rule = (input.rule as string | undefined)?.trim();
        const category = (input.category as string | undefined) || 'prefer';
        if (!rule) return 'Error: rule text required';
        if (!['do', 'dont', 'prefer'].includes(category)) {
          return 'Error: category must be do, dont, or prefer';
        }

        // Dedup: skip if an identical active rule already exists
        const { data: existing } = await supabaseAdmin
          .from('cerebro_rules')
          .select('id')
          .eq('user_id', userId)
          .eq('rule', rule)
          .eq('active', true)
          .limit(1);

        if (existing?.length) {
          return `Rule already exists: "${rule}"`;
        }

        const { error } = await supabaseAdmin.from('cerebro_rules').insert({
          user_id: userId,
          rule,
          category,
          source: 'self',
          active: true,
        });

        if (error) return `Error saving rule: ${error.message}`;
        return `Saved ${category} rule: "${rule}". I'll apply this in future conversations.`;
      }

      case 'get_todo_stats': {
        const { data: todos } = await supabaseAdmin
          .from('todos')
          .select('status, priority, due_date')
          .eq('user_id', userId);

        if (!todos?.length) return 'No tasks found.';

        const byStatus: Record<string, number> = {};
        const byPriority: Record<string, number> = {};
        let overdue = 0;
        const today = new Date().toISOString().split('T')[0];

        for (const t of todos) {
          byStatus[t.status] = (byStatus[t.status] || 0) + 1;
          byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
          if (t.due_date && t.due_date < today && t.status !== 'done') overdue++;
        }

        const total = todos.length;
        const done = byStatus['done'] || 0;
        const rate = total > 0 ? Math.round((done / total) * 100) : 0;

        return `Task stats:\n` +
          `Total: ${total} | Done: ${done} | Completion rate: ${rate}%\n` +
          `By status: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(', ')}\n` +
          `By priority: ${Object.entries(byPriority).map(([k, v]) => `${k}=${v}`).join(', ')}\n` +
          `Overdue: ${overdue}`;
      }

      case 'generate_chart': {
        const chartType = input.type as string;
        const title = input.title as string;
        const labels = input.labels as string[];
        const values = input.values as number[];
        const colors = (input.colors as string[] | undefined) || labels.map((_, i) => {
          const palette = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#a855f7'];
          return palette[i % palette.length];
        });

        const maxVal = Math.max(...values, 1);
        const W = 600, H = 400, pad = 60;

        let body = '';
        if (chartType === 'bar') {
          const barW = Math.min(50, (W - pad * 2) / labels.length - 8);
          body = labels.map((label, i) => {
            const barH = ((values[i] / maxVal) * (H - pad * 2));
            const x = pad + i * ((W - pad * 2) / labels.length) + ((W - pad * 2) / labels.length - barW) / 2;
            const y = H - pad - barH;
            return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${colors[i]}" rx="4"/>` +
              `<text x="${x + barW / 2}" y="${H - pad + 16}" text-anchor="middle" fill="#94a3b8" font-size="11">${label}</text>` +
              `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" fill="#e2e8f0" font-size="12" font-weight="600">${values[i]}</text>`;
          }).join('');
        } else if (chartType === 'pie') {
          const total = values.reduce((a, b) => a + b, 0) || 1;
          const cx = W / 2, cy = H / 2 - 10, r = 140;
          let cumAngle = -Math.PI / 2;
          body = values.map((v, i) => {
            const angle = (v / total) * Math.PI * 2;
            const x1 = cx + r * Math.cos(cumAngle);
            const y1 = cy + r * Math.sin(cumAngle);
            cumAngle += angle;
            const x2 = cx + r * Math.cos(cumAngle);
            const y2 = cy + r * Math.sin(cumAngle);
            const large = angle > Math.PI ? 1 : 0;
            const midAngle = cumAngle - angle / 2;
            const lx = cx + (r + 20) * Math.cos(midAngle);
            const ly = cy + (r + 20) * Math.sin(midAngle);
            return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z" fill="${colors[i]}"/>` +
              `<text x="${lx}" y="${ly}" text-anchor="middle" fill="#e2e8f0" font-size="11">${labels[i]} (${Math.round(v / total * 100)}%)</text>`;
          }).join('');
        } else {
          // line chart
          const stepX = (W - pad * 2) / Math.max(labels.length - 1, 1);
          const points = values.map((v, i) => {
            const x = pad + i * stepX;
            const y = H - pad - (v / maxVal) * (H - pad * 2);
            return `${x},${y}`;
          });
          body = `<polyline points="${points.join(' ')}" fill="none" stroke="${colors[0]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
            points.map((p, i) => {
              const [x, y] = p.split(',');
              return `<circle cx="${x}" cy="${y}" r="4" fill="${colors[0]}"/>` +
                `<text x="${x}" y="${Number(y) - 10}" text-anchor="middle" fill="#e2e8f0" font-size="11">${values[i]}</text>` +
                `<text x="${x}" y="${H - pad + 16}" text-anchor="middle" fill="#94a3b8" font-size="11">${labels[i]}</text>`;
            }).join('');
        }

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
          `<rect width="${W}" height="${H}" fill="#0f172a" rx="12"/>` +
          `<text x="${W / 2}" y="30" text-anchor="middle" fill="#f1f5f9" font-size="16" font-weight="700">${title}</text>` +
          body + `</svg>`;

        return `CHART_SVG:${svg}`;
      }

      case 'generate_prd': {
        const title = input.title as string;
        const overview = input.overview as string;
        const requirements = input.requirements as string[];
        const nonFunc = (input.non_functional as string[]) || [];
        const milestones = (input.milestones as string[]) || [];

        const md = `# PRD: ${title}\n\n` +
          `## Overview\n${overview}\n\n` +
          `## Functional Requirements\n${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n` +
          (nonFunc.length ? `## Non-Functional Requirements\n${nonFunc.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n` : '') +
          (milestones.length ? `## Milestones\n${milestones.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\n` : '') +
          `---\n*Generated by Cerebro on ${new Date().toLocaleDateString('en-ZA')}*`;

        await supabaseAdmin.from('knowledge_base').insert({
          user_id: userId,
          title: `PRD: ${title}`,
          content: md,
          category: 'PRD',
          tags: ['prd', 'cerebro'],
        });

        return `PRD saved to Knowledge Base:\n\n${md}`;
      }

      case 'generate_presentation': {
        const title = input.title as string;
        const audience = (input.audience as string) || 'General';
        const slides = input.slides as Array<{ heading: string; bullets: string[] }>;

        const md = `# ${title}\n*Audience: ${audience}*\n\n` +
          slides.map((s, i) => {
            const bullets = s.bullets.map(b => `- ${b}`).join('\n');
            return `---\n## Slide ${i + 1}: ${s.heading}\n${bullets}`;
          }).join('\n\n') +
          `\n\n---\n*Generated by Cerebro on ${new Date().toLocaleDateString('en-ZA')}*`;

        await supabaseAdmin.from('knowledge_base').insert({
          user_id: userId,
          title: `Deck: ${title}`,
          content: md,
          category: 'Presentation',
          tags: ['presentation', 'cerebro'],
        });

        return `Presentation outline saved to Knowledge Base:\n\n${md}`;
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}
