import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  baseURL: 'https://anthropic.helicone.ai',
  defaultHeaders: {
    'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
  },
});

export const MODELS = {
  fast: 'claude-haiku-4-5' as const,
  smart: 'claude-sonnet-4-6' as const,
};
