import { supabaseAdmin } from '@/lib/supabase-server';

export async function executeTool(
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
          .select('access_token, label')
          .eq('user_id', userId);

        if (!accounts?.length) return 'No calendar accounts connected. Go to Settings > Connections to add one.';

        const allEvents = [];
        for (const acc of accounts) {
          try {
            const res = await fetch(
              `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${start}&endDateTime=${end}&$orderby=start/dateTime&$top=20&$select=subject,start,end,location`,
              { headers: { Authorization: `Bearer ${acc.access_token}` } }
            );
            if (res.ok) {
              const data = await res.json();
              for (const e of data.value ?? []) {
                allEvents.push(`${e.start?.dateTime?.slice(11, 16)} - ${e.subject} (${acc.label})`);
              }
            }
          } catch { /* skip failed account */ }
        }

        return allEvents.length > 0 ? `Calendar events:\n${allEvents.join('\n')}` : 'No events found for this period.';
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
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
        const res = await fetch('https://api.helicone.ai/v1/request/query', {
          method: 'POST',
          headers: { Authorization: `Bearer ${heliconeKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter: { request: { created_at: { gte: thirtyDaysAgo } } }, limit: 500 }),
        });
        if (!res.ok) return 'Could not fetch credits data.';
        const data = await res.json();
        const requests = data.data ?? [];
        const totalCost = requests.reduce((sum: number, r: Record<string, number>) => sum + (r.response_cost_usd ?? 0), 0);
        return `AI Usage (30 days): ${requests.length} requests, $${totalCost.toFixed(4)} total cost`;
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
        const query = input.query as string;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return 'No search API configured. Add GEMINI_API_KEY to environment.';

        // Try with retry on 429
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
              if (attempt === 0) {
                await new Promise(r => setTimeout(r, 2000)); // Wait 2s and retry
                continue;
              }
              return 'Web search is temporarily rate-limited. Please try again in a minute.';
            }

            if (!res.ok) return `Web search failed (HTTP ${res.status}). Try again later.`;
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            return text || 'No results found.';
          } catch (err) {
            if (attempt === 0) continue;
            return 'Web search failed due to a network error.';
          }
        }
        return 'Web search failed after retries.';
      }

      case 'get_emails': {
        const folder = (input.folder as string) || 'inbox';
        const limit = (input.limit as number) || 10;
        const { data: accounts } = await supabaseAdmin.from('calendar_accounts').select('access_token').eq('user_id', userId).eq('is_default', true).limit(1);
        const token = accounts?.[0]?.access_token;
        if (!token) return 'No Microsoft account connected. Go to Settings > Connections.';

        const folderMap: Record<string, string> = { inbox: 'inbox', sent: 'sentitems', drafts: 'drafts' };
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/me/mailFolders/${folderMap[folder] || 'inbox'}/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=subject,from,receivedDateTime,isRead,bodyPreview`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return `Failed to fetch emails (${res.status}).`;
        const data = await res.json();
        const emails = (data.value ?? []).map((e: Record<string, unknown>) => {
          const from = (e.from as Record<string, Record<string, string>>)?.emailAddress;
          return `- ${e.isRead ? '' : '[UNREAD] '}${e.subject} — from ${from?.name || from?.address || 'unknown'} (${(e.bodyPreview as string)?.slice(0, 80)})`;
        });
        return emails.length > 0 ? `Emails (${folder}):\n${emails.join('\n')}` : 'No emails found.';
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

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}
