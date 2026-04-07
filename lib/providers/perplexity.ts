// Perplexity uses OpenAI-compatible API with web search built in
export function createPerplexityStream(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  systemPrompt?: string
) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY not configured');

  let fullResponse = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const allMessages = [
    { role: 'system' as const, content: systemPrompt || 'You are a helpful AI assistant with web search capabilities. Provide accurate, up-to-date information with sources when relevant. Use markdown formatting.' },
    ...messages,
  ];

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: allMessages,
            max_tokens: 4096,
            stream: true,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Perplexity API error ${res.status}: ${err}`);
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
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullResponse += delta;
                controller.enqueue(new TextEncoder().encode(delta));
              }
              if (parsed.usage) {
                inputTokens = parsed.usage.prompt_tokens ?? 0;
                outputTokens = parsed.usage.completion_tokens ?? 0;
              }
            } catch { /* skip */ }
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
    getUsage: () => ({ inputTokens, outputTokens }),
  };
}
