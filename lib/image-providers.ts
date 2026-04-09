/**
 * Image generation provider registry with automatic fallback.
 *
 * Each provider is defined with:
 *   - id: short identifier
 *   - name: display name
 *   - envKey: the env var that must be set
 *   - priority: order for auto mode (lower = tried first)
 *   - generate: async function that produces an image URL/data URL
 *
 * To add a new provider: just add it to PROVIDERS. No other code changes.
 */

export type ImageSize = 'square' | 'landscape' | 'portrait';

export interface GenerateArgs {
  prompt: string;
  size?: ImageSize;
}

export interface GenerateResult {
  success: boolean;
  image?: string;      // data URL or https URL
  text?: string;       // optional text commentary from the model
  error?: string;      // present if success=false
  errorType?: 'config' | 'auth' | 'rate_limit' | 'content_filter' | 'transient' | 'unknown';
}

export interface ImageProvider {
  id: string;
  name: string;
  description: string;
  envKey: string;
  priority: number;
  /** Returns true if the error should halt the fallback chain (e.g. content filter — all providers will likely reject too). */
  halts?: (errorType: GenerateResult['errorType']) => boolean;
  generate: (args: GenerateArgs) => Promise<GenerateResult>;
}

// ───────────────────────────────────────────────
// Provider: Google Gemini 2.5 Flash Image
// ───────────────────────────────────────────────
const gemini: ImageProvider = {
  id: 'gemini',
  name: 'Google Gemini 2.5 Flash',
  description: 'Fast, multimodal, free tier available',
  envKey: 'GEMINI_API_KEY',
  priority: 1,
  async generate({ prompt }: GenerateArgs): Promise<GenerateResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { success: false, error: 'GEMINI_API_KEY not configured', errorType: 'config' };

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        const errorType = res.status === 401 || res.status === 403 ? 'auth'
          : res.status === 429 ? 'rate_limit'
          : errText.toLowerCase().includes('safety') || errText.toLowerCase().includes('blocked') ? 'content_filter'
          : res.status >= 500 ? 'transient'
          : 'unknown';
        return { success: false, error: `Gemini (${res.status}): ${errText.slice(0, 180)}`, errorType };
      }

      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      let text = '';
      let imageData = '';
      let mimeType = '';
      for (const part of parts) {
        if (part.text) text += part.text;
        if (part.inlineData) {
          imageData = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
        }
      }

      if (!imageData) {
        return { success: false, error: 'Gemini returned no image (may have been filtered)', errorType: 'content_filter' };
      }

      return { success: true, image: `data:${mimeType};base64,${imageData}`, text };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error', errorType: 'transient' };
    }
  },
};

// ───────────────────────────────────────────────
// Provider: OpenAI DALL-E 3
// ───────────────────────────────────────────────
const openai: ImageProvider = {
  id: 'openai',
  name: 'OpenAI DALL-E 3',
  description: 'High quality, strict content filter',
  envKey: 'OPENAI_API_KEY',
  priority: 2,
  async generate({ prompt, size = 'square' }: GenerateArgs): Promise<GenerateResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { success: false, error: 'OPENAI_API_KEY not configured', errorType: 'config' };

    const sizeMap: Record<ImageSize, string> = {
      square: '1024x1024',
      landscape: '1792x1024',
      portrait: '1024x1792',
    };

    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size: sizeMap[size],
          response_format: 'b64_json',
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg = errBody?.error?.message || `HTTP ${res.status}`;
        const errorType = res.status === 401 ? 'auth'
          : res.status === 429 ? 'rate_limit'
          : errMsg.toLowerCase().includes('safety') || errMsg.toLowerCase().includes('content_policy') ? 'content_filter'
          : res.status >= 500 ? 'transient'
          : 'unknown';
        return { success: false, error: `OpenAI: ${errMsg.slice(0, 180)}`, errorType };
      }

      const data = await res.json();
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) return { success: false, error: 'OpenAI returned no image', errorType: 'unknown' };

      return { success: true, image: `data:image/png;base64,${b64}`, text: data.data?.[0]?.revised_prompt };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error', errorType: 'transient' };
    }
  },
};

// ───────────────────────────────────────────────
// Provider: Stability AI (SDXL)
// ───────────────────────────────────────────────
const stability: ImageProvider = {
  id: 'stability',
  name: 'Stability AI SDXL',
  description: 'Stable Diffusion XL — flexible artistic styles',
  envKey: 'STABILITY_API_KEY',
  priority: 3,
  async generate({ prompt }: GenerateArgs): Promise<GenerateResult> {
    const apiKey = process.env.STABILITY_API_KEY;
    if (!apiKey) return { success: false, error: 'STABILITY_API_KEY not configured', errorType: 'config' };

    try {
      const res = await fetch(
        'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            text_prompts: [{ text: prompt, weight: 1 }],
            cfg_scale: 7,
            height: 1024,
            width: 1024,
            samples: 1,
            steps: 30,
          }),
        }
      );

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg = errBody?.message || errBody?.name || `HTTP ${res.status}`;
        const errorType = res.status === 401 ? 'auth'
          : res.status === 429 ? 'rate_limit'
          : res.status === 403 && errMsg.toLowerCase().includes('content') ? 'content_filter'
          : res.status >= 500 ? 'transient'
          : 'unknown';
        return { success: false, error: `Stability: ${errMsg.slice(0, 180)}`, errorType };
      }

      const data = await res.json();
      const b64 = data.artifacts?.[0]?.base64;
      if (!b64) return { success: false, error: 'Stability returned no image', errorType: 'unknown' };

      return { success: true, image: `data:image/png;base64,${b64}` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error', errorType: 'transient' };
    }
  },
};

// ───────────────────────────────────────────────
// Provider: Replicate (FLUX schnell — fast & free tier)
// ───────────────────────────────────────────────
const replicate: ImageProvider = {
  id: 'replicate',
  name: 'Replicate FLUX Schnell',
  description: 'Fast open-source model via Replicate',
  envKey: 'REPLICATE_API_TOKEN',
  priority: 4,
  async generate({ prompt }: GenerateArgs): Promise<GenerateResult> {
    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) return { success: false, error: 'REPLICATE_API_TOKEN not configured', errorType: 'config' };

    try {
      // Start prediction
      const startRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          Prefer: 'wait=30',
        },
        body: JSON.stringify({
          input: { prompt, num_outputs: 1, aspect_ratio: '1:1', output_format: 'png' },
        }),
      });

      if (!startRes.ok) {
        const errMsg = await startRes.text();
        const errorType = startRes.status === 401 ? 'auth'
          : startRes.status === 429 ? 'rate_limit'
          : startRes.status >= 500 ? 'transient'
          : 'unknown';
        return { success: false, error: `Replicate: ${errMsg.slice(0, 180)}`, errorType };
      }

      const data = await startRes.json();
      const imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
      if (!imageUrl) return { success: false, error: 'Replicate returned no image', errorType: 'unknown' };

      return { success: true, image: imageUrl };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Network error', errorType: 'transient' };
    }
  },
};

// ───────────────────────────────────────────────
// Registry
// ───────────────────────────────────────────────
export const PROVIDERS: ImageProvider[] = [gemini, openai, stability, replicate];

/**
 * Returns which providers are currently configured (env key set).
 */
export function getProviderStatus() {
  return PROVIDERS.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    priority: p.priority,
    configured: !!process.env[p.envKey],
    envKey: p.envKey,
  }));
}

/**
 * Generate an image using a specific provider or fallback through the priority chain.
 */
export async function generateWithFallback(
  args: GenerateArgs,
  specificProviderId?: string
): Promise<{ finalResult: GenerateResult; attempts: Array<{ provider: string; success: boolean; error?: string }> }> {
  const attempts: Array<{ provider: string; success: boolean; error?: string }> = [];

  // Specific provider requested — no fallback
  if (specificProviderId) {
    const provider = PROVIDERS.find(p => p.id === specificProviderId);
    if (!provider) {
      return {
        finalResult: { success: false, error: `Unknown provider: ${specificProviderId}`, errorType: 'config' },
        attempts,
      };
    }
    const result = await provider.generate(args);
    attempts.push({ provider: provider.name, success: result.success, error: result.error });
    return { finalResult: result, attempts };
  }

  // Auto mode — try each provider in priority order
  const sorted = [...PROVIDERS].sort((a, b) => a.priority - b.priority);

  for (const provider of sorted) {
    // Skip unconfigured providers silently
    if (!process.env[provider.envKey]) continue;

    const result = await provider.generate(args);
    attempts.push({ provider: provider.name, success: result.success, error: result.error });

    if (result.success) {
      return { finalResult: result, attempts };
    }

    // Content filter — all providers will likely reject. Stop fallback.
    if (result.errorType === 'content_filter') {
      return { finalResult: result, attempts };
    }

    // Otherwise, continue to next provider
  }

  // Nothing worked
  return {
    finalResult: {
      success: false,
      error: attempts.length === 0
        ? 'No image providers configured. Add GEMINI_API_KEY, OPENAI_API_KEY, STABILITY_API_KEY, or REPLICATE_API_TOKEN to environment variables.'
        : 'All configured providers failed. See attempts for details.',
      errorType: attempts.length === 0 ? 'config' : 'unknown',
    },
    attempts,
  };
}
