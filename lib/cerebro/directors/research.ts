import { supabaseAdmin } from '@/lib/supabase-server';

export const RESEARCH_TOOLS = [
  'search_documents',
  'analyze_document',
  'search_kb',
  'web_search',
] as const;

export async function handle(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  try {
    switch (toolName) {
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
        const docId = input.document_id as string;
        const { data: doc } = await supabaseAdmin.from('documents').select('name, file_path, file_type').eq('id', docId).eq('user_id', userId).single();
        if (!doc) return 'Document not found.';
        return `Document "${doc.name}" found. To get a full analysis, open it in Documents and click the Analyze button. Type: ${doc.file_type}`;
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

      case 'web_search': {
        const query = (input.query as string)?.trim();
        if (!query) return 'Error: query required for web search.';

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return 'No search API configured. Add GEMINI_API_KEY to environment.';

        const { hashInput, getCached, setCached } = await import('@/lib/ai-cache');
        const cacheKey = hashInput(query);
        const cached = await getCached<{ text: string }>('search.expand', cacheKey);
        if (cached?.text) return cached.text;

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

      default:
        return `Unknown tool in research director: ${toolName}`;
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : 'Unknown error'}`;
  }
}
