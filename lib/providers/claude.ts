import { anthropic, MODELS } from '@/lib/anthropic';

export function createClaudeStream(
  model: 'fast' | 'smart',
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemPrompt?: string
) {
  let fullResponse = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = anthropic.messages.stream({
    model: model === 'smart' ? MODELS.smart : MODELS.fast,
    max_tokens: 4096,
    system: systemPrompt || 'You are a helpful AI assistant. Be concise and clear. Use markdown formatting when appropriate.',
    messages,
  });

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullResponse += event.delta.text;
            controller.enqueue(new TextEncoder().encode(event.delta.text));
          }
          if (event.type === 'message_delta' && event.usage) {
            outputTokens = event.usage.output_tokens;
          }
          if (event.type === 'message_start' && event.message.usage) {
            inputTokens = event.message.usage.input_tokens;
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
