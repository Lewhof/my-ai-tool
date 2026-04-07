// Google Gemini API — uses the generativelanguage REST API with streaming
export function createGeminiStream(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  systemPrompt?: string
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  let fullResponse = '';

  // Convert messages to Gemini format
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${apiKey}&alt=sse`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
              generationConfig: {
                maxOutputTokens: 4096,
                temperature: 0.7,
              },
            }),
          }
        );

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Gemini API error ${res.status}: ${err}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                fullResponse += text;
                controller.enqueue(new TextEncoder().encode(text));
              }
            } catch { /* skip invalid JSON */ }
          }
        }

        controller.close();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Stream failed';
        controller.enqueue(new TextEncoder().encode(`\n\n[Error: ${errMsg}]`));
        controller.close();
      }
    },
  });

  return {
    stream: readable,
    getFullResponse: () => fullResponse,
    getUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
  };
}
