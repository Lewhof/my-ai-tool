import { supabaseAdmin } from '@/lib/supabase-server';

export const WELLNESS_TOOLS = [
  'get_daily_wisdom',
  'log_virtue',
  'add_book',
  'save_highlight',
  'get_weather',
] as const;

export async function handle(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  try {
    switch (toolName) {
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

      case 'get_weather': {
        const lat = (input.lat as number) || -26.2041;
        const lon = (input.lon as number) || 28.0473;
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m`);
        if (!res.ok) return 'Could not fetch weather.';
        const data = await res.json();
        const c = data.current;
        return `Weather: ${c.temperature_2m}°C, wind ${c.wind_speed_10m} km/h, code ${c.weather_code}`;
      }

      default:
        return `Unknown tool in wellness director: ${toolName}`;
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}
